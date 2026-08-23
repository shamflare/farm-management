"""The configurable layer: dynamic fields, catalog lists, and theming."""
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.animals.services import create_animal
from apps.catalog.models import CatalogItem, CatalogTypeCode
from apps.customfields.models import EntityType, FieldDefinition, FieldType
from apps.customfields.services import get_values, set_values
from apps.theme import services as theme_services
from apps.theme.models import Theme, ThemeStatus
from tests.factories import make_farm, make_user, sheep_type


class CustomFieldTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.animal = create_animal(self.farm, animal_type=sheep_type(self.farm), tag="A-1")

    def make_field(self, **kwargs):
        defaults = dict(
            farm=self.farm,
            entity=EntityType.ANIMAL,
            key="chip",
            label="Chip",
            label_ar="رقم الشريحة",
            field_type=FieldType.TEXT,
        )
        defaults.update(kwargs)
        return FieldDefinition.objects.create(**defaults)

    def test_owner_defined_field_stores_a_value(self):
        self.make_field()
        set_values(self.farm, "animal", self.animal.id, {"chip": "SY-99231"})
        self.assertEqual(get_values(self.farm, "animal", self.animal.id)["chip"], "SY-99231")

    def test_unknown_field_is_rejected(self):
        with self.assertRaises(ValidationError):
            set_values(self.farm, "animal", self.animal.id, {"not_a_field": "x"})

    def test_required_field_must_be_supplied(self):
        self.make_field(is_required=True)
        with self.assertRaises(ValidationError):
            set_values(self.farm, "animal", self.animal.id, {})

    def test_number_range_is_enforced_on_the_server(self):
        self.make_field(
            key="score", field_type=FieldType.NUMBER, validation={"min": 1, "max": 5}
        )
        set_values(self.farm, "animal", self.animal.id, {"score": 4})
        with self.assertRaises(ValidationError):
            set_values(self.farm, "animal", self.animal.id, {"score": 9})

    def test_dropdown_rejects_values_outside_its_options(self):
        self.make_field(
            key="grade",
            field_type=FieldType.DROPDOWN,
            options={"choices": [{"value": "a"}, {"value": "b"}]},
        )
        set_values(self.farm, "animal", self.animal.id, {"grade": "a"})
        with self.assertRaises(ValidationError):
            set_values(self.farm, "animal", self.animal.id, {"grade": "z"})

    def test_builtin_fields_are_hidden_rather_than_deleted(self):
        field = FieldDefinition.objects.get(farm=self.farm, entity="animal", key="color")
        field.delete()
        field.refresh_from_db()
        self.assertFalse(field.is_visible)
        self.assertIsNone(field.deleted_at)


class CatalogTests(TestCase):
    def setUp(self):
        self.farm = make_farm()

    def test_seeded_lists_are_available_per_farm(self):
        categories = CatalogItem.objects.filter(
            farm=self.farm, type_id=CatalogTypeCode.EXPENSE_CATEGORY
        )
        self.assertGreater(categories.count(), 10)
        barley = categories.get(code="barley")
        self.assertEqual(barley.parent.code, "feed")

    def test_seeded_rows_are_deactivated_not_removed(self):
        item = CatalogItem.objects.get(
            farm=self.farm, type_id=CatalogTypeCode.EXPENSE_CATEGORY, code="fuel"
        )
        item.delete()
        item.refresh_from_db()
        self.assertFalse(item.is_active)
        self.assertIsNone(item.deleted_at)

    def test_owner_can_add_a_new_category_without_code_changes(self):
        parent = CatalogItem.objects.get(
            farm=self.farm, type_id=CatalogTypeCode.EXPENSE_CATEGORY, code="feed"
        )
        item = CatalogItem.objects.create(
            farm=self.farm,
            type_id=CatalogTypeCode.EXPENSE_CATEGORY,
            parent=parent,
            code="alfalfa",
            name="Alfalfa",
            name_ar="برسيم",
        )
        self.assertEqual(item.full_path(), "برسيم ← أعلاف")


class ThemeTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")

    def test_default_theme_is_published_for_a_new_farm(self):
        payload = theme_services.published_payload(self.farm)
        self.assertEqual(payload["colors"]["primary"], "#166534")
        self.assertEqual(payload["brand"]["name"], self.farm.name)

    def test_unreadable_colors_are_refused_at_publish(self):
        theme_services.save_draft(
            self.farm, {"colors": {"primary": "#FFFF00", "primary_contrast": "#FFFFFF"}}
        )
        with self.assertRaises(ValidationError):
            theme_services.publish(self.farm)

    def test_readable_theme_publishes_and_bumps_the_version(self):
        before = theme_services.published_payload(self.farm)["version"]
        theme_services.save_draft(
            self.farm, {"colors": {"primary": "#7C2D12"}, "brand_name": "مزرعة النور"}
        )
        theme = theme_services.publish(self.farm)
        self.assertEqual(theme.status, ThemeStatus.PUBLISHED)
        self.assertGreater(theme.version, before)
        payload = theme_services.published_payload(self.farm)
        self.assertEqual(payload["colors"]["primary"], "#7C2D12")
        self.assertEqual(payload["brand"]["name"], "مزرعة النور")

    def test_invalid_font_is_refused(self):
        draft = theme_services.get_draft(self.farm)
        draft.font_family = "Comic Sans"
        draft.save()
        problems = theme_services.validate_theme(draft)
        self.assertTrue(any(p["field"] == "font_family" for p in problems))

    def test_the_frame_has_its_own_colors_and_they_default_to_todays_look(self):
        """القائمة الجانبية والشريط العلوي يُلوَّنان على حدة.

        وقيمتهما الافتراضية هي لون البطاقات ولون النص نفسهما، فمزرعة قائمة لا
        يتغيّر شكلها لمجرد أن الحقول أُضيفت.
        """
        payload = theme_services.published_payload(self.farm)
        colors = payload["colors"]
        for key in ("sidebar", "sidebar_text", "header", "header_text"):
            self.assertIn(key, colors)
        self.assertEqual(colors["sidebar"], colors["surface"])
        self.assertEqual(colors["sidebar_text"], colors["text"])
        self.assertEqual(colors["header"], colors["surface"])
        self.assertEqual(colors["header_text"], colors["text"])

    def test_a_dark_sidebar_with_light_text_is_accepted(self):
        theme_services.save_draft(
            self.farm, {"colors": {"sidebar": "#0F2A1D", "sidebar_text": "#F1F5F9"}}
        )
        theme = theme_services.publish(self.farm)
        self.assertEqual(theme.colors["sidebar"], "#0F2A1D")
        self.assertEqual(
            theme_services.published_payload(self.farm)["colors"]["sidebar_text"], "#F1F5F9"
        )

    def test_an_unreadable_sidebar_is_refused(self):
        """نص فاتح على قائمة فاتحة يجعل أسماء الأقسام غير مقروءة."""
        theme_services.save_draft(
            self.farm, {"colors": {"sidebar": "#FFFFFF", "sidebar_text": "#F8FAFC"}}
        )
        with self.assertRaises(ValidationError):
            theme_services.publish(self.farm)

    def test_an_unreadable_header_is_refused(self):
        theme_services.save_draft(
            self.farm, {"colors": {"header": "#111827", "header_text": "#1F2937"}}
        )
        with self.assertRaises(ValidationError):
            theme_services.publish(self.farm)

    def test_every_offered_font_is_a_font_the_theme_accepts(self):
        """القائمة المعروضة للاختيار هي نفسها التي يقبلها التحقق.

        لو افترقتا لظهر خط في الشاشة يرفضه الخادم عند النشر — أسوأ من ألا
        يُعرض أصلًا.
        """
        from apps.theme.models import FONT_CATALOG

        draft = theme_services.get_draft(self.farm)
        for family, label, note, kind in FONT_CATALOG:
            draft.font_family = family
            draft.save()
            problems = theme_services.validate_theme(draft)
            self.assertFalse(
                [p for p in problems if p["field"] == "font_family"],
                f"الخط {family} معروض لكنه مرفوض",
            )
            self.assertTrue(label and note and kind, f"الخط {family} ينقصه وصف عربي")

    def test_the_font_list_travels_with_the_draft(self):
        """الشاشة ترسم الخيارات من رد الخادم، فلا تحتفظ بنسخة ثانية تتقادم."""
        client = APIClient()
        client.force_authenticate(user=self.owner)
        client.credentials(HTTP_X_FARM=self.farm.slug)

        response = client.get("/api/v1/theme/draft/")
        self.assertEqual(response.status_code, 200)
        fonts = response.json()["fonts"]
        families = [font["family"] for font in fonts]
        self.assertIn("Cairo", families)
        self.assertIn("Tajawal", families)
        self.assertTrue(all(font["label"] for font in fonts))

    def test_choosing_a_font_reaches_the_clients_that_draw_it(self):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        client.credentials(HTTP_X_FARM=self.farm.slug)

        client.patch("/api/v1/theme/draft/", {"font_family": "Almarai"}, format="json")
        self.assertEqual(client.post("/api/v1/theme/publish/").status_code, 200)

        payload = theme_services.published_payload(self.farm)
        self.assertEqual(payload["typography"]["font_family"], "Almarai")

    def test_theme_endpoint_serves_tokens_to_clients(self):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        response = client.get("/api/v1/theme/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("typography", response.json())

    def test_publishing_bad_colors_through_the_api_returns_the_reason(self):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        client.patch(
            "/api/v1/theme/draft/",
            {"colors": {"text": "#EEEEEE", "background": "#FFFFFF"}},
            format="json",
        )
        response = client.post("/api/v1/theme/publish/")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()["ok"])
        self.assertTrue(response.json()["problems"])
