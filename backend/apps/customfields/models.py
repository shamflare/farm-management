"""Dynamic fields and form layout.

Structured columns stay in their own tables because accounting and reporting
depend on them. This layer adds owner-defined fields on top, plus the
show/hide/rename/reorder/require controls for the built-in ones.
"""
from django.core.exceptions import ValidationError
from django.db import models

from apps.core.models import FarmScopedModel


class FieldType(models.TextChoices):
    TEXT = "text", "Text"
    LONG_TEXT = "long_text", "Long text"
    NUMBER = "number", "Number"
    DECIMAL = "decimal", "Decimal"
    CURRENCY = "currency", "Currency"
    DATE = "date", "Date"
    DATETIME = "datetime", "Date and time"
    BOOLEAN = "boolean", "Yes / No"
    DROPDOWN = "dropdown", "Dropdown"
    MULTI_SELECT = "multi_select", "Multi select"
    RADIO = "radio", "Radio"
    FILE = "file", "File"
    IMAGE = "image", "Image"
    RELATION = "relation", "Relation"
    PERCENTAGE = "percentage", "Percentage"


class EntityType(models.TextChoices):
    ANIMAL = "animal", "Animal"
    EXPENSE = "expense", "Expense"
    INCOME = "income", "Income"
    PURCHASE = "purchase", "Purchase"
    SALE = "sale", "Sale"
    PARTY = "party", "Supplier / customer"
    ASSET = "asset", "Asset"
    INVENTORY_ITEM = "inventory_item", "Inventory item"
    PARTNER = "partner", "Partner"


class FieldDefinition(FarmScopedModel):
    """One field on one entity form - built-in or owner-created.

    `is_builtin=True` rows mirror a real model column: the admin may rename,
    reorder, require or hide them, but the value still lives in its typed
    column. `is_builtin=False` rows store their values in FieldValue.
    """

    entity = models.CharField(max_length=32, choices=EntityType.choices, db_index=True)
    key = models.SlugField(max_length=64)
    label = models.CharField(max_length=128)
    label_ar = models.CharField(max_length=128, blank=True)
    help_text = models.CharField(max_length=255, blank=True)
    field_type = models.CharField(max_length=24, choices=FieldType.choices, default=FieldType.TEXT)
    is_builtin = models.BooleanField(default=False)
    is_required = models.BooleanField(default=False)
    is_visible = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    show_in_list = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)
    group = models.CharField(max_length=64, blank=True)
    default_value = models.JSONField(null=True, blank=True)
    # Dropdown/radio/multi-select options, or {"catalog_type": "breed"} to pull
    # choices from the catalog instead of a static list.
    options = models.JSONField(default=dict, blank=True)
    # min, max, max_length, regex, decimals, relation target...
    validation = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["entity", "sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["farm", "entity", "key"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_field_key_per_entity",
            )
        ]
        indexes = [models.Index(fields=["farm", "entity", "is_active"])]

    def __str__(self):
        return f"{self.entity}.{self.key}"

    @property
    def display_label(self):
        return self.label_ar or self.label

    def delete(self, using=None, keep_parents=False, hard=False):
        if self.is_builtin and not hard:
            # A built-in field maps to a real column; hide it instead.
            self.is_visible = False
            self.save(update_fields=["is_visible", "updated_at", "updated_by"])
            return (0, {})
        return super().delete(using=using, keep_parents=keep_parents, hard=hard)

    def clean_value(self, value):
        """Server-side validation. Client checks are a convenience only."""
        rules = self.validation or {}
        if value in (None, "", [], {}):
            if self.is_required:
                raise ValidationError({self.key: f"{self.display_label} is required"})
            return None

        ftype = self.field_type
        numeric = (FieldType.NUMBER, FieldType.DECIMAL, FieldType.CURRENCY, FieldType.PERCENTAGE)
        if ftype in numeric:
            try:
                number = float(value)
            except (TypeError, ValueError):
                raise ValidationError({self.key: "must be a number"})
            minimum = rules.get("min")
            maximum = rules.get("max")
            if minimum is not None and number < float(minimum):
                raise ValidationError({self.key: f"must be at least {minimum}"})
            if maximum is not None and number > float(maximum):
                raise ValidationError({self.key: f"must be at most {maximum}"})
            if ftype == FieldType.PERCENTAGE and not 0 <= number <= 100:
                raise ValidationError({self.key: "percentage must be between 0 and 100"})
            if ftype == FieldType.NUMBER:
                return int(number)
            return str(value)
        if ftype == FieldType.BOOLEAN:
            return bool(value)
        if ftype in (FieldType.DROPDOWN, FieldType.RADIO):
            allowed = self.allowed_values()
            if allowed is not None and str(value) not in allowed:
                raise ValidationError({self.key: "value is not one of the allowed options"})
            return str(value)
        if ftype == FieldType.MULTI_SELECT:
            if not isinstance(value, list):
                raise ValidationError({self.key: "expected a list of values"})
            allowed = self.allowed_values()
            if allowed is not None:
                bad = [v for v in value if str(v) not in allowed]
                if bad:
                    raise ValidationError({self.key: f"invalid options: {bad}"})
            return [str(v) for v in value]
        text = str(value)
        max_length = rules.get("max_length")
        if max_length and len(text) > int(max_length):
            raise ValidationError({self.key: f"max length is {max_length}"})
        return text

    def allowed_values(self):
        options = self.options or {}
        catalog_type = options.get("catalog_type")
        if catalog_type:
            from apps.catalog.models import CatalogItem

            rows = CatalogItem.objects.filter(
                farm=self.farm, type_id=catalog_type, is_active=True
            ).values_list("id", flat=True)
            return {str(pk) for pk in rows}
        choices = options.get("choices")
        if isinstance(choices, list):
            return {str(c.get("value") if isinstance(c, dict) else c) for c in choices}
        return None


class FieldValue(FarmScopedModel):
    """Value of one owner-created field for one record."""

    definition = models.ForeignKey(FieldDefinition, on_delete=models.CASCADE, related_name="values")
    entity = models.CharField(max_length=32, choices=EntityType.choices, db_index=True)
    object_id = models.UUIDField(db_index=True)
    value = models.JSONField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["definition", "object_id"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_value_per_object",
            )
        ]
        indexes = [models.Index(fields=["entity", "object_id"])]

    def __str__(self):
        return f"{self.definition_id}={self.value}"
