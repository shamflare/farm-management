"""Financial commands.

Each function here is one thing a person actually does on the farm. It builds
the ledger lines, writes any documents, and commits them together in a single
transaction - so an animal is never registered without its money entry, and
money is never moved without its animal.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.ledger import chart
from apps.ledger.models import AccountType, EntryKind
from apps.ledger.services import Line, post_entry, to_money
from apps.operations.models import (
    AnimalPurchase,
    AnimalSale,
    PurchaseItem,
    SaleItem,
    SettlementStatus,
)
from apps.parties.services import ensure_party_accounts

ZERO = Decimal("0")

# يميّز «لم يُذكر هذا الحقل» عن «اجعله فارغًا»: الأول يُبقي القديم.
UNSET = object()


def _currency(farm, currency=None):
    return currency or farm.base_currency


def resolve_expense_account(farm, *, account=None, category=None):
    """An expense hits either a chosen account or the category's own account."""
    if account is not None:
        if account.type != AccountType.EXPENSE:
            raise ValidationError("the selected account is not an expense account")
        return account
    if category is not None:
        return chart.account_for_category(farm, category, account_type=AccountType.EXPENSE)
    return chart.get(farm, chart.OTHER_EXPENSE)


def resolve_income_account(farm, *, account=None, category=None):
    if account is not None:
        if account.type != AccountType.INCOME:
            raise ValidationError("the selected account is not an income account")
        return account
    if category is not None:
        return chart.account_for_category(farm, category, account_type=AccountType.INCOME)
    return chart.get(farm, chart.OTHER_INCOME)


def resolve_payment_source(farm, *, from_account=None, paid_by_party=None):
    """Where the money came from.

    Either a farm account, or a person who paid out of their own pocket - in
    which case the farm takes on a debt to that person instead of losing cash.
    """
    if from_account is not None and paid_by_party is not None:
        raise ValidationError("choose either a farm account or a person who paid, not both")
    if from_account is not None:
        return from_account
    if paid_by_party is not None:
        ensure_party_accounts(paid_by_party)
        if paid_by_party.payable_account_id is None:
            raise ValidationError(f"{paid_by_party.name} has no payable account")
        return paid_by_party.payable_account
    raise ValidationError("a payment source is required")


@transaction.atomic
def record_expense(
    farm,
    *,
    date,
    amount,
    from_account=None,
    paid_by_party=None,
    category=None,
    expense_account=None,
    currency=None,
    memo="",
    reference="",
    subject_type="",
    subject_id=None,
    branch=None,
    supplier=None,
    attachments=None,
    idempotency_key="",
    actor=None,
):
    """Money spent. Debit the expense, credit whoever paid.

    A worker paying from their own pocket produces the same expense, but the
    credit lands on their payable account - the farm now owes them.
    """
    amount = to_money(amount)
    if amount <= ZERO:
        raise ValidationError("expense amount must be greater than zero")

    currency = _currency(farm, currency)
    debit_account = resolve_expense_account(farm, account=expense_account, category=category)
    credit_account = resolve_payment_source(
        farm, from_account=from_account, paid_by_party=paid_by_party
    )
    if supplier is not None and from_account is None and paid_by_party is None:
        ensure_party_accounts(supplier)
        credit_account = supplier.payable_account

    entry = post_entry(
        farm,
        date=date,
        kind=EntryKind.EXPENSE,
        currency=currency,
        lines=[
            Line.dr(
                debit_account,
                amount,
                memo=memo,
                subject_type=subject_type,
                subject_id=subject_id,
                branch=branch,
            ),
            Line.cr(credit_account, amount, memo=memo),
        ],
        memo=memo,
        reference=reference,
        subject_type=subject_type,
        subject_id=subject_id,
        attachments=attachments,
        idempotency_key=idempotency_key,
        actor=actor,
    )
    return entry


