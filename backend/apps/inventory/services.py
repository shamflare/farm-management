"""Feed store operations and their postings.

Feed is an asset while it sits in the store and becomes an expense the day it
is eaten. That is what makes "how much feed did breeding cost this month" a
real answer instead of a guess about when the truck happened to arrive.

Costing is the weighted moving average: every receipt re-averages the store,
every issue leaves at the average of the moment and keeps that cost forever.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.inventory.models import (
    InventoryItem,
    InventoryStore,
    MovementKind,
    StockMovement,
)
from apps.ledger import chart
from apps.ledger.models import EntryKind
from apps.ledger.services import Line, post_entry, to_money

ZERO = Decimal("0")
QUANTITY = Decimal("0.001")


def to_quantity(value):
    try:
        quantity = Decimal(str(value))
    except (ArithmeticError, TypeError, ValueError):
        raise ValidationError("quantity must be a number")
    if quantity.is_nan() or quantity.is_infinite():
        raise ValidationError("quantity must be a finite number")
    return quantity.quantize(QUANTITY)


def store_account(store):
    """The asset account holding this store's value, created on first use."""
    return chart.account_for_store(store.farm, store)


# --------------------------------------------------------------------------
# Balances
# --------------------------------------------------------------------------

def _movements(store, item, *, before=None):
    rows = StockMovement.objects.filter(store=store, item=item)
    if before is not None:
        rows = rows.filter(happened_on__lte=before)
    return rows.order_by("happened_on", "created_at")


def balance(store, item, *, as_of=None):
    """Quantity, value and average cost of one item in one store.

    Replayed from the movements rather than cached: the same rule the ledger
    follows, for the same reason.
    """
    quantity = ZERO
    value = ZERO
    for movement in _movements(store, item, before=as_of):
        quantity += movement.signed_quantity
        value += movement.signed_value
    if quantity == ZERO:
        # An empty store holds no value, whatever rounding left behind.
        value = ZERO
    average = (value / quantity).quantize(Decimal("0.0001")) if quantity > ZERO else ZERO
    return {"quantity": quantity, "value": value, "average_cost": average}


def store_balances(store, *, as_of=None):
    """Every item this store has ever held, with what is left of it."""
    item_ids = list(
        StockMovement.objects.filter(store=store).values_list("item_id", flat=True).distinct()
    )
    rows = []
    for item in InventoryItem.objects.filter(id__in=item_ids).order_by("sort_order", "name"):
        state = balance(store, item, as_of=as_of)
        rows.append({"item": item, **state})
    return rows


def farm_balances(farm, *, as_of=None, branch=None):
    """Store by store, what is in it and what it is worth."""
    stores = InventoryStore.objects.filter(farm=farm)
    if branch is not None:
        stores = stores.filter(branch=branch)
    result = []
    for store in stores.select_related("branch").order_by("sort_order", "name"):
        rows = store_balances(store, as_of=as_of)
        result.append(
            {
                "store": store,
                "items": rows,
                "total_value": sum((row["value"] for row in rows), ZERO),
            }
        )
    return result


# --------------------------------------------------------------------------
# Movements
# --------------------------------------------------------------------------

def _check(store, item):
    if store.farm_id != item.farm_id:
        raise ValidationError("the store and the item belong to different farms")
    if not store.is_active:
        raise ValidationError("this store is closed")


def _available(store, item, date, quantity):
    """Refuse to take out more than the store holds on that date."""
    state = balance(store, item, as_of=date)
    if quantity > state["quantity"]:
        raise ValidationError(
            f"{store.display_name} holds only {state['quantity']} of {item.display_name}"
        )
    return state


