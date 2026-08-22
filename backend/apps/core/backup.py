"""Taking a copy of one farm, in a form a person can actually keep.

The point of a backup is that it survives whatever happens to the service, so
it is produced as one JSON document the owner downloads and stores somewhere
else. It carries the farm's own rows only - never another farm's, and never a
password hash.
"""
import json
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from django.apps import apps as django_apps
from django.db.models.fields.files import FieldFile

# Written into the file so a future reader knows what shape it is.
FORMAT_VERSION = 1

# Columns that must never leave the server, whatever table they turn up in.
SECRET_FIELDS = {"password", "last_login", "idempotency_key"}


def _plain(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, FieldFile):
        # The path on a disk that the backup is meant to outlive; the name is
        # all that is worth keeping.
        return value.name or ""
    return value


def farm_scoped_models():
    """Every table that hangs off a farm, in a stable order."""
    from apps.core.models import Farm

    models = [
        model
        for model in django_apps.get_models()
        if model is not Farm
        and any(
            field.name == "farm" and field.many_to_one and field.related_model is Farm
            for field in model._meta.get_fields()
        )
    ]
    return sorted(models, key=lambda model: model._meta.label)


def _rows(model, farm):
    manager = getattr(model, "all_objects", model._default_manager)
    fields = [
        field
        for field in model._meta.concrete_fields
        if field.name not in SECRET_FIELDS
    ]
    out = []
    for instance in manager.filter(farm=farm).iterator():
        out.append(
            {field.name: _plain(getattr(instance, field.attname, None)) for field in fields}
        )
    return out


def build(farm):
    """The whole farm as one dictionary."""
    from apps.ledger.models import LedgerLine

    payload = {
        "format_version": FORMAT_VERSION,
        "taken_at": datetime.now().isoformat(timespec="seconds"),
        "farm": {
            "id": str(farm.id),
            "name": farm.name,
            "slug": farm.slug,
            "base_currency": farm.base_currency_id,
            "timezone": farm.timezone,
            "country": farm.country,
        },
        "tables": {},
    }
    for model in farm_scoped_models():
        rows = _rows(model, farm)
        if rows:
            payload["tables"][model._meta.label] = rows

    # Ledger lines hang off entries rather than the farm, and a backup without
    # them would carry balances that cannot be recomputed.
    lines = LedgerLine.objects.filter(entry__farm=farm).order_by("entry__number", "sort_order")
    payload["tables"]["ledger.LedgerLine"] = [
        {
            "id": line.id,
            "entry": str(line.entry_id),
            "account": str(line.account_id),
            "debit": str(line.debit),
            "credit": str(line.credit),
            "memo": line.memo,
            "branch": str(line.branch_id) if line.branch_id else None,
            "subject_type": line.subject_type,
            "subject_id": str(line.subject_id) if line.subject_id else None,
            "sort_order": line.sort_order,
        }
        for line in lines
    ]
    payload["row_counts"] = {name: len(rows) for name, rows in payload["tables"].items()}
    return payload


def to_json(farm, *, indent=None):
    return json.dumps(build(farm), ensure_ascii=False, indent=indent)


def filename_for(farm):
    return f"backup-{farm.slug}-{date.today().isoformat()}.json"