@transaction.atomic
def record_income(
    farm,
    *,
    date,
    amount,
    into_account=None,
    customer=None,
    category=None,
    income_account=None,
    currency=None,
    memo="",
    reference="",
    subject_type="",
    subject_id=None,
    branch=None,
    attachments=None,
    idempotency_key="",
    actor=None,
):
    """Money earned. Debit where it landed, credit the revenue category."""
    amount = to_money(amount)
    if amount <= ZERO:
        raise ValidationError("income amount must be greater than zero")

    currency = _currency(farm, currency)
    credit_account = resolve_income_account(farm, account=income_account, category=category)

    if into_account is not None:
        debit_account = into_account
    elif customer is not None:
        ensure_party_accounts(customer)
        debit_account = customer.receivable_account
    else:
        raise ValidationError("choose the account that received the money, or the customer who owes it")

    return post_entry(
        farm,
        date=date,
        kind=EntryKind.INCOME,
        currency=currency,
        lines=[
            Line.dr(debit_account, amount, memo=memo),
            Line.cr(
                credit_account,
                amount,
                memo=memo,
                subject_type=subject_type,
                subject_id=subject_id,
                branch=branch,
            ),
        ],
        memo=memo,
        reference=reference,
        subject_type=subject_type,
        subject_id=subject_id,
        attachments=attachments,
        idempotency_key=idempotency_key,
        actor=actor,
    )


@transaction.atomic
def transfer_funds(
    farm,
    *,
    date,
    amount,
    from_account,
    to_account,
    memo="",
    idempotency_key="",
    actor=None,
):
    """Moving money between the farm's own accounts is not income or expense."""
    amount = to_money(amount)
    if amount <= ZERO:
        raise ValidationError("transfer amount must be greater than zero")
    if from_account.id == to_account.id:
        raise ValidationError("source and destination accounts must differ")
    if from_account.currency_id != to_account.currency_id:
        raise ValidationError(
            "cross-currency transfers need an exchange rate; record two entries instead"
        )

    return post_entry(
        farm,
        date=date,
        kind=EntryKind.TRANSFER,
        currency=from_account.currency,
        lines=[
            Line.dr(to_account, amount, memo=memo),
            Line.cr(from_account, amount, memo=memo),
        ],
        memo=memo or f"transfer {from_account.code} -> {to_account.code}",
        idempotency_key=idempotency_key,
        actor=actor,
    )


@transaction.atomic
def contribute_capital(
    farm, *, date, amount, partner, into_account, currency=None, memo="", idempotency_key="", actor=None
):
    """A partner puts money in. Cash rises, the partner's capital rises."""
    amount = to_money(amount)
    if amount <= ZERO:
        raise ValidationError("contribution must be greater than zero")
    ensure_party_accounts(partner)
    if partner.capital_account_id is None:
        raise ValidationError(f"{partner.name} is not a partner")

    return post_entry(
        farm,
        date=date,
        kind=EntryKind.CAPITAL,
        currency=_currency(farm, currency),
        lines=[
            Line.dr(into_account, amount, memo=memo),
            Line.cr(partner.capital_account, amount, memo=memo),
        ],
        memo=memo or f"capital from {partner.name}",
        subject_type="party",
        subject_id=partner.id,
        idempotency_key=idempotency_key,
        actor=actor,
    )


@transaction.atomic
def withdraw_capital(
    farm, *, date, amount, partner, from_account, currency=None, memo="", idempotency_key="", actor=None
):
    """A partner takes money out. Recorded as drawings, never as an expense."""
    amount = to_money(amount)
    if amount <= ZERO:
        raise ValidationError("withdrawal must be greater than zero")
    ensure_party_accounts(partner)
    if partner.drawings_account_id is None:
        raise ValidationError(f"{partner.name} is not a partner")

    return post_entry(
        farm,
        date=date,
        kind=EntryKind.WITHDRAWAL,
        currency=_currency(farm, currency),
        lines=[
            Line.dr(partner.drawings_account, amount, memo=memo),
            Line.cr(from_account, amount, memo=memo),
        ],
        memo=memo or f"withdrawal by {partner.name}",
        subject_type="party",
        subject_id=partner.id,
        idempotency_key=idempotency_key,
        actor=actor,
    )


