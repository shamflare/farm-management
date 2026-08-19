from apps.core.context import set_current_user, set_request_meta


class AuditContextMiddleware:
    """Publishes the acting user and request metadata to the audit layer."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        set_current_user(getattr(request, "user", None))
        set_request_meta(
            {
                "ip": self._client_ip(request),
                "user_agent": request.META.get("HTTP_USER_AGENT", "")[:255],
                "path": request.path,
                "method": request.method,
            }
        )
        try:
            return self.get_response(request)
        finally:
            set_current_user(None)
            set_request_meta({})

    @staticmethod
    def _client_ip(request):
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded:
            return forwarded.split(",")[0].strip()[:45]
        return (request.META.get("REMOTE_ADDR") or "")[:45]
