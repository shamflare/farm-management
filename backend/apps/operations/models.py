"""Purchase and sale documents.

The document records what a human agreed to. The ledger records what it did to
the money. They are linked, and the ledger is the source of truth for balances.
"""
from django.db import models

from apps.core.fields import money_field
from apps.core.models import Currency, FarmScopedModel


class SettlementStatus(models.TextChoices):
    UNPAID = "unpaid", "Unpaid"
    PARTIAL = "partial", "Partially paid"
    PAID = "paid", "Paid in full"


class AnimalPurchase(FarmScopedModel):
    """One deal that brought one or more animals onto the farm."""

    reference = models.CharField(max_length=48, blank=True)
    supplier = models.ForeignKey(
        "parties.Party", null=True, blank=True, on_delete=models.PROTECT, related_name="animal_purchases"
    )
    happened_on = models.DateField(db_index=True)
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name="+")
    animals_price = money_field()
    transport_cost = money_field()
    commission_cost = money_field()
    other_cost = money_field()
    total_cost = money_field()
    paid_amount = money_field()
    settlement_status = models.CharField(
        max_length=8, choices=SettlementStatus.choices, default=SettlementStatus.PAID
    )
    paid_from_account = models.ForeignKey(
        "ledger.Account", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    paid_by_party = models.ForeignKey(
        "parties.Party",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="purchases_paid",
        help_text="Set when a worker paid from their own pocket.",
    )
    journal_entry = models.ForeignKey(
        "ledger.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    notes = models.TextField(blank=True)
    attachments = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-happened_on"]
        indexes = [models.Index(fields=["farm", "happened_on"])]

    def __str__(self):
        return f"purchase {self.reference or self.id} {self.total_cost}"

    @property
    def remaining(self):
        return self.total_cost - self.paid_amount


class PurchaseItem(models.Model):
    """An animal in a deal, with its own share of the total cost."""

    id = models.BigAutoField(primary_key=True)
    purchase = models.ForeignKey(AnimalPurchase, on_delete=models.CASCADE, related_name="items")
    animal = models.ForeignKey("animals.Animal", on_delete=models.PROTECT, related_name="purchase_items")
    unit_price = money_field()
    allocated_cost = money_field(help_text="Unit price plus its share of transport and fees.")

    def __str__(self):
        return f"{self.animal_id} @ {self.unit_price}"


class AnimalSale(FarmScopedModel):
    reference = models.CharField(max_length=48, blank=True)
    customer = models.ForeignKey(
        "parties.Party", null=True, blank=True, on_delete=models.PROTECT, related_name="animal_sales"
    )
    happened_on = models.DateField(db_index=True)
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name="+")
    animals_price = money_field()
    transport_cost = money_field()
    commission_cost = money_field()
    total_price = money_field()
    received_amount = money_field()
    settlement_status = models.CharField(
        max_length=8, choices=SettlementStatus.choices, default=SettlementStatus.PAID
    )
    received_into_account = models.ForeignKey(
        "ledger.Account", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    sale_reason = models.ForeignKey(
        "catalog.CatalogItem", null=True, blank=True, on_delete=models.PROTECT, related_name="sales"
    )
    journal_entry = models.ForeignKey(
        "ledger.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    notes = models.TextField(blank=True)
    attachments = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-happened_on"]
        indexes = [models.Index(fields=["farm", "happened_on"])]

    def __str__(self):
        return f"sale {self.reference or self.id} {self.total_price}"

    @property
    def remaining(self):
        return self.total_price - self.received_amount


class SaleItem(models.Model):
    id = models.BigAutoField(primary_key=True)
    sale = models.ForeignKey(AnimalSale, on_delete=models.CASCADE, related_name="items")
    animal = models.ForeignKey("animals.Animal", on_delete=models.PROTECT, related_name="sale_items")
    unit_price = money_field()
    weight_kg = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    book_value = money_field(help_text="Carrying cost removed from the livestock account.")

    def __str__(self):
        return f"{self.animal_id} @ {self.unit_price}"
