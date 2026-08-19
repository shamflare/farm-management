"""Request-scoped context so models can stamp actor information."""
import contextvars

_current_user = contextvars.ContextVar("current_user", default=None)
_current_request_meta = contextvars.ContextVar("current_request_meta", default=None)


def set_current_user(user):
    _current_user.set(user)


def get_current_user():
    user = _current_user.get()
    if user is not None and getattr(user, "is_authenticated", False):
        return user
    return None


def set_request_meta(meta):
    _current_request_meta.set(meta)


def get_request_meta():
    return _current_request_meta.get() or {}
