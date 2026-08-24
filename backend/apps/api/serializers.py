"""API serializers.

Read serializers include the Arabic display name so the mobile app never has to
guess a label. Write serializers accept ids and validate against the farm.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.accounts.models import Membership, Permission, Role, User
from apps.animals.models import (
    Animal,
    AnimalEvent,
    Birth,
    HealthRecord,
    WeightRecord,
)
from apps.audit.models import AuditLog
from apps.catalog.models import CatalogItem, CatalogType
from apps.core.models import Attachment, Currency, Farm
from apps.customfields.models import FieldDefinition, FieldValue
from apps.assets.models import FoundingCost
from apps.inventory.models import InventoryItem, InventoryStore, StockMovement
from apps.ledger.models import Account, ApprovalRule, JournalEntry, LedgerLine
from apps.production.models import MilkProduction, MilkSale
from apps.operations.models import AnimalPurchase, AnimalSale, PurchaseItem, SaleItem
from apps.parties.models import Party
from apps.theme import services as theme_services
from apps.theme.models import Theme


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = ["code", "name", "symbol", "decimal_places", "is_active"]


class FarmSerializer(serializers.ModelSerializer):
    base_currency = CurrencySerializer(read_only=True)

    class Meta:
        model = Farm
        fields = [
            "id", "name", "slug", "base_currency", "timezone", "country",
            "is_active", "opening_completed_at",
        ]
        read_only_fields = ["id", "opening_completed_at"]


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["code", "module", "action", "label", "label_ar", "is_sensitive"]


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SlugRelatedField(
        slug_field="code", queryset=Permission.objects.all(), many=True, required=False
    )
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = [
            "id", "code", "name", "name_ar", "display_name", "description",
            "is_system", "permissions",
        ]
        read_only_fields = ["id", "is_system"]

    def get_display_name(self, obj):
        return obj.name_ar or obj.name


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "full_name", "email", "phone", "language", "is_active"]
        read_only_fields = ["id"]


class ProfileSerializer(serializers.ModelSerializer):
    """ما يملك الشخص تغييره في نفسه: الاسم الذي تناديه به كل الشاشات.

    اسم المستخدم للدخول لا يتغيّر من هنا — تغييره يقطع الصلة بين الشخص وبين ما
    سجّله في سجل التدقيق، والاسم الظاهر يكفي لتصحيح ما هو مكتوب على الشاشة.
    """

    class Meta:
        model = User
        fields = ["full_name", "phone", "email", "language"]

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("الاسم لا يكون فارغًا")
        return value


class MembershipSerializer(serializers.ModelSerializer):
    """A person's access to one farm, with the party record they are paid as."""

    user = UserSerializer(read_only=True)
    role = RoleSerializer(read_only=True)
    role_id = serializers.PrimaryKeyRelatedField(
        source="role", queryset=Role.objects.all(), write_only=True, required=False
    )
    party = serializers.SerializerMethodField()
    # اسم الشخص يُصحَّح من نفس الشاشة التي يُدار فيها حسابه، لا من شاشة أخرى.
    full_name = serializers.CharField(write_only=True, required=False, max_length=160)
    phone = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=32
    )

    class Meta:
        model = Membership
        fields = ["id", "user", "role", "role_id", "is_active", "party", "full_name", "phone"]
        read_only_fields = ["id", "user"]

    def update(self, instance, validated_data):
        full_name = validated_data.pop("full_name", None)
        phone = validated_data.pop("phone", None)
        changed = []
        if full_name is not None and full_name.strip():
            instance.user.full_name = full_name.strip()
            changed.append("full_name")
        if phone is not None:
            instance.user.phone = phone
            changed.append("phone")
        if changed:
            instance.user.save(update_fields=changed)
        return super().update(instance, validated_data)

    def get_party(self, obj):
        party = obj.user.parties.filter(farm=obj.farm).first()
        if party is None:
            return None
        return {"id": str(party.id), "name": party.name, "kind": party.kind}