@transaction.atomic
def receive_stock(
    farm,
    *,
    store,
    item,
    date,
    quantity,
    unit_cost=None,
    total_cost=None,
    supplier=None,
    from_account=None,
    paid_by_party=None,
    currency=None,
    memo="",
    attachments=None,
    idempotency_key="",
    actor=None,
):
    """Feed arrives. The store gains value; no expense is recorded yet."""
    from apps.operations.services import resolve_payment_source
    from apps.parties.services import ensure_party_accounts

    _check(store, item)
    quantity = to_quantity(quantity)
    if quantity <= ZERO:
        raise ValidationError("received quantity must be greater than zero")

    if total_cost is None and unit_cost is None:
        raise ValidationError("give either the unit cost or the total cost")
    if total_cost is None:
        total_cost = to_money(unit_cost) * quantity
    total_cost = to_money(total_cost)
    if total_cost < ZERO:
        raise ValidationError("cost cannot be negative")
    unit_cost = to_money(total_cost / quantity)

    currency = currency or farm.base_currency
    asset = store_account(store)
    label = memo or f"{item.display_name} received"

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

    movement = StockMovement.objects.create(
        farm=farm,
        store=store,
        item=item,
        kind=MovementKind.RECEIPT,
        happened_on=date,
        quantity=quantity,
        unit_cost=unit_cost,
        total_cost=total_cost,
        supplier=supplier,
        memo=memo,
        attachments=attachments or [],
    )

    if total_cost > ZERO:
        entry = post_entry(
            farm,
            date=date,
            kind=EntryKind.PURCHASE,
            currency=currency,
            lines=[
                Line.dr(asset, total_cost, memo=label),
                Line.cr(credit, total_cost, memo=label),
            ],
            memo=memo or f"{item.display_name} into {store.display_name}",
            subject_type="stock_movement",
            subject_id=movement.id,
            branch=store.branch,
            attachments=attachments,
            idempotency_key=idempotency_key,
            actor=actor,
        )
        movement.journal_entry = entry
        movement.save(update_fields=["journal_entry", "updated_at"])

    record(
        AuditAction.CREATE,
        "stock_movement",
        movement.id,
        farm=farm,
        label=f"receipt {quantity} {item.display_name} into {store.display_name}",
        new={"quantity": str(quantity), "total_cost": str(total_cost)},
        user=actor,
    )
    return movement


@transaction.atomic
def issue_stock(
    farm,
    *,
    store,
    item,
    date,
    quantity,
    memo="",
    animal=None,
    currency=None,
    idempotency_key="",
    actor=None,
):
    """Feed is eaten. Its value leaves the store and becomes the branch's cost."""
    _check(store, item)
    quantity = to_quantity(quantity)
    if quantity <= ZERO:
        raise ValidationError("issued quantity must be greater than zero")

    state = _available(store, item, date, quantity)
    unit_cost = state["average_cost"]
    total_cost = to_money(unit_cost * quantity)
    label = memo or f"{item.display_name} fed"

    movement = StockMovement.objects.create(
        farm=farm,
        store=store,
        item=item,
        kind=MovementKind.ISSUE,
        happened_on=date,
        quantity=quantity,
        unit_cost=unit_cost,
        total_cost=total_cost,
        memo=memo,
    )

    if total_cost > ZERO:
        entry = post_entry(
            farm,
            date=date,
            kind=EntryKind.EXPENSE,
            currency=currency or farm.base_currency,
            lines=[
                Line.dr(
                    chart.get(farm, chart.FEED_EXPENSE),
                    total_cost,
                    memo=label,
                    branch=store.branch,
                    subject_type="animal" if animal else "",
                    subject_id=animal.id if animal else None,
                ),
                Line.cr(store_account(store), total_cost, memo=label),
            ],
            memo=memo or f"{item.display_name} from {store.display_name}",
            subject_type="stock_movement",
            subject_id=movement.id,
            branch=store.branch,
            idempotency_key=idempotency_key,
            actor=actor,
        )
        movement.journal_entry = entry
        movement.save(update_fields=["journal_entry", "updated_at"])

    record(
        AuditAction.CREATE,
        "stock_movement",
        movement.id,
        farm=farm,
        label=f"issue {quantity} {item.display_name} from {store.display_name}",
        new={"quantity": str(quantity), "total_cost": str(total_cost)},
        user=actor,
    )
    return movement


