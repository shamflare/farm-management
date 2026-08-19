"""Money endpoints: accounts, entries, commands, purchases, sales, parties."""
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.animals.models import Animal
from apps.animals.services import create_animal
from apps.api.mixins import FarmScopedViewSet, ok
from apps.api.permissions import FarmPermission, require, resolve_farm
from apps.api.serializers import (
    AccountSerializer,
    AnimalPurchaseSerializer,
    AnimalSaleSerializer,
    ApprovalRuleSerializer,
    DeathCommandSerializer,
    ExpenseCommandSerializer,
    IncomeCommandSerializer,
    JournalEntrySerializer,
    OpeningBalanceSerializer,
    PartyMoneyCommandSerializer,
    PartySerializer,
    PurchaseCommandSerializer,
    SaleCommandSerializer,
    TransferCommandSerializer,
)
from apps.catalog.models import CatalogItem
from apps.core.models import Currency
from apps.ledger import services as ledger_services
from apps.ledger.models import (
    Account,
    AccountType,
    ApprovalRule,
    EntryStatus,
    JournalEntry,
)
from apps.operations import services as ops
from apps.operations.models import AnimalPurchase, AnimalSale
from apps.parties.models import Party, PartyKind
from apps.parties.services import (
    ensure_party_accounts,
    party_statement,
    party_summary,
    set_ownership,
)


def pick(model, farm, value, label):
    """Resolve an id inside the current farm, or fail with a clear message."""
    if not value:
        return None
    obj = model.objects.filter(farm=farm, id=value).first()
    if obj is None:
        raise ValidationError({label: "not found in this farm"})
    return obj


def as_api_error(exc):
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    if hasattr(exc, "messages"):
        return ValidationError({"detail": exc.messages})
    return ValidationError({"detail": str(exc)})


class AccountViewSet(FarmScopedViewSet):
    queryset = Account.objects.select_related("currency", "parent").all()
    serializer_class = AccountSerializer
    filterset_fields = ["type", "is_cash", "is_active", "parent", "currency"]
    search_fields = ["code", "name", "name_ar"]
    ordering_fields = ["code", "type", "sort_order"]
    audit_entity = "account"
    audit_fields = ("code", "name_ar", "type", "is_active")
    required_permissions = {
        "list": "finance.view",
        "retrieve": "finance.view",
        "statement": "finance.view",
        "balances": "finance.view",
        # Naming an account is not the same as seeing its balance.
        "pickable": "finance.create",
        "default": "settings.edit",
    }

    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        account = self.get_object()
        result = ledger_services.account_statement(
            account,
            date_from=request.query_params.get("from"),
            date_to=request.query_params.get("to"),
        )
        return ok(
            {
                "account": AccountSerializer(account).data,
                "opening_balance": result["opening_balance"],
                "closing_balance": result["closing_balance"],
                "rows": [
                    {
                        "entry_id": str(row["entry"].id),
                        "date": row["date"],
                        "number": row["number"],
                        "kind": row["kind"],
                        "memo": row["memo"],
                        "debit": row["debit"],
                        "credit": row["credit"],
                        "balance_after": row["balance_after"],
                    }
                    for row in result["rows"]
                ],
            }
        )

    @action(detail=False, methods=["get"])
    def pickable(self, request):
        """Accounts a person may charge, without revealing what is in them.

        A worker recording an expense has to say which box paid, but has no
        business knowing the box holds 9,045.
        """
        rows = (
            Account.objects.filter(farm=self.farm, is_active=True)
            .filter(Q(is_cash=True) | Q(type=AccountType.EXPENSE))
            .order_by("type", "code")
        )
        return ok(
            [
                {
                    "id": str(account.id),
                    "code": account.code,
                    "display_name": account.display_name,
                    "type": account.type,
                    "is_cash": account.is_cash,
                }
                for account in rows
            ]
        )

    @action(detail=False, methods=["get"])
    def balances(self, request):
        rows = ledger_services.account_balances(
            self.farm, as_of=request.query_params.get("as_of") or None
        )
        return ok(
            [
                {
                    "id": str(row["account"].id),
                    "code": row["account"].code,
                    "name": row["account"].display_name,
                    "type": row["account"].type,
                    "is_cash": row["account"].is_cash,
                    "balance": row["balance"],
                }
                for row in rows
            ]
        )