class MemberCreateSerializer(serializers.Serializer):
    """Give a person a way in: a login, a role, and optionally their file."""

    username = serializers.CharField(max_length=64)
    password = serializers.CharField(min_length=8, write_only=True)
    full_name = serializers.CharField(max_length=160, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    role_id = serializers.UUIDField()
    # The supplier/worker/partner record this login belongs to, so money and
    # identity are the same person rather than two lookalike rows.
    party_id = serializers.UUIDField(required=False, allow_null=True)

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("اسم المستخدم محجوز، اختر غيره")
        return value


class PasswordResetSerializer(serializers.Serializer):
    password = serializers.CharField(min_length=8, write_only=True)


class CatalogTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogType
        fields = ["code", "name", "name_ar", "allows_children", "description"]


class CatalogItemSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    type = serializers.PrimaryKeyRelatedField(queryset=CatalogType.objects.all())
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = CatalogItem
        fields = [
            "id", "type", "parent", "code", "name", "name_ar", "display_name",
            "color", "icon", "sort_order", "is_active", "is_system",
            "metadata", "children_count",
        ]
        read_only_fields = ["id", "is_system"]

    def get_children_count(self, obj):
        return obj.children.count()


class FieldDefinitionSerializer(serializers.ModelSerializer):
    display_label = serializers.CharField(read_only=True)

    class Meta:
        model = FieldDefinition
        fields = [
            "id", "entity", "key", "label", "label_ar", "display_label", "help_text",
            "field_type", "is_builtin", "is_required", "is_visible", "is_active",
            "show_in_list", "sort_order", "group", "default_value", "options", "validation",
        ]
        read_only_fields = ["id", "is_builtin"]


class AccountSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    balance = serializers.SerializerMethodField()
    currency = serializers.PrimaryKeyRelatedField(queryset=Currency.objects.all())

    class Meta:
        model = Account
        fields = [
            "id", "code", "name", "name_ar", "display_name", "type", "currency",
            "parent", "is_cash", "is_system", "is_active", "catalog_item",
            "description", "sort_order", "balance",
        ]
        read_only_fields = ["id", "is_system"]

    def get_balance(self, obj):
        return obj.balance()


class LedgerLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source="account.code", read_only=True)
    account_name = serializers.CharField(source="account.display_name", read_only=True)
    account_type = serializers.CharField(source="account.type", read_only=True)
    branch_name = serializers.CharField(source="branch.display_name", read_only=True, default="")

    class Meta:
        model = LedgerLine
        fields = [
            "id", "account", "account_code", "account_name", "account_type",
            "debit", "credit", "memo", "subject_type", "subject_id",
            "branch", "branch_name",
        ]


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = LedgerLineSerializer(many=True, read_only=True)
    currency_code = serializers.CharField(source="currency.code", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = JournalEntry
        fields = [
            "id", "number", "date", "kind", "status", "currency", "currency_code",
            "amount", "memo", "reference", "subject_type", "subject_id",
            "reverses", "void_reason", "posted_at", "approved_at",
            "created_at", "created_by_name", "attachments", "lines",
        ]
        read_only_fields = fields


class ApprovalRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApprovalRule
        fields = ["id", "kind", "min_amount", "currency", "is_active", "note"]
        read_only_fields = ["id"]


class PartySerializer(serializers.ModelSerializer):
    summary = serializers.SerializerMethodField()
    # The login this person signs in with, when they have one.
    user_name = serializers.CharField(source="user.full_name", read_only=True, default="")
    username = serializers.CharField(source="user.username", read_only=True, default="")

    class Meta:
        model = Party
        fields = [
            "id", "kind", "name", "phone", "alt_phone", "address", "national_id",
            "notes", "is_active", "user", "user_name", "username", "ownership_percentage",
            "receivable_account", "payable_account", "capital_account",
            "drawings_account", "cash_account", "summary",
        ]
        read_only_fields = [
            "id", "receivable_account", "payable_account", "capital_account",
            "drawings_account", "cash_account",
        ]

    def validate(self, attrs):
        """اسم واحد لكل نوع داخل المزرعة.

        القاعدة نفسها تمنع التكرار، لكنها كانت تمنعه بخطأ خادم غامض. الفحص هنا
        يردّه رسالة مفهومة على الحقل نفسه، فيعرف من يكتب أن السجل موجود أصلًا.
        """
        from apps.api.permissions import resolve_farm

        request = self.context.get("request")
        name = (attrs.get("name") or getattr(self.instance, "name", "") or "").strip()
        kind = attrs.get("kind") or getattr(self.instance, "kind", "")
        if request is None or not name or not kind:
            return attrs

        clash = Party.objects.filter(farm=resolve_farm(request), kind=kind, name=name)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError(
                {"name": "يوجد سجل بهذا الاسم في نفس النوع — اختر اسمًا يميّزه"}
            )
        return attrs

    def get_summary(self, obj):
        if self.context.get("with_summary") is False:
            return None
        from apps.parties.services import party_summary

        return party_summary(obj)


ACQUISITION_LABELS = {
    "born": "مولود في المزرعة",
    "purchased": "مُشترى",
    "gift": "هدية",
    "opening": "موجود عند البدء",
    "transfer": "منقول",
}


class AnimalListSerializer(serializers.ModelSerializer):
    type_name = serializers.CharField(source="animal_type.display_name", read_only=True)
    breed_name = serializers.CharField(source="breed.display_name", read_only=True, default="")
    status_name = serializers.CharField(source="status.display_name", read_only=True)
    status_code = serializers.CharField(source="status.code", read_only=True)
    location_name = serializers.CharField(source="location.display_name", read_only=True, default="")
    branch_name = serializers.CharField(source="branch.display_name", read_only=True, default="")
    branch_code = serializers.CharField(source="branch.code", read_only=True, default="")
    acquisition_label = serializers.SerializerMethodField()
    # ما دفعته المزرعة في هذا الرأس، ومن أين جاء.
    purchase = serializers.SerializerMethodField()

    class Meta:
        model = Animal
        fields = [
            "id", "tag", "name", "animal_type", "type_name", "breed", "breed_name",
            "branch", "branch_name", "branch_code",
            "sex", "birth_date", "status", "status_name", "status_code",
            "location", "location_name", "current_weight", "is_alive", "is_on_farm",
            "photo", "mother", "father",
            "acquisition", "acquisition_label", "entered_at", "purchase_price",
            "ear_tag", "chip_number", "color", "purchase",
        ]

    def get_acquisition_label(self, obj):
        return ACQUISITION_LABELS.get(obj.acquisition, obj.acquisition)

    def get_purchase(self, obj):
        """صفقة الشراء التي دخل بها هذا الرأس، إن كان مُشترى.

        `allocated_cost` هو ثمنه محمَّلًا بحصّته من النقل والعمولة — أي تكلفته
        الحقيقية، وهي الرقم الذي يُقارَن بسعر البيع لا سعر الشراء وحده.
        القائمة تُجلب بـ prefetch في العرض، فلا استعلام لكل صف.
        """
        item = next(iter(obj.purchase_items.all()), None)
        if item is None:
            return None
        purchase = item.purchase
        return {
            "unit_price": str(item.unit_price),
            "total_cost": str(item.allocated_cost),
            "happened_on": purchase.happened_on.isoformat() if purchase.happened_on else None,
            "supplier_name": purchase.supplier.name if purchase.supplier_id else "",
            "reference": purchase.reference,
        }


class AnimalSerializer(serializers.ModelSerializer):
    type_name = serializers.CharField(source="animal_type.display_name", read_only=True)
    breed_name = serializers.CharField(source="breed.display_name", read_only=True, default="")
    status_name = serializers.CharField(source="status.display_name", read_only=True)
    mother_tag = serializers.CharField(source="mother.tag", read_only=True, default="")
    father_tag = serializers.CharField(source="father.tag", read_only=True, default="")
    branch_name = serializers.CharField(source="branch.display_name", read_only=True, default="")
    photo_url = serializers.SerializerMethodField()
    custom_fields = serializers.DictField(required=False)
    acquisition_label = serializers.SerializerMethodField()
    purchase = serializers.SerializerMethodField()

    class Meta:
        model = Animal
        fields = [
            "id", "tag", "name", "animal_type", "type_name", "breed", "breed_name",
            "branch", "branch_name",
            "status", "status_name", "location", "sex", "birth_date",
            "mother", "mother_tag", "father", "father_tag", "acquisition",
            "acquisition_label", "purchase",
            "entered_at", "exited_at", "purchase_price", "purchase_currency",
            "ear_tag", "chip_number", "barcode", "color", "current_weight",
            "photo", "photo_url", "notes", "is_alive", "is_on_farm", "custom_fields",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "is_alive", "is_on_farm", "exited_at", "photo_url",
            "created_at", "updated_at",
        ]

    def validate(self, attrs):
        """سعر رأس دخل بصفقة شراء يقرؤه المستند، لا اليد.

        تعديله هنا كان سيجعل ملف الحيوان يقول رقمًا والدفتر يقول غيره. أما
        المولود أو الموجود عند البدء فلا مستند خلفه، فسعره يُكتب ويُصحَّح.
        """
        if "purchase_price" in attrs and self.instance is not None:
            if self.instance.purchase_items.exists():
                raise serializers.ValidationError(
                    {
                        "purchase_price": (
                            "هذا الرأس دخل بصفقة شراء — سعره يُعدَّل من صفحة الشراء "
                            "لا من هنا، كي يبقى الدفتر وملف الحيوان رقمًا واحدًا"
                        )
                    }
                )
        return attrs

    def validate_tag(self, value):
        """الرقم يُغيَّر، لكن لا يتكرّر: رقمان متطابقان يعنيان حيوانًا ضائعًا."""
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("رقم الحيوان مطلوب")
        farm = self.instance.farm if self.instance else None
        if farm is None:
            from apps.api.permissions import resolve_farm

            request = self.context.get("request")
            farm = resolve_farm(request) if request else None
        if farm is None:
            return value
        clash = Animal.objects.filter(farm=farm, tag=value)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("هذا الرقم مستعمل لحيوان آخر في المزرعة")
        return value

    def get_acquisition_label(self, obj):
        return ACQUISITION_LABELS.get(obj.acquisition, obj.acquisition)

    def get_purchase(self, obj):
        """الصفقة التي دخل بها هذا الرأس: ثمنه، وتكلفته الكاملة، ومن باعه."""
        item = obj.purchase_items.select_related("purchase__supplier").first()
        if item is None:
            return None
        purchase = item.purchase
        return {
            "id": str(purchase.id),
            "unit_price": str(item.unit_price),
            "total_cost": str(item.allocated_cost),
            "happened_on": purchase.happened_on.isoformat() if purchase.happened_on else None,
            "supplier_name": purchase.supplier.name if purchase.supplier_id else "",
            "reference": purchase.reference,
        }

    def get_photo_url(self, obj):
        """The picture chosen to represent this animal, if one was uploaded."""
        from apps.core.attachments import primary_image

        return primary_image(obj.farm, "animal", obj.id) or (obj.photo.url if obj.photo else "")


class AnimalEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnimalEvent
        fields = [
            "id", "event_type", "happened_on", "title", "detail", "amount",
            "currency", "journal_entry", "data", "created_at",
        ]


class WeightRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeightRecord
        fields = ["id", "animal", "measured_on", "weight_kg", "note"]
        read_only_fields = ["id"]


class HealthRecordSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.display_name", read_only=True, default="")

    class Meta:
        model = HealthRecord
        fields = [
            "id", "animal", "kind", "item", "item_name", "happened_on", "next_due_on",
            "dose", "veterinarian", "cost", "currency", "journal_entry", "notes",
        ]
        read_only_fields = ["id", "journal_entry"]


class BirthSerializer(serializers.ModelSerializer):
    mother_tag = serializers.CharField(source="mother.tag", read_only=True)
    offspring_tags = serializers.SerializerMethodField()

    class Meta:
        model = Birth
        fields = [
            "id", "mother", "mother_tag", "father", "happened_on", "total_born",
            "born_alive", "stillborn", "notes", "offspring_tags",
        ]
        read_only_fields = ["id", "total_born", "born_alive"]

    def get_offspring_tags(self, obj):
        return [row.animal.tag for row in obj.offspring.select_related("animal")]


class PurchaseItemSerializer(serializers.ModelSerializer):
    animal_tag = serializers.CharField(source="animal.tag", read_only=True)

    class Meta:
        model = PurchaseItem
        fields = ["id", "animal", "animal_tag", "unit_price", "allocated_cost"]


class AnimalPurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default="")
    remaining = serializers.DecimalField(max_digits=20, decimal_places=4, read_only=True)

    class Meta:
        model = AnimalPurchase
        fields = [
            "id", "reference", "supplier", "supplier_name", "happened_on", "currency",
            "animals_price", "transport_cost", "commission_cost", "other_cost",
            "total_cost", "paid_amount", "remaining", "settlement_status",
            "paid_from_account", "paid_by_party", "journal_entry", "notes",
            "attachments", "items",
        ]
        read_only_fields = fields


