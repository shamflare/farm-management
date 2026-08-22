"""Turning what is on screen into a file the owner can keep.

CSV, written with a byte-order mark so Excel opens Arabic correctly instead of
showing mojibake - the single most common way an Arabic export goes wrong.
There is no PDF writer here on purpose: rendering Arabic to PDF on the server
means shipping a font and a heavy library to a free host, when the browser the
report is already displayed in prints the same thing better.
"""
import csv
import io
from datetime import date

from django.core.exceptions import ValidationError

# Excel only reads a UTF-8 CSV correctly when it starts with this.
BOM = "﻿"


def to_csv(headers, rows):
    """One CSV document as text, ready to be returned as a file."""
    buffer = io.StringIO()
    buffer.write(BOM)
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow(["" if value is None else value for value in row])
    return buffer.getvalue()


def animals(farm, **filters):
    from apps.animals.models import Animal

    rows = (
        Animal.objects.filter(farm=farm)
        .select_related("branch", "animal_type", "breed", "status", "location")
        .order_by("tag")
    )
    if filters.get("branch"):
        rows = rows.filter(branch_id=filters["branch"])
    if filters.get("is_on_farm") in ("true", "false"):
        rows = rows.filter(is_on_farm=filters["is_on_farm"] == "true")

    headers = [
        "الرقم", "الاسم", "الفرع", "النوع", "السلالة", "الجنس", "تاريخ الميلاد",
        "الحالة", "الموقع", "الوزن", "سعر الشراء", "تاريخ الدخول", "تاريخ الخروج",
        "الأم", "الأب", "ملاحظات",
    ]
    sex = {"female": "أنثى", "male": "ذكر", "unknown": "غير محدد"}
    return headers, [
        [
            row.tag,
            row.name,
            row.branch.display_name if row.branch else "",
            row.animal_type.display_name,
            row.breed.display_name if row.breed else "",
            sex.get(row.sex, row.sex),
            row.birth_date,
            row.status.display_name,
            row.location.display_name if row.location else "",
            row.current_weight,
            row.purchase_price,
            row.entered_at,
            row.exited_at,
            row.mother.tag if row.mother else "",
            row.father.tag if row.father else "",
            row.notes,
        ]
        for row in rows
    ]


def entries(farm, **filters):
    from apps.ledger.models import JournalEntry

    rows = (
        JournalEntry.objects.filter(farm=farm)
        .select_related("currency", "created_by")
        .prefetch_related("lines__account", "lines__branch")
        .order_by("-date", "-number")
    )
    if filters.get("from"):
        rows = rows.filter(date__gte=filters["from"])
    if filters.get("to"):
        rows = rows.filter(date__lte=filters["to"])
    if filters.get("kind"):
        rows = rows.filter(kind=filters["kind"])

    headers = [
        "رقم القيد", "التاريخ", "النوع", "الحالة", "الحساب", "الفرع",
        "مدين", "دائن", "البيان", "العملة",
    ]
    out = []
    for entry in rows:
        for line in entry.lines.all():
            out.append(
                [
                    entry.number,
                    entry.date,
                    entry.get_kind_display(),
                    entry.get_status_display(),
                    line.account.display_name,
                    line.branch.display_name if line.branch else "",
                    line.debit or "",
                    line.credit or "",
                    line.memo or entry.memo,
                    entry.currency_id,
                ]
            )
    return headers, out


def trial_balance(farm, **filters):
    from apps.ledger import services as ledger_services

    result = ledger_services.trial_balance(farm, as_of=filters.get("as_of") or None)
    headers = ["الرمز", "الحساب", "النوع", "مدين", "دائن", "الرصيد"]
    return headers, [
        [
            row["account"].code,
            row["account"].display_name,
            row["account"].get_type_display(),
            row["debit"],
            row["credit"],
            row["balance"],
        ]
        for row in result["rows"]
        if row["debit"] or row["credit"]
    ]


def profit_loss(farm, **filters):
    from apps.ledger import services as ledger_services

    result = ledger_services.profit_and_loss(
        farm, date_from=filters.get("from") or None, date_to=filters.get("to") or None
    )
    headers = ["البند", "الحساب", "المبلغ"]
    rows = [["إيراد", item["name"], item["amount"]] for item in result["income"]]
    rows += [["مصروف", item["name"], item["amount"]] for item in result["expenses"]]
    rows.append(["", "إجمالي الدخل", result["total_income"]])
    rows.append(["", "إجمالي المصروفات", result["total_expenses"]])
    rows.append(["", "صافي الربح", result["net_profit"]])
    return headers, rows


