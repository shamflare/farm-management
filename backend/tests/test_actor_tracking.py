"""Whoever acts, owns the record.

Every row and every audit line has to name the person who created it, including
when the request arrives with a JWT - which DRF only resolves inside the view,
after middleware has already run.
"""
from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from apps.animals.models import Animal
from apps.audit.models import AuditLog
from apps.catalog.models import CatalogItem, CatalogTypeCode
from apps.ledger.models import JournalEntry
from tests.factories import cash, expense_category, make_farm, make_user, sheep_type

TODAY = date.today().isoformat()


class ActorTrackingTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.worker = make_user("khaled", self.farm, "worker")

    def api_as(self, user):
        """A real token, so authentication happens where it does in production."""
        client = APIClient()
        response = client.post(
            "/api/v1/auth/login/", {"username": user.username, "password": "test1234"}, format="json"
        )
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}", HTTP_X_FARM=self.farm.slug
        )
        return client

    def test_an_animal_records_who_registered_it(self):
        status = CatalogItem.objects.get(
            farm=self.farm, type_id=CatalogTypeCode.ANIMAL_STATUS, code="active"
        )
        response = self.api_as(self.worker).post(
            "/api/v1/animals/",
            {
                "tag": "K-001",
                "animal_type": str(sheep_type(self.farm).id),
                "status": str(status.id),
                "sex": "female",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)

        animal = Animal.objects.get(tag="K-001")
        self.assertEqual(animal.created_by, self.worker)

        log = AuditLog.objects.filter(entity="animal", object_id=str(animal.id)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.user, self.worker)

    def test_an_expense_names_the_person_who_recorded_it(self):
        response = self.api_as(self.worker).post(
            "/api/v1/ops/expense/",
            {
                "date": TODAY,
                "amount": "60",
                "category": str(expense_category(self.farm).id),
                "from_account": str(cash(self.farm).id),
                "memo": "شعير",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)

        entry = JournalEntry.objects.get(memo="شعير")
        self.assertEqual(entry.created_by, self.worker)
        self.assertEqual(response.json()["data"]["created_by_name"], self.worker.full_name)

        log = AuditLog.objects.filter(entity="journal_entry", object_id=str(entry.id)).first()
        self.assertEqual(log.user, self.worker)

    def test_two_users_are_never_confused_for_each_other(self):
        status = CatalogItem.objects.get(
            farm=self.farm, type_id=CatalogTypeCode.ANIMAL_STATUS, code="active"
        )
        for user, tag in ((self.worker, "W-1"), (self.owner, "O-1")):
            self.api_as(user).post(
                "/api/v1/animals/",
                {
                    "tag": tag,
                    "animal_type": str(sheep_type(self.farm).id),
                    "status": str(status.id),
                    "sex": "male",
                },
                format="json",
            )
        self.assertEqual(Animal.objects.get(tag="W-1").created_by, self.worker)
        self.assertEqual(Animal.objects.get(tag="O-1").created_by, self.owner)

    def test_an_edit_records_the_editor_separately_from_the_creator(self):
        status = CatalogItem.objects.get(
            farm=self.farm, type_id=CatalogTypeCode.ANIMAL_STATUS, code="active"
        )
        created = self.api_as(self.worker).post(
            "/api/v1/animals/",
            {
                "tag": "E-1",
                "animal_type": str(sheep_type(self.farm).id),
                "status": str(status.id),
                "sex": "female",
            },
            format="json",
        ).json()

        self.api_as(self.owner).patch(
            f"/api/v1/animals/{created['id']}/", {"name": "النعجة الكبيرة"}, format="json"
        )

        animal = Animal.objects.get(tag="E-1")
        self.assertEqual(animal.created_by, self.worker)
        self.assertEqual(animal.updated_by, self.owner)


class FieldStaffAccessTests(TestCase):
    """A worker must be able to open the screens their job depends on."""

    def setUp(self):
        self.farm = make_farm()
        self.worker = make_user("khaled", self.farm, "worker")
        response = APIClient().post(
            "/api/v1/auth/login/", {"username": "khaled", "password": "test1234"}, format="json"
        )
        self.client_ = APIClient()
        self.client_.credentials(
            HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}", HTTP_X_FARM=self.farm.slug
        )

    def test_worker_can_load_the_lists_every_form_needs(self):
        self.assertEqual(self.client_.get("/api/v1/catalog/?type=animal_type").status_code, 200)
        self.assertEqual(self.client_.get("/api/v1/fields/?entity=animal").status_code, 200)

    def test_worker_can_pick_an_account_without_seeing_balances(self):
        response = self.client_.get("/api/v1/accounts/pickable/")
        self.assertEqual(response.status_code, 200)
        rows = response.json()["data"]
        self.assertTrue(rows)
        self.assertNotIn("balance", rows[0])

    def test_worker_can_pick_a_person_without_seeing_their_balances(self):
        response = self.client_.get("/api/v1/parties/pickable/")
        self.assertEqual(response.status_code, 200)
        for row in response.json()["data"]:
            self.assertNotIn("summary", row)

    def test_worker_still_cannot_read_the_books(self):
        self.assertEqual(self.client_.get("/api/v1/accounts/").status_code, 403)
        self.assertEqual(self.client_.get("/api/v1/entries/").status_code, 403)
        self.assertEqual(self.client_.get("/api/v1/parties/").status_code, 403)
        self.assertEqual(self.client_.get("/api/v1/reports/trial-balance/").status_code, 403)

    def test_worker_cannot_edit_the_lists_they_can_read(self):
        response = self.client_.post(
            "/api/v1/catalog/",
            {"type": "expense_category", "code": "sneaky", "name": "x", "name_ar": "س"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
