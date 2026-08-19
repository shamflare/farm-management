from decimal import Decimal

from django.conf import settings
from django.db import models

ZERO = Decimal("0")


def money_field(**kwargs):
    """NUMERIC money column. Never float, per the accounting rules."""
    kwargs.setdefault("max_digits", settings.MONEY_MAX_DIGITS)
    kwargs.setdefault("decimal_places", settings.MONEY_DECIMAL_PLACES)
    kwargs.setdefault("default", ZERO)
    return models.DecimalField(**kwargs)
