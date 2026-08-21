"""The two-branch split: feed stores, milk, founding costs, branch profit.

These are the numbers the owner asked for. Every one of them is checked here
against the ledger, not against a stored total.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.animals.models import Acquisition, Sex
from apps.animals.services import change_branch, create_animal, next_tag
from apps.assets.services import record_founding_cost
from apps.assets.services import summary as founding_summary
from apps.catalog.models import BranchCode, CatalogItem, CatalogTypeCode
from apps.inventory import services as stock
from apps.inventory.models import InventoryItem, InventoryStore, MovementKind
from apps.ledger import chart
from apps.ledger.services import branch_comparison, profit_and_loss, trial_balance
from apps.operations.services import record_expense, sell_animals
from apps.production import services as milk
from apps.production.models import Milking
from tests.factories import cash, expense_category, make_farm, sheep_type

TODAY = date.today()


def branch(farm, code):
    return CatalogItem.objects.get(farm=farm, type_id=CatalogTypeCode.BRANCH, code=code)


def store_for(farm, branch_code):
    return InventoryStore.objects.get(farm=farm, branch__code=branch_code)


def feed(farm, name="Barley"):
    return InventoryItem.objects.get(farm=farm, name=name)


def catalog_row(farm, type_code, code):
    return CatalogItem.objects.get(farm=farm, type_id=type_code, code=code)


class TagNumberingTests(TestCase):
    """Each branch counts its animals from one, in its own letters."""

    def setUp(self):
        self.farm = make_farm()
        self.sheep = sheep_type(self.farm)
        self.breeding = branch(self.farm, BranchCode.BREEDING)
        self.fattening = branch(self.farm, BranchCode.FATTENING)

    def register(self, branch_row):
        return create_animal(
            self.farm, animal_type=self.sheep, sex=Sex.FEMALE, branch=branch_row
        )

    def test_the_two_branches_each_start_at_one(self):
        self.assertEqual(self.register(self.breeding).tag, "TR-0001")
        self.assertEqual(self.register(self.breeding).tag, "TR-0002")
        self.assertEqual(self.register(self.fattening).tag, "TS-0001")
        self.assertEqual(self.register(self.fattening).tag, "TS-0002")
        self.assertEqual(self.register(self.breeding).tag, "TR-0003")

    def test_an_animal_with_no_branch_still_gets_a_number(self):
        animal = create_animal(self.farm, animal_type=self.sheep, sex=Sex.FEMALE)
        self.assertTrue(animal.tag.startswith("SH-"))

    def test_a_moved_animal_keeps_its_number_and_frees_none(self):
        first = self.register(self.breeding)
        change_branch(first, self.fattening, date=TODAY)
        first.refresh_from_db()

        self.assertEqual(first.tag, "TR-0001")
        # The breeding sequence must not hand TR-0001 out a second time.
        self.assertEqual(next_tag(self.farm, self.sheep, self.breeding), "TR-0002")
        self.assertEqual(next_tag(self.farm, self.sheep, self.fattening), "TS-0001")


class BranchSetupTests(TestCase):
    """A new farm arrives with both branches and a store for each."""

    def setUp(self):
        self.farm = make_farm()

    def test_the_farm_is_seeded_with_breeding_and_fattening(self):
        codes = set(
            CatalogItem.objects.filter(
                farm=self.farm, type_id=CatalogTypeCode.BRANCH
            ).values_list("code", flat=True)
        )
        self.assertEqual(
            codes, {BranchCode.BREEDING, BranchCode.FATTENING, BranchCode.SHARED}
        )

    def test_each_branch_has_its_own_store_with_its_own_account(self):
        breeding = store_for(self.farm, BranchCode.BREEDING)
        fattening = store_for(self.farm, BranchCode.FATTENING)

        self.assertIsNotNone(breeding.account)
        self.assertIsNotNone(fattening.account)
        self.assertNotEqual(breeding.account_id, fattening.account_id)
        # Both hang under the one Inventory account on the balance sheet.
        self.assertEqual(breeding.account.parent.code, chart.INVENTORY)


class FeedStoreTests(TestCase):
    """Feed is an asset until it is eaten, and then it is one branch's cost."""

    def setUp(self):
        self.farm = make_farm()
        self.cash = cash(self.farm)
        self.store = store_for(self.farm, BranchCode.BREEDING)
        self.other = store_for(self.farm, BranchCode.FATTENING)
        self.barley = feed(self.farm)

    def receive(self, quantity, total, store=None, day=TODAY):
        return stock.receive_stock(
            self.farm,
            store=store or self.store,
            item=self.barley,
            date=day,
            quantity=quantity,
            total_cost=total,
            from_account=self.cash,
        )

    def test_buying_feed_is_not_an_expense_yet(self):
        self.receive(1000, 500)

        report = profit_and_loss(self.farm)
        self.assertEqual(report["total_expenses"], Decimal("0"))
        self.assertEqual(self.store.account.balance(), Decimal("500"))

    def test_feeding_the_flock_charges_the_branch_that_ate_it(self):
        self.receive(1000, 500)
        stock.issue_stock(
            self.farm, store=self.store, item=self.barley, date=TODAY, quantity=200
        )

        breeding = profit_and_loss(self.farm, branch=branch(self.farm, BranchCode.BREEDING))
        fattening = profit_and_loss(self.farm, branch=branch(self.farm, BranchCode.FATTENING))

        self.assertEqual(breeding["total_expenses"], Decimal("100"))
        self.assertEqual(fattening["total_expenses"], Decimal("0"))
        self.assertEqual(self.store.account.balance(), Decimal("400"))

    def test_the_average_cost_moves_with_every_load(self):
        self.receive(100, 100)  # 1.00 each
        self.receive(100, 300)  # 3.00 each -> average 2.00

        state = stock.balance(self.store, self.barley)
        self.assertEqual(state["quantity"], Decimal("200.000"))
        self.assertEqual(state["average_cost"], Decimal("2.0000"))

        issue = stock.issue_stock(
            self.farm, store=self.store, item=self.barley, date=TODAY, quantity=50
        )
        self.assertEqual(issue.total_cost, Decimal("100.0000"))

    def test_a_store_cannot_issue_what_it_does_not_hold(self):
        self.receive(10, 10)
        with self.assertRaises(ValidationError):
            stock.issue_stock(
                self.farm, store=self.store, item=self.barley, date=TODAY, quantity=11
            )

    def test_the_two_stores_stay_separate(self):
        self.receive(100, 100)
        self.assertEqual(stock.balance(self.other, self.barley)["quantity"], Decimal("0"))

    def test_a_transfer_moves_value_without_creating_an_expense(self):
        self.receive(100, 200)
        stock.transfer_stock(
            self.farm,
            from_store=self.store,
            to_store=self.other,
            item=self.barley,
            date=TODAY,
            quantity=40,
        )

        self.assertEqual(stock.balance(self.store, self.barley)["quantity"], Decimal("60.000"))
        self.assertEqual(stock.balance(self.other, self.barley)["quantity"], Decimal("40.000"))
        self.assertEqual(self.store.account.balance(), Decimal("120"))
        self.assertEqual(self.other.account.balance(), Decimal("80"))
        self.assertEqual(profit_and_loss(self.farm)["total_expenses"], Decimal("0"))

    def test_a_stock_count_books_the_shortage_as_a_loss(self):
        self.receive(100, 100)
        movement = stock.count_stock(
            self.farm, store=self.store, item=self.barley, date=TODAY, counted_quantity=90
        )

        self.assertEqual(movement.kind, MovementKind.COUNT)
        self.assertEqual(movement.quantity, Decimal("-10.000"))
        self.assertEqual(chart.get(self.farm, chart.STOCK_LOSS).balance(), Decimal("10"))
        self.assertEqual(stock.balance(self.store, self.barley)["quantity"], Decimal("90.000"))

    def test_a_count_that_matches_the_books_writes_nothing(self):
        self.receive(100, 100)
        self.assertIsNone(
            stock.count_stock(
                self.farm, store=self.store, item=self.barley, date=TODAY, counted_quantity=100
            )
        )

    def test_the_books_stay_balanced_through_all_of_it(self):
        self.receive(100, 100)
        stock.issue_stock(
            self.farm, store=self.store, item=self.barley, date=TODAY, quantity=30
        )
        stock.transfer_stock(
            self.farm,
            from_store=self.store,
            to_store=self.other,
            item=self.barley,
            date=TODAY,
            quantity=20,
        )
        stock.write_off_stock(
            self.farm, store=self.store, item=self.barley, date=TODAY, quantity=5
        )
        self.assertTrue(trial_balance(self.farm)["balanced"])


