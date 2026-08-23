"""أول إقلاع على خادم جديد.

الأمر يعمل عند كل إقلاع، فالخطر فيه ليس أن يفشل بل أن ينجح مرتين: يعيد بناء ما
بُني، أو يعيد كلمة مرور غيّرها صاحبها. هذه الاختبارات تثبّت أنه يُنشئ ما ينقص
فقط.
"""
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from apps.accounts.models import Membership, User
from apps.animals.models import Animal
from apps.catalog.models import CatalogItem
from apps.core.models import Farm
from apps.ledger.models import Account, JournalEntry

ENV = {
    "FARM_NAME": "مزرعة زاد",
    "FARM_SLUG": "zadfarm",
    "OWNER_USERNAME": "owner",
    "OWNER_NAME": "أبو محمد",
    "OWNER_PASSWORD": "server-pass-2026",
    "OWNER_PASSWORD_RESET": "0",
}


def run(**overrides):
    with mock.patch.dict("os.environ", {**ENV, **overrides}, clear=False):
        call_command("init_farm")


class InitFarmTests(TestCase):
    def test_a_new_server_gets_a_farm_that_is_ready_but_empty(self):
        run()

        farm = Farm.objects.get(slug="zadfarm")
        self.assertEqual(farm.name, "مزرعة زاد")
        # جاهزة: الفروع والقوائم ودليل الحسابات موجودة.
        self.assertTrue(CatalogItem.objects.filter(farm=farm, type_id="branch").exists())
        self.assertTrue(Account.objects.filter(farm=farm).exists())
        # وفارغة: لا حيوان ولا قيد.
        self.assertEqual(Animal.objects.filter(farm=farm).count(), 0)
        self.assertEqual(JournalEntry.objects.filter(farm=farm).count(), 0)

    def test_the_owner_can_sign_in_with_the_password_from_the_environment(self):
        run()

        user = User.objects.get(username="owner")
        self.assertTrue(user.check_password("server-pass-2026"))
        self.assertEqual(user.full_name, "أبو محمد")
        membership = Membership.objects.get(user=user, farm__slug="zadfarm")
        self.assertEqual(membership.role.code, "owner")

    def test_running_it_again_changes_nothing(self):
        run()
        run()

        self.assertEqual(Farm.objects.filter(slug="zadfarm").count(), 1)
        self.assertEqual(User.objects.filter(username="owner").count(), 1)
        self.assertEqual(Membership.objects.filter(user__username="owner").count(), 1)

    def test_a_password_changed_in_the_app_survives_the_next_boot(self):
        run()
        user = User.objects.get(username="owner")
        user.set_password("the-one-i-chose")
        user.save()

        run()

        user.refresh_from_db()
        self.assertTrue(user.check_password("the-one-i-chose"))

    def test_the_reset_switch_puts_the_environment_password_back(self):
        """مخرج من نسيان كلمة المرور: متغيّر واحد وإعادة تشغيل."""
        run()
        user = User.objects.get(username="owner")
        user.set_password("forgotten")
        user.save()

        run(OWNER_PASSWORD_RESET="1")

        user.refresh_from_db()
        self.assertTrue(user.check_password("server-pass-2026"))

    def test_without_a_password_no_login_is_created(self):
        run(OWNER_PASSWORD="")

        self.assertTrue(Farm.objects.filter(slug="zadfarm").exists())
        self.assertFalse(User.objects.filter(username="owner").exists())
