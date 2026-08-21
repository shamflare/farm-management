"""One generic, admin-managed tree for every list in the system.

Expense categories, breeds, animal statuses, payment methods, death reasons and
anything else that can change over time live here as rows instead of code
constants. Historical records point at the row, so renaming a category never
rewrites the meaning of past transactions.
"""
from django.db import models

from apps.core.models import BaseModel, FarmScopedModel


class CatalogType(models.Model):
    """The kinds of list the system knows about. Seeded, extendable."""

    code = models.SlugField(max_length=48, primary_key=True)
    name = models.CharField(max_length=96)
    name_ar = models.CharField(max_length=96, blank=True)
    allows_children = models.BooleanField(default=True)
    is_system = models.BooleanField(default=True)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.code


class CatalogItem(FarmScopedModel):
    type = models.ForeignKey(CatalogType, on_delete=models.PROTECT, related_name="items")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    code = models.SlugField(max_length=64)
    name = models.CharField(max_length=128)
    name_ar = models.CharField(max_length=128, blank=True)
    color = models.CharField(max_length=16, blank=True)
    icon = models.CharField(max_length=48, blank=True)
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_system = models.BooleanField(default=False, help_text="Seeded row; may be renamed but not deleted.")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["type", "sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["farm", "type", "code"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_catalog_code_per_type",
            )
        ]
        indexes = [models.Index(fields=["farm", "type", "is_active"])]

    def __str__(self):
        return self.name_ar or self.name

    @property
    def display_name(self):
        return self.name_ar or self.name

    def full_path(self):
        parts, node, guard = [], self, 0
        while node is not None and guard < 10:
            parts.append(node.display_name)
            node = node.parent
            guard += 1
        return " ← ".join(parts)

    def delete(self, using=None, keep_parents=False, hard=False):
        if self.is_system and not hard:
            # System rows can be deactivated but not removed, so seeded
            # references in historical data keep resolving.
            self.is_active = False
            self.save(update_fields=["is_active", "updated_at", "updated_by"])
            return (0, {})
        return super().delete(using=using, keep_parents=keep_parents, hard=hard)


class BranchCode:
    """The branches seeded for a new farm.

    A branch is an ordinary catalog row: the farm can rename these, or add a
    third one from the settings screen, without a migration. Only the seed and
    the first-run defaults reference these codes.
    """

    BREEDING = "breeding"
    FATTENING = "fattening"
    SHARED = "shared"


class CatalogTypeCode:
    """Codes referenced by application logic."""

    BRANCH = "branch"
    ANIMAL_TYPE = "animal_type"
    BREED = "breed"
    ANIMAL_STATUS = "animal_status"
    LOCATION = "location"
    EXPENSE_CATEGORY = "expense_category"
    REVENUE_CATEGORY = "revenue_category"
    PAYMENT_METHOD = "payment_method"
    ASSET_TYPE = "asset_type"
    INVENTORY_CATEGORY = "inventory_category"
    UNIT = "unit"
    DISEASE = "disease"
    VACCINE = "vaccine"
    DEATH_REASON = "death_reason"
    SALE_REASON = "sale_reason"
    DOCUMENT_TYPE = "document_type"
    MILK_PRODUCT = "milk_product"
