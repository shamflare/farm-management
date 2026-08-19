"""Dashboard and reports. Every number here is derived from posted ledger lines."""
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.animals.models import Animal, Birth
from apps.api.permissions import FarmPermission, resolve_farm
from apps.ledger import chart
from apps.ledger import services as ledger_services
from apps.ledger.models import AccountType, EntryStatus, LedgerLine
from apps.parties.models import Party, PartyKind
from apps.parties.services import party_summary

ZERO = Decimal("0")


def period_from_query(params):
    """Supports Today / This week / This month / This year / custom range."""
    today = date.today()
    preset = params.get("period", "month")
    if params.get("from") or params.get("to"):
        return params.get("from") or None, params.get("to") or today.isoformat()
    if preset == "today":
        return today.isoformat(), today.isoformat()
    if preset == "week":
        return (today - timedelta(days=today.weekday())).isoformat(), today.isoformat()
    if preset == "month":
        return today.replace(day=1).isoformat(), today.isoformat()
    if preset == "year":
        return today.replace(month=1, day=1).isoformat(), today.isoformat()
    if preset == "all":
        return None, None
    return today.replace(day=1).isoformat(), today.isoformat()


class ReportView(APIView):
    permission_classes = [FarmPermission]
    required_permissions = {"default": "reports.view"}

    @property
    def farm(self):
        return resolve_farm(self.request)


class DashboardView(ReportView):
    required_permissions = {"default": "dashboard.view"}

    def get(self, request):
        farm = self.farm
        date_from, date_to = period_from_query(request.query_params)

        animals = Animal.objects.filter(farm=farm)
        on_farm = animals.filter(is_on_farm=True)
        cash = ledger_services.cash_position(farm)
        pl = ledger_services.profit_and_loss(farm, date_from=date_from, date_to=date_to)

        receivable = chart.get(farm, chart.RECEIVABLE).balance()
        payable = chart.get(farm, chart.PAYABLE).balance()
        worker_due = chart.get(farm, chart.WORKER_PAYABLE).balance()
        livestock_value = chart.get(farm, chart.LIVESTOCK).balance()

        # Child accounts hold the real party balances; roll them up.
        for parent_code, target in (
            (chart.RECEIVABLE, "receivable"),
            (chart.PAYABLE, "payable"),
            (chart.WORKER_PAYABLE, "worker"),
        ):
            parent = chart.get(farm, parent_code)
            children = parent.children.all()
            total = sum((child.balance() for child in children), ZERO)
            if target == "receivable":
                receivable += total
            elif target == "payable":
                payable += total
            else:
                worker_due += total

        births = Birth.objects.filter(farm=farm)
        if date_from:
            births = births.filter(happened_on__gte=date_from)
        if date_to:
            births = births.filter(happened_on__lte=date_to)

        partners = [
            party_summary(party)
            for party in Party.objects.filter(farm=farm, kind=PartyKind.PARTNER, is_active=True)
        ]

        return Response(
            {
                "period": {"from": date_from, "to": date_to},
                "animals": {
                    "total": animals.count(),
                    "on_farm": on_farm.count(),
                    "females": on_farm.filter(sex="female").count(),
                    "males": on_farm.filter(sex="male").count(),
                    "sold": animals.filter(status__code="sold").count(),
                    "dead": animals.filter(status__code="dead").count(),
                    "births_in_period": births.count(),
                    "newborns_in_period": births.aggregate(total=Sum("born_alive"))["total"] or 0,
                    "estimated_value": livestock_value,
                },
                "money": {
                    "cash_on_hand": cash["total"],
                    "cash_accounts": [
                        {
                            "id": str(row["account"].id),
                            "name": row["account"].display_name,
                            "balance": row["balance"],
                        }
                        for row in cash["accounts"]
                    ],
                    "income": pl["total_income"],
                    "expenses": pl["total_expenses"],
                    "net_profit": pl["net_profit"],
                    "owed_to_farm": receivable,
                    "owed_by_farm": payable,
                    "due_to_workers": worker_due,
                },
                "partners": partners,
                "pending_approvals": ledger_services.open_entries_pending_approval(farm).count(),
            }
        )


class TrialBalanceView(ReportView):
    def get(self, request):
        result = ledger_services.trial_balance(
            self.farm, as_of=request.query_params.get("as_of") or None
        )
        return Response(
            {
                "total_debit": result["total_debit"],
                "total_credit": result["total_credit"],
                "balanced": result["balanced"],
                "difference": result["difference"],
                "rows": [
                    {
                        "code": row["account"].code,
                        "name": row["account"].display_name,
                        "type": row["account"].type,
                        "debit": row["debit"],
                        "credit": row["credit"],
                        "balance": row["balance"],
                    }
                    for row in result["rows"]
                    if row["debit"] or row["credit"]
                ],
            }
        )


class ProfitLossView(ReportView):
    def get(self, request):
        date_from, date_to = period_from_query(request.query_params)
        result = ledger_services.profit_and_loss(self.farm, date_from=date_from, date_to=date_to)
        result["period"] = {"from": date_from, "to": date_to}
        return Response(result)


