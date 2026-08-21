"""The settings a farm owner changes about the farm itself."""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.core.models import Farm
from apps.theme.models import Theme
from tests.factories import make_farm, make_user

TINY_PNG = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
    "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class FarmProfileTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm)
        self.worker = make_user("worker", self.farm, "worker")

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        return client

    def test_the_owner_renames_the_farm(self):
        response = self.client_for(self.owner).patch(
            f"/api/v1/farms/{self.farm.id}/", {"name": "مزرعة النور"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.farm.refresh_from_db()
        self.assertEqual(self.farm.name, "مزرعة النور")

    def test_a_worker_cannot_rename_the_farm(self):
        """Reading the farm is part of working in it; renaming it is not."""
        client = self.client_for(self.worker)
        self.assertEqual(client.get(f"/api/v1/farms/{self.farm.id}/").status_code, 200)

        response = client.patch(
            f"/api/v1/farms/{self.farm.id}/", {"name": "مزرعتي أنا"}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.farm.refresh_from_db()
        self.assertEqual(self.farm.name, "مزرعة الاختبار")

    def test_renaming_the_farm_is_written_down(self):
        self.client_for(self.owner).patch(
            f"/api/v1/farms/{self.farm.id}/", {"name": "مزرعة النور"}, format="json"
        )
        log = AuditLog.objects.filter(entity="farm").latest("created_at")
        self.assertEqual(log.old_values["name"], "مزرعة الاختبار")
        self.assertEqual(log.new_values["name"], "مزرعة النور")

    def test_the_farm_cannot_be_deleted_through_the_api(self):
        response = self.client_for(self.owner).delete(f"/api/v1/farms/{self.farm.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Farm.objects.filter(id=self.farm.id).exists())


class LogoTests(TestCase):
    """The logo rides in the database, because a free host's disk does not last."""

    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm)
        self.client_ = APIClient()
        self.client_.force_authenticate(user=self.owner)
        self.client_.credentials(HTTP_X_FARM=self.farm.slug)

    def test_an_inlined_logo_is_stored_and_served_in_the_theme(self):
        response = self.client_.patch(
            "/api/v1/theme/draft/", {"logo_data": TINY_PNG}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        draft = Theme.objects.get(farm=self.farm, status="draft")
        self.assertEqual(draft.logo_data, TINY_PNG)
        self.assertEqual(draft.token_payload()["brand"]["logo"], TINY_PNG)

    def test_something_that_is_not_an_image_is_refused(self):
        response = self.client_.patch(
            "/api/v1/theme/draft/",
            {"logo_data": "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_an_oversized_logo_is_refused(self):
        response = self.client_.patch(
            "/api/v1/theme/draft/",
            {"logo_data": "data:image/png;base64," + ("A" * 600_000)},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class ChangeOwnPasswordTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.user = make_user("worker", self.farm, "worker", password="old-pass-123")
        self.client_ = APIClient()
        self.client_.force_authenticate(user=self.user)
        self.client_.credentials(HTTP_X_FARM=self.farm.slug)

    def change(self, **payload):
        return self.client_.post("/api/v1/auth/change-password/", payload, format="json")

    def test_anyone_can_change_their_own_password(self):
        response = self.change(current_password="old-pass-123", new_password="brand-new-pass-9")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("brand-new-pass-9"))

    def test_the_current_password_has_to_be_right(self):
        response = self.change(current_password="not-it", new_password="brand-new-pass-9")
        self.assertEqual(response.status_code, 403)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("old-pass-123"))

    def test_a_weak_new_password_is_refused(self):
        response = self.change(current_password="old-pass-123", new_password="1234")
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("old-pass-123"))

    def test_the_new_password_never_reaches_the_audit_log(self):
        self.change(current_password="old-pass-123", new_password="brand-new-pass-9")
        log = AuditLog.objects.filter(entity="user").latest("created_at")
        self.assertNotIn("brand-new-pass-9", str(log.old_values) + str(log.new_values) + log.label)