class MilkTests(TestCase):
    """Litres are logged whether or not they are sold; sales are money."""

    def setUp(self):
        self.farm = make_farm()
        self.cash = cash(self.farm)
        self.breeding = branch(self.farm, BranchCode.BREEDING)
        self.raw_milk = CatalogItem.objects.get(
            farm=self.farm, type_id=CatalogTypeCode.MILK_PRODUCT, code="raw_milk"
        )

    def test_the_daily_log_holds_no_money(self):
        row = milk.record_production(
            self.farm, date=TODAY, liters=42, branch=self.breeding, session=Milking.MORNING
        )
        self.assertEqual(row.liters, Decimal("42.000"))
        self.assertEqual(profit_and_loss(self.farm)["total_income"], Decimal("0"))

    def test_recording_the_same_session_twice_corrects_it(self):
        milk.record_production(
            self.farm, date=TODAY, liters=40, branch=self.breeding, session=Milking.MORNING
        )
        milk.record_production(
            self.farm, date=TODAY, liters=45, branch=self.breeding, session=Milking.MORNING
        )
        summary = milk.summary(self.farm)
        self.assertEqual(summary["liters_produced"], Decimal("45.000"))

    def test_morning_and_evening_add_up(self):
        milk.record_production(
            self.farm, date=TODAY, liters=40, branch=self.breeding, session=Milking.MORNING
        )
        milk.record_production(
            self.farm, date=TODAY, liters=35, branch=self.breeding, session=Milking.EVENING
        )
        self.assertEqual(milk.summary(self.farm)["liters_produced"], Decimal("75.000"))

    def test_a_sale_credits_the_milk_revenue_account_of_the_breeding_branch(self):
        milk.record_sale(
            self.farm,
            date=TODAY,
            quantity=30,
            unit_price=2,
            product=self.raw_milk,
            branch=self.breeding,
            into_account=self.cash,
        )

        self.assertEqual(chart.get(self.farm, chart.MILK_SALES).balance(), Decimal("60"))
        report = profit_and_loss(self.farm, branch=self.breeding)
        self.assertEqual(report["total_income"], Decimal("60"))
        fattening = profit_and_loss(self.farm, branch=branch(self.farm, BranchCode.FATTENING))
        self.assertEqual(fattening["total_income"], Decimal("0"))

    def test_what_was_produced_but_not_sold_is_visible(self):
        milk.record_production(self.farm, date=TODAY, liters=100, branch=self.breeding)
        milk.record_sale(
            self.farm,
            date=TODAY,
            quantity=70,
            unit_price=2,
            product=self.raw_milk,
            branch=self.breeding,
            into_account=self.cash,
        )
        summary = milk.summary(self.farm)
        self.assertEqual(summary["liters_produced"], Decimal("100.000"))
        self.assertEqual(summary["liters_sold"], Decimal("70.000"))
        self.assertEqual(summary["liters_kept"], Decimal("30.000"))


