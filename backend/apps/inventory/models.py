"""Feed and supply stores.

A store belongs to exactly one branch: breeding feed and fattening feed are
kept apart, so what each branch eats is never a guess. Quantities and values
are derived from movements - nothing is stored as a running total that could
drift away from the ledger.
"""
from django.db import models

from apps.core.fields import money_field
from apps.core.models import FarmScopedModel


class InventoryStore(FarmScopedModel):
    """One physical store. Its value lives in its own ledger account."""

    name = models.CharField(max_length=128)
    name_ar = models.CharField(max_length=128, blank=True)
    branch = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="stores",
        help_text="Everything issued from this store is charged to this branch.",
    )
    account = models.ForeignKey(
        "ledger.Account",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="stores",
        help_text="Asset account holding the value of what is inside.",
    )
    location = models.CharField(max_length=128, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        indexes = [models.Index(fields=["farm", "branch", "is_active"])]

    def __str__(self):
        return self.display_name

    @property
    def display_name(self):
        return self.name_ar or self.name


class InventoryItem(FarmScopedModel):
    """A thing that can be stored: barley, straw, concentrate, medicine."""

    name = models.CharField(max_length=128)
    name_ar = models.CharField(max_length=128, blank=True)
    category = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="inventory_items",
    )
    unit = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="items_measured_in",
    )
    reorder_level = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=0,
        help_text="Warn once the quantity in a store drops to this.",
    )
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["farm", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_inventory_item_name_per_farm",
            )
        ]

    def __str__(self):
        return self.display_name

    @property
    def display_name(self):
        return self.name_ar or self.name

    @property
    def unit_name(self):
        return self.unit.display_name if self.unit else ""


class MovementKind(models.TextChoices):
    """Why the quantity in a store changed."""

    RECEIPT = "receipt", "Received into the store"
    ISSUE = "issue", "Issued to the animals"
    TRANSFER_IN = "transfer_in", "Transferred in from another store"
    TRANSFER_OUT = "transfer_out", "Transferred out to another store"
    WASTE = "waste", "Spoiled or lost"
    COUNT = "count", "Stock count adjustment"


# Movements that add to a store. A stock count is neither: its quantity is the
# difference found, positive for a surplus and negative for a shortage.
INBOUND = {MovementKind.RECEIPT, MovementKind.TRANSFER_IN}
OUTBOUND = {MovementKind.ISSUE, MovementKind.TRANSFER_OUT, MovementKind.WASTE}


class StockMovement(FarmScopedModel):
    """One in or out. The balance of a store is the sum of these, nothing else.

    `unit_cost` is frozen at the moment the movement happens: an issue costed
    at today's weighted average must keep that cost even if a cheaper load
    arrives tomorrow.
    """

    store = models.ForeignKey(InventoryStore, on_delete=models.PROTECT, related_name="movements")
    item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, related_name="movements")
    kind = models.CharField(max_length=16, choices=MovementKind.choices, db_index=True)
    happened_on = models.DateField(db_index=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    unit_cost = money_field()
    total_cost = money_field()
    supplier = models.ForeignKey(
        "parties.Party",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="stock_receipts",
    )
    counterpart = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="The other half of a transfer between two stores.",
    )
    journal_entry = models.ForeignKey(
        "ledger.JournalEntry",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )
    memo = models.CharField(max_length=255, blank=True)
    attachments = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-happened_on", "-created_at"]
        indexes = [
            models.Index(fields=["farm", "store", "item", "happened_on"]),
            models.Index(fields=["farm", "kind", "happened_on"]),
        ]

    def __str__(self):
        return f"{self.kind} {self.quantity} {self.item_id} @ {self.store_id}"

    @property
    def is_inbound(self):
        return self.kind in INBOUND

    @property
    def signed_quantity(self):
        """How much this movement changed the store by, sign included."""
        if self.kind in OUTBOUND:
            return -self.quantity
        return self.quantity

    @property
    def signed_value(self):
        if self.kind in OUTBOUND:
            return -self.total_cost
        return self.total_cost
