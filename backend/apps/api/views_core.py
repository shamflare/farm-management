"""Identity, configuration, theme and audit endpoints."""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.models import Membership, Permission, Role, User
from apps.api.mixins import FarmScopedViewSet, ok
from apps.api.permissions import FarmPermission, confirm_password, resolve_farm
from apps.api.serializers import (
    AuditLogSerializer,
    CatalogItemSerializer,
    CatalogTypeSerializer,
    FarmSerializer,
    FieldDefinitionSerializer,
    MemberCreateSerializer,
    MembershipSerializer,
    PasswordResetSerializer,
    PermissionSerializer,
    RoleSerializer,
    ThemeSerializer,
    UserSerializer,
)
from apps.audit.models import AuditAction, AuditLog
from apps.audit.services import record, snapshot
from apps.catalog.models import CatalogItem, CatalogType
from apps.core.models import Farm
from apps.customfields.models import FieldDefinition
from apps.parties.models import Party
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
    permission_classes = [FarmPermission]
    queryset = Farm.objects.select_related("base_currency").all()
    audit_entity = "farm"
    audit_fields = ("name", "timezone", "country", "is_active")
    # Every member reads the farm they work in; only settings.edit renames it.
    # Creating or removing a farm is not something this API offers at all.
    required_permissions = {
        "list": None,
        "retrieve": None,
        "update": "settings.edit",
        "partial_update": "settings.edit",
        "default": "settings.edit",
    }

    def create(self, request, *args, **kwargs):
        raise ValidationError({"detail": "farms are not created through this endpoint"})

    def destroy(self, request, *args, **kwargs):
        raise ValidationError(
            {"detail": "a farm holds every record in the system and cannot be deleted here"}
        )

    def perform_update(self, serializer):
        before = snapshot(serializer.instance, self.audit_fields)
        farm = serializer.save()
        record(
            AuditAction.UPDATE,
            self.audit_entity,
            farm.id,
            farm=farm,
            label=farm.name,
            old=before,
            new=snapshot(farm, self.audit_fields),
        )
        return farm

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
        # Reading the lists is not a privilege: every form in the app - even the
        # worker's "add animal" screen - needs them to render its dropdowns.
        "list": None,
        "retrieve": None,
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
        # Same reasoning as the catalog: this *is* the form layout.
        "list": None,
        "retrieve": None,
        "form": None,
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
    """Who can sign in to this farm, as what, and as whose file."""

    serializer_class = MembershipSerializer
    queryset = Membership.objects.select_related("user", "role").all()
    audit_entity = "membership"
    audit_fields = ("user", "role", "is_active")
    required_permissions = {
        "list": "users.view",
        "retrieve": "users.view",
        "create": "users.create",
        "set_password": "users.edit",
        "destroy": "users.delete",
        "default": "users.edit",
    }

    def create(self, request, *args, **kwargs):
        """Create the login and the membership together.

        A partner or a worker gets their own username and password here; there
        is no shared account, because the audit trail has to name one person.
        """
        payload = MemberCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        farm = self.farm

        role = Role.objects.filter(farm=farm, id=data["role_id"]).first()
        if role is None:
            raise ValidationError({"role_id": "الدور غير موجود في هذه المزرعة"})

        try:
            validate_password(data["password"])
        except DjangoValidationError as exc:
            raise ValidationError({"password": list(exc.messages)})

        party = None
        if data.get("party_id"):
            party = Party.objects.filter(farm=farm, id=data["party_id"]).first()
            if party is None:
                raise ValidationError({"party_id": "الشخص غير موجود في هذه المزرعة"})
            if party.user_id:
                raise ValidationError({"party_id": "هذا الشخص مرتبط بحساب دخول آخر"})

        with transaction.atomic():
            user = User.objects.create_user(
                username=data["username"],
                password=data["password"],
                full_name=data.get("full_name") or data["username"],
                phone=data.get("phone", ""),
                email=data.get("email", ""),
            )
            user.last_farm = farm
            user.save(update_fields=["last_farm"])
            membership = Membership.objects.create(user=user, farm=farm, role=role)
            if party is not None:
                party.user = user
                party.save(update_fields=["user", "updated_at"])

        record(
            AuditAction.CREATE,
            "membership",
            membership.id,
            farm=farm,
            label=f"إنشاء حساب دخول {user.username} بدور {role.name_ar or role.name}",
            new={
                "username": user.username,
                "full_name": user.full_name,
                "role": role.code,
                "party": party.name if party else "",
            },
        )
        return Response(MembershipSerializer(membership).data, status=201)

    def perform_destroy(self, instance):
        if instance.user_id == self.request.user.id:
            raise ValidationError({"detail": "لا يمكنك حذف عضويتك أنت"})
        super().perform_destroy(instance)

    def perform_update(self, serializer):
        if (
            serializer.instance.user_id == self.request.user.id
            and serializer.validated_data.get("is_active") is False
        ):
            raise ValidationError({"detail": "لا يمكنك تعطيل حسابك أنت"})
        return super().perform_update(serializer)

    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        """Reset someone's password. The new one is never stored in the log."""
        membership = self.get_object()
        payload = PasswordResetSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            validate_password(payload.validated_data["password"], user=membership.user)
        except DjangoValidationError as exc:
            raise ValidationError({"password": list(exc.messages)})

        membership.user.set_password(payload.validated_data["password"])
        membership.user.save(update_fields=["password"])
        record(
            AuditAction.UPDATE,
            "user",
            membership.user_id,
            farm=self.farm,
            label=f"تغيير كلمة مرور {membership.user.username}",
        )
        return ok({"username": membership.user.username})

    @action(detail=True, methods=["post"], url_path="link-party")
    def link_party(self, request, pk=None):
        """Tie a login to the person's financial record, or untie it."""
        membership = self.get_object()
        party_id = request.data.get("party")
        Party.objects.filter(farm=self.farm, user=membership.user).update(user=None)
        if party_id:
            party = Party.objects.filter(farm=self.farm, id=party_id).first()
            if party is None:
                raise ValidationError({"party": "الشخص غير موجود في هذه المزرعة"})
            if party.user_id and party.user_id != membership.user_id:
                raise ValidationError({"party": "هذا الشخص مرتبط بحساب دخول آخر"})
            party.user = membership.user
            party.save(update_fields=["user", "updated_at"])
        record(
            AuditAction.UPDATE,
            "membership",
            membership.id,
            farm=self.farm,
            label=f"ربط {membership.user.username} بسجل شخص",
            new={"party": str(party_id or "")},
        )
        return ok(MembershipSerializer(membership).data)


