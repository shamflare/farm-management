"""The posting engine.

Nothing outside this module may create LedgerLines. Every financial command
runs inside one database transaction: either all lines land or none do.
"""
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max, Q, Sum
from django.utils import timezone

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.core.context import get_current_user
from apps.ledger.models import (
    Account,
    AccountType,
    ApprovalRule,
    EntryKind,
    EntryStatus,
    JournalEntry,
    LedgerLine,
    ProcessedCommand,
)

ZERO = Decimal("0")

# Passed as `branch` to ask for the amounts no branch carries.
UNASSIGNED = "none"


def to_money(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError("amount must be a decimal number")
    if amount.is_nan() or amount.is_infinite():
        raise ValidationError("amount must be a finite number")
    return amount.quantize(Decimal("0.0001"))


@dataclass
class Line:
    """One side of an entry, as supplied by a caller."""

    account: Account
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    memo: str = ""
    subject_type: str = ""
    subject_id: object = None
    branch: object = None
    extra: dict = field(default_factory=dict)

    @classmethod
    def dr(cls, account, amount, **kwargs):
        return cls(account=account, debit=to_money(amount), **kwargs)

    @classmethod
    def cr(cls, account, amount, **kwargs):
        return cls(account=account, credit=to_money(amount), **kwargs)


def requires_approval(farm, kind, amount, currency):
    rule = ApprovalRule.objects.filter(
        farm=farm, kind=kind, currency=currency, is_active=True
    ).first()
    if rule is None:
        return False
    return to_money(amount) >= rule.min_amount


def next_entry_number(farm):
    current = JournalEntry.all_objects.filter(farm=farm).aggregate(top=Max("number"))["top"] or 0
    return current + 1


@transaction.atomic
def post_entry(
    farm,
    *,
    date,
    kind,
    lines,
    currency=None,
    memo="",
    reference="",
    subject_type="",
    subject_id=None,
    branch=None,
    idempotency_key="",
    attachments=None,
    force_status=None,
    actor=None,
):
    """Validate and write one balanced entry. Returns the JournalEntry.

    Raises ValidationError before touching the database if the entry does not
    balance, mixes currencies, or references another farm's accounts.
    """
    if not lines or len(lines) < 2:
        raise ValidationError("an entry needs at least two lines")

    if idempotency_key:
        existing = JournalEntry.all_objects.filter(
            farm=farm, idempotency_key=idempotency_key
        ).first()
        if existing is not None:
            # A retried offline command must never double-post.
            return existing

    entry_currency = currency or lines[0].account.currency
    total_debit = ZERO
    total_credit = ZERO
    errors = []

    for index, line in enumerate(lines):
        account = line.account
        if account.farm_id != farm.id:
            errors.append(f"line {index + 1}: account belongs to another farm")
            continue
        if not account.is_active:
            errors.append(f"line {index + 1}: account {account.code} is inactive")
        if account.currency_id != entry_currency.code:
            errors.append(
                f"line {index + 1}: account {account.code} is in {account.currency_id}, "
                f"entry is in {entry_currency.code}"
            )
        debit = to_money(line.debit or ZERO)
        credit = to_money(line.credit or ZERO)
        if debit < ZERO or credit < ZERO:
            errors.append(f"line {index + 1}: amounts cannot be negative")
        if debit > ZERO and credit > ZERO:
            errors.append(f"line {index + 1}: a line is either a debit or a credit, not both")
        if debit == ZERO and credit == ZERO:
            errors.append(f"line {index + 1}: amount is zero")
        line.debit, line.credit = debit, credit
        total_debit += debit
        total_credit += credit

    if total_debit != total_credit:
        errors.append(f"entry is not balanced: debit {total_debit} vs credit {total_credit}")
    if total_debit == ZERO:
        errors.append("entry total cannot be zero")
    if errors:
        raise ValidationError(errors)

    status = force_status
    if status is None:
        status = (
            EntryStatus.PENDING
            if requires_approval(farm, kind, total_debit, entry_currency)
            else EntryStatus.POSTED
        )

    entry = JournalEntry.objects.create(
        farm=farm,
        number=next_entry_number(farm),
        date=date,
        kind=kind,
        status=status,
        currency=entry_currency,
        amount=total_debit,
        memo=memo[:255],
        reference=reference[:64],
        subject_type=subject_type,
        subject_id=subject_id,
        idempotency_key=idempotency_key or "",
        attachments=attachments or [],
        posted_at=timezone.now() if status == EntryStatus.POSTED else None,
    )

    LedgerLine.objects.bulk_create(
        [
            LedgerLine(
                entry=entry,
                account=line.account,
                debit=line.debit,
                credit=line.credit,
                memo=line.memo[:255],
                subject_type=line.subject_type or subject_type,
                subject_id=line.subject_id or subject_id,
                branch=line.branch or branch,
                sort_order=index,
            )
            for index, line in enumerate(lines)
        ]
    )

    record(
        AuditAction.POST if status == EntryStatus.POSTED else AuditAction.CREATE,
        "journal_entry",
        entry.id,
        farm=farm,
        label=f"{kind} {total_debit} {entry_currency.code} - {memo}"[:255],
        new={
            "number": entry.number,
            "status": status,
            "amount": str(total_debit),
            "currency": entry_currency.code,
            "lines": [
                {
                    "account": line.account.code,
                    "debit": str(line.debit),
                    "credit": str(line.credit),
                }
                for line in lines
            ],
        },
        user=actor or get_current_user(),
    )
    return entry


@transaction.atomic
def approve_entry(entry, actor=None, note=""):
    if entry.status != EntryStatus.PENDING:
        raise ValidationError("only a pending entry can be approved")
    entry.status = EntryStatus.POSTED
    entry.approved_by = actor or get_current_user()
    entry.approved_at = timezone.now()
    entry.posted_at = timezone.now()
    entry.save(update_fields=["status", "approved_by", "approved_at", "posted_at", "updated_at"])
    record(
        AuditAction.APPROVE,
        "journal_entry",
        entry.id,
        farm=entry.farm,
        label=note or f"approved entry #{entry.number}",
        new={"status": entry.status},
        user=actor,
    )
    return entry


@transaction.atomic
def reject_entry(entry, actor=None, reason=""):
    if entry.status != EntryStatus.PENDING:
        raise ValidationError("only a pending entry can be rejected")
    entry.status = EntryStatus.REJECTED
    entry.void_reason = reason[:255]
    entry.save(update_fields=["status", "void_reason", "updated_at"])
    record(
        AuditAction.REJECT,
        "journal_entry",
        entry.id,
        farm=entry.farm,
        label=reason or f"rejected entry #{entry.number}",
        new={"status": entry.status},
        user=actor,
    )
    return entry


@transaction.atomic
def void_entry(entry, actor=None, reason=""):
    """Voiding is only for entries that never hit the books."""
    if entry.status == EntryStatus.POSTED:
        raise ValidationError("a posted entry must be reversed, not voided")
    entry.status = EntryStatus.VOID
    entry.void_reason = reason[:255]
    entry.save(update_fields=["status", "void_reason", "updated_at"])
    record(
        AuditAction.VOID,
        "journal_entry",
        entry.id,
        farm=entry.farm,
        label=reason,
        new={"status": entry.status},
        user=actor,
    )
    return entry


@transaction.atomic
def reverse_entry(entry, actor=None, reason="", date=None):
    """Cancel a posted entry by writing its mirror image. History stays intact."""
    if entry.status != EntryStatus.POSTED:
        raise ValidationError("only a posted entry can be reversed")
    if hasattr(entry, "reversed_by"):
        raise ValidationError("this entry was already reversed")

    mirrored = [
        Line(
            account=line.account,
            debit=line.credit,
            credit=line.debit,
            memo=f"reversal: {line.memo}"[:255],
            subject_type=line.subject_type,
            subject_id=line.subject_id,
            branch=line.branch,
        )
        for line in entry.lines.select_related("account").all()
    ]
    reversal = post_entry(
        entry.farm,
        date=date or timezone.now().date(),
        kind=EntryKind.REVERSAL,
        lines=mirrored,
        currency=entry.currency,
        memo=(reason or f"reversal of #{entry.number}")[:255],
        reference=entry.reference,
        subject_type=entry.subject_type,
        subject_id=entry.subject_id,
        force_status=EntryStatus.POSTED,
        actor=actor,
    )
    reversal.reverses = entry
    reversal.save(update_fields=["reverses", "updated_at"])
    record(
        AuditAction.REVERSE,
        "journal_entry",
        entry.id,
        farm=entry.farm,
        label=reason or f"reversed by #{reversal.number}",
        new={"reversal_entry": str(reversal.id), "reversal_number": reversal.number},
        user=actor,
    )
    return reversal


def entry_snapshot(entry):
    """Everything about an entry, flat enough to store in an audit row.

    A purge leaves nothing behind in the ledger, so this snapshot is the only
    remaining record of what the numbers were. It is written before the delete.
    """
    return {
        "number": entry.number,
        "date": entry.date.isoformat(),
        "kind": entry.kind,
        "status": entry.status,
        "amount": str(entry.amount),
        "currency": entry.currency_id,
        "memo": entry.memo,
        "reference": entry.reference,
        "subject_type": entry.subject_type,
        "subject_id": str(entry.subject_id) if entry.subject_id else "",
        "idempotency_key": entry.idempotency_key,
        "created_at": entry.created_at.isoformat() if entry.created_at else "",
        "created_by": entry.created_by.username if entry.created_by else "",
        "lines": [
            {
                "account_code": line.account.code,
                "account_name": line.account.name_ar or line.account.name,
                "debit": str(line.debit),
                "credit": str(line.credit),
                "memo": line.memo,
                "branch": line.branch.display_name if line.branch else "",
            }
            for line in entry.lines.select_related("account", "branch").order_by("sort_order", "id")
        ],
    }


def purge_blockers(entry):
    """What still depends on this entry and would have to go with it.

    Returned as readable lines rather than model instances: the caller shows
    them to whoever asked for the delete, so they approve the full extent of it
    rather than only the one row they clicked.
    """
    from apps.operations.models import AnimalPurchase, AnimalSale

    blockers = []
    reversal = getattr(entry, "reversed_by", None)
    if reversal is not None:
        blockers.append(f"القيد العكسي رقم {reversal.number}")
    if entry.reverses_id:
        blockers.append(f"سيبقى القيد الأصلي رقم {entry.reverses.number} بلا عكس")

    ids = [entry.id] + ([reversal.id] if reversal else [])
    for purchase in AnimalPurchase.all_objects.filter(journal_entry_id__in=ids):
        blockers.append(f"عملية شراء بتاريخ {purchase.happened_on}")
    for sale in AnimalSale.all_objects.filter(journal_entry_id__in=ids):
        blockers.append(f"عملية بيع بتاريخ {sale.happened_on}")
    return blockers


@transaction.atomic
def purge_entry(entry, actor=None, reason=""):
    """Erase an entry and everything that only exists because of it.

    This is the one path that removes financial history, and it is deliberately
    narrow. `post_entry` guarantees a balanced ledger, and balances are summed
    from lines rather than stored, so removing an entry with its lines leaves
    every remaining balance correct — what is lost is the record that the event
    ever happened. The audit row written here is what remains of it.

    A reversal pair is removed together. Leaving half of one behind would show
    a correction with nothing to correct, or an entry that reads as cancelled
    while its mirror is gone.
    """
    from apps.operations.models import AnimalPurchase, AnimalSale

    farm = entry.farm
    reversal = getattr(entry, "reversed_by", None)
    # The reversal points at the entry it mirrors under PROTECT, so it has to be
    # removed first or the database refuses to let the original go.
    doomed = [reversal, entry] if reversal is not None else [entry]
    if entry.reverses_id:
        # Deleting a reversal on its own would silently un-cancel the original.
        raise ValidationError(
            "this entry is a reversal; delete the entry it reverses to remove both"
        )

    snapshots = [entry_snapshot(item) for item in doomed]
    ids = [item.id for item in doomed]
    keys = [item.idempotency_key for item in doomed if item.idempotency_key]

    # PROTECT on these links exists to stop an accidental cascade. A purge is
    # not accidental, so the operations go too: without their entry they would
    # claim a purchase or a sale the books know nothing about.
    operations = []
    for model, label in ((AnimalPurchase, "شراء"), (AnimalSale, "بيع")):
        # all_objects, not objects: a soft-deleted operation is hidden from the
        # app but still holds the protecting link in the database.
        for row in model.all_objects.filter(journal_entry_id__in=ids):
            operations.append(f"{label} {row.happened_on}")
            row.delete(hard=True)

    # Without this the entry's idempotency key would survive it, and an offline
    # client replaying the command would be answered "already done" forever.
    ProcessedCommand.objects.filter(
        Q(key__in=keys) | Q(result_id__in=[str(i) for i in ids])
    ).delete()

    record(
        AuditAction.DELETE,
        "journal_entry",
        entry.id,
        farm=farm,
        label=(reason or f"حذف نهائي للقيد رقم {entry.number}")[:255],
        old={"entries": snapshots, "operations": operations},
        new={"purged": True, "reason": reason},
        user=actor,
    )

    for item in doomed:
        item.delete(hard=True)
    return {"entries": len(doomed), "operations": operations}


def account_balances(farm, *, as_of=None, types=None, only_active=True):
    """Balances for every account of a farm, derived from posted lines."""
    accounts = Account.objects.filter(farm=farm)
    if only_active:
        accounts = accounts.filter(is_active=True)
    if types:
        accounts = accounts.filter(type__in=types)

    lines = LedgerLine.objects.filter(
        entry__farm=farm, entry__status=EntryStatus.POSTED
    )
    if as_of is not None:
        lines = lines.filter(entry__date__lte=as_of)
    totals = {
        row["account"]: row
        for row in lines.values("account").annotate(debit=Sum("debit"), credit=Sum("credit"))
    }

    result = []
    for account in accounts:
        row = totals.get(account.id, {})
        debit = row.get("debit") or ZERO
        credit = row.get("credit") or ZERO
        balance = debit - credit if account.is_debit_nature else credit - debit
        result.append(
            {
                "account": account,
                "debit": debit,
                "credit": credit,
                "balance": balance,
            }
        )
    return result


def trial_balance(farm, *, as_of=None):
    """Debits and credits across the farm. They must be equal, always."""
    lines = LedgerLine.objects.filter(entry__farm=farm, entry__status=EntryStatus.POSTED)
    if as_of is not None:
        lines = lines.filter(entry__date__lte=as_of)
    agg = lines.aggregate(debit=Sum("debit"), credit=Sum("credit"))
    debit = agg["debit"] or ZERO
    credit = agg["credit"] or ZERO
    return {
        "total_debit": debit,
        "total_credit": credit,
        "difference": debit - credit,
        "balanced": debit == credit,
        "rows": account_balances(farm, as_of=as_of),
    }


def account_statement(account, *, date_from=None, date_to=None, limit=None):
    """Running-balance statement for one account or person."""
    lines = (
        LedgerLine.objects.filter(account=account, entry__status=EntryStatus.POSTED)
        .select_related("entry", "entry__currency")
        .order_by("entry__date", "entry__number", "id")
    )
    if date_from:
        lines = lines.filter(entry__date__gte=date_from)
    if date_to:
        lines = lines.filter(entry__date__lte=date_to)

    opening = ZERO
    if date_from:
        prior = LedgerLine.objects.filter(
            account=account, entry__status=EntryStatus.POSTED, entry__date__lt=date_from
        ).aggregate(debit=Sum("debit"), credit=Sum("credit"))
        pd = prior["debit"] or ZERO
        pc = prior["credit"] or ZERO
        opening = pd - pc if account.is_debit_nature else pc - pd

    running = opening
    rows = []
    for line in lines[: limit or 10000]:
        change = (
            line.debit - line.credit if account.is_debit_nature else line.credit - line.debit
        )
        balance_before = running
        running += change
        rows.append(
            {
                "entry": line.entry,
                "date": line.entry.date,
                "number": line.entry.number,
                "kind": line.entry.kind,
                "memo": line.memo or line.entry.memo,
                "debit": line.debit,
                "credit": line.credit,
                "balance_before": balance_before,
                "balance_after": running,
            }
        )
    return {"account": account, "opening_balance": opening, "closing_balance": running, "rows": rows}


def profit_and_loss(farm, *, date_from=None, date_to=None, branch=None):
    """Income minus expenses for a period, from posted lines only.

    `branch` narrows the report to one production branch; pass the string
    "none" for the amounts that were never attributed to any branch.
    """
    lines = LedgerLine.objects.filter(entry__farm=farm, entry__status=EntryStatus.POSTED)
    if date_from:
        lines = lines.filter(entry__date__gte=date_from)
    if date_to:
        lines = lines.filter(entry__date__lte=date_to)
    if branch == UNASSIGNED:
        lines = lines.filter(branch__isnull=True)
    elif branch is not None:
        lines = lines.filter(branch=branch)

    def totals_for(account_type):
        rows = (
            lines.filter(account__type=account_type)
            .values("account__id", "account__code", "account__name", "account__name_ar")
            .annotate(debit=Sum("debit"), credit=Sum("credit"))
            .order_by("account__code")
        )
        items, total = [], ZERO
        for row in rows:
            debit = row["debit"] or ZERO
            credit = row["credit"] or ZERO
            value = credit - debit if account_type == AccountType.INCOME else debit - credit
            total += value
            items.append(
                {
                    "account_id": row["account__id"],
                    "code": row["account__code"],
                    "name": row["account__name_ar"] or row["account__name"],
                    "amount": value,
                }
            )
        return items, total

    income_rows, income_total = totals_for(AccountType.INCOME)
    expense_rows, expense_total = totals_for(AccountType.EXPENSE)
    return {
        "income": income_rows,
        "expenses": expense_rows,
        "total_income": income_total,
        "total_expenses": expense_total,
        "net_profit": income_total - expense_total,
    }


def branch_comparison(farm, *, date_from=None, date_to=None):
    """One profit and loss column per branch, side by side.

    This is the report the whole two-branch split exists for: what breeding
    earned, what fattening earned, and what neither of them carries alone.
    """
    from apps.catalog.models import CatalogItem, CatalogTypeCode

    branches = list(
        CatalogItem.objects.filter(farm=farm, type_id=CatalogTypeCode.BRANCH).order_by(
            "sort_order", "name"
        )
    )
    columns = []
    for branch in branches:
        report = profit_and_loss(farm, date_from=date_from, date_to=date_to, branch=branch)
        columns.append(
            {
                "branch_id": str(branch.id),
                "code": branch.code,
                "name": branch.display_name,
                **report,
            }
        )

    unassigned = profit_and_loss(farm, date_from=date_from, date_to=date_to, branch=UNASSIGNED)
    if unassigned["total_income"] or unassigned["total_expenses"]:
        columns.append(
            {
                "branch_id": None,
                "code": UNASSIGNED,
                "name": "غير موزّع",
                **unassigned,
            }
        )

    total = profit_and_loss(farm, date_from=date_from, date_to=date_to)
    return {"branches": columns, "farm_total": total}


def cash_position(farm, *, as_of=None):
    """What is actually in the boxes and bank accounts right now."""
    rows = account_balances(farm, as_of=as_of, types=[AccountType.ASSET])
    cash_rows = [row for row in rows if row["account"].is_cash]
    return {
        "total": sum((row["balance"] for row in cash_rows), ZERO),
        "accounts": cash_rows,
    }


def subject_cost(farm, subject_type, subject_id):
    """Everything ever spent on one subject - an animal, an asset, a project."""
    agg = LedgerLine.objects.filter(
        entry__farm=farm,
        entry__status=EntryStatus.POSTED,
        subject_type=subject_type,
        subject_id=subject_id,
        account__type__in=[AccountType.EXPENSE, AccountType.ASSET],
    ).aggregate(debit=Sum("debit"), credit=Sum("credit"))
    return (agg["debit"] or ZERO) - (agg["credit"] or ZERO)


def subject_revenue(farm, subject_type, subject_id):
    agg = LedgerLine.objects.filter(
        entry__farm=farm,
        entry__status=EntryStatus.POSTED,
        subject_type=subject_type,
        subject_id=subject_id,
        account__type=AccountType.INCOME,
    ).aggregate(debit=Sum("debit"), credit=Sum("credit"))
    return (agg["credit"] or ZERO) - (agg["debit"] or ZERO)


def remember_command(farm, key, command, obj=None):
    """Record that an idempotent command ran, for offline replay safety."""
    if not key:
        return None
    return ProcessedCommand.objects.get_or_create(
        key=key,
        defaults={
            "farm": farm,
            "command": command,
            "result_type": obj._meta.label if obj is not None else "",
            "result_id": str(obj.pk) if obj is not None else "",
        },
    )[0]


def open_entries_pending_approval(farm):
    return JournalEntry.objects.filter(farm=farm, status=EntryStatus.PENDING).order_by("date")


def find_account(farm, code):
    return Account.objects.filter(farm=farm, code=code).first()


def accounts_by_kind(farm, **filters):
    return Account.objects.filter(farm=farm, is_active=True, **filters).order_by("code")


def has_movements(account):
    return LedgerLine.objects.filter(account=account).exists()


def entries_for_subject(farm, subject_type, subject_id):
    return (
        JournalEntry.objects.filter(farm=farm, subject_type=subject_type, subject_id=subject_id)
        .exclude(status__in=[EntryStatus.VOID, EntryStatus.REJECTED])
        .order_by("date", "number")
    )


def outstanding_balance(account):
    """Positive means the farm owes this account holder (for liabilities)."""
    return account.balance()


def search_entries(farm, *, kind=None, status=None, date_from=None, date_to=None, query=None):
    qs = JournalEntry.objects.filter(farm=farm).select_related("currency")
    if kind:
        qs = qs.filter(kind=kind)
    if status:
        qs = qs.filter(status=status)
    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)
    if query:
        qs = qs.filter(Q(memo__icontains=query) | Q(reference__icontains=query))
    return qs
