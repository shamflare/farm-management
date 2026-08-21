"""The endpoints behind the two-branch screens, and who may reach them."""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.animals.models import Sex
from apps.animals.services import create_animal
from apps.catalog.models import BranchCode, CatalogItem, CatalogTypeCode
from apps.inventory.models import InventoryItem, InventoryStore
from apps.ledger import chart
from tests.factories import cash, make_farm, make_user, sheep_type

TODAY = date.today().isoformat()


class BranchApiTestCase(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.viewer = make_user("viewer", self.farm, "viewer")
        self.cash = cash(self.farm)
        self.breeding = CatalogItem.objects.get(
            farm=self.farm, type_id=CatalogTypeCode.BRANCH, code=BranchCode.BREEDING
        )
        self.fattening = CatalogItem.objects.get(
            farm=self.farm, type_id=CatalogTypeCode.BRANCH, code=BranchCode.FATTENING
        )
        self.store = InventoryStore.objects.get(farm=self.farm, branch=self.breeding)
        self.barley = InventoryItem.objects.get(farm=self.farm, name="Barley")

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        return client


class StockEndpointTests(BranchApiTestCase):
    def receive(self, client, quantity=1000, total=500):
        return client.post(
            "/api/v1/ops/stock-receive/",
            {
                "store": str(self.store.id),
                "item": str(self.barley.id),
                "date": TODAY,
                "quantity": quantity,
                "total_cost": total,
                "from_account": str(self.cash.id),
            },
            format="json",
        )

    def test_receiving_then_issuing_moves_the_balance(self):
        client = self.client_for(self.owner)
        self.assertEqual(self.receive(client).status_code, 200)

        response = client.post(
            "/api/v1/ops/stock-issue/",
            {
                "store": str(self.store.id),
                "item": str(self.barley.id),
                "date": TODAY,
                "quantity": 250,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        balance = client.get("/api/v1/stock-balance/").json()["data"]
        store_row = next(
            row for row in balance["stores"] if row["store"]["id"] == str(self.store.id)
        )
        item_row = store_row["items"][0]
        self.assertEqual(Decimal(item_row["quantity"]), Decimal("750.000"))
        self.assertEqual(Decimal(item_row["value"]), Decimal("375.0000"))

    def test_issuing_more_than_the_store_holds_is_refused(self):
        client = self.client_for(self.owner)
        self.receive(client, quantity=10, total=10)
        response = client.post(
            "/api/v1/ops/stock-issue/",
            {
                "store": str(self.store.id),
                "item": str(self.barley.id),
                "date": TODAY,
                "quantity": 11,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_a_receipt_needs_someone_to_have_paid(self):
        response = self.client_for(self.owner).post(
            "/api/v1/ops/stock-receive/",
            {
                "store": str(self.store.id),
                "item": str(self.barley.id),
                "date": TODAY,
                "quantity": 5,
                "total_cost": 5,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_a_read_only_user_cannot_move_stock(self):
        response = self.receive(self.client_for(self.viewer))
        self.assertEqual(response.status_code, 403)

    def test_movements_are_read_only_over_the_api(self):
        client = self.client_for(self.owner)
        self.receive(client)
        response = client.post(
            "/api/v1/stock-movements/",
            {"store": str(self.store.id), "item": str(self.barley.id)},
            format="json",
        )
        self.assertIn(response.status_code, (403, 405))


class MilkEndpointTests(BranchApiTestCase):
    def test_logging_a_milking_then_reading_the_report(self):
        client = self.client_for(self.owner)
        response = client.post(
            "/api/v1/ops/milk-production/",
            {
                "date": TODAY,
                "liters": 48,
                "branch": str(self.breeding.id),
                "session": "day",
                "milking_animals": 9,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        report = client.get("/api/v1/reports/milk/?period=all").json()
        self.assertEqual(Decimal(report["liters_produced"]), Decimal("48.000"))
        self.assertEqual(Decimal(report["liters_sold"]), Decimal("0"))

    def test_a_dairy_sale_shows_up_as_branch_income(self):
        client = self.client_for(self.owner)
        raw_milk = CatalogItem.objects.get(
            farm=self.farm, type_id=CatalogTypeCode.MILK_PRODUCT, code="raw_milk"
        )
        response = client.post(
            "/api/v1/ops/milk-sale/",
            {
                "date": TODAY,
                "quantity": 40,
                "unit_price": "1.25",
                "product": str(raw_milk.id),
                "branch": str(self.breeding.id),
                "into_account": str(self.cash.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        branches = client.get("/api/v1/reports/branches/?period=all").json()
        breeding = next(
            column for column in branches["branches"] if column["code"] == BranchCode.BREEDING
        )
        self.assertEqual(Decimal(breeding["total_income"]), Decimal("50"))

    def test_a_sale_needs_somewhere_for_the_money_to_land(self):
        response = self.client_for(self.owner).post(
            "/api/v1/ops/milk-sale/",
            {"date": TODAY, "quantity": 10, "unit_price": "1.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class FoundingCostEndpointTests(BranchApiTestCase):
    def test_a_founding_cost_is_registered_and_totalled(self):
        client = self.client_for(self.owner)
        response = client.post(
            "/api/v1/ops/founding-cost/",
            {
                "date": TODAY,
                "name": "خزان مياه",
                "amount": 900,
                "from_account": str(self.cash.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        report = client.get("/api/v1/reports/founding-costs/").json()
        self.assertEqual(Decimal(report["total"]), Decimal("900"))
        self.assertEqual(Decimal(report["book_value"]), Decimal("900"))

        # And it stays out of the profit and loss.
        pl = client.get("/api/v1/reports/profit-loss/?period=all").json()
        self.assertEqual(Decimal(pl["total_expenses"]), Decimal("0"))


class AnimalBranchEndpointTests(BranchApiTestCase):
    def test_an_animal_can_be_created_into_a_branch_and_filtered_by_it(self):
        client = self.client_for(self.owner)
        response = client.post(
            "/api/v1/animals/",
            {
                "tag": "F-100",
                "animal_type": str(sheep_type(self.farm).id),
                "status": str(
                    CatalogItem.objects.get(
                        farm=self.farm, type_id=CatalogTypeCode.ANIMAL_STATUS, code="active"
                    ).id
                ),
                "branch": str(self.fattening.id),
                "sex": "male",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)

        listed = client.get(f"/api/v1/animals/?branch={self.fattening.id}").json()
        self.assertEqual(listed["count"], 1)
        self.assertEqual(listed["results"][0]["branch_code"], BranchCode.FATTENING)

        empty = client.get(f"/api/v1/animals/?branch={self.breeding.id}").json()
        self.assertEqual(empty["count"], 0)

    def test_moving_an_animal_between_branches_needs_edit_rights(self):
        animal = create_animal(
            self.farm,
            animal_type=sheep_type(self.farm),
            tag="B-100",
            sex=Sex.FEMALE,
            branch=self.breeding,
        )
        payload = {"branch": str(self.fattening.id), "date": TODAY}

        denied = self.client_for(self.viewer).post(
            f"/api/v1/animals/{animal.id}/branch/", payload, format="json"
        )
        self.assertEqual(denied.status_code, 403)

        allowed = self.client_for(self.owner).post(
            f"/api/v1/animals/{animal.id}/branch/", payload, format="json"
        )
        self.assertEqual(allowed.status_code, 200)
        animal.refresh_from_db()
        self.assertEqual(animal.branch_id, self.fattening.id)


class BranchReportTests(BranchApiTestCase):
    def test_the_dashboard_carries_a_card_for_each_branch(self):
        body = self.client_for(self.owner).get("/api/v1/reports/dashboard/?period=all").json()
        codes = {card["code"] for card in body["branches"]}
        self.assertIn(BranchCode.BREEDING, codes)
        self.assertIn(BranchCode.FATTENING, codes)
        self.assertIn("founding_total", body)
        self.assertIn("stock_value", body)

    def test_an_unknown_branch_is_an_error_not_the_whole_farm(self):
        response = self.client_for(self.owner).get(
            "/api/v1/reports/profit-loss/?period=all&branch=00000000-0000-0000-0000-000000000000"
        )
        self.assertEqual(response.status_code, 400)

    def test_the_unassigned_column_can_be_asked_for_by_name(self):
        response = self.client_for(self.owner).get(
            "/api/v1/reports/profit-loss/?period=all&branch=none"
        )
        self.assertEqual(response.status_code, 200)

    def test_the_stock_report_lists_both_stores(self):
        body = self.client_for(self.owner).get("/api/v1/reports/stock/").json()
        self.assertEqual(len(body["stores"]), 2)
        self.assertEqual(
            {row["branch"] for row in body["stores"]},
            {self.breeding.display_name, self.fattening.display_name},
        )
