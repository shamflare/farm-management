"""Identity, configuration, theme and audit endpoints."""
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.models import Membership, Permission, Role
from apps.api.mixins import FarmScopedViewSet, ok
from apps.api.permissions import FarmPermission, resolve_farm
from apps.api.serializers import (
    AuditLogSerializer,
    CatalogItemSerializer,
    CatalogTypeSerializer,
    FarmSerializer,
    FieldDefinitionSerializer,
    MembershipSerializer,
    PermissionSerializer,
    RoleSerializer,
    ThemeSerializer,
    UserSerializer,
)
from apps.audit.models import AuditLog
from apps.catalog.models import CatalogItem, CatalogType
from apps.core.models import Farm
from apps.customfields.models import FieldDefinition
from apps.theme import services as theme_services


class FarmTokenSerializer(TokenObtainPairSerializer):
    """Login returns the token plus everything the client needs to render."""

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        memberships = (
            Membership.objects.filter(user=user, is_active=True)
            .select_related("farm", "role", "farm__base_currency")
            .all()
        )
        farms = []
        for membership in memberships:
            farms.append(
                {
                    "id": str(membership.farm.id),
                    "slug": membership.farm.slug,
                    "name": membership.farm.name,
                    "currency": membership.farm.base_currency_id,
                    "role": membership.role.name_ar or membership.role.name,
                    "permissions": sorted(membership.permission_codes()),
                }
            )
        data["user"] = UserSerializer(user).data
        data["is_platform_admin"] = user.is_platform_admin
        data["farms"] = farms
        if farms and not user.last_farm_id:
            user.last_farm_id = farms[0]["id"]
            user.save(update_fields=["last_farm"])
        return data


class LoginView(TokenObtainPairView):
    serializer_class = FarmTokenSerializer
    permission_classes = [AllowAny]


