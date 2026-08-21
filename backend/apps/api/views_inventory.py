"""Feed store endpoints: stores, items, movements and what is left inside."""
from django.core.exceptions import ValidationError as DjangoValidationError

from apps.animals.models import Animal
from apps.api.mixins import CommandView, FarmScopedViewSet, ReadOnlyFarmViewSet, as_api_error, ok, pick
from apps.api.serializers import (
    InventoryItemSerializer,
    InventoryStoreSerializer,
    StockCountSerializer,
    StockIssueSerializer,
    StockMovementSerializer,
    StockReceiveSerializer,
    StockTransferSerializer,
    StockWriteOffSerializer,
)
from apps.api.views_reports import branch_from_query
from apps.inventory import services as stock
from apps.inventory.models import InventoryItem, InventoryStore, StockMovement
from apps.ledger import services as ledger_services
from apps.ledger.models import Account
from apps.parties.models import Party


def store_state(store, *, as_of=None):
    """One store, its items and their value, ready for the screen."""
    rows = stock.store_balances(store, as_of=as_of)
    return {
        "store": InventoryStoreSerializer(store).data,
        "total_value": sum((row["value"] for row in rows), stock.ZERO),
        "items": [
            {
                "item_id": str(row["item"].id),
                "name": row["item"].display_name,
                "unit": row["item"].unit_name,
                "quantity": row["quantity"],
                "value": row["value"],
                "average_cost": row["average_cost"],
                "reorder_level": row["item"].reorder_level,
                "is_low": (
                    row["item"].reorder_level > stock.ZERO
                    and row["quantity"] <= row["item"].reorder_level
                ),
            }
            for row in rows
        ],
    }


class InventoryStoreViewSet(FarmScopedViewSet):
    queryset = InventoryStore.objects.select_related("branch", "account").all()
    serializer_class = InventoryStoreSerializer
    filterset_fields = ["branch", "is_active"]
    search_fields = ["name", "name_ar", "location"]
    ordering_fields = ["sort_order", "name"]
    audit_entity = "inventory_store"
    audit_fields = ("name_ar", "branch", "is_active")
    required_permissions = {
        "list": "inventory.view",
        "retrieve": "inventory.view",
        "balance": "inventory.view",
        "create": "inventory.create",
        "update": "inventory.edit",
        "partial_update": "inventory.edit",
        "destroy": "inventory.delete",
        "default": "inventory.view",
    }

    def perform_create(self, serializer):
        store = super().perform_create(serializer)
        # A store without an account cannot hold value; give it one at birth.
        stock.store_account(store)
        return store


class InventoryItemViewSet(FarmScopedViewSet):
    queryset = InventoryItem.objects.select_related("category", "unit").all()
    serializer_class = InventoryItemSerializer
    filterset_fields = ["category", "unit", "is_active"]
    search_fields = ["name", "name_ar"]
    ordering_fields = ["sort_order", "name"]
    audit_entity = "inventory_item"
    audit_fields = ("name_ar", "category", "unit", "reorder_level")
    required_permissions = {
        "list": "inventory.view",
        "retrieve": "inventory.view",
        "create": "inventory.create",
        "update": "inventory.edit",
        "partial_update": "inventory.edit",
        "destroy": "inventory.delete",
        "default": "inventory.view",
    }


class StockMovementViewSet(ReadOnlyFarmViewSet):
    """Movements are written by commands only, so they are read-only here."""

    queryset = StockMovement.objects.select_related(
        "store", "store__branch", "item", "item__unit", "supplier"
    ).all()
    serializer_class = StockMovementSerializer
    filterset_fields = {
        "store": ["exact"],
        "item": ["exact"],
        "kind": ["exact"],
        "store__branch": ["exact"],
        "happened_on": ["gte", "lte", "exact"],
    }
    ordering_fields = ["happened_on", "created_at"]
    required_permissions = {"default": "inventory.view"}


