"""Farm resolution and permission enforcement for the API.

Every request works inside one farm. The farm comes from the `X-Farm` header
(slug or id) or falls back to the user's last farm. Permissions are checked
against the user's membership in that farm - never against a hardcoded role.
"""
from rest_framework import permissions
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.accounts.models import Membership, has_permission
from apps.core.models import Farm

FARM_HEADER = "HTTP_X_FARM"


def resolve_farm(request):
    """Which farm is this request about?"""
    if getattr(request, "_farm_cache", None) is not None:
        return request._farm_cache

    user = request.user
    if not getattr(user, "is_authenticated", False):
        raise PermissionDenied("authentication required")

    raw = request.META.get(FARM_HEADER) or request.query_params.get("farm") if hasattr(request, "query_params") else None
    farm = None
    if raw:
        farm = Farm.objects.filter(slug=raw).first()
        if farm is None:
            farm = Farm.objects.filter(id=raw).first() if _looks_like_uuid(raw) else None
        if farm is None:
            raise NotFound(f"farm '{raw}' was not found")
    else:
        if user.last_farm_id:
            farm = Farm.objects.filter(id=user.last_farm_id).first()
        if farm is None:
            membership = Membership.objects.filter(user=user, is_active=True).select_related("farm").first()
            farm = membership.farm if membership else None
        if farm is None and user.is_platform_admin:
            farm = Farm.objects.first()
    if farm is None:
        raise NotFound("no farm is available for this user")

    if not user.is_platform_admin and not Membership.objects.filter(
        user=user, farm=farm, is_active=True
    ).exists():
        raise PermissionDenied("you are not a member of this farm")

    request._farm_cache = farm
    return farm


def _looks_like_uuid(value):
    return len(value) == 36 and value.count("-") == 4


class FarmPermission(permissions.BasePermission):
    """Reads `required_permissions` off the view, keyed by DRF action.

        required_permissions = {
            "list": "animals.view",
            "create": "animals.create",
            "default": "animals.view",
        }
    """

    message = "you do not have permission to do this"

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        farm = resolve_farm(request)
        code = self._code_for(view)
        if code is None:
            return True
        if not has_permission(request.user, farm, code):
            self.message = f"missing permission: {code}"
            return False
        return True

    @staticmethod
    def _code_for(view):
        mapping = getattr(view, "required_permissions", None)
        if not mapping:
            return None
        action = getattr(view, "action", None) or "default"
        if action in mapping:
            return mapping[action]
        # Fall back by verb family so custom actions inherit a sensible default.
        if action in ("retrieve", "list"):
            return mapping.get("read", mapping.get("default"))
        if action in ("update", "partial_update"):
            return mapping.get("update", mapping.get("default"))
        if action == "destroy":
            return mapping.get("destroy", mapping.get("default"))
        return mapping.get("default")


def require(request, code):
    """Imperative check for command endpoints."""
    farm = resolve_farm(request)
    if not has_permission(request.user, farm, code):
        raise PermissionDenied(f"missing permission: {code}")
    return farm


def confirm_password(request, field="password"):
    """Make the caller prove they are still the person who logged in.

    A destructive action is worth more than a token that has been sitting in a
    browser for hours, so the sensitive endpoints ask for the password again.
    Failures are deliberately vague about which part was wrong, and the password
    itself never reaches the audit log.
    """
    supplied = (request.data or {}).get(field) or ""
    if not supplied:
        raise ValidationError({field: "أدخل كلمة مرورك لتأكيد العملية"})
    if not request.user.check_password(supplied):
        raise PermissionDenied("كلمة المرور غير صحيحة")
    return True