class MeView(APIView):
    """Who am I, in which farm, and what am I allowed to do."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        farm = resolve_farm(request)
        membership = Membership.objects.filter(
            user=request.user, farm=farm, is_active=True
        ).select_related("role").first()
        permissions = (
            sorted(p.code for p in Permission.objects.all())
            if request.user.is_platform_admin
            else sorted(membership.permission_codes() if membership else [])
        )
        return Response(
            {
                "user": UserSerializer(request.user).data,
                "farm": FarmSerializer(farm).data,
                "role": RoleSerializer(membership.role).data if membership else None,
                "permissions": permissions,
                "theme": theme_services.published_payload(farm),
            }
        )


class SwitchFarmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        slug = request.data.get("farm")
        farm = Farm.objects.filter(slug=slug).first() or Farm.objects.filter(id=slug).first()
        if farm is None:
            raise ValidationError({"farm": "unknown farm"})
        if not request.user.is_platform_admin and not Membership.objects.filter(
            user=request.user, farm=farm, is_active=True
        ).exists():
            raise ValidationError({"farm": "you are not a member of this farm"})
        request.user.last_farm = farm
        request.user.save(update_fields=["last_farm"])
        return ok({"farm": FarmSerializer(farm).data})


class FarmViewSet(viewsets.ModelViewSet):
    """Farms the caller belongs to. Multi-farm is supported from day one."""

    serializer_class = FarmSerializer
    permission_classes = [IsAuthenticated]
    queryset = Farm.objects.select_related("base_currency").all()

    def get_queryset(self):
        if self.request.user.is_platform_admin:
            return self.queryset
        farm_ids = Membership.objects.filter(
            user=self.request.user, is_active=True
        ).values_list("farm_id", flat=True)
        return self.queryset.filter(id__in=farm_ids)


class CatalogTypeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CatalogTypeSerializer
    queryset = CatalogType.objects.all()
    permission_classes = [IsAuthenticated]


class CatalogItemViewSet(FarmScopedViewSet):
    """Every configurable list in the system, managed by the owner."""

    serializer_class = CatalogItemSerializer
    queryset = CatalogItem.objects.select_related("type", "parent").all()
    filterset_fields = ["type", "parent", "is_active"]
    search_fields = ["name", "name_ar", "code"]
    ordering_fields = ["sort_order", "name", "created_at"]
    audit_entity = "catalog_item"
    audit_fields = ("code", "name", "name_ar", "is_active", "sort_order")
    required_permissions = {
        "list": "settings.view",
        "retrieve": "settings.view",
        "default": "settings.edit",
    }

    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request):
        """Persist a drag-and-drop ordering in one call."""
        order = request.data.get("order") or []
        updated = 0
        for position, item_id in enumerate(order):
            updated += CatalogItem.objects.filter(farm=self.farm, id=item_id).update(
                sort_order=position * 10
            )
        return ok({"updated": updated})


class FieldDefinitionViewSet(FarmScopedViewSet):
    """The form builder: show, hide, rename, reorder, require, or add fields."""

    serializer_class = FieldDefinitionSerializer
    queryset = FieldDefinition.objects.all()
    filterset_fields = ["entity", "is_active", "is_visible", "is_builtin"]
    ordering_fields = ["sort_order", "key"]
    audit_entity = "field_definition"
    audit_fields = ("key", "label_ar", "is_required", "is_visible", "sort_order", "field_type")
    required_permissions = {
        "list": "settings.view",
        "retrieve": "settings.view",
        "default": "settings.edit",
    }

    @action(detail=False, methods=["get"], url_path="form")
    def form(self, request):
        """The full form layout for one entity, ready to render."""
        entity = request.query_params.get("entity")
        if not entity:
            raise ValidationError({"entity": "required"})
        rows = FieldDefinition.objects.filter(
            farm=self.farm, entity=entity, is_active=True, is_visible=True
        ).order_by("sort_order", "id")
        return ok(
            {
                "entity": entity,
                "fields": FieldDefinitionSerializer(rows, many=True).data,
            }
        )

    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request):
        order = request.data.get("order") or []
        updated = 0
        for position, field_id in enumerate(order):
            updated += FieldDefinition.objects.filter(farm=self.farm, id=field_id).update(
                sort_order=position * 10
            )
        return ok({"updated": updated})


class RoleViewSet(FarmScopedViewSet):
    serializer_class = RoleSerializer
    queryset = Role.objects.prefetch_related("permissions").all()
    audit_entity = "role"
    audit_fields = ("code", "name_ar")
    required_permissions = {
        "list": "users.view",
        "retrieve": "users.view",
        "default": "users.edit",
    }


class MembershipViewSet(FarmScopedViewSet):
    serializer_class = MembershipSerializer
    queryset = Membership.objects.select_related("user", "role").all()
    audit_entity = "membership"
    audit_fields = ("user", "role", "is_active")
    required_permissions = {
        "list": "users.view",
        "retrieve": "users.view",
        "default": "users.edit",
    }


class PermissionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = Permission.objects.all()
        grouped = {}
        for permission in rows:
            grouped.setdefault(permission.module, []).append(PermissionSerializer(permission).data)
        return Response({"modules": grouped, "count": rows.count()})


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [FarmPermission]
    queryset = AuditLog.objects.select_related("user").all()
    filterset_fields = ["action", "entity", "object_id", "user"]
    search_fields = ["label", "entity"]
    required_permissions = {"default": "audit.view"}

    def get_queryset(self):
        return super().get_queryset().filter(farm=resolve_farm(self.request))


class ThemeView(APIView):
    """The published theme. Public to any authenticated member of the farm."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        farm = resolve_farm(request)
        return Response(theme_services.published_payload(farm))


class ThemeDraftView(APIView):
    permission_classes = [FarmPermission]
    required_permissions = {"default": "theme.edit"}

    def get(self, request):
        farm = resolve_farm(request)
        draft = theme_services.get_draft(farm)
        return Response(
            {
                "draft": ThemeSerializer(draft).data,
                "problems": theme_services.validate_theme(draft),
            }
        )

    def patch(self, request):
        farm = resolve_farm(request)
        draft, problems = theme_services.save_draft(farm, request.data, actor=request.user)
        return Response(
            {"draft": ThemeSerializer(draft).data, "problems": problems},
            status=status.HTTP_200_OK,
        )


class ThemePublishView(APIView):
    permission_classes = [FarmPermission]
    required_permissions = {"default": "theme.edit"}

    def post(self, request):
        farm = resolve_farm(request)
        try:
            theme = theme_services.publish(farm, actor=request.user)
        except DjangoValidationError as exc:
            return Response(
                {"ok": False, "problems": exc.message_dict.get("theme", [])},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return ok({"theme": ThemeSerializer(theme).data, "tokens": theme.token_payload()})


class ThemeResetView(APIView):
    permission_classes = [FarmPermission]
    required_permissions = {"default": "theme.edit"}

    def post(self, request):
        farm = resolve_farm(request)
        draft = theme_services.reset_to_default(farm, actor=request.user)
        return ok({"draft": ThemeSerializer(draft).data})


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok", "service": "farm-api"})
