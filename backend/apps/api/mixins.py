"""Shared viewset behaviour: farm scoping, soft delete, audit on write."""
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.api.permissions import FarmPermission, resolve_farm
from apps.audit.models import AuditAction
from apps.audit.services import record, snapshot
from apps.core.models import Currency


class FarmScopedViewSet(viewsets.ModelViewSet):
    """A viewset that can only ever see one farm's rows.

    Scoping happens in get_queryset, so no view can leak another farm's data by
    forgetting a filter.
    """

    permission_classes = [FarmPermission]
    audit_entity = ""
    audit_fields = ()

    @property
    def farm(self):
        return resolve_farm(self.request)

    def get_queryset(self):
        return super().get_queryset().filter(farm=self.farm)

    def perform_create(self, serializer):
        instance = serializer.save(farm=self.farm)
        if self.audit_entity:
            record(
                AuditAction.CREATE,
                self.audit_entity,
                instance.pk,
                farm=self.farm,
                label=str(instance)[:255],
                new=snapshot(instance, self.audit_fields) if self.audit_fields else None,
            )
        return instance

    def perform_update(self, serializer):
        before = snapshot(serializer.instance, self.audit_fields) if self.audit_fields else None
        instance = serializer.save()
        if self.audit_entity:
            record(
                AuditAction.UPDATE,
                self.audit_entity,
                instance.pk,
                farm=self.farm,
                label=str(instance)[:255],
                old=before,
                new=snapshot(instance, self.audit_fields) if self.audit_fields else None,
            )
        return instance

    def perform_destroy(self, instance):
        before = snapshot(instance, self.audit_fields) if self.audit_fields else None
        instance.delete()
        if self.audit_entity:
            record(
                AuditAction.DELETE,
                self.audit_entity,
                instance.pk,
                farm=self.farm,
                label=str(instance)[:255],
                old=before,
            )


class ReadOnlyFarmViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [FarmPermission]

    @property
    def farm(self):
        return resolve_farm(self.request)

    def get_queryset(self):
        return super().get_queryset().filter(farm=self.farm)


def ok(data=None, **extra):
    payload = {"ok": True}
    if data is not None:
        payload["data"] = data
    payload.update(extra)
    return Response(payload)


class CommandView(APIView):
    """Base for one-shot commands that write through a service, not the ORM."""

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


def pick(model, farm, value, label):
    """Resolve an id inside the current farm, or fail with a clear message."""
    if not value:
        return None
    obj = model.objects.filter(farm=farm, id=value).first()
    if obj is None:
        raise ValidationError({label: "not found in this farm"})
    return obj


def as_api_error(exc):
    """Turn a Django ValidationError from a service into a DRF one."""
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    if hasattr(exc, "messages"):
        return ValidationError({"detail": exc.messages})
    return ValidationError({"detail": str(exc)})