class SaleItemSerializer(serializers.ModelSerializer):
    animal_tag = serializers.CharField(source="animal.tag", read_only=True)

    class Meta:
        model = SaleItem
        fields = ["id", "animal", "animal_tag", "unit_price", "weight_kg", "book_value"]


class AnimalSaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True, default="")
    remaining = serializers.DecimalField(max_digits=20, decimal_places=4, read_only=True)

    class Meta:
        model = AnimalSale
        fields = [
            "id", "reference", "customer", "customer_name", "happened_on", "currency",
            "animals_price", "transport_cost", "commission_cost", "total_price",
            "received_amount", "remaining", "settlement_status",
            "received_into_account", "sale_reason", "journal_entry", "notes",
            "attachments", "items",
        ]
        read_only_fields = fields


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True, default="")

    class Meta:
        model = AuditLog
        fields = [
            "id", "action", "entity", "object_id", "label", "old_values", "new_values",
            "user", "user_name", "ip_address", "created_at",
        ]


class ThemeSerializer(serializers.ModelSerializer):
    tokens = serializers.SerializerMethodField()

    class Meta:
        model = Theme
        fields = [
            "id", "status", "version", "brand_name", "brand_tagline", "logo",
            "logo_data", "logo_dark", "favicon", "colors", "font_family", "font_scale",
            "corner_radius", "density", "dark_mode_enabled", "sidebar",
            "dashboard_widgets", "published_at", "tokens",
        ]
        read_only_fields = ["id", "status", "version", "published_at"]

    def get_tokens(self, obj):
        return obj.token_payload()

    def validate_logo_data(self, value):
        """One rule, defined next to the theme it protects."""
        try:
            return theme_services.validate_logo_data(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict["logo_data"])


