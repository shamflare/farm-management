"""Double-entry ledger.

Every movement of money is a JournalEntry with balanced LedgerLines. Balances
and reports are always derived from these lines - no stored totals that can
drift. Posted entries are never edited or deleted; they are reversed.
"""
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Sum
from django.utils import timezone

from apps.core.fields import money_field
from apps.core.models import BaseModel, Currency, FarmScopedModel

ZERO = Decimal("0")


class AccountType(models.TextChoices):
    ASSET = "asset", "Asset"
    LIABILITY = "liability", "Liability"
    EQUITY = "equity", "Equity"
    INCOME = "income", "Income"
    EXPENSE = "expense", "Expense"


# Accounts whose natural balance grows on the debit side.
DEBIT_NATURE = {AccountType.ASSET, AccountType.EXPENSE}


class EntryKind(models.TextChoices):
    """Business meaning of an entry. Reports read this, not free text."""

    OPENING = "opening", "Opening balance"
    EXPENSE = "expense", "Expense"
    INCOME = "income", "Income"
    TRANSFER = "transfer", "Transfer between accounts"
    PURCHASE = "purchase", "Purchase"
    SALE = "sale", "Sale"
    CAPITAL = "capital", "Capital contribution"
    WITHDRAWAL = "withdrawal", "Withdrawal"
    LOAN = "loan", "Loan"
    SETTLEMENT = "settlement", "Settlement"
    ADJUSTMENT = "adjustment", "Adjustment"
    REVERSAL = "reversal", "Reversal"


class EntryStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PENDING = "pending", "Pending approval"
    POSTED = "posted", "Posted"
    REJECTED = "rejected", "Rejected"
    VOID = "void", "Void"


