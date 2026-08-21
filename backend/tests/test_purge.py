"""Deleting financial history for good.

The rest of the ledger refuses to lose a posted entry. This one path is allowed
to, because the farm's owner asked for it, so the rules that keep it from being
an accident are the ones worth locking down.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.audit.models import AuditAction, AuditLog
from apps.ledger import chart
from apps.ledger.models import EntryStatus, JournalEntry, LedgerLine, ProcessedCommand
from apps.ledger.services import Line, post_entry, purge_entry, reverse_entry
from apps.animals.models import Sex
from apps.animals.services import create_animal
from apps.operations.models import AnimalPurchase
from apps.operations.services import purchase_animals, record_expense
from tests.factories import cash, catalog, expense_category, make_farm, make_user, sheep_type

TODAY = date.today()


class PurgeServiceTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm)
        self.cash = cash(self.farm)
        self.feed = chart.get(self.farm, chart.OTHER_EXPENSE)

    def expense(self, amount=100, key=""):
        return post_entry(
            self.farm,
            date=TODAY,
            kind="expense",
            lines=[Line.dr(self.feed, amount), Line.cr(self.cash, amount)],
            memo="feed",
            idempotency_key=key,
            actor=self.owner,
        )

    def test_purge_removes_the_entry_its_lines_and_its_effect(self):
        entry = self.expense(100)
        self.assertEqual(self.cash.balance(), Decimal("-100"))

        purge_entry(entry, actor=self.owner, reason="سجّلته بالخطأ")

        self.assertFalse(JournalEntry.all_objects.filter(id=entry.id).exists())
        self.assertFalse(LedgerLine.objects.filter(entry_id=entry.id).exists())
        self.assertEqual(self.cash.balance(), Decimal("0"))

    def test_the_erased_numbers_survive_in_the_audit_log(self):
        entry = self.expense(250)
        number = entry.number

        purge_entry(entry, actor=self.owner, reason="خطأ")

        log = AuditLog.objects.get(entity="journal_entry", action=AuditAction.DELETE)
        snapshot = log.old_values["entries"][0]
        self.assertEqual(snapshot["number"], number)
        self.assertEqual(snapshot["amount"], "250.0000")
        self.assertEqual(len(snapshot["lines"]), 2)
        self.assertEqual(log.user, self.owner)

    def test_an_entry_and_its_reversal_go_together(self):
        entry = self.expense(80)
        reversal = reverse_entry(entry, actor=self.owner, reason="مكرر")

        purge_entry(entry, actor=self.owner)

        self.assertFalse(JournalEntry.all_objects.filter(id=entry.id).exists())
        self.assertFalse(JournalEntry.all_objects.filter(id=reversal.id).exists())
        self.assertEqual(self.cash.balance(), Decimal("0"))

    def test_a_reversal_cannot_be_deleted_on_its_own(self):
        entry = self.expense(80)
        reversal = reverse_entry(entry, actor=self.owner)

        with self.assertRaises(Exception):
            purge_entry(reversal, actor=self.owner)

        self.assertTrue(JournalEntry.all_objects.filter(id=entry.id).exists())

    def test_the_idempotency_key_dies_with_the_entry(self):
        entry = post_entry(
            self.farm,
            date=TODAY,
            kind="expense",
            lines=[Line.dr(self.feed, 60), Line.cr(self.cash, 60)],
            idempotency_key="offline-42",
            actor=self.owner,
        )
        ProcessedCommand.objects.create(
            key="offline-42", farm=self.farm, command="expense", result_id=str(entry.id)
        )

        purge_entry(entry, actor=self.owner)

        self.assertFalse(ProcessedCommand.objects.filter(key="offline-42").exists())

    def test_purging_a_purchase_entry_takes_the_purchase_with_it(self):
        animal = create_animal(
            self.farm, animal_type=sheep_type(self.farm), sex=Sex.FEMALE, actor=self.owner
        )
        purchase = purchase_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": animal, "unit_price": Decimal("150")}],
            from_account=self.cash,
            actor=self.owner,
        )
        entry = purchase.journal_entry
        self.assertIsNotNone(entry)

        blockers = purge_entry(entry, actor=self.owner)

        self.assertFalse(AnimalPurchase.all_objects.filter(id=purchase.id).exists())
        self.assertTrue(blockers["operations"])


class PurgeApiTests(TestCase):
    """The gate in front of the service: permission, then password."""

    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, password="owner-pass-1")
        self.accountant = make_user("accountant", self.farm, "accountant", password="acc-pass-1")
        self.cash = cash(self.farm)
        self.feed = chart.get(self.farm, chart.OTHER_EXPENSE)
        self.entry = post_entry(
            self.farm,
            date=TODAY,
            kind="expense",
            lines=[Line.dr(self.feed, 90), Line.cr(self.cash, 90)],
            actor=self.owner,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        return client

    def purge(self, client, **payload):
        return client.post(f"/api/v1/entries/{self.entry.id}/purge/", payload, format="json")

    def test_the_right_password_deletes_it(self):
        response = self.purge(self.client_for(self.owner), password="owner-pass-1", reason="خطأ")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(JournalEntry.all_objects.filter(id=self.entry.id).exists())

    def test_no_password_no_delete(self):
        response = self.purge(self.client_for(self.owner))
        self.assertEqual(response.status_code, 400)
        self.assertTrue(JournalEntry.all_objects.filter(id=self.entry.id).exists())

    def test_a_wrong_password_no_delete(self):
        response = self.purge(self.client_for(self.owner), password="not-my-password")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(JournalEntry.all_objects.filter(id=self.entry.id).exists())

    def test_someone_without_the_permission_cannot_delete(self):
        """An accountant may reverse an entry, which is the safe correction,
        but erasing history is the owner's call."""
        response = self.purge(self.client_for(self.accountant), password="acc-pass-1")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(JournalEntry.all_objects.filter(id=self.entry.id).exists())

    def test_the_preview_says_what_else_would_go(self):
        reverse_entry(self.entry, actor=self.owner)
        client = self.client_for(self.owner)
        response = client.get(f"/api/v1/entries/{self.entry.id}/purge-preview/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["data"]["also_removed"])

    def test_ordinary_delete_is_still_refused(self):
        """The blunt path stays closed: deletion happens through purge or not
        at all."""
        client = self.client_for(self.owner)
        response = client.delete(f"/api/v1/entries/{self.entry.id}/")
        self.assertIn(response.status_code, (403, 405))
        self.assertTrue(JournalEntry.all_objects.filter(id=self.entry.id).exists())
