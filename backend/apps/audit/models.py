"""Append-only audit trail. Rows are never updated or deleted."""
import uuid

from django.conf import settings
from django.db import models

from apps.core.models import Farm


class AuditAction(models.TextChoices):
    CREATE = "create", "Create"
    UPDATE = "update", "Update"
    DELETE = "delete", "Delete"
    RESTORE = "restore", "Restore"
    POST = "post", "Post"
    VOID = "void", "Void"
    REVERSE = "reverse", "Reverse"
    APPROVE = "approve", "Approve"
    REJECT = "reject", "Reject"
    LOGIN = "login", "Login"
    SETTING = "setting", "Setting change"


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    farm = models.ForeignKey(Farm, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs")
    action = models.CharField(max_length=16, choices=AuditAction.choices, db_index=True)
    entity = models.CharField(max_length=64, db_index=True)
    object_id = models.CharField(max_length=64, blank=True, db_index=True)
    label = models.CharField(max_length=255, blank=True)
    old_values = models.JSONField(null=True, blank=True)
    new_values = models.JSONField(null=True, blank=True)
    ip_address = models.CharField(max_length=45, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["entity", "object_id"])]

    def __str__(self):
        return f"{self.action} {self.entity}#{self.object_id}"
