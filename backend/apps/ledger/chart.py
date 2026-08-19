"""The default chart of accounts.

Seeded once per farm, then owned by the farm: the admin can rename accounts and
add categories from settings. Application code refers to accounts by these
codes, never by name, so a rename is safe.
"""
from django.db import transaction

from apps.ledger.models import Account, AccountType

# code, english name, arabic name, type, parent code, is_cash
DEFAULT_ACCOUNTS = [
    ("1000", "Assets", "الأصول", AccountType.ASSET, None, False),
    ("1010", "Farm cash box", "صندوق المزرعة", AccountType.ASSET, "1000", True),
    ("1020", "Bank account", "الحساب البنكي", AccountType.ASSET, "1000", True),
    ("1050", "Cash held by staff", "العهد النقدية", AccountType.ASSET, "1000", False),
    ("1100", "Accounts receivable", "ذمم مدينة (لنا عند الناس)", AccountType.ASSET, "1000", False),
    ("1200", "Livestock", "قيمة الحيوانات", AccountType.ASSET, "1000", False),
    ("1300", "Inventory", "المخزون", AccountType.ASSET, "1000", False),
    ("1400", "Fixed assets", "الأصول الثابتة", AccountType.ASSET, "1000", False),
    ("2000", "Liabilities", "الالتزامات", AccountType.LIABILITY, None, False),
    ("2100", "Accounts payable", "ذمم دائنة (علينا للناس)", AccountType.LIABILITY, "2000", False),
    ("2200", "Due to workers", "مستحقات العاملين", AccountType.LIABILITY, "2000", False),
    ("2300", "Loans", "القروض", AccountType.LIABILITY, "2000", False),
    ("3000", "Equity", "حقوق الملكية", AccountType.EQUITY, None, False),
    ("3100", "Partner capital", "رأس مال الشركاء", AccountType.EQUITY, "3000", False),
    ("3200", "Partner drawings", "مسحوبات الشركاء", AccountType.EQUITY, "3000", False),
    ("3900", "Opening balance equity", "رصيد افتتاحي", AccountType.EQUITY, "3000", False),
    ("4000", "Revenue", "الإيرادات", AccountType.INCOME, None, False),
    ("4100", "Animal sales", "مبيعات الحيوانات", AccountType.INCOME, "4000", False),
    ("4900", "Other income", "إيرادات أخرى", AccountType.INCOME, "4000", False),
    ("5000", "Expenses", "المصروفات", AccountType.EXPENSE, None, False),
    ("5100", "Cost of animals sold", "تكلفة الحيوانات المباعة", AccountType.EXPENSE, "5000", False),
    ("5200", "Animal loss on death", "خسائر النفوق", AccountType.EXPENSE, "5000", False),
    ("5900", "Other expenses", "مصروفات أخرى", AccountType.EXPENSE, "5000", False),
]

# Codes the application logic depends on.
CASH = "1010"
BANK = "1020"
STAFF_CASH = "1050"
RECEIVABLE = "1100"
LIVESTOCK = "1200"
INVENTORY = "1300"
FIXED_ASSETS = "1400"
PAYABLE = "2100"
WORKER_PAYABLE = "2200"
PARTNER_CAPITAL = "3100"
PARTNER_DRAWINGS = "3200"
OPENING_EQUITY = "3900"
REVENUE_ROOT = "4000"
ANIMAL_SALES = "4100"
OTHER_INCOME = "4900"
EXPENSE_ROOT = "5000"
COST_OF_ANIMALS_SOLD = "5100"
ANIMAL_LOSS = "5200"
OTHER_EXPENSE = "5900"


@transaction.atomic
def seed_chart_of_accounts(farm, currency=None):
    """Create any missing default accounts for a farm. Safe to re-run."""
    currency = currency or farm.base_currency
    created = []
    for code, name, name_ar, acc_type, parent_code, is_cash in DEFAULT_ACCOUNTS:
        if Account.all_objects.filter(farm=farm, code=code).exists():
            continue
        parent = Account.objects.filter(farm=farm, code=parent_code).first() if parent_code else None
        account = Account.objects.create(
            farm=farm,
            code=code,
            name=name,
            name_ar=name_ar,
            type=acc_type,
            currency=currency,
            parent=parent,
            is_cash=is_cash,
            is_system=True,
            sort_order=int(code),
        )
        created.append(account)
    return created


def get(farm, code):
    """Fetch a system account by code, raising a clear error when missing."""
    account = Account.objects.filter(farm=farm, code=code).first()
    if account is None:
        raise LookupError(f"account {code} is not set up for farm {farm.slug}")
    return account


@transaction.atomic
def account_for_category(farm, catalog_item, *, account_type, currency=None):
    """Give every expense/revenue category its own ledger account.

    Categories are catalog rows the admin controls; this keeps the ledger in
    step with them without hardcoding any category name.
    """
    existing = Account.objects.filter(farm=farm, catalog_item=catalog_item).first()
    if existing is not None:
        return existing

    root_code = EXPENSE_ROOT if account_type == AccountType.EXPENSE else REVENUE_ROOT
    root = get(farm, root_code)
    parent = root
    if catalog_item.parent_id:
        parent_account = Account.objects.filter(farm=farm, catalog_item=catalog_item.parent).first()
        if parent_account is not None:
            parent = parent_account

    count = Account.all_objects.filter(farm=farm, code__startswith=f"{root_code}-").count() + 1
    code = f"{root_code}-{count:03d}"
    while Account.all_objects.filter(farm=farm, code=code).exists():
        count += 1
        code = f"{root_code}-{count:03d}"

    return Account.objects.create(
        farm=farm,
        code=code,
        name=catalog_item.name,
        name_ar=catalog_item.name_ar or catalog_item.name,
        type=account_type,
        currency=currency or farm.base_currency,
        parent=parent,
        is_system=False,
        catalog_item=catalog_item,
        sort_order=catalog_item.sort_order,
    )
