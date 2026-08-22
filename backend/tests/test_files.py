"""Attachments, alerts, exports and backups."""
import base64
import json
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.animals.models import Sex
from apps.animals.services import add_health_record, create_animal
from apps.core import alerts, attachments, backup, exporting
from apps.core.models import Attachment
from apps.inventory.models import InventoryItem, InventoryStore
from apps.inventory import services as stock
from apps.catalog.models import BranchCode
from tests.factories import cash, make_farm, make_user, sheep_type

TODAY = date.today()

# A one-pixel PNG, which is all any of these tests needs to be a real image.
PIXEL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
PDF = "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.4 fake").decode()


class AttachmentTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.animal = create_animal(
            self.farm, animal_type=sheep_type(self.farm), tag="A-1", sex=Sex.FEMALE
        )

    def attach(self, data=PIXEL, **kwargs):
        return attachments.attach(
            self.farm,
            subject_type="animal",
            subject_id=self.animal.id,
            data=data,
            name=kwargs.pop("name", "photo.png"),
            **kwargs,
        )

    def test_a_file_is_stored_with_its_real_type_and_size(self):
        row = self.attach(kind="photo")
        self.assertEqual(row.content_type, "image/png")
        self.assertGreater(row.size, 0)
        self.assertTrue(row.is_image)

    def test_a_pdf_is_accepted_as_paperwork(self):
        row = self.attach(data=PDF, name="invoice.pdf", kind="invoice")
        self.assertEqual(row.content_type, "application/pdf")
        self.assertFalse(row.is_image)

    def test_an_unknown_file_type_is_refused(self):
        with self.assertRaises(ValidationError):
            self.attach(data="data:application/x-msdownload;base64,QUJD")

    def test_something_that_is_not_a_data_uri_is_refused(self):
        with self.assertRaises(ValidationError):
            self.attach(data="https://example.com/photo.png")

    def test_a_file_over_the_ceiling_is_refused(self):
        payload = base64.b64encode(b"x" * (attachments.MAX_BYTES + 1)).decode()
        with self.assertRaises(ValidationError):
            self.attach(data=f"data:image/png;base64,{payload}")

    def test_only_one_picture_represents_a_record(self):
        first = self.attach(kind="photo", is_primary=True)
        second = self.attach(kind="photo", name="better.png", is_primary=True)

        first.refresh_from_db()
        second.refresh_from_db()
        self.assertFalse(first.is_primary)
        self.assertTrue(second.is_primary)
        self.assertEqual(
            attachments.primary_image(self.farm, "animal", self.animal.id), second.data
        )

    def test_paperwork_cannot_be_made_the_picture(self):
        row = self.attach(data=PDF, name="invoice.pdf", kind="invoice")
        with self.assertRaises(ValidationError):
            attachments.make_primary(row)

    def test_a_photo_has_to_be_an_image(self):
        with self.assertRaises(ValidationError):
            self.attach(data=PDF, kind="photo")


class AttachmentApiTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.viewer = make_user("viewer", self.farm, "viewer")
        self.animal = create_animal(
            self.farm, animal_type=sheep_type(self.farm), tag="A-2", sex=Sex.FEMALE
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        return client

    def payload(self, **extra):
        return {
            "subject_type": "animal",
            "subject_id": str(self.animal.id),
            "data": PIXEL,
            "name": "photo.png",
            "kind": "photo",
            **extra,
        }

    def test_uploading_and_reading_it_back(self):
        client = self.client_for(self.owner)
        response = client.post("/api/v1/attachments/upload/", self.payload(), format="json")
        self.assertEqual(response.status_code, 200)

        listing = client.get(
            f"/api/v1/attachments/?subject_type=animal&subject_id={self.animal.id}"
        ).json()
        self.assertEqual(listing["count"], 1)
        # The listing leaves the bytes out; they would make every page heavy.
        self.assertNotIn("data", listing["results"][0])

    def test_the_uploaded_picture_becomes_the_animal_photo(self):
        client = self.client_for(self.owner)
        client.post("/api/v1/attachments/upload/", self.payload(is_primary=True), format="json")

        animal = client.get(f"/api/v1/animals/{self.animal.id}/").json()
        self.assertTrue(animal["photo_url"].startswith("data:image/png"))

    def test_a_read_only_user_cannot_upload(self):
        response = self.client_for(self.viewer).post(
            "/api/v1/attachments/upload/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_a_bad_file_comes_back_as_a_readable_error(self):
        response = self.client_for(self.owner).post(
            "/api/v1/attachments/upload/", self.payload(data="not-a-file"), format="json"
        )
        self.assertEqual(response.status_code, 400)


class AlertTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.viewer = make_user("viewer", self.farm, "viewer")
        self.cash = cash(self.farm)

    def test_a_quiet_farm_raises_nothing(self):
        self.assertEqual(alerts.collect(self.farm, self.owner), [])

    def test_an_overdue_vaccination_is_raised(self):
        animal = create_animal(
            self.farm, animal_type=sheep_type(self.farm), tag="V-1", sex=Sex.FEMALE
        )
        add_health_record(
            animal,
            kind="vaccine",
            happened_on=TODAY - timedelta(days=40),
            next_due_on=TODAY - timedelta(days=5),
        )
        kinds = {row["kind"] for row in alerts.collect(self.farm, self.owner)}
        self.assertIn("vaccine_overdue", kinds)

    def test_low_feed_is_raised(self):
        store = InventoryStore.objects.get(farm=self.farm, branch__code=BranchCode.BREEDING)
        item = InventoryItem.objects.get(farm=self.farm, name="Barley")
        item.reorder_level = Decimal("100")
        item.save(update_fields=["reorder_level"])
        stock.receive_stock(
            self.farm,
            store=store,
            item=item,
            date=TODAY,
            quantity=50,
            total_cost=25,
            from_account=self.cash,
        )
        kinds = {row["kind"] for row in alerts.collect(self.farm, self.owner)}
        self.assertIn("low_stock", kinds)

    def test_a_reader_is_not_told_about_the_cash_box(self):
        # The viewer role holds neither finance.view nor inventory.view.
        rows = alerts.collect(self.farm, self.viewer)
        self.assertEqual([row for row in rows if row["kind"] == "negative_cash"], [])

    def test_the_endpoint_answers(self):
        client = APIClient()
        client.force_authenticate(user=self.owner)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        body = client.get("/api/v1/alerts/").json()
        self.assertIn("alerts", body["data"])
        self.assertIn("urgent", body["data"])


class ExportTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.viewer = make_user("viewer", self.farm, "viewer")
        create_animal(self.farm, animal_type=sheep_type(self.farm), tag="X-1", sex=Sex.FEMALE)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        return client

    def test_the_file_starts_with_the_mark_excel_needs(self):
        response = self.client_for(self.owner).get("/api/v1/export/animals/")
        self.assertEqual(response.status_code, 200)
        body = response.content.decode("utf-8")
        self.assertTrue(body.startswith("﻿"), "Excel needs the byte-order mark")
        self.assertIn("X-1", body)
        self.assertIn("attachment;", response["Content-Disposition"])

    def test_every_known_export_builds(self):
        client = self.client_for(self.owner)
        for name in exporting.EXPORTS:
            with self.subTest(export=name):
                response = client.get(f"/api/v1/export/{name}/")
                self.assertEqual(response.status_code, 200)

    def test_an_unknown_export_is_refused(self):
        response = self.client_for(self.owner).get("/api/v1/export/everything/")
        self.assertEqual(response.status_code, 400)

    def test_exporting_the_ledger_needs_the_ledger_right(self):
        response = self.client_for(self.viewer).get("/api/v1/export/entries/")
        self.assertEqual(response.status_code, 400)


class BackupTests(TestCase):
    def setUp(self):
        self.farm = make_farm()
        self.owner = make_user("owner", self.farm, "owner")
        self.accountant = make_user("accountant", self.farm, "accountant")
        create_animal(self.farm, animal_type=sheep_type(self.farm), tag="B-1", sex=Sex.FEMALE)

    def test_the_backup_carries_the_farm_and_its_rows(self):
        payload = backup.build(self.farm)
        self.assertEqual(payload["farm"]["slug"], self.farm.slug)
        self.assertIn("animals.Animal", payload["tables"])
        self.assertGreater(payload["row_counts"]["animals.Animal"], 0)
        self.assertIn("ledger.LedgerLine", payload["tables"])

    def test_no_password_hash_ever_leaves(self):
        text = backup.to_json(self.farm)
        self.assertNotIn("pbkdf2_", text)
        self.assertNotIn('"password"', text)

    def test_it_is_valid_json_a_person_can_reopen(self):
        reloaded = json.loads(backup.to_json(self.farm))
        self.assertEqual(reloaded["format_version"], backup.FORMAT_VERSION)

    def test_downloading_it_needs_the_backup_right(self):
        client = APIClient()
        client.force_authenticate(user=self.accountant)
        client.credentials(HTTP_X_FARM=self.farm.slug)
        self.assertEqual(client.get("/api/v1/backup/").status_code, 403)

        client.force_authenticate(user=self.owner)
        response = client.get("/api/v1/backup/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment;", response["Content-Disposition"])
