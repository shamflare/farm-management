"""Request-scoped context so models can stamp actor information."""
import contextvars

_current_user = contextvars.ContextVar("current_user", default=None)
_current_request = contextvars.ContextVar("current_request", default=None)
_current_request_meta = contextvars.ContextVar("current_request_meta", default=None)


def set_current_user(user):
    """Explicit override, used by management commands and background jobs."""
    _current_user.set(user)


def set_current_request(request):
    _current_request.set(request)


def get_current_user():
    """Who is acting right now.

    The request is read at call time, not captured by the middleware: DRF
    authenticates a JWT inside the view, long after middleware has run, so a
    user captured early would always be anonymous.
    """
    user = _current_user.get()
    if user is None:
        request = _current_request.get()
        user = getattr(request, "user", None) if request is not None else None
    if user is not None and getattr(user, "is_authenticated", False):
        return user
    return None


def set_request_meta(meta):
    _current_request_meta.set(meta)


def get_request_meta():
    return _current_request_meta.get() or {}