# --- command payloads -------------------------------------------------------


class ExpenseCommandSerializer(serializers.Serializer):
    date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=20, decimal_places=4, min_value=Decimal("0"))
    category = serializers.UUIDField(required=False, allow_null=True)
    expense_account = serializers.UUIDField(required=False, allow_null=True)
    from_account = serializers.UUIDField(required=False, allow_null=True)
    paid_by_party = serializers.UUIDField(required=False, allow_null=True)
    supplier = serializers.UUIDField(required=False, allow_null=True)
    animal = serializers.UUIDField(required=False, allow_null=True)
    branch = serializers.UUIDField(required=False, allow_null=True)
    memo = serializers.CharField(required=False, allow_blank=True, default="")
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    currency = serializers.CharField(required=False, allow_blank=True)
    attachments = serializers.ListField(required=False)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, data):
        if not data.get("from_account") and not data.get("paid_by_party") and not data.get("supplier"):
            raise serializers.ValidationError(
                "choose who paid: a farm account, a person paying from their pocket, or a supplier on credit"
            )
        return data


class IncomeCommandSerializer(serializers.Serializer):
    date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=20, decimal_places=4, min_value=Decimal("0"))
    category = serializers.UUIDField(required=False, allow_null=True)
    income_account = serializers.UUIDField(required=False, allow_null=True)
    into_account = serializers.UUIDField(required=False, allow_null=True)
    customer = serializers.UUIDField(required=False, allow_null=True)
    branch = serializers.UUIDField(required=False, allow_null=True)
    memo = serializers.CharField(required=False, allow_blank=True, default="")
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    currency = serializers.CharField(required=False, allow_blank=True)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")