@transaction.atomic
def settle_with_party(
    farm, *, date, amount, party, from_account, currency=None, memo="", idempotency_key="", actor=None
):
    """Pay off what the farm owes a worker or supplier - full or partial."""
    amount = to_money(amount)
    if amount <= ZERO:
        raise ValidationError("settlement must be greater than zero")
    ensure_party_accounts(party)
    if party.payable_account_id is None:
        raise ValidationError(f"{party.name} has no outstanding payable account")

    owed = party.payable_account.balance()
    if amount > owed:
        raise ValidationError(
            f"cannot pay {amount}; the farm only owes {party.name} {owed}"
        )

    return post_entry(
        farm,
        date=date,
        kind=EntryKind.SETTLEMENT,
        currency=_currency(farm, currency),
        lines=[
            Line.dr(party.payable_account, amount, memo=memo),
            Line.cr(from_account, amount, memo=memo),
        ],
        memo=memo or f"settlement to {party.name}",
        subject_type="party",
        subject_id=party.id,
        idempotency_key=idempotency_key,
        actor=actor,
    )


@transaction.atomic
def collect_from_party(
    farm, *, date, amount, party, into_account, currency=None, memo="", idempotency_key="", actor=None
):
    """Collect what a customer owes the farm."""
    amount = to_money(amount)
    if amount <= ZERO:
        raise ValidationError("collection must be greater than zero")
    ensure_party_accounts(party)
    if party.receivable_account_id is None:
        raise ValidationError(f"{party.name} has no receivable account")

    return post_entry(
        farm,
        date=date,
        kind=EntryKind.SETTLEMENT,
        currency=_currency(farm, currency),
        lines=[
            Line.dr(into_account, amount, memo=memo),
            Line.cr(party.receivable_account, amount, memo=memo),
        ],
        memo=memo or f"payment received from {party.name}",
        subject_type="party",
        subject_id=party.id,
        idempotency_key=idempotency_key,
        actor=actor,
    )


CULLING_REASON = "culling"


def _by_branch(animals, amounts):
    """Fold per-animal amounts into one total per branch, order preserved.

    Revenue and cost have to reach the ledger split by branch, otherwise a
    single mixed invoice would make both branch reports wrong.
    """
    groups = {}
    for animal, amount in zip(animals, amounts):
        if amount <= ZERO:
            continue
        key = animal.branch_id
        if key in groups:
            groups[key][1] += amount
        else:
            groups[key] = [animal.branch, amount]
    return list(groups.values())


def revenue_account_for(farm, animal, sale_reason=None):
    """Which revenue line a sold animal belongs on.

    The breeding branch earns from two different things and the owner reads
    them apart: lambs raised and sold, and ewes taken out of the flock. An ewe
    born here and culled years later is a cull, not a lamb sale, so the reason
    is asked first.
    """
    from apps.animals.models import Acquisition

    if sale_reason is not None and sale_reason.code == CULLING_REASON:
        return chart.get(farm, chart.CULLED_SALES)
    if animal.acquisition == Acquisition.BORN:
        return chart.get(farm, chart.OFFSPRING_SALES)
    return chart.get(farm, chart.ANIMAL_SALES)


def _by_account_and_branch(animals, amounts, account_for):
    """Same folding as `_by_branch`, but split by revenue account too."""
    groups = {}
    for animal, amount in zip(animals, amounts):
        if amount <= ZERO:
            continue
        account = account_for(animal)
        key = (account.id, animal.branch_id)
        if key in groups:
            groups[key][2] += amount
        else:
            groups[key] = [account, animal.branch, amount]
    return list(groups.values())


def _allocate(total_extra, weights):
    """Spread transport and fees over animals in proportion to their price.

    The last animal absorbs the rounding remainder so the parts always sum back
    to the whole.
    """
    if total_extra == ZERO or not weights:
        return [ZERO for _ in weights]
    base = sum(weights, ZERO)
    if base == ZERO:
        share = (total_extra / len(weights)).quantize(Decimal("0.0001"))
        parts = [share for _ in weights]
    else:
        parts = [(total_extra * w / base).quantize(Decimal("0.0001")) for w in weights]
    parts[-1] += total_extra - sum(parts, ZERO)
    return parts


