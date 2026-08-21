"""Founding cost endpoints: the register and its running total."""
from django.core.exceptions import ValidationError as DjangoValidationError

from apps.api.mixins import CommandView, ReadOnlyFarmViewSet, as_api_error, ok, pick
from apps.api.serializers import FoundingCostCommandSerializer, FoundingCostSerializer
from apps.assets import services as founding
from apps.assets.models import FoundingCost
from apps.catalog.models import CatalogItem
from apps.ledger.models import Account
from apps.parties.models import Party


class FoundingCostViewSet(ReadOnlyFarmViewSet):
    """Written through the command so every row carries its ledger entry."""

    queryset = FoundingCost.objects.select_related("asset_type", "branch", "supplier").all()
    serializer_class = FoundingCostSerializer
    filterset_fields = {
        "asset_type": ["exact"],
        "branch": ["exact"],
        "happened_on": ["gte", "lte", "exact"],
    }
    search_fields = ["name", "notes"]
    ordering_fields = ["happened_on", "amount"]
    required_permissions = {"default": "assets.view"}


class FoundingCostCommandView(CommandView):
    required_permissions = {"default": "assets.create"}

    def post(self, request):
        serializer = FoundingCostCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        farm = self.farm
        try:
            cost = founding.record_founding_cost(
                farm,
                date=data["date"],
                name=data["name"],
                amount=data["amount"],
                asset_type=pick(CatalogItem, farm, data.get("asset_type"), "asset_type"),
                branch=pick(CatalogItem, farm, data.get("branch"), "branch"),
                quantity=data.get("quantity"),
                supplier=pick(Party, farm, data.get("supplier"), "supplier"),
                from_account=pick(Account, farm, data.get("from_account"), "from_account"),
                paid_by_party=pick(Party, farm, data.get("paid_by_party"), "paid_by_party"),
                currency=self.currency_or_default(data.get("currency")),
                notes=data.get("notes", ""),
                attachments=data.get("attachments"),
                idempotency_key=data.get("idempotency_key", ""),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(FoundingCostSerializer(cost).data)
