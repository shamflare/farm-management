"""People and companies the farm owes money to, or is owed money by.

Suppliers, customers, workers and partners are one table with a kind, because
the same person is often two of them. Every party owns real ledger accounts, so
"what do I owe the worker" is a query over posted lines, not a stored number.
"""
from django.db import models

from apps.core.fields import money_field
from apps.core.models import Currency, FarmScopedModel


class PartyKind(models.TextChoices):
    SUPPLIER = "supplier", "Supplier"
    CUSTOMER = "customer", "Customer"
    WORKER = "worker", "Worker or supervisor"
    PARTNER = "partner", "Partner"
    OTHER = "other", "Other"


class Party(FarmScopedModel):
    kind = models.CharField(max_length=16, choices=PartyKind.choices, db_index=True)
    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=32, blank=True)
    alt_phone = models.CharField(max_length=32, blank=True)
    address = models.CharField(max_length=255, blank=True)
    national_id = models.CharField(max_length=48, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    # The user account this party logs in with, when they are a system user.
    user = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="parties"
    )

    # Ledger accounts owned by this party. Created on demand by the service.
    receivable_account = models.ForeignKey(
        "ledger.Account", null=True, blank=True, on_delete=models.PROTECT, related_name="receivable_for"
    )
    payable_account = models.ForeignKey(
        "ledger.Account", null=True, blank=True, on_delete=models.PROTECT, related_name="payable_for"
    )
    capital_account = models.ForeignKey(
        "ledger.Account", null=True, blank=True, on_delete=models.PROTECT, related_name="capital_for"
    )
    drawings_account = models.ForeignKey(
        "ledger.Account", null=True, blank=True, on_delete=models.PROTECT, related_name="drawings_for"
    )
    cash_account = models.ForeignKey(
        "ledger.Account",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="wallet_for",
        help_text="Personal cash box held by this person on behalf of the farm.",
    )

    # Ownership share is deliberately separate from money contributed: a partner
    # may own 30% while having paid 50% of the capital.
    ownership_percentage = models.DecimalField(
        max_digits=7, decimal_places=4, null=True, blank=True
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "parties"
        constraints = [
            models.UniqueConstraint(
                fields=["farm", "kind", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_party_name_per_kind",
            )
        ]
        indexes = [models.Index(fields=["farm", "kind", "is_active"])]

    def __str__(self):
        return self.name

    @property
    def is_partner(self):
        return self.kind == PartyKind.PARTNER

    def balance_owed_to_farm(self):
        """Positive: this party owes the farm."""
        return self.receivable_account.balance() if self.receivable_account_id else 0

    def balance_owed_by_farm(self):
        """Positive: the farm owes this party."""
        return self.payable_account.balance() if self.payable_account_id else 0


class OwnershipChange(FarmScopedModel):
    """Audit trail for partnership percentages; history is never overwritten."""

    party = models.ForeignKey(Party, on_delete=models.CASCADE, related_name="ownership_changes")
    effective_from = models.DateField(db_index=True)
    old_percentage = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    new_percentage = models.DecimalField(max_digits=7, decimal_places=4)
    reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-effective_from"]

    def __str__(self):
        return f"{self.party_id} -> {self.new_percentage}%"


class ProfitDistribution(FarmScopedModel):
    """A declared distribution of profit for a period, split across partners."""

    period_start = models.DateField()
    period_end = models.DateField()
    total_profit = money_field()
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name="+")
    note = models.CharField(max_length=255, blank=True)
    journal_entry = models.ForeignKey(
        "ledger.JournalEntry", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-period_end"]

    def __str__(self):
        return f"distribution {self.period_start}..{self.period_end}"


class DistributionShare(models.Model):
    id = models.BigAutoField(primary_key=True)
    distribution = models.ForeignKey(
        ProfitDistribution, on_delete=models.CASCADE, related_name="shares"
    )
    party = models.ForeignKey(Party, on_delete=models.PROTECT, related_name="distribution_shares")
    percentage = models.DecimalField(max_digits=7, decimal_places=4)
    amount = money_field()

    def __str__(self):
        return f"{self.party_id} {self.amount}"
