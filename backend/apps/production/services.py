"""Recording the milk and selling it."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Sum

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.ledger import chart
from apps.ledger.models import EntryKind
from apps.ledger.services import Line, post_entry, to_money
from apps.production.models import Milking, MilkProduction, MilkSale

ZERO = Decimal("0")


def to_quantity(value):
    try:
        quantity = Decimal(str(value))
    except (ArithmeticError, TypeError, ValueError):
        raise ValidationError("quantity must be a number")
    if quantity.is_nan() or quantity.is_infinite():
        raise ValidationError("quantity must be a finite number")
    return quantity.quantize(Decimal("0.001"))


@transaction.atomic
def record_production(
    farm,
    *,
    date,
    liters,
    branch=None,
    session=Milking.DAY,
    milking_animals=None,
    wasted_liters=0,
    notes="",
    actor=None,
):
    """Log one milking. Re-recording the same session corrects it, never doubles it."""
    liters = to_quantity(liters)
    if liters < ZERO:
        raise ValidationError("litres cannot be negative")

    wasted = to_quantity(wasted_liters or 0)
    if wasted < ZERO:
        raise ValidationError("الهدر لا يكون سالبًا")
    if wasted > liters:
        raise ValidationError("الهدر لا يتجاوز ما أُنتج")

    row, created = MilkProduction.objects.update_or_create(
        farm=farm,
        branch=branch,
        happened_on=date,
        session=session,
        defaults={
            "liters": liters,
            "milking_animals": milking_animals,
            "wasted_liters": wasted,
            "notes": notes,
        },
    )
    record(
        AuditAction.CREATE if created else AuditAction.UPDATE,
        "milk_production",
        row.id,
        farm=farm,
        label=f"{date} {session}: {liters}L",
        new={"liters": str(liters), "session": session},
        user=actor,
    )
    return row


@transaction.atomic
def record_sale(
    farm,
    *,
    date,
    quantity,
    unit_price=None,
    total_price=None,
    product=None,
    unit=None,
    branch=None,
    customer=None,
    into_account=None,
    currency=None,
    notes="",
    attachments=None,
    idempotency_key="",
    actor=None,
):
    """Sell milk or a dairy product. Credits the milk revenue account."""
    from apps.parties.services import ensure_party_accounts

    quantity = to_quantity(quantity)
    if quantity <= ZERO:
        raise ValidationError("sold quantity must be greater than zero")

    if total_price is None and unit_price is None:
        raise ValidationError("give either the unit price or the total price")
    if total_price is None:
        total_price = to_money(unit_price) * quantity
    total_price = to_money(total_price)
    if total_price <= ZERO:
        raise ValidationError("sale total must be greater than zero")
    unit_price = to_money(total_price / quantity)

    currency = currency or farm.base_currency
    if into_account is None and customer is None:
        raise ValidationError("choose the account that received the money, or the customer who owes it")

    sale = MilkSale.objects.create(
        farm=farm,
        happened_on=date,
        branch=branch,
        product=product,
        unit=unit,
        quantity=quantity,
        unit_price=unit_price,
        total_price=total_price,
        currency=currency,
        customer=customer,
        received_into_account=into_account,
        notes=notes,
        attachments=attachments or [],
    )

    if into_account is not None:
        debit = into_account
    else:
        ensure_party_accounts(customer)
        debit = customer.receivable_account

    label = notes or f"{sale.product_name} sale"
    entry = post_entry(
        farm,
        date=date,
        kind=EntryKind.SALE,
        currency=currency,
        lines=[
            Line.dr(debit, total_price, memo=label),
            Line.cr(chart.get(farm, chart.MILK_SALES), total_price, memo=label, branch=branch),
        ],
        memo=label,
        subject_type="milk_sale",
        subject_id=sale.id,
        branch=branch,
        attachments=attachments,
        idempotency_key=idempotency_key,
        actor=actor,
    )
    sale.journal_entry = entry
    sale.save(update_fields=["journal_entry", "updated_at"])

    record(
        AuditAction.CREATE,
        "milk_sale",
        sale.id,
        farm=farm,
        label=f"{sale.product_name} {quantity} for {total_price} {currency.code}",
        new={"quantity": str(quantity), "total": str(total_price)},
        user=actor,
    )
    return sale


def summary(farm, *, date_from=None, date_to=None, branch=None):
    """Produced, sold, and the gap between them for a period.

    The gap is what the farm drank, turned into cheese, or lost - the number
    the owner asks about when the milk cheque looks smaller than the yield.
    """
    production = MilkProduction.objects.filter(farm=farm)
    sales = MilkSale.objects.filter(farm=farm)
    if date_from:
        production = production.filter(happened_on__gte=date_from)
        sales = sales.filter(happened_on__gte=date_from)
    if date_to:
        production = production.filter(happened_on__lte=date_to)
        sales = sales.filter(happened_on__lte=date_to)
    if branch is not None:
        production = production.filter(branch=branch)
        sales = sales.filter(branch=branch)

    totals = production.aggregate(liters=Sum("liters"), days=Count("happened_on", distinct=True))
    produced = totals["liters"] or ZERO
    days = totals["days"] or 0

    # Only raw milk is measured in litres, so the litres sold are counted from
    # the rows whose unit matches production. Products are reported by value.
    sold_rows = sales.aggregate(value=Sum("total_price"))
    raw_sold = sales.filter(product__code="raw_milk").aggregate(quantity=Sum("quantity"))

    liters_sold = raw_sold["quantity"] or ZERO
    wasted = production.aggregate(total=Sum("wasted_liters"))["total"] or ZERO
    return {
        "liters_produced": produced,
        "liters_sold": liters_sold,
        "liters_wasted": wasted,
        # ما لم يُبَع ولم يُهدر: بقي للبيت أو لرضاعة المواليد.
        "liters_kept": produced - liters_sold - wasted,
        "days_recorded": days,
        "daily_average": (produced / days) if days else ZERO,
        "sales_value": sold_rows["value"] or ZERO,
        "by_product": [
            {
                "product": row["product__name_ar"] or row["product__name"] or "حليب",
                "quantity": row["quantity"],
                "value": row["value"],
            }
            for row in sales.values("product__name", "product__name_ar")
            .annotate(quantity=Sum("quantity"), value=Sum("total_price"))
            .order_by("-value")
        ],
    }


def daily_series(farm, *, date_from=None, date_to=None, branch=None):
    """Litres per day, for the chart on the milk screen."""
    rows = MilkProduction.objects.filter(farm=farm)
    if date_from:
        rows = rows.filter(happened_on__gte=date_from)
    if date_to:
        rows = rows.filter(happened_on__lte=date_to)
    if branch is not None:
        rows = rows.filter(branch=branch)
    return [
        {"date": row["happened_on"], "liters": row["liters"]}
        for row in rows.values("happened_on")
        .annotate(liters=Sum("liters"))
        .order_by("happened_on")
    ]
