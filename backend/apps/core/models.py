"""Base model layer: UUID keys, timestamps, actor stamps, soft delete, tenancy."""
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.context import get_current_user


class SoftDeleteQuerySet(models.QuerySet):
    def alive(self):
        return self.filter(deleted_at__isnull=True)

    def dead(self):
        return self.filter(deleted_at__isnull=False)

    def delete(self):
        return self.update(deleted_at=timezone.now())

    def hard_delete(self):
        return super().delete()


class AliveManager(models.Manager):
    """Default manager hides soft-deleted rows; `all_objects` exposes them."""

    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).filter(deleted_at__isnull=True)


class AllManager(models.Manager):
    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db)


class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = AliveManager()
    all_objects = AllManager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        actor = get_current_user()
        if actor is not None:
            if self._state.adding and self.created_by_id is None:
                self.created_by = actor
            self.updated_by = actor
        super().save(*args, **kwargs)

    def delete(self, using=None, keep_parents=False, hard=False):
        """Soft delete by default. Financial records override this to refuse."""
        if hard:
            return super().delete(using=using, keep_parents=keep_parents)
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at", "updated_at", "updated_by"])
        return (1, {self._meta.label: 1})

    def restore(self):
        self.deleted_at = None
        self.save(update_fields=["deleted_at", "updated_at", "updated_by"])


class Currency(models.Model):
    """Currencies are data, not code. Amounts always carry one."""

    code = models.CharField(max_length=8, primary_key=True)
    name = models.CharField(max_length=64)
    symbol = models.CharField(max_length=8, blank=True)
    decimal_places = models.PositiveSmallIntegerField(default=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]
        verbose_name_plural = "currencies"

    def __str__(self):
        return self.code


class Farm(BaseModel):
    """Tenant root. Every business record hangs off a farm."""

    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=64, unique=True)
    base_currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name="farms")
    timezone = models.CharField(max_length=64, default="Asia/Damascus")
    country = models.CharField(max_length=64, blank=True)
    is_active = models.BooleanField(default=True)
    opening_completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class FarmScopedModel(BaseModel):
    """Mixin for everything that belongs to exactly one farm."""

    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name="%(class)s_set")

    class Meta:
        abstract = True


class ExchangeRate(models.Model):
    """Rates are recorded, never guessed, so historical reports stay stable."""

    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, related_name="exchange_rates")
    from_currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name="+")
    to_currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name="+")
    rate = models.DecimalField(max_digits=24, decimal_places=10)
    valid_on = models.DateField(db_index=True)

    class Meta:
        ordering = ["-valid_on"]
        constraints = [
            models.UniqueConstraint(
                fields=["farm", "from_currency", "to_currency", "valid_on"],
                name="uniq_rate_per_day",
            )
        ]

    def __str__(self):
        return f"{self.from_currency_id}->{self.to_currency_id} {self.rate} @{self.valid_on}"
