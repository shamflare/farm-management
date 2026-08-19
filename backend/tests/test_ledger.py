"""The accounting rules that must never break."""
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.ledger import chart
from apps.ledger.models import EntryKind, EntryStatus, JournalEntry, LedgerLine
from apps.ledger.services import (
    Line,
    approve_entry,
    post_entry,
    reverse_entry,
    trial_balance,
)
from tests.factories import cash, make_farm

TODAY = date.today()


class LedgerRulesTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.cash = cash(self.farm)
        self.feed = chart.get(self.farm, chart.OTHER_EXPENSE)

    def test_balanced_entry_posts(self):
        entry = post_entry(
            self.farm,
            date=TODAY,
            kind=EntryKind.EXPENSE,
            lines=[Line.dr(self.feed, 100), Line.cr(self.cash, 100)],
            memo="feed",
        )
        self.assertEqual(entry.status, EntryStatus.POSTED)
        self.assertTrue(entry.is_balanced())
        self.assertEqual(self.cash.balance(), Decimal("-100"))
        self.assertEqual(self.feed.balance(), Decimal("100"))

    def test_unbalanced_entry_is_refused(self):
        with self.assertRaises(ValidationError):
            post_entry(
                self.farm,
                date=TODAY,
                kind=EntryKind.EXPENSE,
                lines=[Line.dr(self.feed, 100), Line.cr(self.cash, 90)],
            )
        self.assertEqual(JournalEntry.objects.count(), 0)
        self.assertEqual(LedgerLine.objects.count(), 0)

    def test_zero_amount_is_refused(self):
        with self.assertRaises(ValidationError):
            post_entry(
                self.farm,
                date=TODAY,
                kind=EntryKind.EXPENSE,
                lines=[Line.dr(self.feed, 0), Line.cr(self.cash, 0)],
            )

    def test_single_line_is_refused(self):
        with self.assertRaises(ValidationError):
            post_entry(
                self.farm, date=TODAY, kind=EntryKind.EXPENSE, lines=[Line.dr(self.feed, 50)]
            )

    def test_account_from_another_farm_is_refused(self):
        other = make_farm(slug="other-farm", name="مزرعة أخرى")
        with self.assertRaises(ValidationError):
            post_entry(
                self.farm,
                date=TODAY,
                kind=EntryKind.EXPENSE,
                lines=[Line.dr(self.feed, 10), Line.cr(cash(other), 10)],
            )

    def test_posted_entry_cannot_be_deleted(self):
        entry = post_entry(
            self.farm,
            date=TODAY,
            kind=EntryKind.EXPENSE,
            lines=[Line.dr(self.feed, 100), Line.cr(self.cash, 100)],
        )
        with self.assertRaises(ValueError):
            entry.delete()
        self.assertTrue(JournalEntry.objects.filter(id=entry.id).exists())

    def test_reversal_cancels_the_effect_and_keeps_history(self):
        entry = post_entry(
            self.farm,
            date=TODAY,
            kind=EntryKind.EXPENSE,
            lines=[Line.dr(self.feed, 250), Line.cr(self.cash, 250)],
            memo="wrong amount",
        )
        reversal = reverse_entry(entry, reason="entered twice")

        self.assertEqual(reversal.reverses_id, entry.id)
        self.assertEqual(self.cash.balance(), Decimal("0"))
        self.assertEqual(self.feed.balance(), Decimal("0"))
        # Both entries remain readable for the audit trail.
        self.assertEqual(JournalEntry.objects.count(), 2)

    def test_an_entry_can_only_be_reversed_once(self):
        entry = post_entry(
            self.farm,
            date=TODAY,
            kind=EntryKind.EXPENSE,
            lines=[Line.dr(self.feed, 10), Line.cr(self.cash, 10)],
        )
        reverse_entry(entry)
        entry.refresh_from_db()
        with self.assertRaises(ValidationError):
            reverse_entry(entry)

    def test_idempotency_key_prevents_double_posting(self):
        payload = dict(
            date=TODAY,
            kind=EntryKind.EXPENSE,
            memo="offline retry",
            idempotency_key="device-1:abc123",
        )
        first = post_entry(
            self.farm, lines=[Line.dr(self.feed, 75), Line.cr(self.cash, 75)], **payload
        )
        second = post_entry(
            self.farm, lines=[Line.dr(self.feed, 75), Line.cr(self.cash, 75)], **payload
        )
        self.assertEqual(first.id, second.id)
        self.assertEqual(JournalEntry.objects.count(), 1)
        self.assertEqual(self.cash.balance(), Decimal("-75"))

    def test_pending_entries_do_not_move_balances_until_approved(self):
        entry = post_entry(
            self.farm,
            date=TODAY,
            kind=EntryKind.EXPENSE,
            lines=[Line.dr(self.feed, 400), Line.cr(self.cash, 400)],
            force_status=EntryStatus.PENDING,
        )
        self.assertEqual(self.cash.balance(), Decimal("0"))
        approve_entry(entry)
        self.assertEqual(self.cash.balance(), Decimal("-400"))

    def test_trial_balance_stays_equal(self):
        for amount in (10, 25, 300):
            post_entry(
                self.farm,
                date=TODAY,
                kind=EntryKind.EXPENSE,
                lines=[Line.dr(self.feed, amount), Line.cr(self.cash, amount)],
            )
        result = trial_balance(self.farm)
        self.assertTrue(result["balanced"])
        self.assertEqual(result["difference"], Decimal("0"))
