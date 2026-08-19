"""Party accounts and statements."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.ledger.models import Account, AccountType
from apps.ledger.services import account_statement
from apps.parties.models import OwnershipChange, Party, PartyKind

ZERO = Decimal("0")

# Parent accounts each party account hangs under.
PARENT_CODES = {
    "receivable": "1100",
    "payable": "2100",
    "worker_payable": "2200",
    "capital": "3100",
    "drawings": "3200",
    "wallet": "1050",
}


def _next_child_code(farm, parent_code):
    parent = Account.objects.filter(farm=farm, code=parent_code).first()
    if parent is None:
        raise ValidationError(f"chart of accounts is missing parent account {parent_code}")
    count = Account.all_objects.filter(farm=farm, parent=parent).count() + 1
    code = f"{parent_code}-{count:03d}"
    while Account.all_objects.filter(farm=farm, code=code).exists():
        count += 1
        code = f"{parent_code}-{count:03d}"
    return parent, code


def _create_party_account(farm, party, slot, account_type, suffix_ar, currency):
    parent, code = _next_child_code(farm, PARENT_CODES[slot])
    return Account.objects.create(
        farm=farm,
        code=code,
        name=f"{party.name} - {slot}",
        name_ar=f"{suffix_ar} - {party.name}",
        type=account_type,
        currency=currency,
        parent=parent,
        is_cash=slot == "wallet",
        is_system=True,
    )


@transaction.atomic
def ensure_party_accounts(party, currency=None):
    """Create the ledger accounts a party needs for its kind. Idempotent."""
    farm = party.farm
    currency = currency or farm.base_currency
    changed = []

    if party.kind in (PartyKind.CUSTOMER, PartyKind.OTHER) and not party.receivable_account_id:
        party.receivable_account = _create_party_account(
            farm, party, "receivable", AccountType.ASSET, "ذمم مدينة", currency
        )
        changed.append("receivable_account")

    if party.kind == PartyKind.SUPPLIER and not party.payable_account_id:
        party.payable_account = _create_party_account(
            farm, party, "payable", AccountType.LIABILITY, "ذمم دائنة", currency
        )
        changed.append("payable_account")

    if party.kind == PartyKind.WORKER and not party.payable_account_id:
        # Money the worker spent from their own pocket lands here.
        party.payable_account = _create_party_account(
            farm, party, "worker_payable", AccountType.LIABILITY, "مستحق للعامل", currency
        )
        changed.append("payable_account")

    if party.kind == PartyKind.PARTNER:
        if not party.capital_account_id:
            party.capital_account = _create_party_account(
                farm, party, "capital", AccountType.EQUITY, "رأس مال الشريك", currency
            )
            changed.append("capital_account")
        if not party.drawings_account_id:
            party.drawings_account = _create_party_account(
                farm, party, "drawings", AccountType.EQUITY, "مسحوبات الشريك", currency
            )
            changed.append("drawings_account")

    if changed:
        party.save(update_fields=changed + ["updated_at"])
    return party


@transaction.atomic
def ensure_wallet(party, currency=None):
    """A cash box a person holds on behalf of the farm (advance float)."""
    if party.cash_account_id:
        return party.cash_account
    currency = currency or party.farm.base_currency
    party.cash_account = _create_party_account(
        party.farm, party, "wallet", AccountType.ASSET, "عهدة نقدية", currency
    )
    party.save(update_fields=["cash_account", "updated_at"])
    return party.cash_account


def create_party(farm, *, kind, name, currency=None, **extra):
    party = Party.objects.create(farm=farm, kind=kind, name=name, **extra)
    ensure_party_accounts(party, currency=currency)
    return party


@transaction.atomic
def set_ownership(party, percentage, *, effective_from, reason=""):
    if not party.is_partner:
        raise ValidationError("ownership applies to partners only")
    percentage = Decimal(str(percentage))
    if not ZERO <= percentage <= Decimal("100"):
        raise ValidationError("ownership must be between 0 and 100")
    OwnershipChange.objects.create(
        farm=party.farm,
        party=party,
        effective_from=effective_from,
        old_percentage=party.ownership_percentage,
        new_percentage=percentage,
        reason=reason,
    )
    party.ownership_percentage = percentage
    party.save(update_fields=["ownership_percentage", "updated_at"])
    return party


def ownership_total(farm):
    rows = Party.objects.filter(
        farm=farm, kind=PartyKind.PARTNER, is_active=True, ownership_percentage__isnull=False
    ).values_list("ownership_percentage", flat=True)
    return sum(rows, ZERO)


def party_statement(party, *, date_from=None, date_to=None):
    """Combined statement across every account the party owns."""
    sections = []
    for slot in ("receivable_account", "payable_account", "capital_account", "drawings_account", "cash_account"):
        account = getattr(party, slot, None)
        if account is None:
            continue
        statement = account_statement(account, date_from=date_from, date_to=date_to)
        statement["slot"] = slot
        sections.append(statement)
    return {"party": party, "sections": sections}


def party_summary(party):
    """The numbers a person cares about: what they owe and what they are owed."""
    owed_to_farm = party.receivable_account.balance() if party.receivable_account_id else ZERO
    owed_by_farm = party.payable_account.balance() if party.payable_account_id else ZERO
    capital = party.capital_account.balance() if party.capital_account_id else ZERO
    wallet = party.cash_account.balance() if party.cash_account_id else ZERO

    # Drawings is a contra-equity account: taking money out debits it, so its
    # natural balance runs negative. Flip the sign to report "how much was
    # withdrawn" as a positive figure, then subtract it from what was put in.
    drawings_balance = party.drawings_account.balance() if party.drawings_account_id else ZERO
    drawings = -drawings_balance

    return {
        "party_id": str(party.id),
        "name": party.name,
        "kind": party.kind,
        "owed_to_farm": owed_to_farm,
        "owed_by_farm": owed_by_farm,
        "capital_contributed": capital,
        "drawings": drawings,
        "net_capital": capital - drawings,
        "cash_held": wallet,
        "ownership_percentage": party.ownership_percentage,
    }
