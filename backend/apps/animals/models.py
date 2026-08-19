"""Animals, lineage, births, health and the per-animal timeline.

The table is `Animal`, never `Sheep`: species is a catalog row, so cows, goats
or poultry need configuration, not a migration. A sold or dead animal is kept
forever - it stays in the family tree and in historical reports.
"""
from django.db import models

from apps.core.fields import money_field
from apps.core.models import BaseModel, Currency, FarmScopedModel


class Sex(models.TextChoices):
    FEMALE = "female", "Female"
    MALE = "male", "Male"
    UNKNOWN = "unknown", "Unknown"


class Acquisition(models.TextChoices):
    BORN = "born", "Born on the farm"
    PURCHASED = "purchased", "Purchased"
    GIFT = "gift", "Gift"
    OPENING = "opening", "Existing at system start"
    TRANSFER = "transfer", "Transferred in"


class Animal(FarmScopedModel):
    tag = models.CharField(max_length=48, help_text="Visible number the farm uses.")
    name = models.CharField(max_length=96, blank=True)
    animal_type = models.ForeignKey(
        "catalog.CatalogItem", on_delete=models.PROTECT, related_name="animals_of_type"
    )
    breed = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="animals_of_breed",
    )
    status = models.ForeignKey(
        "catalog.CatalogItem", on_delete=models.PROTECT, related_name="animals_with_status"
    )
    location = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="animals_at_location",
    )
    sex = models.CharField(max_length=8, choices=Sex.choices, default=Sex.UNKNOWN, db_index=True)
    birth_date = models.DateField(null=True, blank=True, db_index=True)
    mother = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="offspring_by_mother"
    )
    father = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="offspring_by_father"
    )
    acquisition = models.CharField(
        max_length=16, choices=Acquisition.choices, default=Acquisition.BORN
    )
    entered_at = models.DateField(null=True, blank=True, help_text="Date the animal joined the farm.")
    exited_at = models.DateField(null=True, blank=True, help_text="Sale, death or transfer date.")
    purchase_price = money_field(null=True, blank=True, default=None)
    purchase_currency = models.ForeignKey(
        Currency, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    ear_tag = models.CharField(max_length=48, blank=True)
    chip_number = models.CharField(max_length=64, blank=True)
    barcode = models.CharField(max_length=64, blank=True)
    color = models.CharField(max_length=48, blank=True)
    current_weight = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    photo = models.ImageField(upload_to="animals/", null=True, blank=True)
    notes = models.TextField(blank=True)
    is_alive = models.BooleanField(default=True, db_index=True)
    is_on_farm = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["tag"]
        constraints = [
            models.UniqueConstraint(
                fields=["farm", "tag"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_animal_tag_per_farm",
            )
        ]
        indexes = [
            models.Index(fields=["farm", "animal_type", "status"]),
            models.Index(fields=["farm", "sex", "is_on_farm"]),
        ]

    def __str__(self):
        return f"{self.tag} {self.name}".strip()

    @property
    def age_days(self):
        if not self.birth_date:
            return None
        end = self.exited_at or None
        from django.utils import timezone

        end = end or timezone.now().date()
        return (end - self.birth_date).days

    def children(self):
        return Animal.objects.filter(
            models.Q(mother=self) | models.Q(father=self)
        ).order_by("birth_date")


class AnimalEventType(models.TextChoices):
    CREATED = "created", "Registered"
    PURCHASED = "purchased", "Purchased"
    BIRTH = "birth", "Gave birth"
    BORN = "born", "Born"
    WEIGHT = "weight", "Weight recorded"
    HEALTH = "health", "Health event"
    VACCINE = "vaccine", "Vaccination"
    TREATMENT = "treatment", "Treatment"
    MOVED = "moved", "Moved"
    STATUS = "status", "Status changed"
    EXPENSE = "expense", "Expense recorded"
    SOLD = "sold", "Sold"
    DIED = "died", "Died"
    NOTE = "note", "Note"


class AnimalEvent(FarmScopedModel):
    """Timeline row. Everything that happens to an animal lands here."""

    animal = models.ForeignKey(Animal, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=16, choices=AnimalEventType.choices, db_index=True)
    happened_on = models.DateField(db_index=True)
    title = models.CharField(max_length=160)
    detail = models.TextField(blank=True)
    amount = money_field(null=True, blank=True, default=None)
    currency = models.ForeignKey(
        Currency, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    journal_entry = models.ForeignKey(
        "ledger.JournalEntry",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="animal_events",
    )
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-happened_on", "-created_at"]
        indexes = [models.Index(fields=["animal", "happened_on"])]

    def __str__(self):
        return f"{self.animal_id} {self.event_type} {self.happened_on}"


class Birth(FarmScopedModel):
    """One birthing event. Offspring rows point back here."""

    mother = models.ForeignKey(Animal, on_delete=models.PROTECT, related_name="births")
    father = models.ForeignKey(
        Animal, null=True, blank=True, on_delete=models.SET_NULL, related_name="sired_births"
    )
    happened_on = models.DateField(db_index=True)
    total_born = models.PositiveSmallIntegerField(default=1)
    born_alive = models.PositiveSmallIntegerField(default=1)
    stillborn = models.PositiveSmallIntegerField(default=0)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-happened_on"]
        indexes = [models.Index(fields=["farm", "happened_on"])]

    def __str__(self):
        return f"birth {self.happened_on} of {self.mother_id}"


class Offspring(models.Model):
    """Link table so a newborn keeps its birth event even after being sold."""

    id = models.BigAutoField(primary_key=True)
    birth = models.ForeignKey(Birth, on_delete=models.CASCADE, related_name="offspring")
    animal = models.OneToOneField(Animal, on_delete=models.CASCADE, related_name="birth_record")

    def __str__(self):
        return f"{self.birth_id}->{self.animal_id}"


class WeightRecord(FarmScopedModel):
    animal = models.ForeignKey(Animal, on_delete=models.CASCADE, related_name="weights")
    measured_on = models.DateField(db_index=True)
    weight_kg = models.DecimalField(max_digits=10, decimal_places=3)
    note = models.CharField(max_length=160, blank=True)

    class Meta:
        ordering = ["-measured_on"]
        constraints = [
            models.UniqueConstraint(
                fields=["animal", "measured_on"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_weight_per_day",
            )
        ]

    def __str__(self):
        return f"{self.animal_id} {self.weight_kg}kg"


class HealthRecord(FarmScopedModel):
    """Vaccines, treatments and diagnoses. Types come from the catalog."""

    animal = models.ForeignKey(Animal, on_delete=models.CASCADE, related_name="health_records")
    kind = models.CharField(
        max_length=16,
        choices=[("vaccine", "Vaccine"), ("treatment", "Treatment"), ("diagnosis", "Diagnosis"), ("checkup", "Checkup")],
        default="treatment",
    )
    item = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="health_records",
        help_text="Vaccine or disease from the catalog.",
    )
    happened_on = models.DateField(db_index=True)
    next_due_on = models.DateField(null=True, blank=True, db_index=True)
    dose = models.CharField(max_length=64, blank=True)
    veterinarian = models.CharField(max_length=96, blank=True)
    cost = money_field(null=True, blank=True, default=None)
    currency = models.ForeignKey(
        Currency, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    journal_entry = models.ForeignKey(
        "ledger.JournalEntry",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="health_records",
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-happened_on"]

    def __str__(self):
        return f"{self.kind} {self.animal_id} {self.happened_on}"
