"""API behaviour: authentication, permissions, and farm isolation."""
from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from apps.animals.models import Sex
from apps.animals.services import create_animal
from apps.ledger import chart
from tests.factories import cash, expense_category, make_farm, make_user, sheep_type

TODAY = date.today().isoformat()


class ApiTestCase(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.worker = make_user("worker", self.farm, "worker")
        self.viewer = make_user("viewer", self.farm, "viewer")

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        return client


class AuthTests(ApiTestCase):
    def test_login_returns_permissions_and_farms(self):
        client = APIClient()
        response = client.post(
            "/api/v1/auth/login/", {"username": "owner", "password": "test1234"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("access", body)
        self.assertEqual(len(body["farms"]), 1)
        self.assertIn("animals.create", body["farms"][0]["permissions"])

    def test_anonymous_requests_are_rejected(self):
        response = APIClient().get("/api/v1/animals/")
        self.assertEqual(response.status_code, 401)

    def test_me_returns_the_theme_so_clients_can_render_immediately(self):
        response = self.client_for(self.owner).get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("colors", body["theme"])
        self.assertIn("primary", body["theme"]["colors"])


class CorsTests(ApiTestCase):
    """The browser refuses to send X-Farm unless the preflight advertises it."""

    def test_preflight_allows_the_farm_header(self):
        response = APIClient().options(
            "/api/v1/auth/me/",
            HTTP_ORIGIN="http://localhost:3000",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,x-farm",
        )
        allowed = response.headers.get("access-control-allow-headers", "")
        self.assertIn("x-farm", allowed.lower())
        self.assertIn("authorization", allowed.lower())


class PermissionTests(ApiTestCase):
    def test_worker_can_add_an_animal(self):
        response = self.client_for(self.worker).post(
            "/api/v1/animals/",
            {
                "tag": "W-001",
                "animal_type": str(sheep_type(self.farm).id),
                "status": str(
                    self.farm.catalogitem_set.get(type_id="animal_status", code="active").id
                ),
                "sex": Sex.FEMALE,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)

    def test_worker_cannot_read_the_ledger(self):
        response = self.client_for(self.worker).get("/api/v1/entries/")
        self.assertEqual(response.status_code, 403)

    def test_viewer_cannot_create_an_animal(self):
        response = self.client_for(self.viewer).post(
            "/api/v1/animals/", {"tag": "V-1"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_worker_cannot_settle_with_a_worker(self):
        response = self.client_for(self.worker).post(
            "/api/v1/ops/settle/",
            {"date": TODAY, "amount": "10", "party": str(self.farm.id), "account": str(self.farm.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_owner_can_read_everything(self):
        client = self.client_for(self.owner)
        for path in ("/api/v1/entries/", "/api/v1/accounts/", "/api/v1/reports/dashboard/"):
            self.assertEqual(client.get(path).status_code, 200, path)


class TenancyTests(ApiTestCase):
    def test_a_user_cannot_see_another_farms_animals(self):
        other_farm = make_farm(slug="other", name="مزرعة ثانية")
        create_animal(other_farm, animal_type=sheep_type(other_farm), tag="OTHER-1")
        create_animal(self.farm, animal_type=sheep_type(self.farm), tag="MINE-1")

        response = self.client_for(self.owner).get("/api/v1/animals/")
        tags = [row["tag"] for row in response.json()["results"]]
        self.assertIn("MINE-1", tags)
        self.assertNotIn("OTHER-1", tags)

    def test_requesting_a_farm_you_do_not_belong_to_is_refused(self):
        other_farm = make_farm(slug="other", name="مزرعة ثانية")
        client = APIClient()
        client.force_authenticate(user=self.owner)
        client.credentials(HTTP_X_FARM=other_farm.slug)
        response = client.get("/api/v1/animals/")
        self.assertEqual(response.status_code, 403)


class ExpenseEndpointTests(ApiTestCase):
    def test_expense_endpoint_posts_a_balanced_entry(self):
        client = self.client_for(self.owner)
        response = client.post(
            "/api/v1/ops/expense/",
            {
                "date": TODAY,
                "amount": "120.50",
                "category": str(expense_category(self.farm).id),
                "from_account": str(cash(self.farm).id),
                "memo": "شعير",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        entry = response.json()["data"]
        self.assertEqual(entry["status"], "posted")
        self.assertEqual(len(entry["lines"]), 2)
        debit = sum(float(line["debit"]) for line in entry["lines"])
        credit = sum(float(line["credit"]) for line in entry["lines"])
        self.assertEqual(debit, credit)
        self.assertEqual(cash(self.farm).balance(), -1 * float(120.50))

    def test_expense_without_a_payer_is_rejected(self):
        response = self.client_for(self.owner).post(
            "/api/v1/ops/expense/", {"date": TODAY, "amount": "50"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_entries_cannot_be_created_directly(self):
        response = self.client_for(self.owner).post("/api/v1/entries/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_dashboard_reports_the_cash_position(self):
        client = self.client_for(self.owner)
        client.post(
            "/api/v1/ops/expense/",
            {
                "date": TODAY,
                "amount": "40",
                "category": str(expense_category(self.farm).id),
                "from_account": str(cash(self.farm).id),
            },
            format="json",
        )
        body = client.get("/api/v1/reports/dashboard/").json()
        self.assertEqual(float(body["money"]["cash_on_hand"]), -40.0)
        self.assertEqual(float(body["money"]["expenses"]), 40.0)