@transaction.atomic
def purchase_animals(
    farm,
    *,
    date,
    items,
    supplier=None,
    transport_cost=0,
    commission_cost=0,
    other_cost=0,
    paid_amount=None,
    from_account=None,
    paid_by_party=None,
    currency=None,
    reference="",
    notes="",
    attachments=None,
    idempotency_key="",
    actor=None,
):
    """Buy animals.

    `items` is a list of dicts: {"animal": Animal, "unit_price": Decimal}.
    Transport, commission and other fees are capitalised into the value of the
    animals, so each animal carries its true cost.
    """
    from apps.animals.models import Acquisition, AnimalEvent, AnimalEventType

    if not items:
        raise ValidationError("a purchase needs at least one animal")

    currency = _currency(farm, currency)
    prices = [to_money(item["unit_price"]) for item in items]
    if any(price < ZERO for price in prices):
        raise ValidationError("prices cannot be negative")

    animals_price = sum(prices, ZERO)
    transport_cost = to_money(transport_cost)
    commission_cost = to_money(commission_cost)
    other_cost = to_money(other_cost)
    extra = transport_cost + commission_cost + other_cost
    total_cost = animals_price + extra
    if total_cost <= ZERO:
        raise ValidationError("purchase total must be greater than zero")

    paid = total_cost if paid_amount is None else to_money(paid_amount)
    if paid < ZERO or paid > total_cost:
        raise ValidationError("paid amount must be between zero and the total")
    unpaid = total_cost - paid

    livestock = chart.get(farm, chart.LIVESTOCK)
    allocations = _allocate(extra, prices)
    animals = [item["animal"] for item in items]
    allocated_costs = [price + share for price, share in zip(prices, allocations)]
    lines = [
        Line.dr(livestock, amount, memo=notes or "animal purchase", branch=branch)
        for branch, amount in _by_branch(animals, allocated_costs)
    ]

    if paid > ZERO:
        source = resolve_payment_source(
            farm, from_account=from_account, paid_by_party=paid_by_party
        )
        lines.append(Line.cr(source, paid, memo=notes or "animal purchase"))
    if unpaid > ZERO:
        if supplier is None:
            raise ValidationError("an unpaid balance needs a supplier to owe it to")
        ensure_party_accounts(supplier)
        lines.append(Line.cr(supplier.payable_account, unpaid, memo="unpaid balance"))

    purchase = AnimalPurchase.objects.create(
        farm=farm,
        reference=reference,
        supplier=supplier,
        happened_on=date,
        currency=currency,
        animals_price=animals_price,
        transport_cost=transport_cost,
        commission_cost=commission_cost,
        other_cost=other_cost,
        total_cost=total_cost,
        paid_amount=paid,
        settlement_status=(
            SettlementStatus.PAID
            if unpaid == ZERO
            else SettlementStatus.PARTIAL if paid > ZERO else SettlementStatus.UNPAID
        ),
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
        lines=lines,
        memo=notes or f"purchase of {len(items)} animal(s)",
        reference=reference,
        subject_type="purchase",
        subject_id=purchase.id,
        attachments=attachments,
        idempotency_key=idempotency_key,
        actor=actor,
    )
    purchase.journal_entry = entry
    purchase.save(update_fields=["journal_entry", "updated_at"])

    for item, price, allocated in zip(items, prices, allocated_costs):
        animal = item["animal"]
        PurchaseItem.objects.create(
            purchase=purchase, animal=animal, unit_price=price, allocated_cost=allocated
        )
        animal.purchase_price = allocated
        animal.purchase_currency = currency
        animal.entered_at = animal.entered_at or date
        # Money changed hands for this animal, so however it was registered, it
        # is a purchased animal now. Reports read this to tell a lamb raised
        # here apart from one bought at the market.
        animal.acquisition = Acquisition.PURCHASED
        animal.save(
            update_fields=[
                "purchase_price",
                "purchase_currency",
                "entered_at",
                "acquisition",
                "updated_at",
            ]
        )
        AnimalEvent.objects.create(
            farm=farm,
            animal=animal,
            event_type=AnimalEventType.PURCHASED,
            happened_on=date,
            title="تم شراء الحيوان",
            amount=allocated,
            currency=currency,
            journal_entry=entry,
            data={"purchase_id": str(purchase.id), "unit_price": str(price)},
        )

    record(
        AuditAction.CREATE,
        "animal_purchase",
        purchase.id,
        farm=farm,
        label=f"purchase {total_cost} {currency.code} for {len(items)} animal(s)",
        new={"total": str(total_cost), "paid": str(paid), "entry": str(entry.id)},
        user=actor,
    )
    return purchase