class TransferCommandSerializer(serializers.Serializer):
    date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=20, decimal_places=4, min_value=Decimal("0"))
    from_account = serializers.UUIDField()
    to_account = serializers.UUIDField()
    memo = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")


class PartyMoneyCommandSerializer(serializers.Serializer):
    date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=20, decimal_places=4, min_value=Decimal("0"))
    party = serializers.UUIDField()
    account = serializers.UUIDField()
    memo = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")


class PurchaseLineSerializer(serializers.Serializer):
    animal = serializers.UUIDField(required=False, allow_null=True)
    unit_price = serializers.DecimalField(max_digits=20, decimal_places=4, min_value=Decimal("0"))
    # When no animal id is given, one is created from these fields.
    tag = serializers.CharField(required=False, allow_blank=True)
    name = serializers.CharField(required=False, allow_blank=True)
    animal_type = serializers.UUIDField(required=False, allow_null=True)
    breed = serializers.UUIDField(required=False, allow_null=True)
    branch = serializers.UUIDField(required=False, allow_null=True)
    sex = serializers.CharField(required=False, allow_blank=True)
    birth_date = serializers.DateField(required=False, allow_null=True)


class PurchaseCommandSerializer(serializers.Serializer):
    date = serializers.DateField()
    items = PurchaseLineSerializer(many=True)
    supplier = serializers.UUIDField(required=False, allow_null=True)
    # ومثله البائع: يُكتب اسمه ولا يُبحث عنه في قائمة.
    supplier_name = serializers.CharField(required=False, allow_blank=True, default="")
    transport_cost = serializers.DecimalField(max_digits=20, decimal_places=4, default=0)
    commission_cost = serializers.DecimalField(max_digits=20, decimal_places=4, default=0)
    other_cost = serializers.DecimalField(max_digits=20, decimal_places=4, default=0)
    paid_amount = serializers.DecimalField(
        max_digits=20, decimal_places=4, required=False, allow_null=True
    )
    from_account = serializers.UUIDField(required=False, allow_null=True)
    paid_by_party = serializers.UUIDField(required=False, allow_null=True)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")


