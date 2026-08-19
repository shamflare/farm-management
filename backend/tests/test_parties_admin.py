"""Editing and removing people, without losing money or history."""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.ledger.models import LedgerLine
from apps.operations.services import record_expense, settle_with_party
from apps.parties.models import OwnershipChange, Party, PartyKind
from apps.parties.services import create_party, set_ownership
from tests.factories import cash, expense_category, make_farm, make_user

TODAY = date.today()


class PartyAdminTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.client.credentials(HTTP_X_FARM=self.farm.slug)

    def test_renaming_a_party_keeps_its_ledger_account(self):
        party = create_party(self.farm, kind=PartyKind.SUPPLIER, name="معمل الأعلاف")
        account_id = party.payable_account_id

        response = self.client.patch(f"/api/v1/parties/{party.id}/", {"name": "معمل الشام"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)

        party.refresh_from_db()
        self.assertEqual(party.name, "معمل الشام")
        self.assertEqual(party.payable_account_id, account_id)

    def test_changing_a_partner_share_is_recorded_in_history(self):
        partner = create_party(self.farm, kind=PartyKind.PARTNER, name="أبو محمد")
        set_ownership(partner, 60, effective_from=TODAY)

        response = self.client.patch(
            f"/api/v1/parties/{partner.id}/", {"ownership_percentage": "55"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)

        partner.refresh_from_db()
        self.assertEqual(partner.ownership_percentage, Decimal("55.0000"))

        # The old share is not overwritten silently; it stays in the record.
        # Selected by content, not by created_at: the Windows clock ticks every
        # ~15ms, so two rows written in the same tick sort arbitrarily.
        history = OwnershipChange.objects.filter(party=partner)
        self.assertEqual(history.count(), 2)
        change = history.get(new_percentage=Decimal("55.0000"))
        self.assertEqual(change.old_percentage, Decimal("60.0000"))

    def test_a_party_who_is_owed_money_cannot_be_deleted(self):
        worker = create_party(self.farm, kind=PartyKind.WORKER, name="خالد")
        record_expense(
            self.farm,
            date=TODAY,
            amount=500,
            category=expense_category(self.farm),
            paid_by_party=worker,
        )

        response = self.client.delete(f"/api/v1/parties/{worker.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("رصيد", response.json()["detail"])
        self.assertTrue(Party.objects.filter(id=worker.id).exists())

    def test_a_settled_party_can_be_deleted_and_the_ledger_survives(self):
        worker = create_party(self.farm, kind=PartyKind.WORKER, name="خالد")
        record_expense(
            self.farm,
            date=TODAY,
            amount=500,
            category=expense_category(self.farm),
            paid_by_party=worker,
        )
        settle_with_party(
            self.farm, date=TODAY, amount=500, party=worker, from_account=cash(self.farm)
        )
        lines_before = LedgerLine.objects.count()

        response = self.client.delete(f"/api/v1/parties/{worker.id}/")
        self.assertEqual(response.status_code, 204, response.content)

        # Soft deleted: hidden from the list, still on file, ledger untouched.
        self.assertFalse(Party.objects.filter(id=worker.id).exists())
        self.assertTrue(Party.all_objects.filter(id=worker.id).exists())
        self.assertEqual(LedgerLine.objects.count(), lines_before)

    def test_a_partner_who_took_everything_back_can_be_removed(self):
        """Capital and drawings are one stake: 100 in, 100 out, nothing held."""
        from apps.operations.services import contribute_capital, withdraw_capital

        partner = create_party(self.farm, kind=PartyKind.PARTNER, name="شريك مؤقت")
        contribute_capital(
            self.farm, date=TODAY, amount=1000, partner=partner, into_account=cash(self.farm)
        )
        blocked = self.client.delete(f"/api/v1/parties/{partner.id}/")
        self.assertEqual(blocked.status_code, 400)

        withdraw_capital(
            self.farm, date=TODAY, amount=1000, partner=partner, from_account=cash(self.farm)
        )
        self.assertEqual(self.client.delete(f"/api/v1/parties/{partner.id}/").status_code, 204)

    def test_deactivating_hides_a_party_without_deleting_it(self):
        supplier = create_party(self.farm, kind=PartyKind.SUPPLIER, name="مورد قديم")
        response = self.client.patch(
            f"/api/v1/parties/{supplier.id}/", {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, 200)

        supplier.refresh_from_db()
        self.assertFalse(supplier.is_active)
        self.assertIsNone(supplier.deleted_at)

    def test_a_worker_cannot_delete_people(self):
        worker_user = make_user("field_worker", self.farm, "worker")
        party = create_party(self.farm, kind=PartyKind.SUPPLIER, name="مورد")
        client = APIClient()
        client.force_authenticate(user=worker_user)
        client.credentials(HTTP_X_FARM=self.farm.slug)

        self.assertEqual(client.delete(f"/api/v1/parties/{party.id}/").status_code, 403)
        self.assertEqual(
            client.patch(f"/api/v1/parties/{party.id}/", {"name": "x"}, format="json").status_code, 403
        )

    def test_a_partner_statement_reports_withdrawals_as_money_taken_out(self):
        """Drawings read as a positive amount withdrawn, and reduce the stake."""
        from apps.operations.services import contribute_capital, withdraw_capital
        from apps.parties.services import party_summary

        partner = create_party(self.farm, kind=PartyKind.PARTNER, name="شريك")
        contribute_capital(
            self.farm, date=TODAY, amount=1000, partner=partner, into_account=cash(self.farm)
        )
        withdraw_capital(
            self.farm, date=TODAY, amount=400, partner=partner, from_account=cash(self.farm)
        )

        summary = party_summary(partner)
        self.assertEqual(summary["capital_contributed"], Decimal("1000"))
        self.assertEqual(summary["drawings"], Decimal("400"))
        self.assertEqual(summary["net_capital"], Decimal("600"))
