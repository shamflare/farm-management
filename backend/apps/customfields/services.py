"""Read and write dynamic values for a record."""
from django.core.exceptions import ValidationError

from apps.customfields.models import FieldDefinition, FieldValue


def definitions_for(farm, entity, *, include_hidden=False):
    qs = FieldDefinition.objects.filter(farm=farm, entity=entity, is_active=True)
    if not include_hidden:
        qs = qs.filter(is_visible=True)
    return qs.order_by("sort_order", "id")


def get_values(farm, entity, object_id):
    rows = FieldValue.objects.filter(
        farm=farm, entity=entity, object_id=object_id
    ).select_related("definition")
    return {row.definition.key: row.value for row in rows}


def set_values(farm, entity, object_id, data):
    """Validate then persist custom values. Raises ValidationError on bad input."""
    defs = {
        d.key: d
        for d in definitions_for(farm, entity, include_hidden=True)
        if not d.is_builtin
    }
    errors, cleaned = {}, {}
    for key, raw in (data or {}).items():
        definition = defs.get(key)
        if definition is None:
            errors[key] = "unknown field"
            continue
        try:
            cleaned[key] = definition.clean_value(raw)
        except ValidationError as exc:
            detail = exc.message_dict.get(key) if hasattr(exc, "message_dict") else None
            errors[key] = detail[0] if detail else str(exc)

    # Required fields that were never supplied and have no stored value yet.
    for key, definition in defs.items():
        if not definition.is_required or key in cleaned or key in errors:
            continue
        existing = FieldValue.objects.filter(definition=definition, object_id=object_id).first()
        if existing is None or existing.value in (None, ""):
            errors[key] = f"{definition.display_label} is required"

    if errors:
        raise ValidationError(errors)

    for key, value in cleaned.items():
        FieldValue.objects.update_or_create(
            definition=defs[key],
            object_id=object_id,
            defaults={"farm": farm, "entity": entity, "value": value},
        )
    return cleaned
