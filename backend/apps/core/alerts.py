"""What the farm should be told about, gathered on demand.

Nothing here is stored. An alert that lives in a table goes stale the moment
the thing it warns about is dealt with, and then someone has to remember to
clear it. Recomputing is cheap and can never be wrong.

Every alert is filtered by what the person asking is allowed to see, so a
worker is not told the cash box is empty.
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

ZERO = Decimal("0")

# How far ahead a vaccination counts as "coming up".
VACCINE_HORIZON_DAYS = 14


class Severity:
    INFO = "info"
    WARNING = "warning"
    DANGER = "danger"


def _alert(kind, severity, title, detail="", count=0, link=""):
    return {
        "kind": kind,
        "severity": severity,
        "title": title,
        "detail": detail,
        "count": count,
        "link": link,
    }


def vaccinations_due(farm, horizon=VACCINE_HORIZON_DAYS):
    from apps.animals.models import HealthRecord

    today = timezone.now().date()
    rows = (
        HealthRecord.objects.filter(
            farm=farm,
            next_due_on__isnull=False,
            next_due_on__lte=today + timedelta(days=horizon),
        )
        .select_related("animal", "item")
        .order_by("next_due_on")
    )
    if not rows:
        return []

    overdue = [row for row in rows if row.next_due_on < today]
    soon = [row for row in rows if row.next_due_on >= today]
    alerts = []
    if overdue:
        alerts.append(
            _alert(
                "vaccine_overdue",
                Severity.DANGER,
                f"{len(overdue)} لقاح أو علاج فات موعده",
                "، ".join(f"{row.animal.tag}" for row in overdue[:5]),
                len(overdue),
                "/animals",
            )
        )
    if soon:
        alerts.append(
            _alert(
                "vaccine_due",
                Severity.WARNING,
                f"{len(soon)} لقاح أو علاج مستحق خلال {horizon} يومًا",
                "، ".join(f"{row.animal.tag}" for row in soon[:5]),
                len(soon),
                "/animals",
            )
        )
    return alerts


def low_stock(farm):
    from apps.inventory.services import low_stock as find_low

    rows = find_low(farm)
    if not rows:
        return []
    return [
        _alert(
            "low_stock",
            Severity.WARNING,
            f"{len(rows)} صنف علف أوشك على النفاد",
            "، ".join(f"{row['item'].display_name} في {row['store'].display_name}" for row in rows[:4]),
            len(rows),
            "/inventory",
        )
    ]


def pending_approvals(farm):
    from apps.ledger import services as ledger_services

    count = ledger_services.open_entries_pending_approval(farm).count()
    if not count:
        return []
    return [
        _alert(
            "pending_approval",
            Severity.WARNING,
            f"{count} عملية بانتظار الاعتماد",
            "لن تدخل الحسابات قبل اعتمادها",
            count,
            "/finance",
        )
    ]


def outstanding_debts(farm):
    from apps.parties.models import Party
    from apps.parties.services import party_summary

    owed_to_farm = ZERO
    owed_by_farm = ZERO
    creditors = 0
    debtors = 0
    for party in Party.objects.filter(farm=farm, is_active=True):
        summary = party_summary(party)
        if summary["owed_to_farm"] > ZERO:
            owed_to_farm += summary["owed_to_farm"]
            debtors += 1
        if summary["owed_by_farm"] > ZERO:
            owed_by_farm += summary["owed_by_farm"]
            creditors += 1

    alerts = []
    if debtors:
        alerts.append(
            _alert(
                "receivable",
                Severity.INFO,
                f"لنا عند {debtors} شخصًا مبلغ {owed_to_farm}",
                "ذمم لم تُحصَّل بعد",
                debtors,
                "/parties",
            )
        )
    if creditors:
        alerts.append(
            _alert(
                "payable",
                Severity.WARNING,
                f"علينا لـ {creditors} شخصًا مبلغ {owed_by_farm}",
                "مستحقات لم تُسدَّد بعد",
                creditors,
                "/parties",
            )
        )
    return alerts


def cash_position(farm):
    from apps.ledger import services as ledger_services

    position = ledger_services.cash_position(farm)
    negative = [row for row in position["accounts"] if row["balance"] < ZERO]
    if not negative:
        return []
    return [
        _alert(
            "negative_cash",
            Severity.DANGER,
            f"{len(negative)} صندوق برصيد سالب",
            "، ".join(f"{row['account'].display_name}: {row['balance']}" for row in negative),
            len(negative),
            "/finance",
        )
    ]


# Each source, and the permission that earns the right to be told about it.
SOURCES = [
    ("health.view", vaccinations_due),
    ("inventory.view", low_stock),
    ("finance.approve", pending_approvals),
    ("parties.view", outstanding_debts),
    ("finance.view", cash_position),
]

SEVERITY_ORDER = {Severity.DANGER: 0, Severity.WARNING: 1, Severity.INFO: 2}


def collect(farm, user):
    """Everything this person should be told about this farm, worst first."""
    from apps.accounts.models import has_permission

    alerts = []
    for permission, source in SOURCES:
        if not has_permission(user, farm, permission):
            continue
        alerts.extend(source(farm))
    alerts.sort(key=lambda alert: SEVERITY_ORDER.get(alert["severity"], 9))
    return alerts
