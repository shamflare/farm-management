"""Storing and reading files that hang off a record.

Files arrive from the client already encoded as a data URI, the same shape the
branding logo uses, so nothing here touches a filesystem and nothing is lost
when the host hands the service a fresh disk.
"""
import base64
import re

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.core.models import Attachment, AttachmentKind

# What a farm may attach: pictures of animals, and paperwork.
ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
}

# Data URIs live in the database and travel inside every API response that
# carries them, so the ceiling is deliberately low. A phone photo of an invoice
# fits comfortably; a scanned contract at full resolution does not, and should
# be re-shot rather than quietly bloating every page load.
MAX_BYTES = 3 * 1024 * 1024

DATA_URI = re.compile(r"^data:(?P<type>[\w.+/-]+);base64,(?P<payload>[A-Za-z0-9+/=\s]+)$")


def decode(data_uri):
    """Validate a data URI and report what it actually holds."""
    if not data_uri:
        raise ValidationError("no file was sent")
    match = DATA_URI.match(data_uri.strip())
    if match is None:
        raise ValidationError("the file must be sent as a base64 data URI")

    content_type = match.group("type").lower()
    if content_type not in ALLOWED_TYPES:
        allowed = ", ".join(sorted(ALLOWED_TYPES))
        raise ValidationError(f"'{content_type}' is not an accepted file type; allowed: {allowed}")

    try:
        raw = base64.b64decode(match.group("payload"), validate=True)
    except (ValueError, TypeError):
        raise ValidationError("the file is not valid base64")

    if not raw:
        raise ValidationError("the file is empty")
    if len(raw) > MAX_BYTES:
        megabytes = MAX_BYTES / 1024 / 1024
        raise ValidationError(f"the file is larger than {megabytes:.0f} MB")

    return content_type, len(raw)


@transaction.atomic
def attach(
    farm,
    *,
    subject_type,
    subject_id,
    data,
    name="",
    kind=AttachmentKind.DOCUMENT,
    note="",
    is_primary=False,
    actor=None,
):
    """Pin one file to one record."""
    if not subject_type or not subject_id:
        raise ValidationError("an attachment needs to know what it belongs to")

    content_type, size = decode(data)
    if kind == AttachmentKind.PHOTO and not content_type.startswith("image/"):
        raise ValidationError("a photo has to be an image")

    row = Attachment.objects.create(
        farm=farm,
        subject_type=subject_type,
        subject_id=subject_id,
        kind=kind,
        name=name[:200] or "file",
        content_type=content_type,
        size=size,
        data=data.strip(),
        note=note[:255],
        is_primary=bool(is_primary),
    )
    if row.is_primary:
        make_primary(row, actor=actor)

    record(
        AuditAction.CREATE,
        "attachment",
        row.id,
        farm=farm,
        label=f"{kind} {row.name} on {subject_type}",
        new={"name": row.name, "type": content_type, "size": size},
        user=actor,
    )
    return row


@transaction.atomic
def make_primary(attachment, actor=None):
    """One picture represents a record; choosing a new one demotes the old."""
    if not attachment.is_image:
        raise ValidationError("only an image can represent a record")

    siblings = Attachment.objects.filter(
        farm=attachment.farm,
        subject_type=attachment.subject_type,
        subject_id=attachment.subject_id,
        is_primary=True,
    ).exclude(id=attachment.id)
    siblings.update(is_primary=False)

    if not attachment.is_primary:
        attachment.is_primary = True
        attachment.save(update_fields=["is_primary", "updated_at", "updated_by"])
    return attachment


def for_subject(farm, subject_type, subject_id):
    return Attachment.objects.filter(
        farm=farm, subject_type=subject_type, subject_id=subject_id
    ).order_by("-is_primary", "-created_at")


def primary_image(farm, subject_type, subject_id):
    """The data URI that represents a record, or nothing."""
    row = (
        Attachment.objects.filter(
            farm=farm, subject_type=subject_type, subject_id=subject_id, is_primary=True
        )
        .only("data")
        .first()
    )
    return row.data if row else ""


def counts_for(farm, subject_type, subject_ids):
    """How many files each record carries, for list screens."""
    from django.db.models import Count

    rows = (
        Attachment.objects.filter(
            farm=farm, subject_type=subject_type, subject_id__in=list(subject_ids)
        )
        .values("subject_id")
        .annotate(total=Count("id"))
    )
    return {str(row["subject_id"]): row["total"] for row in rows}
