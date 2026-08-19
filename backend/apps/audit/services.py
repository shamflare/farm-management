from apps.audit.models import AuditLog
from apps.core.context import get_current_user, get_request_meta


def record(action, entity, obj_id="", *, farm=None, label="", old=None, new=None, user=None):
    """Write one audit row. Called by services, not by models, so the entry
    describes a business action instead of a column write."""
    meta = get_request_meta()
    return AuditLog.objects.create(
        farm=farm,
        user=user or get_current_user(),
        action=action,
        entity=entity,
        object_id=str(obj_id or ""),
        label=label[:255],
        old_values=old,
        new_values=new,
        ip_address=meta.get("ip", ""),
        user_agent=meta.get("user_agent", ""),
    )


def snapshot(instance, fields):
    """Serialize selected fields for before/after audit values."""
    data = {}
    for name in fields:
        value = getattr(instance, name, None)
        if hasattr(value, "pk"):
            value = str(value.pk)
        elif value is not None and not isinstance(value, (str, int, float, bool, list, dict)):
            value = str(value)
        data[name] = value
    return data
