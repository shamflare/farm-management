"""المسودة تُفتح على ما هو منشور، لا على ما نسيه أحدهم فيها."""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.theme import services as theme_services
from apps.theme.models import Theme, ThemeStatus
from tests.factories import make_farm, make_user


class DraftFreshnessTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        theme_services.save_draft(self.farm, {"colors": {"primary": "#11478D"}})
        theme_services.publish(self.farm, actor=self.owner)

    def test_the_screen_opens_on_what_is_published(self):
        draft = theme_services.get_draft(self.farm)

        self.assertEqual(draft.colors["primary"], "#11478D")

    def test_a_draft_untouched_since_the_last_publish_is_refreshed(self):
        """الفخّ: مسودة قديمة تُنشر فوق عمل جاء بعدها.

        تُعدَّل الألوان وتُنشر من جهاز، ثم تُفتح الشاشة على جهاز آخر بقيت فيه
        مسودة قديمة؛ فتغيير لون واحد ونشره كان يمحو كل ما نُشر بينهما.
        """
        stale = Theme.objects.create(
            farm=self.farm,
            status=ThemeStatus.DRAFT,
            colors={"primary": "#166534"},
            font_family="Cairo",
        )
        # تُرجَع الطوابع الزمنية إلى ما قبل النشر
        Theme.objects.filter(pk=stale.pk).update(
            updated_at=theme_services.get_published(self.farm).published_at
        )

        draft = theme_services.get_draft(self.farm)

        self.assertEqual(draft.colors["primary"], "#11478D")

    def test_unpublished_work_is_never_thrown_away(self):
        """تعديل لم يُنشر بعد عملٌ لصاحبه، لا يُمحى لأن نشرًا سبقه."""
        theme_services.save_draft(self.farm, {"colors": {"primary": "#7C2D12"}})

        draft = theme_services.get_draft(self.farm)

        self.assertEqual(draft.colors["primary"], "#7C2D12")
        self.assertTrue(theme_services.draft_differs(self.farm))

    def test_reverting_brings_back_what_people_see(self):
        theme_services.save_draft(self.farm, {"colors": {"primary": "#7C2D12"}})

        theme_services.revert_draft(self.farm, actor=self.owner)

        draft = theme_services.get_draft(self.farm)
        self.assertEqual(draft.colors["primary"], "#11478D")
        self.assertFalse(theme_services.draft_differs(self.farm))

    def test_changing_one_colour_keeps_the_others(self):
        """ما اشتكى منه صاحب المزرعة: لون واحد يُغيَّر، والبقية تبقى."""
        theme_services.save_draft(
            self.farm,
            {"colors": {"sidebar": "#11478D", "sidebar_text": "#FFFFFF"}, "font_family": "Almarai"},
        )
        theme_services.publish(self.farm, actor=self.owner)

        # لون واحد وحده، بعد يوم، من شاشة فُتحت من جديد
        theme_services.save_draft(self.farm, {"colors": {"accent": "#00478A"}})
        theme_services.publish(self.farm, actor=self.owner)

        published = theme_services.published_payload(self.farm)
        self.assertEqual(published["colors"]["accent"], "#00478A")
        self.assertEqual(published["colors"]["sidebar"], "#11478D")
        self.assertEqual(published["colors"]["sidebar_text"], "#FFFFFF")
        self.assertEqual(published["typography"]["font_family"], "Almarai")

    def test_the_api_says_when_the_draft_is_not_what_people_see(self):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        client.credentials(HTTP_X_FARM=self.farm.slug)

        quiet = client.get("/api/v1/theme/draft/").json()
        self.assertFalse(quiet["differs_from_published"])

        client.patch("/api/v1/theme/draft/", {"colors": {"primary": "#7C2D12"}}, format="json")
        noisy = client.get("/api/v1/theme/draft/").json()
        self.assertTrue(noisy["differs_from_published"])

        reverted = client.post("/api/v1/theme/revert/").json()
        self.assertFalse(reverted["differs_from_published"])
