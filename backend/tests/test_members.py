"""Giving people their own way in, and tying it to their money record."""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Membership, Role, User
from apps.parties.models import PartyKind
from apps.parties.services import create_party
from tests.factories import make_farm, make_user


class MemberManagementTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.client_ = APIClient()
        self.client_.force_authenticate(user=self.owner)
        self.client_.credentials(HTTP_X_FARM=self.farm.slug)
        self.worker_role = Role.objects.get(farm=self.farm, code="worker")

    def test_owner_creates_a_login_for_a_worker(self):
        party = create_party(self.farm, kind=PartyKind.WORKER, name="فراس الظاهر")
        response = self.client_.post(
            "/api/v1/members/",
            {
                "full_name": "فراس الظاهر",
                "username": "firas",
                "password": "farm-2026-pass",
                "role_id": str(self.worker_role.id),
                "party_id": str(party.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)

        body = response.json()
        self.assertEqual(body["user"]["username"], "firas")
        self.assertEqual(body["party"]["name"], "فراس الظاهر")

        # The new person can actually sign in with what the owner handed them.
        login = APIClient().post(
            "/api/v1/auth/login/", {"username": "firas", "password": "farm-2026-pass"}, format="json"
        )
        self.assertEqual(login.status_code, 200)
        self.assertIn("animals.create", login.json()["farms"][0]["permissions"])
        self.assertNotIn("finance.view", login.json()["farms"][0]["permissions"])

        party.refresh_from_db()
        self.assertEqual(party.user.username, "firas")

    def test_a_short_password_is_refused(self):
        response = self.client_.post(
            "/api/v1/members/",
            {"full_name": "x", "username": "shorty", "password": "1234", "role_id": str(self.worker_role.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="shorty").exists())

    def test_a_taken_username_is_refused(self):
        response = self.client_.post(
            "/api/v1/members/",
            {"full_name": "x", "username": "owner", "password": "farm-2026-pass", "role_id": str(self.worker_role.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_one_person_record_cannot_have_two_logins(self):
        party = create_party(self.farm, kind=PartyKind.WORKER, name="فراس")
        payload = {
            "full_name": "فراس",
            "username": "firas1",
            "password": "farm-2026-pass",
            "role_id": str(self.worker_role.id),
            "party_id": str(party.id),
        }
        self.assertEqual(self.client_.post("/api/v1/members/", payload, format="json").status_code, 201)

        payload["username"] = "firas2"
        response = self.client_.post("/api/v1/members/", payload, format="json")
        self.assertEqual(response.status_code, 400)

    def test_owner_can_reset_a_password(self):
        member = make_user("khaled", self.farm, "worker")
        membership = Membership.objects.get(user=member, farm=self.farm)
        response = self.client_.post(
            f"/api/v1/members/{membership.id}/set-password/", {"password": "brand-new-2026"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)

        login = APIClient().post(
            "/api/v1/auth/login/", {"username": "khaled", "password": "brand-new-2026"}, format="json"
        )
        self.assertEqual(login.status_code, 200)

    def test_an_owner_cannot_lock_themselves_out(self):
        membership = Membership.objects.get(user=self.owner, farm=self.farm)
        deactivate = self.client_.patch(
            f"/api/v1/members/{membership.id}/", {"is_active": False}, format="json"
        )
        self.assertEqual(deactivate.status_code, 400)
        self.assertEqual(self.client_.delete(f"/api/v1/members/{membership.id}/").status_code, 400)

    def test_a_deactivated_membership_loses_access(self):
        member = make_user("khaled", self.farm, "worker")
        membership = Membership.objects.get(user=member, farm=self.farm)
        self.client_.patch(f"/api/v1/members/{membership.id}/", {"is_active": False}, format="json")

        blocked = APIClient()
        blocked.force_authenticate(user=member)
        blocked.credentials(HTTP_X_FARM=self.farm.slug)
        self.assertEqual(blocked.get("/api/v1/animals/").status_code, 403)

    def test_a_worker_cannot_create_logins(self):
        worker = make_user("khaled", self.farm, "worker")
        client = APIClient()
        client.force_authenticate(user=worker)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        response = client.post(
            "/api/v1/members/",
            {"full_name": "x", "username": "sneaky", "password": "farm-2026-pass", "role_id": str(self.worker_role.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="sneaky").exists())

    def test_linking_and_unlinking_a_person_record(self):
        member = make_user("khaled", self.farm, "worker")
        membership = Membership.objects.get(user=member, farm=self.farm)
        party = create_party(self.farm, kind=PartyKind.WORKER, name="خالد")

        linked = self.client_.post(
            f"/api/v1/members/{membership.id}/link-party/", {"party": str(party.id)}, format="json"
        )
        self.assertEqual(linked.status_code, 200)
        party.refresh_from_db()
        self.assertEqual(party.user_id, member.id)

        self.client_.post(f"/api/v1/members/{membership.id}/link-party/", {"party": None}, format="json")
        party.refresh_from_db()
        self.assertIsNone(party.user_id)
