"""Attachments, alerts, exports and backups.

The four things a farm needs around its data rather than inside it: the papers
that prove a transaction, the warnings that something needs doing, a copy of a
table to keep, and a copy of everything in case the service disappears.
"""
from urllib.parse import quote

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.views import APIView

from apps.accounts.models import has_permission
from apps.api.mixins import CommandView, ReadOnlyFarmViewSet, as_api_error, ok
from apps.api.permissions import FarmPermission, resolve_farm
from apps.api.serializers import (
    AttachmentCommandSerializer,
    AttachmentListSerializer,
    AttachmentSerializer,
)
from apps.core import alerts, attachments as attachment_services, backup, exporting
from apps.core.models import Attachment


def download(body, filename, content_type):
    """Send a file back under an Arabic name the browser keeps intact.

    A raw Arabic filename in the header makes Django encode the whole header as
    a MIME word, and the file is then saved under a name nobody can read.
    Percent-encoding is what the header format actually asks for.
    """
    response = HttpResponse(body, content_type=content_type)
    response["Content-Disposition"] = (
        f'attachment; filename="download"; filename*=UTF-8\'\'{quote(filename)}'
    )
    return response


class AttachmentViewSet(ReadOnlyFarmViewSet):
    """Written through the command below, read and deleted here."""

    queryset = Attachment.objects.select_related("created_by").all()
    serializer_class = AttachmentListSerializer
    filterset_fields = ["subject_type", "subject_id", "kind", "is_primary"]
    ordering_fields = ["created_at", "size"]
    required_permissions = {
        "list": "attachments.view",
        "retrieve": "attachments.view",
        "destroy": "attachments.delete",
        "primary": "attachments.create",
        "default": "attachments.view",
    }
    # The bytes are heavy, so a listing leaves them out and one row carries them.
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_serializer_class(self):
        return AttachmentSerializer if self.action == "retrieve" else AttachmentListSerializer

    def destroy(self, request, *args, **kwargs):
        if not has_permission(request.user, self.farm, "attachments.delete"):
            raise ValidationError({"detail": "missing permission: attachments.delete"})
        row = self.get_object()
        row.delete(hard=True)
        return ok(None, deleted=True)


class AttachmentUploadView(CommandView):
    required_permissions = {"default": "attachments.create"}

    def post(self, request):
        serializer = AttachmentCommandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            row = attachment_services.attach(
                self.farm,
                subject_type=data["subject_type"],
                subject_id=data["subject_id"],
                data=data["data"],
                name=data.get("name", ""),
                kind=data.get("kind", "document"),
                note=data.get("note", ""),
                is_primary=data.get("is_primary", False),
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(AttachmentListSerializer(row).data)


class AttachmentPrimaryView(CommandView):
    """Choose which picture represents a record."""

    required_permissions = {"default": "attachments.create"}

    def post(self, request, pk):
        row = Attachment.objects.filter(farm=self.farm, id=pk).first()
        if row is None:
            raise NotFound("attachment not found in this farm")
        try:
            attachment_services.make_primary(row, actor=request.user)
        except DjangoValidationError as exc:
            raise as_api_error(exc)
        return ok(AttachmentListSerializer(row).data)


class AlertsView(APIView):
    """Everything the signed-in person should be told about this farm."""

    permission_classes = [FarmPermission]
    required_permissions = {"default": "dashboard.view"}

    def get(self, request):
        farm = resolve_farm(request)
        rows = alerts.collect(farm, request.user)
        return ok(
            {
                "alerts": rows,
                "total": len(rows),
                "urgent": len([row for row in rows if row["severity"] == alerts.Severity.DANGER]),
            }
        )


class ExportView(APIView):
    """One table or report as a CSV file Excel can open without mangling Arabic."""

    permission_classes = [FarmPermission]
    # The real check is per export, below: exporting the herd and exporting the
    # ledger are not the same right.
    required_permissions = {"default": "reports.view"}

    def get(self, request, name):
        farm = resolve_farm(request)
        permission = exporting.permission_for(name)
        if permission is None:
            known = ", ".join(sorted(exporting.EXPORTS))
            raise ValidationError({"detail": f"unknown export '{name}'; try one of: {known}"})
        if not has_permission(request.user, farm, permission):
            raise ValidationError({"detail": f"missing permission: {permission}"})

        try:
            filename, body = exporting.build(farm, name, **request.query_params.dict())
        except DjangoValidationError as exc:
            raise as_api_error(exc)

        return download(body, filename, "text/csv; charset=utf-8")


class BackupView(APIView):
    """The whole farm as one JSON file, to keep somewhere that is not here."""

    permission_classes = [FarmPermission]
    required_permissions = {"default": "backup.export"}

    def get(self, request):
        farm = resolve_farm(request)
        body = backup.to_json(farm, indent=2 if request.query_params.get("pretty") else None)
        return download(body, backup.filename_for(farm), "application/json; charset=utf-8")


class BackupSummaryView(APIView):
    """What a backup would contain, without downloading it."""

    permission_classes = [FarmPermission]
    required_permissions = {"default": "backup.export"}

    def get(self, request):
        farm = resolve_farm(request)
        payload = backup.build(farm)
        return ok(
            {
                "taken_at": payload["taken_at"],
                "format_version": payload["format_version"],
                "row_counts": payload["row_counts"],
                "total_rows": sum(payload["row_counts"].values()),
            }
        )