class FoundingCostTests(TestCase):
    """Building the farm must not look like a bad month."""

    def setUp(self):
        self.farm = make_farm()
        self.cash = cash(self.farm)

    def test_a_founding_cost_is_an_asset_not_an_expense(self):
        record_founding_cost(
            self.farm,
            date=TODAY,
            name="حظيرة",
            amount=5000,
            from_account=self.cash,
        )

        self.assertEqual(chart.get(self.farm, chart.FIXED_ASSETS).balance(), Decimal("5000"))
        self.assertEqual(profit_and_loss(self.farm)["total_expenses"], Decimal("0"))
        self.assertTrue(trial_balance(self.farm)["balanced"])

    def test_later_additions_accumulate_into_the_same_total(self):
        record_founding_cost(
            self.farm, date=TODAY, name="سياج", amount=1200, from_account=self.cash
        )
        record_founding_cost(
            self.farm,
            date=TODAY + timedelta(days=200),
            name="خزان مياه",
            amount=800,
            from_account=self.cash,
        )
        self.assertEqual(founding_summary(self.farm)["total"], Decimal("2000"))
        self.assertEqual(founding_summary(self.farm)["count"], 2)

    def test_a_founding_cost_needs_a_payer(self):
        with self.assertRaises(ValidationError):
            record_founding_cost(self.farm, date=TODAY, name="مولدة", amount=100)


