"""Shared viewset behaviour: farm scoping, soft delete, audit on write."""
from rest_framework import viewsets
from rest_framework.response import Response

from apps.api.permissions import FarmPermission, resolve_farm
from apps.audit.models import AuditAction
from apps.audit.services import record, snapshot


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