class PurchaseCorrectionSerializer(serializers.Serializer):
    """تصحيح أرقام صفقة قائمة — لا إضافة رأس ولا إخراجه."""

    date = serializers.DateField(required=False)
    supplier = serializers.UUIDField(required=False, allow_null=True)
    supplier_name = serializers.CharField(required=False, allow_blank=True, default="")
    # {معرّف البند: الثمن}
    prices = serializers.DictField(
        child=serializers.DecimalField(max_digits=20, decimal_places=4, min_value=Decimal("0")),
        required=False,
    )
    transport_cost = serializers.DecimalField(
        max_digits=20, decimal_places=4, required=False, min_value=Decimal("0")
    )
    commission_cost = serializers.DecimalField(
        max_digits=20, decimal_places=4, required=False, min_value=Decimal("0")
    )
    other_cost = serializers.DecimalField(
        max_digits=20, decimal_places=4, required=False, min_value=Decimal("0")
    )
    paid_amount = serializers.DecimalField(
        max_digits=20, decimal_places=4, required=False, allow_null=True
    )
    from_account = serializers.UUIDField(required=False, allow_null=True)
    reference = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class SaleLineSerializer(serializers.Serializer):
    animal = serializers.UUIDField()
    unit_price = serializers.DecimalField(max_digits=20, decimal_places=4, min_value=Decimal("0"))
    weight_kg = serializers.DecimalField(
        max_digits=10, decimal_places=3, required=False, allow_null=True
    )


class SaleCommandSerializer(serializers.Serializer):
    date = serializers.DateField()
    items = SaleLineSerializer(many=True)
    customer = serializers.UUIDField(required=False, allow_null=True)
    # الزبون يُكتب اسمه في السوق، ويُنشأ سجلّه إن كان جديدًا.
    customer_name = serializers.CharField(required=False, allow_blank=True, default="")
    transport_cost = serializers.DecimalField(max_digits=20, decimal_places=4, default=0)
    commission_cost = serializers.DecimalField(max_digits=20, decimal_places=4, default=0)
    received_amount = serializers.DecimalField(
        max_digits=20, decimal_places=4, required=False, allow_null=True
    )
    into_account = serializers.UUIDField(required=False, allow_null=True)
    sale_reason = serializers.UUIDField(required=False, allow_null=True)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")


class BirthCommandSerializer(serializers.Serializer):
    mother = serializers.UUIDField()
    father = serializers.UUIDField(required=False, allow_null=True)
    happened_on = serializers.DateField()
    stillborn = serializers.IntegerField(required=False, default=0, min_value=0)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    offspring = serializers.ListField(child=serializers.DictField(), required=False, default=list)


class DeathCommandSerializer(serializers.Serializer):
    animal = serializers.UUIDField()
    date = serializers.DateField()
    reason = serializers.UUIDField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class OpeningBalanceSerializer(serializers.Serializer):
    date = serializers.DateField()
    assets = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    liabilities = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    partner_capital = serializers.ListField(
        child=serializers.DictField(), required=False, default=list
    )
    memo = serializers.CharField(required=False, allow_blank=True, default="الرصيد الافتتاحي")


# --------------------------------------------------------------------------
# Feed stores
# --------------------------------------------------------------------------

class InventoryStoreSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    branch_name = serializers.CharField(source="branch.display_name", read_only=True, default="")
    branch_code = serializers.CharField(source="branch.code", read_only=True, default="")
    account_code = serializers.CharField(source="account.code", read_only=True, default="")

    class Meta:
        model = InventoryStore
        fields = [
            "id", "name", "name_ar", "display_name", "branch", "branch_name", "branch_code",
            "account", "account_code", "location", "notes", "is_active", "sort_order",
        ]
        read_only_fields = ["id", "account"]


class InventoryItemSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    category_name = serializers.CharField(source="category.display_name", read_only=True, default="")
    unit_name = serializers.CharField(read_only=True)

    class Meta:
        model = InventoryItem
        fields = [
            "id", "name", "name_ar", "display_name", "category", "category_name",
            "unit", "unit_name", "reorder_level", "notes", "is_active", "sort_order",
        ]
        read_only_fields = ["id"]


class StockMovementSerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source="store.display_name", read_only=True)
    item_name = serializers.CharField(source="item.display_name", read_only=True)
    unit_name = serializers.CharField(source="item.unit_name", read_only=True, default="")
    branch_name = serializers.CharField(
        source="store.branch.display_name", read_only=True, default=""
    )
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default="")

    class Meta:
        model = StockMovement
        fields = [
            "id", "store", "store_name", "branch_name", "item", "item_name", "unit_name",
            "kind", "happened_on", "quantity", "unit_cost", "total_cost",
            "supplier", "supplier_name", "journal_entry", "memo", "attachments",
            "created_at",
        ]
        read_only_fields = fields


class StockReceiveSerializer(serializers.Serializer):
    store = serializers.UUIDField()
    item = serializers.UUIDField()
    date = serializers.DateField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0"))
    unit_cost = serializers.DecimalField(
        max_digits=20, decimal_places=4, required=False, allow_null=True
    )
    total_cost = serializers.DecimalField(
        max_digits=20, decimal_places=4, required=False, allow_null=True
    )
    supplier = serializers.UUIDField(required=False, allow_null=True)
    from_account = serializers.UUIDField(required=False, allow_null=True)
    paid_by_party = serializers.UUIDField(required=False, allow_null=True)
    memo = serializers.CharField(required=False, allow_blank=True, default="")
    currency = serializers.CharField(required=False, allow_blank=True)
    attachments = serializers.ListField(required=False)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, data):
        if data.get("unit_cost") is None and data.get("total_cost") is None:
            raise serializers.ValidationError("give either the unit cost or the total cost")
        if not any(data.get(key) for key in ("from_account", "paid_by_party", "supplier")):
            raise serializers.ValidationError(
                "choose who paid: a farm account, a person paying from their pocket, "
                "or a supplier on credit"
            )
        return data


class StockIssueSerializer(serializers.Serializer):
    store = serializers.UUIDField()
    item = serializers.UUIDField()
    date = serializers.DateField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0"))
    animal = serializers.UUIDField(required=False, allow_null=True)
    memo = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")


class StockTransferSerializer(serializers.Serializer):
    from_store = serializers.UUIDField()
    to_store = serializers.UUIDField()
    item = serializers.UUIDField()
    date = serializers.DateField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0"))
    memo = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")


class StockCountSerializer(serializers.Serializer):
    store = serializers.UUIDField()
    item = serializers.UUIDField()
    date = serializers.DateField()
    counted_quantity = serializers.DecimalField(
        max_digits=14, decimal_places=3, min_value=Decimal("0")
    )
    memo = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")


class StockWriteOffSerializer(serializers.Serializer):
    store = serializers.UUIDField()
    item = serializers.UUIDField()
    date = serializers.DateField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal("0"))
    memo = serializers.CharField(required=False, allow_blank=True, default="")
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")


# --------------------------------------------------------------------------
# Milk
# --------------------------------------------------------------------------

class MilkProductionSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.display_name", read_only=True, default="")

    class Meta:
        model = MilkProduction
        fields = [
            "id", "happened_on", "branch", "branch_name", "session", "liters",
            "milking_animals", "notes", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class MilkProductionCommandSerializer(serializers.Serializer):
    date = serializers.DateField()
    liters = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0"))
    branch = serializers.UUIDField(required=False, allow_null=True)
    session = serializers.ChoiceField(
        choices=["morning", "evening", "day"], required=False, default="day"
    )
    milking_animals = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class MilkSaleSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(read_only=True)
    unit_name = serializers.CharField(source="unit.display_name", read_only=True, default="")
    branch_name = serializers.CharField(source="branch.display_name", read_only=True, default="")
    customer_name = serializers.CharField(source="customer.name", read_only=True, default="")

    class Meta:
        model = MilkSale
        fields = [
            "id", "happened_on", "branch", "branch_name", "product", "product_name",
            "unit", "unit_name", "quantity", "unit_price", "total_price", "currency",
            "customer", "customer_name", "received_into_account", "journal_entry",
            "notes", "attachments", "created_at",
        ]
        read_only_fields = fields


class MilkSaleCommandSerializer(serializers.Serializer):
    date = serializers.DateField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0"))
    unit_price = serializers.DecimalField(
        max_digits=20, decimal_places=4, required=False, allow_null=True
    )
    total_price = serializers.DecimalField(
        max_digits=20, decimal_places=4, required=False, allow_null=True
    )
    product = serializers.UUIDField(required=False, allow_null=True)
    unit = serializers.UUIDField(required=False, allow_null=True)
    branch = serializers.UUIDField(required=False, allow_null=True)
    customer = serializers.UUIDField(required=False, allow_null=True)
    into_account = serializers.UUIDField(required=False, allow_null=True)
    currency = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    attachments = serializers.ListField(required=False)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, data):
        if data.get("unit_price") is None and data.get("total_price") is None:
            raise serializers.ValidationError("give either the unit price or the total price")
        if not data.get("into_account") and not data.get("customer"):
            raise serializers.ValidationError(
                "choose the account that received the money, or the customer who owes it"
            )
        return data


# --------------------------------------------------------------------------
# Founding costs
# --------------------------------------------------------------------------

class FoundingCostSerializer(serializers.ModelSerializer):
    type_name = serializers.CharField(read_only=True)
    branch_name = serializers.CharField(source="branch.display_name", read_only=True, default="")
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default="")

    class Meta:
        model = FoundingCost
        fields = [
            "id", "happened_on", "name", "asset_type", "type_name", "branch", "branch_name",
            "amount", "currency", "quantity", "supplier", "supplier_name",
            "paid_from_account", "paid_by_party", "journal_entry", "notes",
            "attachments", "created_at",
        ]
        read_only_fields = fields


class FoundingCostCommandSerializer(serializers.Serializer):
    date = serializers.DateField()
    name = serializers.CharField(max_length=160)
    amount = serializers.DecimalField(max_digits=20, decimal_places=4, min_value=Decimal("0"))
    asset_type = serializers.UUIDField(required=False, allow_null=True)
    branch = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.DecimalField(
        max_digits=12, decimal_places=3, required=False, default=Decimal("1")
    )
    supplier = serializers.UUIDField(required=False, allow_null=True)
    from_account = serializers.UUIDField(required=False, allow_null=True)
    paid_by_party = serializers.UUIDField(required=False, allow_null=True)
    currency = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    attachments = serializers.ListField(required=False)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, data):
        if not any(data.get(key) for key in ("from_account", "paid_by_party", "supplier")):
            raise serializers.ValidationError(
                "choose who paid: a farm account, a person paying from their pocket, "
                "or a supplier on credit"
            )
        return data


class BranchChangeSerializer(serializers.Serializer):
    branch = serializers.UUIDField(required=False, allow_null=True)
    date = serializers.DateField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


# --------------------------------------------------------------------------
# Attachments
# --------------------------------------------------------------------------

class AttachmentSerializer(serializers.ModelSerializer):
    is_image = serializers.BooleanField(read_only=True)
    uploaded_by = serializers.CharField(source="created_by.full_name", read_only=True, default="")

    class Meta:
        model = Attachment
        fields = [
            "id", "subject_type", "subject_id", "kind", "name", "content_type",
            "size", "data", "note", "is_primary", "is_image", "uploaded_by",
            "created_at",
        ]
        read_only_fields = fields


class AttachmentListSerializer(AttachmentSerializer):
    """The same rows without the bytes, for listings that only need the names."""

    class Meta(AttachmentSerializer.Meta):
        fields = [field for field in AttachmentSerializer.Meta.fields if field != "data"]
        read_only_fields = fields


class AttachmentCommandSerializer(serializers.Serializer):
    subject_type = serializers.CharField(max_length=32)
    subject_id = serializers.UUIDField()
    data = serializers.CharField(help_text="The file as a base64 data URI.")
    name = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    kind = serializers.ChoiceField(
        choices=["photo", "invoice", "receipt", "contract", "document"],
        required=False,
        default="document",
    )
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    is_primary = serializers.BooleanField(required=False, default=False)