@transaction.atomic
def transfer_stock(
    farm,
    *,
    from_store,
    to_store,
    item,
    date,
    quantity,
    memo="",
    currency=None,
    idempotency_key="",
    actor=None,
):
    """Move feed between the two stores. Value follows it; no expense arises."""
    _check(from_store, item)
    _check(to_store, item)
    if from_store.id == to_store.id:
        raise ValidationError("a transfer needs two different stores")

    quantity = to_quantity(quantity)
    if quantity <= ZERO:
        raise ValidationError("transferred quantity must be greater than zero")

    state = _available(from_store, item, date, quantity)
    unit_cost = state["average_cost"]
    total_cost = to_money(unit_cost * quantity)
    label = memo or "stock transfer"

    out = StockMovement.objects.create(
        farm=farm,
        store=from_store,
        item=item,
        kind=MovementKind.TRANSFER_OUT,
        happened_on=date,
        quantity=quantity,
        unit_cost=unit_cost,
        total_cost=total_cost,
        memo=memo,
    )
    into = StockMovement.objects.create(
        farm=farm,
        store=to_store,
        item=item,
        kind=MovementKind.TRANSFER_IN,
        happened_on=date,
        quantity=quantity,
        unit_cost=unit_cost,
        total_cost=total_cost,
        memo=memo,
        counterpart=out,
    )
    out.counterpart = into
    out.save(update_fields=["counterpart", "updated_at"])

    if total_cost > ZERO:
        entry = post_entry(
            farm,
            date=date,
            kind=EntryKind.TRANSFER,
            currency=currency or farm.base_currency,
            lines=[
                Line.dr(store_account(to_store), total_cost, memo=label, branch=to_store.branch),
                Line.cr(store_account(from_store), total_cost, memo=label, branch=from_store.branch),
            ],
            memo=memo or f"{item.display_name}: {from_store.display_name} to {to_store.display_name}",
            subject_type="stock_movement",
            subject_id=out.id,
            idempotency_key=idempotency_key,
            actor=actor,
        )
        StockMovement.objects.filter(id__in=[out.id, into.id]).update(journal_entry=entry)

    record(
        AuditAction.CREATE,
        "stock_movement",
        out.id,
        farm=farm,
        label=f"transfer {quantity} {item.display_name} to {to_store.display_name}",
        new={"quantity": str(quantity), "total_cost": str(total_cost)},
        user=actor,
    )
    return out, into


@transaction.atomic
def write_off_stock(
    farm, *, store, item, date, quantity, memo="", currency=None, idempotency_key="", actor=None
):
    """Feed spoiled, spilled or stolen. A loss, not a cost of feeding."""
    _check(store, item)
    quantity = to_quantity(quantity)
    if quantity <= ZERO:
        raise ValidationError("written off quantity must be greater than zero")

    state = _available(store, item, date, quantity)
    unit_cost = state["average_cost"]
    total_cost = to_money(unit_cost * quantity)
    label = memo or "stock written off"

    movement = StockMovement.objects.create(
        farm=farm,
        store=store,
        item=item,
        kind=MovementKind.WASTE,
        happened_on=date,
        quantity=quantity,
        unit_cost=unit_cost,
        total_cost=total_cost,
        memo=memo,
    )

    if total_cost > ZERO:
        entry = post_entry(
            farm,
            date=date,
            kind=EntryKind.ADJUSTMENT,
            currency=currency or farm.base_currency,
            lines=[
                Line.dr(
                    chart.get(farm, chart.STOCK_LOSS),
                    total_cost,
                    memo=label,
                    branch=store.branch,
                ),
                Line.cr(store_account(store), total_cost, memo=label),
            ],
            memo=memo or f"{item.display_name} written off",
            subject_type="stock_movement",
            subject_id=movement.id,
            branch=store.branch,
            idempotency_key=idempotency_key,
            actor=actor,
        )
        movement.journal_entry = entry
        movement.save(update_fields=["journal_entry", "updated_at"])

    record(
        AuditAction.CREATE,
        "stock_movement",
        movement.id,
        farm=farm,
        label=f"write off {quantity} {item.display_name}",
        new={"quantity": str(quantity), "total_cost": str(total_cost)},
        user=actor,
    )
    return movement