class JournalEntryViewSet(FarmScopedViewSet):
    """Entries are read-only through the API. They are created by commands and
    corrected by reversal, never by editing history."""

    queryset = JournalEntry.objects.select_related("currency", "created_by").prefetch_related(
        "lines__account"
    )
    serializer_class = JournalEntrySerializer
    filterset_fields = ["kind", "status", "date", "subject_type", "subject_id"]
    search_fields = ["memo", "reference"]
    ordering_fields = ["date", "number", "amount"]
    http_method_names = ["get", "post", "head", "options"]
    required_permissions = {
        "list": "finance.view",
        "retrieve": "finance.view",
        "approve": "finance.approve",
        "reject": "finance.approve",
        "reverse": "finance.reverse",
        "default": "finance.view",
    }

    def create(self, request, *args, **kwargs):
        raise ValidationError(
            {"detail": "entries are created through the operation endpoints, not directly"}
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        entry = self.get_object()
        try:
            ledger_services.approve_entry(entry, actor=request.user, note=request.data.get("note", ""))
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(JournalEntrySerializer(entry).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        entry = self.get_object()
        try:
            ledger_services.reject_entry(entry, actor=request.user, reason=request.data.get("reason", ""))
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(JournalEntrySerializer(entry).data)

    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        entry = self.get_object()
        try:
            reversal = ledger_services.reverse_entry(
                entry,
                actor=request.user,
                reason=request.data.get("reason", ""),
                date=request.data.get("date") or None,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(
            {
                "original": JournalEntrySerializer(entry).data,
                "reversal": JournalEntrySerializer(reversal).data,
            }
        )

    @action(detail=False, methods=["get"], url_path="pending-approval")
    def pending(self, request):
        rows = self.get_queryset().filter(status=EntryStatus.PENDING).order_by("date")
        return ok(JournalEntrySerializer(rows, many=True).data)


class ApprovalRuleViewSet(FarmScopedViewSet):
    queryset = ApprovalRule.objects.select_related("currency").all()
    serializer_class = ApprovalRuleSerializer
    audit_entity = "approval_rule"
    audit_fields = ("kind", "min_amount", "is_active")
    required_permissions = {
        "list": "settings.view",
        "retrieve": "settings.view",
        "default": "settings.edit",
    }


class PartyViewSet(FarmScopedViewSet):
    queryset = Party.objects.select_related(
        "receivable_account", "payable_account", "capital_account", "drawings_account"
    ).all()
    serializer_class = PartySerializer
    filterset_fields = ["kind", "is_active"]
    search_fields = ["name", "phone", "national_id"]
    audit_entity = "party"
    audit_fields = ("name", "kind", "phone", "is_active", "ownership_percentage")
    required_permissions = {
        "list": "parties.view",
        "retrieve": "parties.view",
        "create": "parties.create",
        "update": "parties.edit",
        "partial_update": "parties.edit",
        "destroy": "parties.delete",
        # A worker must be able to say "I paid for this" without being able to
        # read everyone's balances.
        "pickable": "finance.create",
        "default": "parties.view",
    }

    def perform_create(self, serializer):
        party = super().perform_create(serializer)
        ensure_party_accounts(party)
        return party

    def perform_update(self, serializer):
        """Ownership changes go through the service so history is recorded."""
        instance = serializer.instance
        old_share = instance.ownership_percentage
        new_share = serializer.validated_data.get("ownership_percentage", old_share)
        changes_share = (
            instance.kind == PartyKind.PARTNER and new_share is not None and new_share != old_share
        )
        if changes_share:
            serializer.validated_data.pop("ownership_percentage", None)

        party = super().perform_update(serializer)
        ensure_party_accounts(party)

        if changes_share:
            set_ownership(
                party,
                new_share,
                effective_from=date.today(),
                reason="تعديل من لوحة الإدارة",
            )
        return party

    def perform_destroy(self, instance):
        """Refuse to hide a person who still owes money or is owed money.

        Deleting is a soft delete, so the ledger survives either way - but a
        settled-looking list that quietly drops a 2,200 debt is worse than an
        error message. Deactivating is the safe alternative and stays available.
        """
        outstanding = []
        for slot, label in (
            ("receivable_account", "ذمم مدينة"),
            ("payable_account", "ذمم دائنة"),
            ("capital_account", "رأس مال"),
            ("drawings_account", "مسحوبات"),
            ("cash_account", "عهدة نقدية"),
        ):
            account = getattr(instance, slot, None)
            if account is not None and account.balance() != 0:
                outstanding.append(f"{label}: {account.balance()}")
        if outstanding:
            raise ValidationError(
                {
                    "detail": "لا يمكن حذف هذا الشخص لوجود أرصدة مفتوحة ("
                    + " · ".join(outstanding)
                    + "). سدّد الرصيد أولًا أو عطّل الحساب بدل حذفه."
                }
            )
        super().perform_destroy(instance)

    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        party = self.get_object()
        result = party_statement(
            party,
            date_from=request.query_params.get("from"),
            date_to=request.query_params.get("to"),
        )
        return ok(
            {
                "party": PartySerializer(party, context={"with_summary": False}).data,
                "summary": party_summary(party),
                "sections": [
                    {
                        "slot": section["slot"],
                        "account": section["account"].display_name,
                        "opening_balance": section["opening_balance"],
                        "closing_balance": section["closing_balance"],
                        "rows": [
                            {
                                "date": row["date"],
                                "number": row["number"],
                                "kind": row["kind"],
                                "memo": row["memo"],
                                "debit": row["debit"],
                                "credit": row["credit"],
                                "balance_after": row["balance_after"],
                            }
                            for row in section["rows"]
                        ],
                    }
                    for section in result["sections"]
                ],
            }
        )

    @action(detail=False, methods=["get"])
    def pickable(self, request):
        """Names a person may charge an expense to, with no financial detail."""
        rows = Party.objects.filter(farm=self.farm, is_active=True).order_by("kind", "name")
        return ok(
            [
                {"id": str(party.id), "name": party.name, "kind": party.kind}
                for party in rows
            ]
        )

    @action(detail=False, methods=["get"])
    def balances(self, request):
        kind = request.query_params.get("kind")
        rows = self.get_queryset().filter(is_active=True)
        if kind:
            rows = rows.filter(kind=kind)
        return ok([party_summary(party) for party in rows])


class PurchaseViewSet(FarmScopedViewSet):
    queryset = AnimalPurchase.objects.select_related("supplier", "currency").prefetch_related(
        "items__animal"
    )
    serializer_class = AnimalPurchaseSerializer
    filterset_fields = ["supplier", "settlement_status", "happened_on"]
    ordering_fields = ["happened_on", "total_cost"]
    http_method_names = ["get", "post", "head", "options"]
    required_permissions = {
        "list": "purchases.view",
        "retrieve": "purchases.view",
        "create": "purchases.create",
        "default": "purchases.view",
    }

    def create(self, request, *args, **kwargs):
        command = PurchaseCommandSerializer(data=request.data)
        command.is_valid(raise_exception=True)
        data = command.validated_data
        farm = self.farm

        items = []
        for row in data["items"]:
            animal = pick(Animal, farm, row.get("animal"), "items.animal")
            if animal is None:
                animal_type = pick(CatalogItem, farm, row.get("animal_type"), "items.animal_type")
                if animal_type is None:
                    raise ValidationError({"items": "each line needs an animal id or an animal_type"})
                animal = create_animal(
                    farm,
                    animal_type=animal_type,
                    tag=row.get("tag") or None,
                    name=row.get("name", ""),
                    breed=pick(CatalogItem, farm, row.get("breed"), "items.breed"),
                    sex=row.get("sex") or "unknown",
                    birth_date=row.get("birth_date"),
                    acquisition="purchased",
                    entered_at=data["date"],
                    actor=request.user,
                )
            items.append({"animal": animal, "unit_price": row["unit_price"]})

        try:
            purchase = ops.purchase_animals(
                farm,
                date=data["date"],
                items=items,
                supplier=pick(Party, farm, data.get("supplier"), "supplier"),
                transport_cost=data.get("transport_cost") or 0,
                commission_cost=data.get("commission_cost") or 0,
                other_cost=data.get("other_cost") or 0,
                paid_amount=data.get("paid_amount"),
                from_account=pick(Account, farm, data.get("from_account"), "from_account"),
                paid_by_party=pick(Party, farm, data.get("paid_by_party"), "paid_by_party"),
                reference=data.get("reference", ""),
                notes=data.get("notes", ""),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return Response(AnimalPurchaseSerializer(purchase).data, status=201)


class SaleViewSet(FarmScopedViewSet):
    queryset = AnimalSale.objects.select_related("customer", "currency").prefetch_related(
        "items__animal"
    )
    serializer_class = AnimalSaleSerializer
    filterset_fields = ["customer", "settlement_status", "happened_on"]
    ordering_fields = ["happened_on", "total_price"]
    http_method_names = ["get", "post", "head", "options"]
    required_permissions = {
        "list": "sales.view",
        "retrieve": "sales.view",
        "create": "sales.create",
        "default": "sales.view",
    }

    def create(self, request, *args, **kwargs):
        command = SaleCommandSerializer(data=request.data)
        command.is_valid(raise_exception=True)
        data = command.validated_data
        farm = self.farm

        items = []
        for row in data["items"]:
            animal = pick(Animal, farm, row["animal"], "items.animal")
            if animal is None:
                raise ValidationError({"items.animal": "not found"})
            if not animal.is_on_farm:
                raise ValidationError(
                    {"items.animal": f"{animal.tag} is no longer on the farm and cannot be sold"}
                )
            items.append(
                {
                    "animal": animal,
                    "unit_price": row["unit_price"],
                    "weight_kg": row.get("weight_kg"),
                }
            )

        try:
            sale = ops.sell_animals(
                farm,
                date=data["date"],
                items=items,
                customer=pick(Party, farm, data.get("customer"), "customer"),
                transport_cost=data.get("transport_cost") or 0,
                commission_cost=data.get("commission_cost") or 0,
                received_amount=data.get("received_amount"),
                into_account=pick(Account, farm, data.get("into_account"), "into_account"),
                sale_reason=pick(CatalogItem, farm, data.get("sale_reason"), "sale_reason"),
                reference=data.get("reference", ""),
                notes=data.get("notes", ""),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return Response(AnimalSaleSerializer(sale).data, status=201)


class CommandView(APIView):
    """Base for one-shot financial commands."""

    permission_classes = [FarmPermission]

    @property
    def farm(self):
        return resolve_farm(self.request)

    def currency_or_default(self, code):
        if not code:
            return None
        currency = Currency.objects.filter(code=code).first()
        if currency is None:
            raise ValidationError({"currency": f"unknown currency '{code}'"})
        return currency


class ExpenseCommandView(CommandView):
    required_permissions = {"default": "finance.create"}

    def post(self, request):
        serializer = ExpenseCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        animal = pick(Animal, farm, data.get("animal"), "animal")
        try:
            entry = ops.record_expense(
                farm,
                date=data["date"],
                amount=data["amount"],
                category=pick(CatalogItem, farm, data.get("category"), "category"),
                expense_account=pick(Account, farm, data.get("expense_account"), "expense_account"),
                from_account=pick(Account, farm, data.get("from_account"), "from_account"),
                paid_by_party=pick(Party, farm, data.get("paid_by_party"), "paid_by_party"),
                supplier=pick(Party, farm, data.get("supplier"), "supplier"),
                currency=self.currency_or_default(data.get("currency")),
                memo=data.get("memo", ""),
                reference=data.get("reference", ""),
                subject_type="animal" if animal else "",
                subject_id=animal.id if animal else None,
                attachments=data.get("attachments"),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(JournalEntrySerializer(entry).data, needs_approval=entry.status == EntryStatus.PENDING)


class IncomeCommandView(CommandView):
    required_permissions = {"default": "finance.create"}

    def post(self, request):
        serializer = IncomeCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        try:
            entry = ops.record_income(
                farm,
                date=data["date"],
                amount=data["amount"],
                category=pick(CatalogItem, farm, data.get("category"), "category"),
                income_account=pick(Account, farm, data.get("income_account"), "income_account"),
                into_account=pick(Account, farm, data.get("into_account"), "into_account"),
                customer=pick(Party, farm, data.get("customer"), "customer"),
                currency=self.currency_or_default(data.get("currency")),
                memo=data.get("memo", ""),
                reference=data.get("reference", ""),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(JournalEntrySerializer(entry).data)


class TransferCommandView(CommandView):
    required_permissions = {"default": "finance.create"}

    def post(self, request):
        serializer = TransferCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        try:
            entry = ops.transfer_funds(
                farm,
                date=data["date"],
                amount=data["amount"],
                from_account=pick(Account, farm, data["from_account"], "from_account"),
                to_account=pick(Account, farm, data["to_account"], "to_account"),
                memo=data.get("memo", ""),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(JournalEntrySerializer(entry).data)


class PartyMoneyView(CommandView):
    """Capital in, drawings out, settling debts, collecting receivables."""

    operation = None
    required_permissions = {"default": "finance.create"}

    def post(self, request):
        serializer = PartyMoneyCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        party = pick(Party, farm, data["party"], "party")
        account = pick(Account, farm, data["account"], "account")
        common = dict(
            date=data["date"],
            amount=data["amount"],
            memo=data.get("memo", ""),
            idempotency_key=data.get("idempotency_key", ""),
            actor=request.user,
        )
        try:
            if self.operation == "capital":
                entry = ops.contribute_capital(farm, partner=party, into_account=account, **common)
            elif self.operation == "withdraw":
                entry = ops.withdraw_capital(farm, partner=party, from_account=account, **common)
            elif self.operation == "settle":
                entry = ops.settle_with_party(farm, party=party, from_account=account, **common)
            elif self.operation == "collect":
                entry = ops.collect_from_party(farm, party=party, into_account=account, **common)
            else:
                raise ValidationError({"detail": "unknown operation"})
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(
            {
                "entry": JournalEntrySerializer(entry).data,
                "party": party_summary(party),
            }
        )


class CapitalView(PartyMoneyView):
    operation = "capital"
    required_permissions = {"default": "partners.edit"}


class WithdrawView(PartyMoneyView):
    operation = "withdraw"
    required_permissions = {"default": "partners.edit"}


class SettleView(PartyMoneyView):
    operation = "settle"
    required_permissions = {"default": "workers.settle"}


class CollectView(PartyMoneyView):
    operation = "collect"
    required_permissions = {"default": "finance.create"}


class DeathCommandView(CommandView):
    required_permissions = {"default": "animals.edit"}

    def post(self, request):
        serializer = DeathCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        animal = pick(Animal, farm, data["animal"], "animal")
        try:
            entry = ops.record_animal_death(
                farm,
                animal=animal,
                date=data["date"],
                reason=pick(CatalogItem, farm, data.get("reason"), "reason"),
                notes=data.get("notes", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok({"entry": JournalEntrySerializer(entry).data if entry else None})


class OpeningBalanceView(CommandView):
    """The setup wizard: tell the system what the farm already owns and owes."""

    required_permissions = {"default": "settings.edit"}

    def post(self, request):
        serializer = OpeningBalanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm

        def resolve_rows(rows, key):
            resolved = []
            for row in rows:
                account = pick(Account, farm, row.get("account"), f"{key}.account")
                if account is None:
                    raise ValidationError({key: "each row needs an account id"})
                resolved.append(
                    {"account": account, "amount": row.get("amount", 0), "memo": row.get("memo", "")}
                )
            return resolved

        partner_rows = []
        for row in data.get("partner_capital", []):
            party = pick(Party, farm, row.get("party"), "partner_capital.party")
            if party is None:
                raise ValidationError({"partner_capital": "each row needs a party id"})
            partner_rows.append({"party": party, "amount": row.get("amount", 0)})

        try:
            entry = ops.record_opening_balances(
                farm,
                date=data["date"],
                assets=resolve_rows(data.get("assets", []), "assets"),
                liabilities=resolve_rows(data.get("liabilities", []), "liabilities"),
                partner_capital=partner_rows,
                memo=data.get("memo", "الرصيد الافتتاحي"),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(JournalEntrySerializer(entry).data)
