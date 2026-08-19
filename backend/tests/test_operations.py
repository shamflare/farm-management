"""Business flows: worker spending, purchases, sales, deaths, opening balances."""
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.animals.models import Sex
from apps.animals.services import create_animal
from apps.ledger import chart
from apps.ledger.services import trial_balance
from apps.operations.services import (
    purchase_animals,
    record_animal_death,
    record_expense,
    record_opening_balances,
    sell_animals,
    settle_with_party,
)
from apps.parties.models import PartyKind
from apps.parties.services import create_party, party_summary
from tests.factories import cash, expense_category, make_farm, sheep_type

TODAY = date.today()


class WorkerSpendingTests(TestCase):
    """Section 11 of the brief: the supervisor pays from his own pocket."""

    def setUp(self):
        self.farm = make_farm()
        self.cash = cash(self.farm)
        self.worker = create_party(self.farm, kind=PartyKind.WORKER, name="خالد")

    def test_worker_payment_creates_a_debt_not_a_cash_movement(self):
        record_expense(
            self.farm,
            date=TODAY,
            amount=500,
            category=expense_category(self.farm),
            paid_by_party=self.worker,
            memo="أعلاف",
        )
        self.assertEqual(self.cash.balance(), Decimal("0"))
        self.assertEqual(self.worker.payable_account.balance(), Decimal("500"))
        summary = party_summary(self.worker)
        self.assertEqual(summary["owed_by_farm"], Decimal("500"))

    def test_partial_settlement_leaves_the_remainder(self):
        record_expense(
            self.farm,
            date=TODAY,
            amount=500,
            category=expense_category(self.farm),
            paid_by_party=self.worker,
        )
        settle_with_party(
            self.farm, date=TODAY, amount=300, party=self.worker, from_account=self.cash
        )
        self.assertEqual(self.worker.payable_account.balance(), Decimal("200"))
        self.assertEqual(self.cash.balance(), Decimal("-300"))

    def test_cannot_pay_more_than_is_owed(self):
        record_expense(
            self.farm,
            date=TODAY,
            amount=100,
            category=expense_category(self.farm),
            paid_by_party=self.worker,
        )
        with self.assertRaises(ValidationError):
            settle_with_party(
                self.farm, date=TODAY, amount=150, party=self.worker, from_account=self.cash
            )
        self.assertEqual(self.worker.payable_account.balance(), Decimal("100"))

    def test_expense_needs_a_payment_source(self):
        with self.assertRaises(ValidationError):
            record_expense(
                self.farm, date=TODAY, amount=50, category=expense_category(self.farm)
            )


class PurchaseTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.cash = cash(self.farm)
        self.supplier = create_party(self.farm, kind=PartyKind.SUPPLIER, name="المورد")
        self.animals = [
            create_animal(self.farm, animal_type=sheep_type(self.farm), sex=Sex.FEMALE)
            for _ in range(3)
        ]

    def test_extra_costs_are_spread_over_the_animals(self):
        purchase = purchase_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": a, "unit_price": 180} for a in self.animals],
            supplier=self.supplier,
            transport_cost=45,
            commission_cost=15,
            from_account=self.cash,
        )
        self.assertEqual(purchase.total_cost, Decimal("600.0000"))
        allocated = sum(item.allocated_cost for item in purchase.items.all())
        # No cent is lost or invented in the allocation.
        self.assertEqual(allocated, purchase.total_cost)
        self.assertEqual(chart.get(self.farm, chart.LIVESTOCK).balance(), Decimal("600"))
        self.assertEqual(self.cash.balance(), Decimal("-600"))

    def test_unpaid_purchase_becomes_a_supplier_debt(self):
        purchase = purchase_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": self.animals[0], "unit_price": 200}],
            supplier=self.supplier,
            paid_amount=50,
            from_account=self.cash,
        )
        self.assertEqual(purchase.remaining, Decimal("150.0000"))
        self.assertEqual(self.supplier.payable_account.balance(), Decimal("150"))
        self.assertEqual(self.cash.balance(), Decimal("-50"))

    def test_unpaid_purchase_without_a_supplier_is_refused(self):
        with self.assertRaises(ValidationError):
            purchase_animals(
                self.farm,
                date=TODAY,
                items=[{"animal": self.animals[0], "unit_price": 200}],
                paid_amount=50,
                from_account=self.cash,
            )


class SaleTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.cash = cash(self.farm)
        self.customer = create_party(self.farm, kind=PartyKind.CUSTOMER, name="التاجر")
        self.animal = create_animal(self.farm, animal_type=sheep_type(self.farm), sex=Sex.FEMALE)
        purchase_animals(
            self.farm,
            date=TODAY - timedelta(days=30),
            items=[{"animal": self.animal, "unit_price": 200}],
            from_account=self.cash,
        )
        self.animal.refresh_from_db()

    def test_sale_records_revenue_and_keeps_the_animal_on_file(self):
        sale = sell_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": self.animal, "unit_price": 260}],
            customer=self.customer,
            into_account=self.cash,
        )
        self.animal.refresh_from_db()

        self.assertEqual(sale.total_price, Decimal("260.0000"))
        self.assertEqual(self.animal.status.code, "sold")
        self.assertFalse(self.animal.is_on_farm)
        # The record survives the sale: history and lineage stay intact.
        self.assertTrue(type(self.animal).objects.filter(id=self.animal.id).exists())
        self.assertEqual(chart.get(self.farm, chart.ANIMAL_SALES).balance(), Decimal("260"))
        # Book value left the livestock account.
        self.assertEqual(chart.get(self.farm, chart.LIVESTOCK).balance(), Decimal("0"))
        self.assertEqual(chart.get(self.farm, chart.COST_OF_ANIMALS_SOLD).balance(), Decimal("200"))
        self.assertTrue(trial_balance(self.farm)["balanced"])

    def test_partial_payment_creates_a_receivable(self):
        sell_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": self.animal, "unit_price": 260}],
            customer=self.customer,
            received_amount=200,
            into_account=self.cash,
        )
        self.assertEqual(self.customer.receivable_account.balance(), Decimal("60"))

    def test_selling_more_than_the_price_received_is_refused(self):
        with self.assertRaises(ValidationError):
            sell_animals(
                self.farm,
                date=TODAY,
                items=[{"animal": self.animal, "unit_price": 100}],
                customer=self.customer,
                received_amount=500,
                into_account=self.cash,
            )


class DeathTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.cash = cash(self.farm)
        self.animal = create_animal(self.farm, animal_type=sheep_type(self.farm), sex=Sex.MALE)
        purchase_animals(
            self.farm,
            date=TODAY - timedelta(days=10),
            items=[{"animal": self.animal, "unit_price": 150}],
            from_account=self.cash,
        )
        self.animal.refresh_from_db()

    def test_death_writes_off_the_book_value(self):
        record_animal_death(self.farm, animal=self.animal, date=TODAY, notes="مرض")
        self.animal.refresh_from_db()
        self.assertFalse(self.animal.is_alive)
        self.assertEqual(self.animal.status.code, "dead")
        self.assertEqual(chart.get(self.farm, chart.ANIMAL_LOSS).balance(), Decimal("150"))
        self.assertEqual(chart.get(self.farm, chart.LIVESTOCK).balance(), Decimal("0"))
        self.assertTrue(trial_balance(self.farm)["balanced"])


class OpeningBalanceTests(TestCase):
    def test_opening_balances_balance_through_equity(self):
        farm = make_farm()
        partner = create_party(farm, kind=PartyKind.PARTNER, name="الشريك")
        entry = record_opening_balances(
            farm,
            date=TODAY,
            assets=[
                {"account": cash(farm), "amount": 10000},
                {"account": chart.get(farm, chart.LIVESTOCK), "amount": 30000},
            ],
            liabilities=[{"account": chart.get(farm, chart.PAYABLE), "amount": 4000}],
            partner_capital=[{"party": partner, "amount": 20000}],
        )
        self.assertTrue(entry.is_balanced())
        self.assertEqual(cash(farm).balance(), Decimal("10000"))
        self.assertEqual(partner.capital_account.balance(), Decimal("20000"))
        # 40000 assets - 4000 payable - 20000 capital = 16000 to opening equity
        self.assertEqual(chart.get(farm, chart.OPENING_EQUITY).balance(), Decimal("16000"))
        self.assertTrue(trial_balance(farm)["balanced"])
        farm.refresh_from_db()
        self.assertIsNotNone(farm.opening_completed_at)
