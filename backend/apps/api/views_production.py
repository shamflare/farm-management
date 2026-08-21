"""Milk endpoints: the daily log, dairy sales, and the two read against each other."""
from django.core.exceptions import ValidationError as DjangoValidationError

from apps.api.mixins import CommandView, FarmScopedViewSet, ReadOnlyFarmViewSet, as_api_error, ok, pick
from apps.api.serializers import (
    MilkProductionCommandSerializer,
    MilkProductionSerializer,
    MilkSaleCommandSerializer,
    MilkSaleSerializer,
)
from apps.catalog.models import CatalogItem
from apps.ledger.models import Account
from apps.parties.models import Party
from apps.production import services as milk
from apps.production.models import MilkProduction, MilkSale


class MilkProductionViewSet(FarmScopedViewSet):
    """The daily litres. Recorded whether or not a drop of it is sold."""

    queryset = MilkProduction.objects.select_related("branch").all()
    serializer_class = MilkProductionSerializer
    filterset_fields = {
        "branch": ["exact"],
        "session": ["exact"],
        "happened_on": ["gte", "lte", "exact"],
    }
    ordering_fields = ["happened_on", "liters"]
    audit_entity = "milk_production"
    audit_fields = ("happened_on", "session", "liters")
    required_permissions = {
        "list": "milk.view",
        "retrieve": "milk.view",
        "create": "milk.create",
        "update": "milk.edit",
        "partial_update": "milk.edit",
        "destroy": "milk.delete",
        "default": "milk.view",
    }


class MilkSaleViewSet(ReadOnlyFarmViewSet):
    """Sales are posted through a command, so this view only reads them back."""

    queryset = MilkSale.objects.select_related("branch", "product", "unit", "customer").all()
    serializer_class = MilkSaleSerializer
    filterset_fields = {
        "branch": ["exact"],
        "product": ["exact"],
        "customer": ["exact"],
        "happened_on": ["gte", "lte", "exact"],
    }
    ordering_fields = ["happened_on", "total_price"]
    required_permissions = {"default": "milk.view"}


class MilkProductionCommandView(CommandView):
    """Log a milking. Sending the same day and session again corrects it."""

    required_permissions = {"default": "milk.create"}

    def post(self, request):
        serializer = MilkProductionCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        try:
            row = milk.record_production(
                farm,
                date=data["date"],
                liters=data["liters"],
                branch=pick(CatalogItem, farm, data.get("branch"), "branch"),
                session=data.get("session", "day"),
                milking_animals=data.get("milking_animals"),
                notes=data.get("notes", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(MilkProductionSerializer(row).data)


class MilkSaleCommandView(CommandView):
    required_permissions = {"default": "milk.create"}

    def post(self, request):
        serializer = MilkSaleCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        try:
            sale = milk.record_sale(
                farm,
                date=data["date"],
                quantity=data["quantity"],
                unit_price=data.get("unit_price"),
                total_price=data.get("total_price"),
                product=pick(CatalogItem, farm, data.get("product"), "product"),
                unit=pick(CatalogItem, farm, data.get("unit"), "unit"),
                branch=pick(CatalogItem, farm, data.get("branch"), "branch"),
                customer=pick(Party, farm, data.get("customer"), "customer"),
                into_account=pick(Account, farm, data.get("into_account"), "into_account"),
                currency=self.currency_or_default(data.get("currency")),
                notes=data.get("notes", ""),
                attachments=data.get("attachments"),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(MilkSaleSerializer(sale).data)
