"""تصحيح ما أُدخل خطأ، وتسمية الناس، والمسارات التي لا يجوز أن تتصادم."""
from datetime import date
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.animals.models import Animal, Sex
from apps.animals.services import create_animal
from apps.ledger import chart
from apps.ledger.models import EntryKind, EntryStatus, JournalEntry
from apps.operations import services as ops
from apps.operations.models import AnimalPurchase
from apps.parties.models import Party, PartyKind
from apps.parties.services import create_party, party_by_name
from tests.factories import cash, make_farm, make_user, sheep_type

TODAY = date.today()


class PurchaseCorrectionTests(TestCase):
    """صفقة أُدخلت بأرقام خاطئة تُصحَّح دون أن يكذب الدفتر."""

    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.cash = cash(self.farm)
        self.supplier = create_party(self.farm, kind=PartyKind.SUPPLIER, name="تاجر السوق")
        self.animals = [
            create_animal(
                self.farm, animal_type=sheep_type(self.farm), sex=Sex.MALE, tag=f"A-{i}", actor=self.owner
            )
            for i in range(2)
        ]
        self.purchase = ops.purchase_animals(
            self.farm,
            date=TODAY,
            items=[{"animal": animal, "unit_price": Decimal("100")} for animal in self.animals],
            supplier=self.supplier,
            transport_cost=Decimal("20"),
            from_account=self.cash,
            actor=self.owner,
        )

    def test_the_numbers_change_and_the_books_stay_balanced(self):
        ops.correct_purchase(
            self.purchase,
            prices={str(item.id): Decimal("150") for item in self.purchase.items.all()},
            transport_cost=Decimal("40"),
            actor=self.owner,
        )

        self.purchase.refresh_from_db()
        self.assertEqual(self.purchase.animals_price, Decimal("300.0000"))
        self.assertEqual(self.purchase.total_cost, Decimal("340.0000"))

        balance = chart.get(self.farm, chart.LIVESTOCK).balance()
        self.assertEqual(balance, Decimal("340.0000"))

    def test_the_old_entry_is_reversed_not_erased(self):
        """القصة تبقى كاملة: هكذا سُجّلت، وهكذا أُلغيت، وهكذا صارت."""
        original = self.purchase.journal_entry

        ops.correct_purchase(self.purchase, transport_cost=Decimal("50"), actor=self.owner)

        original.refresh_from_db()
        self.assertEqual(original.status, EntryStatus.POSTED)
        self.assertTrue(JournalEntry.objects.filter(kind=EntryKind.REVERSAL).exists())
        self.purchase.refresh_from_db()
        self.assertNotEqual(self.purchase.journal_entry_id, original.id)

    def test_each_animal_carries_its_corrected_cost(self):
        ops.correct_purchase(
            self.purchase,
            prices={str(item.id): Decimal("200") for item in self.purchase.items.all()},
            transport_cost=Decimal("0"),
            actor=self.owner,
        )

        for animal in self.animals:
            animal.refresh_from_db()
            self.assertEqual(animal.purchase_price, Decimal("200.0000"))

    def test_what_was_paid_stays_paid_unless_it_is_named(self):
        """تصحيح الأثمان لا يعني أن المزرعة دفعت مبلغًا آخر."""
        paid_before = self.purchase.paid_amount

        ops.correct_purchase(self.purchase, transport_cost=Decimal("60"), actor=self.owner)

        self.purchase.refresh_from_db()
        self.assertEqual(self.purchase.paid_amount, paid_before)

    def test_the_api_corrects_a_deal(self):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        client.credentials(HTTP_X_FARM=self.farm.slug)

        item = self.purchase.items.first()
        response = client.patch(
            f"/api/v1/purchases/{self.purchase.id}/",
            {"prices": {str(item.id): "250"}, "transport_cost": "0", "commission_cost": "0"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.purchase.refresh_from_db()
        self.assertEqual(self.purchase.animals_price, Decimal("350.0000"))


class PartyByNameTests(TestCase):
    """الزبون يُكتب اسمه في السوق، ولا يتكرّر سجلّه."""

    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")

    def test_a_new_name_becomes_a_record_with_its_accounts(self):
        party = party_by_name(self.farm, PartyKind.CUSTOMER, "محمد العلي")

        self.assertIsNotNone(party)
        self.assertEqual(party.name, "محمد العلي")
        self.assertIsNotNone(party.receivable_account_id)

    def test_the_same_name_returns_the_same_record(self):
        first = party_by_name(self.farm, PartyKind.CUSTOMER, "محمد العلي")
        again = party_by_name(self.farm, PartyKind.CUSTOMER, "  محمد   العلي ")

        self.assertEqual(first.id, again.id)
        self.assertEqual(Party.objects.filter(farm=self.farm, kind=PartyKind.CUSTOMER).count(), 1)

    def test_an_empty_name_creates_nobody(self):
        self.assertIsNone(party_by_name(self.farm, PartyKind.CUSTOMER, "   "))
        self.assertEqual(Party.objects.filter(farm=self.farm).count(), 0)

    def test_selling_by_a_written_name_creates_the_customer(self):
        animal = create_animal(
            self.farm, animal_type=sheep_type(self.farm), sex=Sex.MALE, tag="S-1", actor=self.owner
        )
        client = APIClient()
        client.force_authenticate(user=self.owner)
        client.credentials(HTTP_X_FARM=self.farm.slug)

        response = client.post(
            "/api/v1/sales/",
            {
                "date": TODAY.isoformat(),
                "customer_name": "أبو سامر",
                "into_account": str(cash(self.farm).id),
                "items": [{"animal": str(animal.id), "unit_price": "200"}],
                "received_amount": "200",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(
            Party.objects.filter(farm=self.farm, kind=PartyKind.CUSTOMER, name="أبو سامر").exists()
        )

    def test_a_failed_sale_leaves_no_ghost_customer(self):
        """الاسم يُكتب قبل أن يُرحَّل البيع، فإن فشل البيع وجب أن يذهب معه."""
        client = APIClient()
        client.force_authenticate(user=self.owner)
        client.credentials(HTTP_X_FARM=self.farm.slug)

        response = client.post(
            "/api/v1/sales/",
            {
                "date": TODAY.isoformat(),
                "customer_name": "زبون لن يوجد",
                "items": [{"animal": str(self.farm.id), "unit_price": "200"}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Party.objects.filter(farm=self.farm, name="زبون لن يوجد").exists())


class RouteCollisionTests(TestCase):
    """مساران باسم واحد يعني أن أحدهما لا يُنادى أبدًا."""

    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.client_ = APIClient()
        self.client_.force_authenticate(user=self.owner)
        self.client_.credentials(HTTP_X_FARM=self.farm.slug)

    def test_health_is_the_service_probe(self):
        response = self.client_.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["service"], "farm-api")

    def test_health_records_are_a_list_of_records(self):
        animal = create_animal(
            self.farm, animal_type=sheep_type(self.farm), sex=Sex.FEMALE, tag="H-1", actor=self.owner
        )
        created = self.client_.post(
            "/api/v1/health-records/",
            {
                "animal": str(animal.id),
                "kind": "vaccine",
                "happened_on": TODAY.isoformat(),
                "title": "لقاح",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)

        listed = self.client_.get(f"/api/v1/health-records/?animal={animal.id}")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["count"], 1)


class AnimalRemovalTests(TestCase):
    """إخراج رأس من القطيع: واقعة تُسجَّل، أو سجل يُصحَّح."""

    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.animal = create_animal(
            self.farm, animal_type=sheep_type(self.farm), sex=Sex.FEMALE, tag="D-1", actor=self.owner
        )
        self.client_ = APIClient()
        self.client_.force_authenticate(user=self.owner)
        self.client_.credentials(HTTP_X_FARM=self.farm.slug)

    def test_deleting_a_record_hides_it_everywhere(self):
        response = self.client_.delete(f"/api/v1/animals/{self.animal.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Animal.objects.filter(id=self.animal.id).exists())
        self.assertEqual(self.client_.get("/api/v1/animals/").json()["count"], 0)

    def test_the_row_survives_underneath_for_the_audit_trail(self):
        """الحذف لا يمحو الصف: يُخفيه. سجل التدقيق يبقى قادرًا على أن يشرح."""
        self.client_.delete(f"/api/v1/animals/{self.animal.id}/")

        self.assertTrue(Animal.all_objects.filter(id=self.animal.id).exists())