class CashFlowView(ReportView):
    """Money in and out of the cash and bank accounts, grouped by kind."""

    def get(self, request):
        farm = self.farm
        date_from, date_to = period_from_query(request.query_params)
        lines = LedgerLine.objects.filter(
            entry__farm=farm,
            entry__status=EntryStatus.POSTED,
            account__is_cash=True,
        )
        if date_from:
            lines = lines.filter(entry__date__gte=date_from)
        if date_to:
            lines = lines.filter(entry__date__lte=date_to)

        rows = (
            lines.values("entry__kind")
            .annotate(inflow=Sum("debit"), outflow=Sum("credit"), count=Count("id"))
            .order_by("entry__kind")
        )
        total_in = sum((row["inflow"] or ZERO for row in rows), ZERO)
        total_out = sum((row["outflow"] or ZERO for row in rows), ZERO)
        return Response(
            {
                "period": {"from": date_from, "to": date_to},
                "total_in": total_in,
                "total_out": total_out,
                "net": total_in - total_out,
                "closing_cash": ledger_services.cash_position(farm)["total"],
                "by_kind": [
                    {
                        "kind": row["entry__kind"],
                        "in": row["inflow"] or ZERO,
                        "out": row["outflow"] or ZERO,
                        "count": row["count"],
                    }
                    for row in rows
                ],
            }
        )


class CategoryReportView(ReportView):
    """Expenses or revenue grouped by category account."""

    account_type = AccountType.EXPENSE

    def get(self, request):
        farm = self.farm
        date_from, date_to = period_from_query(request.query_params)
        kind = request.query_params.get("type", "expense")
        account_type = AccountType.INCOME if kind == "income" else AccountType.EXPENSE

        lines = LedgerLine.objects.filter(
            entry__farm=farm, entry__status=EntryStatus.POSTED, account__type=account_type
        )
        if date_from:
            lines = lines.filter(entry__date__gte=date_from)
        if date_to:
            lines = lines.filter(entry__date__lte=date_to)

        rows = (
            lines.values("account__id", "account__code", "account__name", "account__name_ar")
            .annotate(debit=Sum("debit"), credit=Sum("credit"))
            .order_by("account__code")
        )
        items = []
        total = ZERO
        for row in rows:
            debit = row["debit"] or ZERO
            credit = row["credit"] or ZERO
            amount = (credit - debit) if account_type == AccountType.INCOME else (debit - credit)
            if amount == ZERO:
                continue
            total += amount
            items.append(
                {
                    "account_id": str(row["account__id"]),
                    "code": row["account__code"],
                    "name": row["account__name_ar"] or row["account__name"],
                    "amount": amount,
                }
            )
        for item in items:
            item["share"] = float(item["amount"] / total * 100) if total else 0.0
        items.sort(key=lambda row: row["amount"], reverse=True)
        return Response(
            {"period": {"from": date_from, "to": date_to}, "type": kind, "total": total, "items": items}
        )


class AnimalReportView(ReportView):
    """Herd breakdowns: by type, breed, sex, status, age and productivity."""

    required_permissions = {"default": "animals.view"}

    def get(self, request):
        farm = self.farm
        animals = Animal.objects.filter(farm=farm)
        on_farm = animals.filter(is_on_farm=True)
        today = date.today()

        def group(field, label_field):
            return [
                {"key": row[field], "label": row[label_field] or row[field], "count": row["count"]}
                for row in on_farm.values(field, label_field).annotate(count=Count("id")).order_by()
            ]

        age_buckets = {"under_6m": 0, "6m_to_1y": 0, "1y_to_2y": 0, "over_2y": 0, "unknown": 0}
        for birth_date in on_farm.values_list("birth_date", flat=True):
            if birth_date is None:
                age_buckets["unknown"] += 1
                continue
            days = (today - birth_date).days
            if days < 180:
                age_buckets["under_6m"] += 1
            elif days < 365:
                age_buckets["6m_to_1y"] += 1
            elif days < 730:
                age_buckets["1y_to_2y"] += 1
            else:
                age_buckets["over_2y"] += 1

        top_mothers = (
            Birth.objects.filter(farm=farm)
            .values("mother__id", "mother__tag", "mother__name")
            .annotate(births=Count("id"), offspring=Sum("born_alive"))
            .order_by("-offspring")[:10]
        )

        return Response(
            {
                "totals": {
                    "all": animals.count(),
                    "on_farm": on_farm.count(),
                    "sold": animals.filter(status__code="sold").count(),
                    "dead": animals.filter(status__code="dead").count(),
                },
                "by_type": group("animal_type__code", "animal_type__name_ar"),
                "by_breed": group("breed__code", "breed__name_ar"),
                "by_status": group("status__code", "status__name_ar"),
                "by_sex": [
                    {"key": row["sex"], "label": row["sex"], "count": row["count"]}
                    for row in on_farm.values("sex").annotate(count=Count("id")).order_by()
                ],
                "by_age": age_buckets,
                "top_mothers": [
                    {
                        "animal_id": str(row["mother__id"]),
                        "tag": row["mother__tag"],
                        "name": row["mother__name"],
                        "births": row["births"],
                        "offspring": row["offspring"] or 0,
                    }
                    for row in top_mothers
                ],
            }
        )