class Account(FarmScopedModel):
    """A cash box, bank account, category account, or a person's account.

    Category accounts (feed expense, animal sales revenue) are ordinary
    accounts too, so a category rename never rewrites history.
    """

    code = models.CharField(max_length=32)
    name = models.CharField(max_length=128)
    name_ar = models.CharField(max_length=128, blank=True)
    type = models.CharField(max_length=16, choices=AccountType.choices, db_index=True)
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name="accounts")
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="children"
    )
    # True for wallets that hold real money (farm cash box, bank, safe).
    is_cash = models.BooleanField(default=False)
    # True for accounts created by the system that must keep existing.
    is_system = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    # Optional link to the catalog row this account represents (expense
    # category, revenue category), so the settings screen and the ledger agree.
    catalog_item = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="accounts",
    )
    description = models.CharField(max_length=255, blank=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["type", "sort_order", "code"]
        constraints = [
            models.UniqueConstraint(
                fields=["farm", "code"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_account_code_per_farm",
            )
        ]
        indexes = [models.Index(fields=["farm", "type", "is_active"])]

    def __str__(self):
        return f"{self.code} {self.name_ar or self.name}"

    @property
    def display_name(self):
        return self.name_ar or self.name

    @property
    def is_debit_nature(self):
        return self.type in DEBIT_NATURE

    def balance(self, *, as_of=None, since=None):
        """Signed balance in the account's natural direction, from lines only."""
        lines = LedgerLine.objects.filter(account=self, entry__status=EntryStatus.POSTED)
        if as_of is not None:
            lines = lines.filter(entry__date__lte=as_of)
        if since is not None:
            lines = lines.filter(entry__date__gte=since)
        totals = lines.aggregate(debit=Sum("debit"), credit=Sum("credit"))
        debit = totals["debit"] or ZERO
        credit = totals["credit"] or ZERO
        return debit - credit if self.is_debit_nature else credit - debit

    def delete(self, using=None, keep_parents=False, hard=False):
        if not hard and (self.is_system or self.lines.exists()):
            # Accounts referenced by history are deactivated, never removed.
            self.is_active = False
            self.save(update_fields=["is_active", "updated_at", "updated_by"])
            return (0, {})
        return super().delete(using=using, keep_parents=keep_parents, hard=hard)


class JournalEntry(FarmScopedModel):
    """One balanced financial event."""

    number = models.BigIntegerField(db_index=True)
    date = models.DateField(db_index=True)
    kind = models.CharField(max_length=16, choices=EntryKind.choices, db_index=True)
    status = models.CharField(
        max_length=16, choices=EntryStatus.choices, default=EntryStatus.POSTED, db_index=True
    )
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name="entries")
    amount = money_field(help_text="Total debits of the entry, for listing and filtering.")
    memo = models.CharField(max_length=255, blank=True)
    reference = models.CharField(max_length=64, blank=True)
    # What this entry documents, without coupling the ledger to other apps.
    subject_type = models.CharField(max_length=32, blank=True, db_index=True)
    subject_id = models.UUIDField(null=True, blank=True, db_index=True)
    # Safe retries from an offline client: same key, same single entry.
    idempotency_key = models.CharField(max_length=80, blank=True, default="")
    reverses = models.OneToOneField(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="reversed_by"
    )
    void_reason = models.CharField(max_length=255, blank=True)
    posted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    attachments = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-date", "-number"]
        constraints = [
            models.UniqueConstraint(fields=["farm", "number"], name="uniq_entry_number_per_farm"),
            models.UniqueConstraint(
                fields=["farm", "idempotency_key"],
                condition=~models.Q(idempotency_key=""),
                name="uniq_entry_idempotency_key",
            ),
        ]
        indexes = [
            models.Index(fields=["farm", "kind", "date"]),
            models.Index(fields=["subject_type", "subject_id"]),
        ]

    def __str__(self):
        return f"#{self.number} {self.kind} {self.amount} {self.currency_id}"

    @property
    def is_posted(self):
        return self.status == EntryStatus.POSTED

    def totals(self):
        agg = self.lines.aggregate(debit=Sum("debit"), credit=Sum("credit"))
        return (agg["debit"] or ZERO), (agg["credit"] or ZERO)

    def is_balanced(self):
        debit, credit = self.totals()
        return debit == credit

    def delete(self, using=None, keep_parents=False, hard=False):
        """Financial history is never deleted through the ORM."""
        if self.status == EntryStatus.POSTED and not hard:
            raise ValueError("A posted journal entry cannot be deleted; reverse it instead.")
        return super().delete(using=using, keep_parents=keep_parents, hard=hard)


class LedgerLine(models.Model):
    """One side of an entry. Exactly one of debit/credit is positive."""

    id = models.BigAutoField(primary_key=True)
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="lines")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="lines")
    debit = money_field()
    credit = money_field()
    memo = models.CharField(max_length=255, blank=True)
    # Cost attribution: which animal, asset, or party this line belongs to.
    subject_type = models.CharField(max_length=32, blank=True, db_index=True)
    subject_id = models.UUIDField(null=True, blank=True, db_index=True)
    # Which production branch carries this amount. Lives on the line, not the
    # entry, so one invoice can be split between breeding and fattening. Null
    # means the amount was recorded before branches existed, or belongs to
    # neither on its own.
    branch = models.ForeignKey(
        "catalog.CatalogItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="ledger_lines",
        db_index=True,
    )
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["entry", "sort_order", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(debit__gte=0) & models.Q(credit__gte=0),
                name="ledger_line_non_negative",
            ),
            models.CheckConstraint(
                condition=models.Q(debit=0) | models.Q(credit=0),
                name="ledger_line_single_side",
            ),
        ]
        indexes = [
            models.Index(fields=["account"]),
            models.Index(fields=["subject_type", "subject_id"]),
            models.Index(fields=["branch"]),
        ]

    def __str__(self):
        side = f"Dr {self.debit}" if self.debit else f"Cr {self.credit}"
        return f"{self.account_id} {side}"

    @property
    def signed_amount(self):
        return self.debit - self.credit


class ApprovalRule(FarmScopedModel):
    """Threshold above which an entry of a given kind needs approval."""

    kind = models.CharField(max_length=16, choices=EntryKind.choices)
    min_amount = money_field(help_text="Entries at or above this amount require approval.")
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name="approval_rules")
    is_active = models.BooleanField(default=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["kind"]
        constraints = [
            models.UniqueConstraint(
                fields=["farm", "kind", "currency"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_approval_rule",
            )
        ]

    def __str__(self):
        return f"{self.kind} >= {self.min_amount} {self.currency_id}"


class ProcessedCommand(models.Model):
    """Idempotency ledger for offline clients replaying financial commands."""

    key = models.CharField(max_length=80, primary_key=True)
    farm = models.ForeignKey("core.Farm", on_delete=models.CASCADE, related_name="processed_commands")
    command = models.CharField(max_length=64)
    result_type = models.CharField(max_length=64, blank=True)
    result_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.key
