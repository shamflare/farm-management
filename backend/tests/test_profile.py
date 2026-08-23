"""الاسم الذي تناديك به الشاشة.

كان اسم صاحب المزرعة يُكتب مرة عند إنشاء الحساب ثم لا سبيل إلى تصحيحه: يظهر
أسفل القائمة الجانبية وفي كل سطر من سجل التدقيق. هذه الاختبارات تثبّت أن صاحبه
يغيّره بنفسه، وأن من يدير المستخدمين يصحّح أسماء غيره، وأن اسم الدخول لا يُمسّ.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Membership, User
from apps.audit.models import AuditAction, AuditLog
from tests.factories import make_farm, make_user


class ProfileTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.worker = make_user("worker", self.farm, "worker")
        self.client_ = self.client_for(self.owner)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        return client

    def test_a_person_renames_themselves(self):
        response = self.client_.patch(
            "/api/v1/auth/me/", {"full_name": "أبو محمد"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["user"]["full_name"], "أبو محمد")

        self.owner.refresh_from_db()
        self.assertEqual(self.owner.full_name, "أبو محمد")

    def test_a_worker_renames_themselves_without_any_extra_permission(self):
        """تصحيح اسمك ليس صلاحية إدارية — لا يمرّ على المالك."""
        response = self.client_for(self.worker).patch(
            "/api/v1/auth/me/", {"full_name": "خالد المشرف"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.full_name, "خالد المشرف")

    def test_an_empty_name_is_refused(self):
        response = self.client_.patch("/api/v1/auth/me/", {"full_name": "   "}, format="json")
        self.assertEqual(response.status_code, 400)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.full_name, "owner")

    def test_the_login_name_is_not_changed_from_here(self):
        response = self.client_.patch(
            "/api/v1/auth/me/", {"username": "someone-else"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.username, "owner")
        self.assertFalse(User.objects.filter(username="someone-else").exists())

    def test_the_rename_is_written_in_the_audit_log(self):
        self.client_.patch("/api/v1/auth/me/", {"full_name": "أبو محمد"}, format="json")

        log = AuditLog.objects.filter(entity="user", action=AuditAction.UPDATE).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.old_values["full_name"], "owner")
        self.assertEqual(log.new_values["full_name"], "أبو محمد")

    def test_whoever_manages_users_can_correct_someone_elses_name(self):
        membership = Membership.objects.get(farm=self.farm, user=self.worker)
        response = self.client_.patch(
            f"/api/v1/members/{membership.id}/",
            {"full_name": "خالد - المشرف", "phone": "0999"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["user"]["full_name"], "خالد - المشرف")

        self.worker.refresh_from_db()
        self.assertEqual(self.worker.full_name, "خالد - المشرف")
        self.assertEqual(self.worker.phone, "0999")

    def test_a_worker_cannot_rename_other_people(self):
        membership = Membership.objects.get(farm=self.farm, user=self.owner)
        response = self.client_for(self.worker).patch(
            f"/api/v1/members/{membership.id}/", {"full_name": "أنا المالك"}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.full_name, "owner")