class BranchProfitTests(TestCase):
    """Breeding and fattening are read side by side, never as one pot."""

    def setUp(self):
        self.farm = make_farm()
        self.cash = cash(self.farm)
        self.breeding = branch(self.farm, BranchCode.BREEDING)
        self.fattening = branch(self.farm, BranchCode.FATTENING)
        self.sheep = sheep_type(self.farm)

    def make_animal(self, tag, branch_row, price=None):
        animal = create_animal(
            self.farm,
            animal_type=self.sheep,
            tag=tag,
            sex=Sex.MALE,
            branch=branch_row,
            entered_at=TODAY,
        )
        if price is not None:
            animal.purchase_price = Decimal(price)
            animal.save(update_fields=["purchase_price"])
        return animal

    def test_a_mixed_sale_splits_its_revenue_between_the_branches(self):
        lamb = self.make_animal("B-1", self.breeding, price=40)
        fattened = self.make_animal("F-1", self.fattening, price=90)

        sell_animals(
            self.farm,
            date=TODAY,
            items=[
                {"animal": lamb, "unit_price": Decimal("100")},
                {"animal": fattened, "unit_price": Decimal("150")},
            ],
            into_account=self.cash,
        )

        breeding = profit_and_loss(self.farm, branch=self.breeding)
        fattening = profit_and_loss(self.farm, branch=self.fattening)

        self.assertEqual(breeding["total_income"], Decimal("100"))
        self.assertEqual(fattening["total_income"], Decimal("150"))
        # Each branch also carries the book value of what it gave up.
        self.assertEqual(breeding["total_expenses"], Decimal("40"))
        self.assertEqual(fattening["total_expenses"], Decimal("90"))
        self.assertTrue(trial_balance(self.farm)["balanced"])

    def test_an_expense_lands_on_the_branch_it_is_given(self):
        record_expense(
            self.farm,
            date=TODAY,
            amount=300,
            category=expense_category(self.farm, "veterinary"),
            from_account=self.cash,
            branch=self.breeding,
        )
        self.assertEqual(
            profit_and_loss(self.farm, branch=self.breeding)["total_expenses"], Decimal("300")
        )
        self.assertEqual(
            profit_and_loss(self.farm, branch=self.fattening)["total_expenses"], Decimal("0")
        )

    def test_shared_costs_show_up_as_their_own_column(self):
        record_expense(
            self.farm,
            date=TODAY,
            amount=120,
            category=expense_category(self.farm, "electricity"),
            from_account=self.cash,
            branch=branch(self.farm, BranchCode.SHARED),
        )
        comparison = branch_comparison(self.farm)
        shared = next(c for c in comparison["branches"] if c["code"] == BranchCode.SHARED)
        self.assertEqual(shared["total_expenses"], Decimal("120"))
        self.assertEqual(comparison["farm_total"]["total_expenses"], Decimal("120"))

    def test_the_branch_columns_add_back_up_to_the_farm(self):
        record_expense(
            self.farm,
            date=TODAY,
            amount=100,
            category=expense_category(self.farm),
            from_account=self.cash,
            branch=self.breeding,
        )
        record_expense(
            self.farm,
            date=TODAY,
            amount=50,
            category=expense_category(self.farm),
            from_account=self.cash,
            branch=self.fattening,
        )
        # Recorded with no branch at all: it must not vanish from the report.
        record_expense(
            self.farm,
            date=TODAY,
            amount=25,
            category=expense_category(self.farm),
            from_account=self.cash,
        )

        comparison = branch_comparison(self.farm)
        columns = sum(
            (column["total_expenses"] for column in comparison["branches"]), Decimal("0")
        )
        self.assertEqual(columns, comparison["farm_total"]["total_expenses"])
        self.assertEqual(columns, Decimal("175"))

    def test_each_kind_of_sale_lands_on_its_own_revenue_line(self):
        lamb = create_animal(
            self.farm,
            animal_type=self.sheep,
            tag="L-1",
            sex=Sex.MALE,
            branch=self.breeding,
            acquisition=Acquisition.BORN,
        )
        ewe = create_animal(
            self.farm,
            animal_type=self.sheep,
            tag="E-9",
            sex=Sex.FEMALE,
            branch=self.breeding,
            acquisition=Acquisition.OPENING,
        )
        fattened = self.make_animal("F-9", self.fattening)
        fattened.acquisition = Acquisition.PURCHASED
        fattened.save(update_fields=["acquisition"])

        routine = catalog_row(self.farm, CatalogTypeCode.SALE_REASON, "routine")
        culling = catalog_row(self.farm, CatalogTypeCode.SALE_REASON, "culling")

        sell_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": lamb, "unit_price": Decimal("190")}],
            into_account=self.cash,
            sale_reason=routine,
        )
        sell_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": ewe, "unit_price": Decimal("150")}],
            into_account=self.cash,
            sale_reason=culling,
        )
        sell_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": fattened, "unit_price": Decimal("300")}],
            into_account=self.cash,
            sale_reason=routine,
        )

        self.assertEqual(chart.get(self.farm, chart.OFFSPRING_SALES).balance(), Decimal("190"))
        self.assertEqual(chart.get(self.farm, chart.CULLED_SALES).balance(), Decimal("150"))
        self.assertEqual(chart.get(self.farm, chart.ANIMAL_SALES).balance(), Decimal("300"))

    def test_buying_an_animal_marks_it_as_purchased(self):
        from apps.operations.services import purchase_animals

        animal = create_animal(
            self.farm, animal_type=self.sheep, tag="P-1", sex=Sex.MALE, branch=self.fattening
        )
        self.assertEqual(animal.acquisition, Acquisition.BORN)

        purchase_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": animal, "unit_price": Decimal("200")}],
            from_account=self.cash,
        )
        animal.refresh_from_db()
        self.assertEqual(animal.acquisition, Acquisition.PURCHASED)

        # And so its sale is not mistaken for a lamb raised on the farm.
        sell_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": animal, "unit_price": Decimal("280")}],
            into_account=self.cash,
        )
        self.assertEqual(chart.get(self.farm, chart.ANIMAL_SALES).balance(), Decimal("280"))
        self.assertEqual(chart.get(self.farm, chart.OFFSPRING_SALES).balance(), Decimal("0"))

    def test_an_animal_born_here_but_culled_counts_as_a_cull(self):
        ewe = create_animal(
            self.farm,
            animal_type=self.sheep,
            tag="E-10",
            sex=Sex.FEMALE,
            branch=self.breeding,
            acquisition=Acquisition.BORN,
        )
        sell_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": ewe, "unit_price": Decimal("120")}],
            into_account=self.cash,
            sale_reason=catalog_row(self.farm, CatalogTypeCode.SALE_REASON, "culling"),
        )
        self.assertEqual(chart.get(self.farm, chart.CULLED_SALES).balance(), Decimal("120"))
        self.assertEqual(chart.get(self.farm, chart.OFFSPRING_SALES).balance(), Decimal("0"))

    def test_moving_an_animal_between_branches_leaves_a_trace(self):
        animal = self.make_animal("B-2", self.breeding)
        change_branch(animal, self.fattening, date=TODAY, note="فُطم ونُقل للتسمين")

        animal.refresh_from_db()
        self.assertEqual(animal.branch_id, self.fattening.id)
        event = animal.events.filter(event_type="branch").first()
        self.assertIsNotNone(event)
        self.assertEqual(event.data["from"], BranchCode.BREEDING)
        self.assertEqual(event.data["to"], BranchCode.FATTENING)

    def test_a_newborn_joins_its_mothers_branch(self):
        from apps.animals.services import register_birth

        ewe = create_animal(
            self.farm,
            animal_type=self.sheep,
            tag="E-1",
            sex=Sex.FEMALE,
            branch=self.breeding,
        )
        _, lambs = register_birth(
            self.farm,
            mother=ewe,
            happened_on=TODAY,
            offspring=[{"sex": Sex.MALE, "tag": "L-1"}],
        )
        self.assertEqual(lambs[0].branch_id, self.breeding.id)
