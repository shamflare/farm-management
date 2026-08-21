"""Founding costs: what it took to build the farm before it could earn.

The barn, the fence, the water tank, the generator. These are paid once and
are not part of any month's running cost, so they are held as fixed assets and
never touch the profit and loss. The register simply accumulates: anything
built or bought later is another row, and the total grows.

No depreciation is applied. The owner asked what the farm cost to set up, not
what an accountant would write off this year.
"""
from django.db import models

from apps.core.fields import money_field
from apps.core.models import Currency, FarmScopedModel


class FoundingCost(FarmScopedModel):
    """One thing the farm was built with."""

    happened_on = models.DateField(db_index=True)
    name = models.CharField(max_length=160)
    asset_type = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="founding_costs",
        help_text="Barn, fence, generator - a catalog row.",
    )
    branch = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="founding_costs_of_branch",
        help_text="Left empty when the asset serves the whole farm.",
    )
    amount = money_field()
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name="+")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    supplier = models.ForeignKey(
        "parties.Party",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="founding_costs",
    )
    paid_from_account = models.ForeignKey(
        "ledger.Account", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    paid_by_party = models.ForeignKey(
        "parties.Party",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="founding_costs_paid",
        help_text="Set when a partner or worker paid from their own pocket.",
    )
    journal_entry = models.ForeignKey(
        "ledger.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    notes = models.TextField(blank=True)
    attachments = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-happened_on", "-created_at"]
        indexes = [
            models.Index(fields=["farm", "happened_on"]),
            models.Index(fields=["farm", "asset_type"]),
        ]

    def __str__(self):
        return f"{self.name} {self.amount}"

    @property
    def type_name(self):
        return self.asset_type.display_name if self.asset_type else ""