@transaction.atomic
def count_stock(
    farm,
    *,
    store,
    item,
    date,
    counted_quantity,
    memo="",
    currency=None,
    idempotency_key="",
    actor=None,
):
    """Record a physical count and book the difference against the books."""
    _check(store, item)
    counted = to_quantity(counted_quantity)
    if counted < ZERO:
        raise ValidationError("a counted quantity cannot be negative")

    state = balance(store, item, as_of=date)
    difference = counted - state["quantity"]
    if difference == ZERO:
        return None

    # A shortage leaves at the store's average cost. A surplus found in an
    # empty store has no average to use, so it comes in at the last known cost.
    unit_cost = state["average_cost"]
    if unit_cost <= ZERO:
        last = (
            StockMovement.objects.filter(store=store, item=item, unit_cost__gt=ZERO)
            .order_by("-happened_on", "-created_at")
            .first()
        )
        unit_cost = last.unit_cost if last else ZERO
    value = to_money(unit_cost * abs(difference))

    movement = StockMovement.objects.create(
        farm=farm,
        store=store,
        item=item,
        kind=MovementKind.COUNT,
        happened_on=date,
        quantity=difference,
        unit_cost=unit_cost,
        total_cost=value if difference > ZERO else -value,
        memo=memo or f"counted {counted}, books said {state['quantity']}",
    )

    if value > ZERO:
        loss = chart.get(farm, chart.STOCK_LOSS)
        asset = store_account(store)
        if difference < ZERO:
            lines = [
                Line.dr(loss, value, memo="stock count shortage", branch=store.branch),
                Line.cr(asset, value, memo="stock count shortage"),
            ]
        else:
            lines = [
                Line.dr(asset, value, memo="stock count surplus"),
                Line.cr(loss, value, memo="stock count surplus", branch=store.branch),
            ]
        entry = post_entry(
            farm,
            date=date,
            kind=EntryKind.ADJUSTMENT,
            currency=currency or farm.base_currency,
            lines=lines,
            memo=memo or f"stock count of {item.display_name}",
            subject_type="stock_movement",
            subject_id=movement.id,
            branch=store.branch,
            idempotency_key=idempotency_key,
            actor=actor,
        )
        movement.journal_entry = entry
        movement.save(update_fields=["journal_entry", "updated_at"])

    record(
        AuditAction.CREATE,
        "stock_movement",
        movement.id,
        farm=farm,
        label=f"count {item.display_name} in {store.display_name}",
        new={"counted": str(counted), "difference": str(difference)},
        user=actor,
    )
    return movement


@transaction.atomic
def create_store(farm, *, name, name_ar="", branch=None, location="", notes="", sort_order=0):
    """A store, with its own account under Inventory, ready to receive."""
    store = InventoryStore.objects.create(
        farm=farm,
        name=name,
        name_ar=name_ar,
        branch=branch,
        location=location,
        notes=notes,
        sort_order=sort_order,
    )
    store_account(store)
    return store


def low_stock(farm):
    """Items that have dropped to their reorder level, store by store."""
    warnings = []
    for store in InventoryStore.objects.filter(farm=farm, is_active=True).select_related("branch"):
        for row in store_balances(store):
            item = row["item"]
            if item.reorder_level > ZERO and row["quantity"] <= item.reorder_level:
                warnings.append({"store": store, "item": item, "quantity": row["quantity"]})
    return warnings