def branches(farm, **filters):
    from apps.ledger import services as ledger_services

    result = ledger_services.branch_comparison(
        farm, date_from=filters.get("from") or None, date_to=filters.get("to") or None
    )
    headers = ["الفرع", "البند", "الحساب", "المبلغ"]
    rows = []
    for column in result["branches"]:
        for item in column["income"]:
            rows.append([column["name"], "إيراد", item["name"], item["amount"]])
        for item in column["expenses"]:
            rows.append([column["name"], "مصروف", item["name"], item["amount"]])
        rows.append([column["name"], "", "صافي الربح", column["net_profit"]])
    return headers, rows


def stock(farm, **filters):
    from apps.inventory import services as stock_services

    headers = ["المستودع", "الفرع", "الصنف", "الوحدة", "الكمية", "متوسط التكلفة", "القيمة"]
    rows = []
    for store_row in stock_services.farm_balances(farm, as_of=filters.get("as_of") or None):
        store = store_row["store"]
        for item in store_row["items"]:
            rows.append(
                [
                    store.display_name,
                    store.branch.display_name if store.branch else "",
                    item["item"].display_name,
                    item["item"].unit_name,
                    item["quantity"],
                    item["average_cost"],
                    item["value"],
                ]
            )
    return headers, rows


def milk(farm, **filters):
    from apps.production.models import MilkProduction

    rows = (
        MilkProduction.objects.filter(farm=farm).select_related("branch").order_by("happened_on")
    )
    if filters.get("from"):
        rows = rows.filter(happened_on__gte=filters["from"])
    if filters.get("to"):
        rows = rows.filter(happened_on__lte=filters["to"])

    headers = ["التاريخ", "الفرع", "الحلبة", "اللترات", "عدد الحلوبات", "ملاحظات"]
    return headers, [
        [
            row.happened_on,
            row.branch.display_name if row.branch else "",
            row.get_session_display(),
            row.liters,
            row.milking_animals,
            row.notes,
        ]
        for row in rows
    ]


def founding_costs(farm, **filters):
    from apps.assets.models import FoundingCost

    rows = (
        FoundingCost.objects.filter(farm=farm)
        .select_related("asset_type", "branch", "supplier")
        .order_by("happened_on")
    )
    headers = ["التاريخ", "البند", "النوع", "الفرع", "المبلغ", "العملة", "المورد", "ملاحظات"]
    return headers, [
        [
            row.happened_on,
            row.name,
            row.type_name,
            row.branch.display_name if row.branch else "",
            row.amount,
            row.currency_id,
            row.supplier.name if row.supplier else "",
            row.notes,
        ]
        for row in rows
    ]


def parties(farm, **filters):
    from apps.parties.models import Party
    from apps.parties.services import party_summary

    headers = ["الاسم", "الصفة", "الهاتف", "لنا عنده", "علينا له", "صافي رأس المال"]
    rows = []
    for party in Party.objects.filter(farm=farm).order_by("kind", "name"):
        summary = party_summary(party)
        rows.append(
            [
                party.name,
                party.get_kind_display(),
                party.phone,
                summary["owed_to_farm"],
                summary["owed_by_farm"],
                summary["net_capital"],
            ]
        )
    return headers, rows


# Each export, the permission it needs, and the file it produces.
EXPORTS = {
    "animals": (animals, "animals.export", "الحيوانات"),
    "entries": (entries, "finance.export", "قيود-الدفتر"),
    "trial-balance": (trial_balance, "reports.export", "ميزان-المراجعة"),
    "profit-loss": (profit_loss, "reports.export", "الأرباح-والخسائر"),
    "branches": (branches, "reports.export", "مقارنة-الفروع"),
    "stock": (stock, "reports.export", "المخزون"),
    "milk": (milk, "reports.export", "الحليب"),
    "founding-costs": (founding_costs, "reports.export", "التكاليف-التأسيسية"),
    "parties": (parties, "reports.export", "الأشخاص-والحسابات"),
}


def build(farm, name, **filters):
    """Returns (filename, csv text) for one of the known exports."""
    if name not in EXPORTS:
        known = ", ".join(sorted(EXPORTS))
        raise ValidationError(f"'{name}' is not an export this system knows; try one of: {known}")
    builder, _permission, label = EXPORTS[name]
    headers, rows = builder(farm, **filters)
    filename = f"{label}-{date.today().isoformat()}.csv"
    return filename, to_csv(headers, rows)


def permission_for(name):
    return EXPORTS[name][1] if name in EXPORTS else None