@transaction.atomic
@transaction.atomic
def correct_purchase(
    purchase,
    *,
    date=None,
    prices=None,
    supplier=UNSET,
    transport_cost=None,
    commission_cost=None,
    other_cost=None,
    paid_amount=UNSET,
    from_account=UNSET,
    reference=None,
    notes=None,
    actor=None,
):
    """يصحّح صفقة شراء أُدخلت بقيم خاطئة.

    القيد المرحّل لا يُعدَّل في هذا النظام — يُعكس بقيد مضاد ويُكتب قيد صحيح
    مكانه. فتبقى القصة كاملة في الدفتر: هكذا سُجّلت، وهكذا أُلغيت، وهكذا صارت.
    محو الأول كان سيجعل الدفتر يقول إن الخطأ لم يحدث قط، وذاك تزوير لا تصحيح.

    الرؤوس نفسها تبقى في الصفقة؛ ما يُصحَّح هو الأرقام: الأثمان والنقل
    والعمولة والمدفوع والتاريخ والبائع. إضافة رأس أو إخراجه صفقة أخرى لا
    تصحيح لهذه.
    """
    from apps.animals.models import AnimalEvent, AnimalEventType
    from apps.ledger.models import EntryStatus
    from apps.ledger.services import reverse_entry

    items = list(purchase.items.select_related("animal").all())
    if not items:
        raise ValidationError("لا رؤوس في هذه الصفقة")

    before = {
        "animals_price": str(purchase.animals_price),
        "transport_cost": str(purchase.transport_cost),
        "commission_cost": str(purchase.commission_cost),
        "other_cost": str(purchase.other_cost),
        "total_cost": str(purchase.total_cost),
        "paid_amount": str(purchase.paid_amount),
        "happened_on": purchase.happened_on.isoformat(),
        "supplier": purchase.supplier.name if purchase.supplier_id else "",
    }

    farm = purchase.farm
    currency = purchase.currency
    date = date or purchase.happened_on
    prices = prices or {}
    new_prices = [
        to_money(prices.get(str(item.id), prices.get(item.id, item.unit_price))) for item in items
    ]
    if any(price < ZERO for price in new_prices):
        raise ValidationError("الأثمان لا تكون سالبة")

    transport = to_money(purchase.transport_cost if transport_cost is None else transport_cost)
    commission = to_money(purchase.commission_cost if commission_cost is None else commission_cost)
    other = to_money(purchase.other_cost if other_cost is None else other_cost)
    if min(transport, commission, other) < ZERO:
        raise ValidationError("التكاليف الإضافية لا تكون سالبة")

    animals_price = sum(new_prices, ZERO)
    extra = transport + commission + other
    total_cost = animals_price + extra
    if total_cost <= ZERO:
        raise ValidationError("مجموع الصفقة يجب أن يكون أكبر من صفر")

    # لم يُذكر المدفوع: يبقى كما هو، محدودًا بالمجموع الجديد إن نزل عنه.
    if paid_amount is UNSET:
        paid = min(to_money(purchase.paid_amount), total_cost)
    elif paid_amount is None:
        paid = total_cost
    else:
        paid = to_money(paid_amount)
    if paid < ZERO or paid > total_cost:
        raise ValidationError("المدفوع يكون بين صفر ومجموع الصفقة")
    unpaid = total_cost - paid

    new_supplier = purchase.supplier if supplier is UNSET else supplier
    account = purchase.paid_from_account if from_account is UNSET else from_account

    # تصحيح لا يغيّر شيئًا لا يُحرّك الدفتر: عكسٌ وقيدٌ جديدان بالأرقام نفسها
    # يملآن التاريخ بضجيج ويجعلان قارئه يبحث عن فرق لا وجود له.
    unchanged = (
        date == purchase.happened_on
        and animals_price == to_money(purchase.animals_price)
        and transport == to_money(purchase.transport_cost)
        and commission == to_money(purchase.commission_cost)
        and other == to_money(purchase.other_cost)
        and paid == to_money(purchase.paid_amount)
        and (new_supplier.id if new_supplier else None)
        == (purchase.supplier.id if purchase.supplier_id else None)
    )
    if unchanged:
        # النص والمرجع لا يمسّان القيد، فيُحفظان وحدهما إن ذُكرا.
        fields = []
        if reference is not None and reference != purchase.reference:
            purchase.reference = reference
            fields.append("reference")
        if notes is not None and notes != purchase.notes:
            purchase.notes = notes
            fields.append("notes")
        if fields:
            purchase.save(update_fields=fields + ["updated_at"])
        return purchase

    # القيد القديم يُعكس أولًا: لا يُكتب الجديد قبل أن يُلغى الأول، وإلا حُسب
    # المبلغ مرتين للحظة بين الاثنين.
    old_entry = purchase.journal_entry
    if old_entry is not None and old_entry.status == EntryStatus.POSTED:
        reverse_entry(old_entry, actor=actor, reason=f"تصحيح صفقة شراء #{old_entry.number}", date=date)

    livestock = chart.get(farm, chart.LIVESTOCK)
    allocations = _allocate(extra, new_prices)
    allocated_costs = [price + share for price, share in zip(new_prices, allocations)]
    animals = [item.animal for item in items]
    lines = [
        Line.dr(livestock, amount, memo=notes or "تصحيح شراء حيوانات", branch=branch)
        for branch, amount in _by_branch(animals, allocated_costs)
    ]

    if paid > ZERO:
        source = resolve_payment_source(farm, from_account=account, paid_by_party=purchase.paid_by_party)
        lines.append(Line.cr(source, paid, memo=notes or "تصحيح شراء حيوانات"))
    if unpaid > ZERO:
        if new_supplier is None:
            raise ValidationError("الباقي على المزرعة يحتاج بائعًا يُنسب إليه")
        ensure_party_accounts(new_supplier)
        lines.append(Line.cr(new_supplier.payable_account, unpaid, memo="باقٍ على المزرعة"))

    entry = post_entry(
        farm,
        date=date,
        kind=EntryKind.PURCHASE,
        currency=currency,
        lines=lines,
        memo=notes or f"تصحيح شراء {len(items)} رأس",
        reference=reference if reference is not None else purchase.reference,
        subject_type="purchase",
        subject_id=purchase.id,
        actor=actor,
    )

    purchase.happened_on = date
    purchase.supplier = new_supplier
    purchase.animals_price = animals_price
    purchase.transport_cost = transport
    purchase.commission_cost = commission
    purchase.other_cost = other
    purchase.total_cost = total_cost
    purchase.paid_amount = paid
    purchase.paid_from_account = account
    purchase.settlement_status = (
        SettlementStatus.PAID
        if unpaid == ZERO
        else SettlementStatus.PARTIAL if paid > ZERO else SettlementStatus.UNPAID
    )
    purchase.journal_entry = entry
    if reference is not None:
        purchase.reference = reference
    if notes is not None:
        purchase.notes = notes
    purchase.save()

    for item, price, allocated in zip(items, new_prices, allocated_costs):
        item.unit_price = price
        item.allocated_cost = allocated
        item.save(update_fields=["unit_price", "allocated_cost"])

        animal = item.animal
        animal.purchase_price = allocated
        animal.entered_at = date
        animal.save(update_fields=["purchase_price", "entered_at", "updated_at"])

        # حدث الشراء في تاريخ الحيوان يقول الرقم الجديد، لا القديم الذي أُلغي.
        AnimalEvent.objects.filter(
            animal=animal,
            event_type=AnimalEventType.PURCHASED,
            data__purchase_id=str(purchase.id),
        ).update(happened_on=date, amount=allocated, journal_entry=entry)

    record(
        AuditAction.UPDATE,
        "animal_purchase",
        purchase.id,
        farm=farm,
        label=f"تصحيح صفقة شراء إلى {total_cost} {currency.code}",
        old=before,
        new={
            "animals_price": str(animals_price),
            "transport_cost": str(transport),
            "commission_cost": str(commission),
            "other_cost": str(other),
            "total_cost": str(total_cost),
            "paid_amount": str(paid),
            "happened_on": date.isoformat(),
            "supplier": new_supplier.name if new_supplier else "",
        },
        user=actor,
    )
    return purchase


