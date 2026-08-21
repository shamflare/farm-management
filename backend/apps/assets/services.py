"""Recording founding costs and reading the total back."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum

from apps.assets.models import FoundingCost
from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.ledger import chart
from apps.ledger.models import EntryKind
from apps.ledger.services import Line, post_entry, to_money

ZERO = Decimal("0")


@transaction.atomic
def record_founding_cost(
    farm,
    *,
    date,
    name,
    amount,
    asset_type=None,
    branch=None,
    quantity=1,
    supplier=None,
    from_account=None,
    paid_by_party=None,
    currency=None,
    notes="",
    attachments=None,
    idempotency_key="",
    actor=None,
):
    """Book one founding cost as a fixed asset, not as a running expense.

    Debiting Fixed assets rather than an expense account is the whole point:
    building the barn must not make the month the barn was built look like a
    losing month.
    """
    from apps.operations.services import resolve_payment_source
    from apps.parties.services import ensure_party_accounts

    amount = to_money(amount)
    if amount <= ZERO:
        raise ValidationError("a founding cost must be greater than zero")
    if not name:
        raise ValidationError("say what was bought or built")

    currency = currency or farm.base_currency

    if from_account is not None or paid_by_party is not None:
        credit = resolve_payment_source(farm, from_account=from_account, paid_by_party=paid_by_party)
    elif supplier is not None:
        ensure_party_accounts(supplier)
        credit = supplier.payable_account
    else:
        raise ValidationError(
            "choose who paid: a farm account, a person paying from their pocket, "
            "or a supplier on credit"
        )

    cost = FoundingCost.objects.create(
        farm=farm,
        happened_on=date,
        name=name,
        asset_type=asset_type,
        branch=branch,
        amount=amount,
        currency=currency,
        quantity=quantity or 1,
        supplier=supplier,
        paid_from_account=from_account,
        paid_by_party=paid_by_party,
        notes=notes,
        attachments=attachments or [],
    )

    entry = post_entry(
        farm,
        date=date,
        kind=EntryKind.PURCHASE,
        currency=currency,
        lines=[
            Line.dr(
                chart.get(farm, chart.FIXED_ASSETS),
                amount,
                memo=name,
                subject_type="founding_cost",
                subject_id=cost.id,
                branch=branch,
            ),
            Line.cr(credit, amount, memo=name),
        ],
        memo=f"تأسيس: {name}"[:255],
        subject_type="founding_cost",
        subject_id=cost.id,
        branch=branch,
        attachments=attachments,
        idempotency_key=idempotency_key,
        actor=actor,
    )
    cost.journal_entry = entry
    cost.save(update_fields=["journal_entry", "updated_at"])

    record(
        AuditAction.CREATE,
        "founding_cost",
        cost.id,
        farm=farm,
        label=f"founding cost {name} {amount} {currency.code}",
        new={"name": name, "amount": str(amount)},
        user=actor,
    )
    return cost


def summary(farm, *, date_from=None, date_to=None, branch=None):
    """The total invested in setting the farm up, and what it went on."""
    rows = FoundingCost.objects.filter(farm=farm)
    if date_from:
        rows = rows.filter(happened_on__gte=date_from)
    if date_to:
        rows = rows.filter(happened_on__lte=date_to)
    if branch is not None:
        rows = rows.filter(branch=branch)

    total = rows.aggregate(total=Sum("amount"))["total"] or ZERO
    by_type = [
        {
            "type": row["asset_type__name_ar"] or row["asset_type__name"] or "غير مصنف",
            "total": row["total"],
            "count": row["count"],
        }
        for row in rows.values("asset_type__name", "asset_type__name_ar")
        .annotate(total=Sum("amount"), count=Sum("quantity"))
        .order_by("-total")
    ]
    by_branch = [
        {
            "branch": row["branch__name_ar"] or row["branch__name"] or "عام",
            "total": row["total"],
        }
        for row in rows.values("branch__name", "branch__name_ar")
        .annotate(total=Sum("amount"))
        .order_by("-total")
    ]
    return {
        "total": total,
        "count": rows.count(),
        "by_type": by_type,
        "by_branch": by_branch,
    }
