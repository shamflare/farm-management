"""إفراغ المزرعة: يمحو ما حدث، ويُبقي ما يجعلها قابلة للاستعمال.

الفرق بين هذا وبين حذف المزرعة أن صاحبها بعده يفتح اللوحة فيجدها فارغة وجاهزة:
الفروع مكانها، دليل الحسابات كامل، وحسابه يدخل كما كان — فقط لا يوجد فيها شيء
بعد. أي شيء من هذين الطرفين ينكسر يجعل الأمر عديم الفائدة أو مدمّرًا.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from apps.accounts.models import Membership
from apps.animals.models import Animal, Sex
from apps.animals.services import create_animal
from apps.audit.models import AuditLog
from apps.catalog.models import CatalogItem
from apps.core.models import Farm
from apps.core.purge import empty_farm, purge_farm
from apps.customfields.models import FieldDefinition
from apps.inventory.models import InventoryStore
from apps.ledger import chart
from apps.ledger.models import Account, JournalEntry
from apps.ledger.services import Line, post_entry
from apps.parties.models import Party, PartyKind
from apps.parties.services import create_party
from apps.theme.models import Theme
from tests.factories import cash, make_farm, make_user, sheep_type

TODAY = date.today()


class EmptyFarmTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.cash = cash(self.farm)

        create_animal(
            self.farm, animal_type=sheep_type(self.farm), sex=Sex.FEMALE, actor=self.owner
        )
        post_entry(
            self.farm,
            date=TODAY,
            kind="expense",
            lines=[
                Line.dr(chart.get(self.farm, chart.OTHER_EXPENSE), 120),
                Line.cr(self.cash, 120),
            ],
            memo="علف",
            actor=self.owner,
        )
        create_party(self.farm, kind=PartyKind.SUPPLIER, name="معمل الأعلاف")

    def test_what_happened_is_gone(self):
        empty_farm(self.farm)

        self.assertEqual(Animal.all_objects.filter(farm=self.farm).count(), 0)
        self.assertEqual(JournalEntry.all_objects.filter(farm=self.farm).count(), 0)
        self.assertEqual(Party.all_objects.filter(farm=self.farm).count(), 0)
        self.assertEqual(AuditLog.objects.filter(farm=self.farm).count(), 0)

    def test_what_the_farm_is_built_of_stays(self):
        branches_before = CatalogItem.objects.filter(farm=self.farm, type_id="branch").count()

        empty_farm(self.farm)

        self.assertTrue(Farm.objects.filter(id=self.farm.id).exists())
        self.assertEqual(Membership.objects.filter(farm=self.farm, user=self.owner).count(), 1)
        self.assertEqual(
            CatalogItem.objects.filter(farm=self.farm, type_id="branch").count(), branches_before
        )
        self.assertTrue(FieldDefinition.objects.filter(farm=self.farm).exists())
        self.assertTrue(InventoryStore.objects.filter(farm=self.farm).exists())
        self.assertTrue(Theme.objects.filter(farm=self.farm).exists())
        # الصندوق نفسه باقٍ، ورصيده عاد إلى الصفر لأن قيوده مُحيت.
        self.assertTrue(Account.objects.filter(farm=self.farm, code=self.cash.code).exists())
        self.assertEqual(chart.get(self.farm, chart.CASH).balance(), Decimal("0"))

    def test_the_account_of_a_deleted_person_goes_with_them(self):
        """حساب «ذمم دائنة - معمل الأعلاف» بلا معمل أعلاف هو ضجيج في الدليل."""
        supplier = Party.objects.get(farm=self.farm, name="معمل الأعلاف")
        payable_id = supplier.payable_account_id
        self.assertIsNotNone(payable_id)

        empty_farm(self.farm)

        self.assertFalse(Account.all_objects.filter(id=payable_id).exists())

    def test_the_farm_still_works_after_being_emptied(self):
        empty_farm(self.farm)

        animal = create_animal(
            self.farm,
            animal_type=sheep_type(self.farm),
            sex=Sex.FEMALE,
            tag="A-1",
            actor=self.owner,
        )
        entry = post_entry(
            self.farm,
            date=TODAY,
            kind="expense",
            lines=[
                Line.dr(chart.get(self.farm, chart.OTHER_EXPENSE), 50),
                Line.cr(chart.get(self.farm, chart.CASH), 50),
            ],
            actor=self.owner,
        )
        self.assertEqual(Animal.objects.filter(farm=self.farm).count(), 1)
        self.assertEqual(animal.tag, "A-1")
        self.assertEqual(chart.get(self.farm, chart.CASH).balance(), Decimal("-50"))
        self.assertIsNotNone(entry.number)

    def test_purge_removes_the_farm_itself(self):
        """الفرق بين الإفراغ والحذف: هذا يُبقي المزرعة، وذاك يُنهيها."""
        slug = self.farm.slug

        self.assertTrue(purge_farm(slug))

        self.assertFalse(Farm.all_objects.filter(slug=slug).exists())
        self.assertFalse(purge_farm(slug))