def sell_animals(
    farm,
    *,
    date,
    items,
    customer=None,
    transport_cost=0,
    commission_cost=0,
    received_amount=None,
    into_account=None,
    sale_reason=None,
    currency=None,
    reference="",
    notes="",
    attachments=None,
    idempotency_key="",
    actor=None,
):
    """Sell animals.

    One entry carries the whole story: the money in, what is still owed, the
    revenue earned, the book value leaving the livestock account, and any
    transport or commission paid on the way out.
    """
    from apps.animals.models import AnimalEvent, AnimalEventType
    from apps.animals.services import mark_sold

    if not items:
        raise ValidationError("a sale needs at least one animal")

    currency = _currency(farm, currency)
    prices = [to_money(item["unit_price"]) for item in items]
    if any(price < ZERO for price in prices):
        raise ValidationError("prices cannot be negative")

    animals_price = sum(prices, ZERO)
    transport_cost = to_money(transport_cost)
    commission_cost = to_money(commission_cost)
    selling_costs = transport_cost + commission_cost
    if animals_price <= ZERO:
        raise ValidationError("sale total must be greater than zero")

    received = animals_price if received_amount is None else to_money(received_amount)
    if received < ZERO or received > animals_price:
        raise ValidationError("received amount must be between zero and the sale total")
    outstanding = animals_price - received

    if received > ZERO and into_account is None:
        raise ValidationError("choose the account that received the money")
    if outstanding > ZERO and customer is None:
        raise ValidationError("an unpaid balance needs a customer to owe it")

    livestock = chart.get(farm, chart.LIVESTOCK)
    cogs = chart.get(farm, chart.COST_OF_ANIMALS_SOLD)

    animals = [item["animal"] for item in items]
    lines = [
        Line.cr(account, amount, memo=notes or "animal sale", branch=branch)
        for account, branch, amount in _by_account_and_branch(
            animals, prices, lambda animal: revenue_account_for(farm, animal, sale_reason)
        )
    ]
    if received > ZERO:
        lines.append(Line.dr(into_account, received, memo=notes or "animal sale"))
    if outstanding > ZERO:
        ensure_party_accounts(customer)
        lines.append(Line.dr(customer.receivable_account, outstanding, memo="unpaid balance"))

    # Remove each animal's carrying value from the livestock account.
    book_values = []
    total_book_value = ZERO
    for item in items:
        animal = item["animal"]
        book_value = to_money(item.get("book_value") or animal.purchase_price or ZERO)
        book_values.append(book_value)
        total_book_value += book_value
    if total_book_value > ZERO:
        for branch, amount in _by_branch(animals, book_values):
            lines.append(Line.dr(cogs, amount, memo="cost of animals sold", branch=branch))
            lines.append(Line.cr(livestock, amount, memo="cost of animals sold", branch=branch))

    if selling_costs > ZERO:
        if into_account is None:
            raise ValidationError("selling costs need an account to be paid from")
        selling_expense = chart.get(farm, chart.OTHER_EXPENSE)
        # Transport and commission follow the animals that caused them.
        shares = _allocate(selling_costs, prices)
        for branch, amount in _by_branch(animals, shares):
            lines.append(
                Line.dr(selling_expense, amount, memo="transport and commission", branch=branch)
            )
        lines.append(Line.cr(into_account, selling_costs, memo="transport and commission"))

    sale = AnimalSale.objects.create(
        farm=farm,
        reference=reference,
        customer=customer,
        happened_on=date,
        currency=currency,
        animals_price=animals_price,
        transport_cost=transport_cost,
        commission_cost=commission_cost,
        total_price=animals_price,
        received_amount=received,
        settlement_status=(
            SettlementStatus.PAID
            if outstanding == ZERO
            else SettlementStatus.PARTIAL if received > ZERO else SettlementStatus.UNPAID
        ),
        received_into_account=into_account,
        sale_reason=sale_reason,
        notes=notes,
        attachments=attachments or [],
    )

    entry = post_entry(
        farm,
        date=date,
        kind=EntryKind.SALE,
        currency=currency,
        lines=lines,
        memo=notes or f"sale of {len(items)} animal(s)",
        reference=reference,
        subject_type="sale",
        subject_id=sale.id,
        attachments=attachments,
        idempotency_key=idempotency_key,
        actor=actor,
    )
    sale.journal_entry = entry
    sale.save(update_fields=["journal_entry", "updated_at"])

    for item, price, book_value in zip(items, prices, book_values):
        animal = item["animal"]
        SaleItem.objects.create(
            sale=sale,
            animal=animal,
            unit_price=price,
            weight_kg=item.get("weight_kg"),
            book_value=book_value,
        )
        mark_sold(animal, date=date)
        AnimalEvent.objects.create(
            farm=farm,
            animal=animal,
            event_type=AnimalEventType.SOLD,
            happened_on=date,
            title="تم بيع الحيوان",
            amount=price,
            currency=currency,
            journal_entry=entry,
            data={"sale_id": str(sale.id), "customer": customer.name if customer else ""},
        )

    record(
        AuditAction.CREATE,
        "animal_sale",
        sale.id,
        farm=farm,
        label=f"sale {animals_price} {currency.code} of {len(items)} animal(s)",
        new={"total": str(animals_price), "received": str(received), "entry": str(entry.id)},
        user=actor,
    )
    return sale