class ChangePasswordView(APIView):
    """Change your own password.

    Resetting someone else's password is an owner's job and lives on the
    membership endpoint. This is the other half: everyone can change their own,
    and nobody needs an owner to do it for them. The current password is asked
    for so a walk-up to an unlocked screen cannot lock the real user out.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        confirm_password(request, field="current_password")
        new_password = (request.data or {}).get("new_password") or ""
        if not new_password:
            raise ValidationError({"new_password": "أدخل كلمة المرور الجديدة"})
        try:
            validate_password(new_password, user=request.user)
        except DjangoValidationError as exc:
            raise ValidationError({"new_password": list(exc.messages)})

        request.user.set_password(new_password)
        request.user.save(update_fields=["password"])
        record(
            AuditAction.UPDATE,
            "user",
            request.user.id,
            label=f"غيّر {request.user.username} كلمة مروره",
            new={"password_changed": True},
            user=request.user,
        )
        return ok({"changed": True})


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
        try:
            draft, problems = theme_services.save_draft(farm, request.data, actor=request.user)
        except DjangoValidationError as exc:
            raise ValidationError(getattr(exc, "message_dict", {"detail": exc.messages}))
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
        except DjangoValidationError:
            # Re-validate so the client gets structured {field, message} rows
            # instead of Django's stringified error list.
            problems = theme_services.validate_theme(theme_services.get_draft(farm))
            return Response(
                {"ok": False, "problems": problems},
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