class StockBalanceView(CommandView):
    """What every store holds right now, or on a given date."""

    required_permissions = {"default": "inventory.view"}

    def get(self, request):
        farm = self.farm
        as_of = request.query_params.get("as_of") or None
        branch = branch_from_query(farm, request.query_params)

        stores = InventoryStore.objects.filter(farm=farm).select_related("branch", "account")
        if branch == ledger_services.UNASSIGNED:
            stores = stores.filter(branch__isnull=True)
        elif branch is not None:
            stores = stores.filter(branch=branch)
        rows = [store_state(store, as_of=as_of) for store in stores.order_by("sort_order", "name")]
        return ok(
            {
                "stores": rows,
                "total_value": sum((row["total_value"] for row in rows), stock.ZERO),
            }
        )


class StockReceiveView(CommandView):
    required_permissions = {"default": "inventory.create"}

    def post(self, request):
        serializer = StockReceiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        try:
            movement = stock.receive_stock(
                farm,
                store=pick(InventoryStore, farm, data["store"], "store"),
                item=pick(InventoryItem, farm, data["item"], "item"),
                date=data["date"],
                quantity=data["quantity"],
                unit_cost=data.get("unit_cost"),
                total_cost=data.get("total_cost"),
                supplier=pick(Party, farm, data.get("supplier"), "supplier"),
                from_account=pick(Account, farm, data.get("from_account"), "from_account"),
                paid_by_party=pick(Party, farm, data.get("paid_by_party"), "paid_by_party"),
                currency=self.currency_or_default(data.get("currency")),
                memo=data.get("memo", ""),
                attachments=data.get("attachments"),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(StockMovementSerializer(movement).data)


class StockIssueView(CommandView):
    required_permissions = {"default": "inventory.create"}

    def post(self, request):
        serializer = StockIssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        try:
            movement = stock.issue_stock(
                farm,
                store=pick(InventoryStore, farm, data["store"], "store"),
                item=pick(InventoryItem, farm, data["item"], "item"),
                date=data["date"],
                quantity=data["quantity"],
                animal=pick(Animal, farm, data.get("animal"), "animal"),
                memo=data.get("memo", ""),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(StockMovementSerializer(movement).data)


class StockTransferView(CommandView):
    required_permissions = {"default": "inventory.create"}

    def post(self, request):
        serializer = StockTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        try:
            out, into = stock.transfer_stock(
                farm,
                from_store=pick(InventoryStore, farm, data["from_store"], "from_store"),
                to_store=pick(InventoryStore, farm, data["to_store"], "to_store"),
                item=pick(InventoryItem, farm, data["item"], "item"),
                date=data["date"],
                quantity=data["quantity"],
                memo=data.get("memo", ""),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(
            {
                "out": StockMovementSerializer(out).data,
                "in": StockMovementSerializer(into).data,
            }
        )


class StockCountView(CommandView):
    required_permissions = {"default": "inventory.edit"}

    def post(self, request):
        serializer = StockCountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        try:
            movement = stock.count_stock(
                farm,
                store=pick(InventoryStore, farm, data["store"], "store"),
                item=pick(InventoryItem, farm, data["item"], "item"),
                date=data["date"],
                counted_quantity=data["counted_quantity"],
                memo=data.get("memo", ""),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        if movement is None:
            return ok(None, unchanged=True)
        return ok(StockMovementSerializer(movement).data)


class StockWriteOffView(CommandView):
    required_permissions = {"default": "inventory.edit"}

    def post(self, request):
        serializer = StockWriteOffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        try:
            movement = stock.write_off_stock(
                farm,
                store=pick(InventoryStore, farm, data["store"], "store"),
                item=pick(InventoryItem, farm, data["item"], "item"),
                date=data["date"],
                quantity=data["quantity"],
                memo=data.get("memo", ""),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(StockMovementSerializer(movement).data)