@transaction.atomic
def record_animal_death(
    farm, *, animal, date, reason=None, notes="", currency=None, actor=None, idempotency_key=""
):
    """A dead animal leaves the livestock account as a loss, and stays on file."""
    from apps.animals.models import AnimalEvent, AnimalEventType
    from apps.animals.services import mark_dead

    currency = _currency(farm, currency)
    book_value = to_money(animal.purchase_price or ZERO)
    entry = None
    if book_value > ZERO:
        entry = post_entry(
            farm,
            date=date,
            kind=EntryKind.ADJUSTMENT,
            currency=currency,
            lines=[
                Line.dr(
                    chart.get(farm, chart.ANIMAL_LOSS),
                    book_value,
                    memo=notes or "animal death",
                    subject_type="animal",
                    subject_id=animal.id,
                    branch=animal.branch,
                ),
                Line.cr(
                    chart.get(farm, chart.LIVESTOCK),
                    book_value,
                    memo=notes or "animal death",
                    branch=animal.branch,
                ),
            ],
            memo=notes or f"death of animal {animal.tag}",
            subject_type="animal",
            subject_id=animal.id,
            idempotency_key=idempotency_key,
            actor=actor,
        )

    mark_dead(animal, date=date)
    AnimalEvent.objects.create(
        farm=farm,
        animal=animal,
        event_type=AnimalEventType.DIED,
        happened_on=date,
        title="نفوق الحيوان",
        detail=notes,
        amount=book_value or None,
        currency=currency if book_value else None,
        journal_entry=entry,
        data={"reason": reason.name if reason else ""},
    )
    return entry


