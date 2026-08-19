"""Users, farm memberships, and a data-driven permission system.

Roles are rows, not code branches: an admin can create a role and pick its
permissions without a deploy. Permission codes are `<module>.<action>`.
"""
import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from apps.core.models import BaseModel, Farm


class UserManager(BaseUserManager):
    def create_user(self, username, password=None, **extra):
        if not username:
            raise ValueError("username is required")
        email = extra.pop("email", "") or ""
        user = self.model(username=username, email=self.normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_platform_admin", True)
        return self.create_user(username, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(max_length=64, unique=True)
    full_name = models.CharField(max_length=160, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    language = models.CharField(max_length=8, default="ar")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    # Platform-level super admin: bypasses farm permission checks.
    is_platform_admin = models.BooleanField(default=False)
    last_farm = models.ForeignKey(Farm, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["username"]

    def __str__(self):
        return self.full_name or self.username


class Permission(models.Model):
    """Catalogue of every permission the API enforces."""

    code = models.CharField(max_length=64, primary_key=True)
    module = models.CharField(max_length=32, db_index=True)
    action = models.CharField(max_length=32)
    label = models.CharField(max_length=160)
    label_ar = models.CharField(max_length=160, blank=True)
    is_sensitive = models.BooleanField(default=False)

    class Meta:
        ordering = ["module", "action"]

    def __str__(self):
        return self.code


class Role(BaseModel):
    """A named permission set. `farm=None` means a template shared by all farms."""

    farm = models.ForeignKey(Farm, null=True, blank=True, on_delete=models.CASCADE, related_name="roles")
    code = models.SlugField(max_length=48)
    name = models.CharField(max_length=96)
    name_ar = models.CharField(max_length=96, blank=True)
    description = models.CharField(max_length=255, blank=True)
    is_system = models.BooleanField(default=False)
    permissions = models.ManyToManyField(Permission, blank=True, related_name="roles")

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["farm", "code"], name="uniq_role_code_per_farm"),
        ]

    def __str__(self):
        return self.name_ar or self.name

    def permission_codes(self):
        return set(self.permissions.values_list("code", flat=True))


class Membership(BaseModel):
    """Links a user to a farm with a role, plus per-user grants and revocations."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name="memberships")
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="memberships")
    extra_permissions = models.ManyToManyField(Permission, blank=True, related_name="granted_memberships")
    revoked_permissions = models.ManyToManyField(Permission, blank=True, related_name="revoked_memberships")
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "farm"], name="uniq_membership_per_farm"),
        ]

    def __str__(self):
        return f"{self.user} @ {self.farm} ({self.role})"

    def permission_codes(self):
        codes = self.role.permission_codes()
        codes |= set(self.extra_permissions.values_list("code", flat=True))
        codes -= set(self.revoked_permissions.values_list("code", flat=True))
        return codes


def membership_for(user, farm):
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return (
        Membership.objects.filter(user=user, farm=farm, is_active=True)
        .select_related("role", "farm")
        .first()
    )


def has_permission(user, farm, code):
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if user.is_platform_admin:
        return True
    membership = membership_for(user, farm)
    if membership is None:
        return False
    return code in membership.permission_codes()
