"""Milk: what the flock produced, and what was sold of it.

Production and sale are two records on purpose. The farm milks every day
whether or not anything is sold that day, and part of the yield becomes
cheese, or the household's own food. Keeping them apart is what makes the
difference between the two readable instead of lost.
"""
from django.db import models

from apps.core.fields import money_field
from apps.core.models import Currency, FarmScopedModel


class Milking(models.TextChoices):
    MORNING = "morning", "Morning"
    EVENING = "evening", "Evening"
    DAY = "day", "Whole day"


class MilkProduction(FarmScopedModel):
    """Litres drawn in one milking. A quantity log - no money involved."""

    happened_on = models.DateField(db_index=True)
    branch = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="milk_records",
    )
    session = models.CharField(max_length=8, choices=Milking.choices, default=Milking.DAY)
    liters = models.DecimalField(max_digits=12, decimal_places=3)
    milking_animals = models.PositiveIntegerField(
        null=True, blank=True, help_text="How many head were milked, when counted."
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-happened_on", "session"]
        constraints = [
            models.UniqueConstraint(
                fields=["farm", "branch", "happened_on", "session"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_milking_per_session",
            )
        ]
        indexes = [models.Index(fields=["farm", "happened_on"])]

    def __str__(self):
        return f"{self.happened_on} {self.session} {self.liters}L"

    @property
    def per_animal(self):
        if not self.milking_animals:
            return None
        return self.liters / self.milking_animals


class MilkSale(FarmScopedModel):
    """Milk or something made from it, sold. This one does touch the money."""

    happened_on = models.DateField(db_index=True)
    branch = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="milk_sales",
    )
    product = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="sales_of_product",
        help_text="Raw milk, cheese, yoghurt - a catalog row.",
    )
    unit = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="milk_sales_measured_in",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    unit_price = money_field()
    total_price = money_field()
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name="+")
    customer = models.ForeignKey(
        "parties.Party",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="milk_sales",
    )
    received_into_account = models.ForeignKey(
        "ledger.Account", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    journal_entry = models.ForeignKey(
        "ledger.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    notes = models.TextField(blank=True)
    attachments = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-happened_on", "-created_at"]
        indexes = [models.Index(fields=["farm", "happened_on"])]

    def __str__(self):
        return f"milk sale {self.happened_on} {self.total_price}"

    @property
    def product_name(self):
        return self.product.display_name if self.product else "حليب"