@transaction.atomic
def record_opening_balances(
    farm,
    *,
    date,
    assets=None,
    liabilities=None,
    partner_capital=None,
    currency=None,
    memo="الرصيد الافتتاحي",
    actor=None,
):
    """Load the farm's position on the day the system starts.

    `assets` and `liabilities` are lists of {"account": Account, "amount": x}.
    `partner_capital` is a list of {"party": Party, "amount": x}. Whatever does
    not balance between them is booked to opening balance equity, which is the
    honest way to say "this existed before we started counting".
    """
    currency = _currency(farm, currency)
    assets = assets or []
    liabilities = liabilities or []
    partner_capital = partner_capital or []

    lines = []
    total_debit = ZERO
    total_credit = ZERO

    for row in assets:
        amount = to_money(row["amount"])
        if amount <= ZERO:
            continue
        lines.append(Line.dr(row["account"], amount, memo=row.get("memo", "opening balance")))
        total_debit += amount

    for row in liabilities:
        amount = to_money(row["amount"])
        if amount <= ZERO:
            continue
        lines.append(Line.cr(row["account"], amount, memo=row.get("memo", "opening balance")))
        total_credit += amount

    for row in partner_capital:
        amount = to_money(row["amount"])
        if amount <= ZERO:
            continue
        partner = row["party"]
        ensure_party_accounts(partner)
        lines.append(Line.cr(partner.capital_account, amount, memo="opening capital"))
        total_credit += amount

    difference = total_debit - total_credit
    if difference != ZERO:
        equity = chart.get(farm, chart.OPENING_EQUITY)
        if difference > ZERO:
            lines.append(Line.cr(equity, difference, memo="opening equity"))
        else:
            lines.append(Line.dr(equity, -difference, memo="opening equity"))

    if not lines:
        raise ValidationError("opening balances are empty")

    entry = post_entry(
        farm,
        date=date,
        kind=EntryKind.OPENING,
        currency=currency,
        lines=lines,
        memo=memo,
        force_status=None,
        actor=actor,
    )

    from django.utils import timezone

    farm.opening_completed_at = timezone.now()
    farm.save(update_fields=["opening_completed_at", "updated_at"])
    return entry
