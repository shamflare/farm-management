"""First-run defaults.

Everything here is a starting point the owner can rename, reorder, disable or
extend from the settings screen. Nothing in this file is a business rule - the
rules read rows, not constants.
"""
from django.db import transaction

from apps.accounts.models import Permission, Role
from apps.catalog.models import BranchCode, CatalogItem, CatalogType, CatalogTypeCode
from apps.core.models import Currency, Farm
from apps.customfields.models import EntityType, FieldDefinition, FieldType
from apps.ledger.chart import seed_chart_of_accounts

CURRENCIES = [
    ("USD", "US Dollar", "$", 2),
    ("SYP", "Syrian Pound", "ل.س", 0),
    ("TRY", "Turkish Lira", "₺", 2),
    ("EUR", "Euro", "€", 2),
    ("SAR", "Saudi Riyal", "ر.س", 2),
]

# module code, arabic label, actions
PERMISSION_MODULES = [
    ("dashboard", "لوحة المعلومات", ["view"], False),
    ("animals", "الحيوانات", ["view", "create", "edit", "delete", "export"], False),
    ("births", "الولادات", ["view", "create", "edit", "delete"], False),
    ("health", "الصحة واللقاحات", ["view", "create", "edit", "delete"], False),
    ("finance", "المالية", ["view", "create", "edit", "approve", "reverse", "delete", "export"], True),
    ("purchases", "المشتريات", ["view", "create", "edit", "approve"], False),
    ("sales", "المبيعات", ["view", "create", "edit", "approve"], False),
    ("parties", "الموردون والعملاء", ["view", "create", "edit", "delete"], False),
    ("partners", "الشركاء", ["view", "create", "edit", "delete"], True),
    ("workers", "حسابات العاملين", ["view", "create", "edit", "settle"], True),
    ("milk", "الحليب", ["view", "create", "edit", "delete"], False),
    ("attachments", "المرفقات والصور", ["view", "create", "delete"], False),
    ("backup", "النسخ الاحتياطي", ["export"], True),
    ("inventory", "المخزون", ["view", "create", "edit", "delete"], False),
    ("assets", "الأصول", ["view", "create", "edit", "delete"], False),
    ("reports", "التقارير", ["view", "export"], False),
    ("settings", "الإعدادات", ["view", "edit"], False),
    ("users", "المستخدمون", ["view", "create", "edit", "delete"], True),
    ("audit", "سجل التدقيق", ["view", "export"], True),
    ("theme", "الهوية البصرية", ["view", "edit"], False),
]

ACTION_LABELS = {
    "view": "عرض",
    "create": "إضافة",
    "edit": "تعديل",
    "delete": "حذف",
    "approve": "اعتماد",
    "reverse": "عكس القيد",
    "export": "تصدير",
    "settle": "تسديد",
}

# Roles created for every new farm. They are ordinary rows: rename them, change
# their permissions, or add your own.
DEFAULT_ROLES = [
    ("owner", "Owner", "صاحب المزرعة", "*"),
    (
        "partner",
        "Partner",
        "شريك",
        [
            "dashboard.view", "animals.view", "births.view", "health.view",
            "finance.view", "purchases.view", "sales.view", "parties.view",
            "partners.view", "milk.view", "inventory.view", "assets.view",
            "attachments.view", "reports.view", "reports.export",
        ],
    ),
    (
        "manager",
        "Manager",
        "مدير",
        [
            "dashboard.view", "animals.view", "animals.create", "animals.edit", "animals.export",
            "births.view", "births.create", "births.edit",
            "health.view", "health.create", "health.edit",
            "finance.view", "finance.create", "finance.edit", "finance.approve", "finance.export",
            "purchases.view", "purchases.create", "purchases.edit", "purchases.approve",
            "sales.view", "sales.create", "sales.edit", "sales.approve",
            "parties.view", "parties.create", "parties.edit",
            "workers.view", "workers.settle",
            "milk.view", "milk.create", "milk.edit",
            "inventory.view", "inventory.create", "inventory.edit",
            "assets.view", "assets.create", "assets.edit",
            "attachments.view", "attachments.create", "attachments.delete",
            "reports.view", "reports.export", "settings.view",
        ],
    ),
    (
        "supervisor",
        "Farm supervisor",
        "مشرف المزرعة",
        [
            "dashboard.view", "animals.view", "animals.create", "animals.edit",
            "births.view", "births.create", "health.view", "health.create",
            "finance.create", "purchases.view", "purchases.create",
            "sales.view", "sales.create", "parties.view", "parties.create",
            "milk.view", "milk.create", "inventory.view", "inventory.create",
            "attachments.view", "attachments.create", "workers.view",
        ],
    ),
    (
        "worker",
        "Worker",
        "عامل",
        [
            "dashboard.view", "animals.view", "animals.create",
            "births.view", "births.create", "health.view", "health.create",
            "finance.create", "purchases.create",
            "milk.view", "milk.create", "inventory.view",
            "attachments.view", "attachments.create",
        ],
    ),
    (
        "accountant",
        "Accountant",
        "محاسب",
        [
            "dashboard.view", "animals.view", "finance.view", "finance.create",
            "finance.edit", "finance.approve", "finance.reverse", "finance.export",
            "purchases.view", "sales.view", "parties.view", "parties.create",
            "parties.edit", "partners.view", "workers.view", "workers.settle",
            "milk.view", "inventory.view", "assets.view", "attachments.view",
            "reports.view", "reports.export", "audit.view",
        ],
    ),
    (
        "viewer",
        "Read only",
        "قراءة فقط",
        [
            "dashboard.view", "animals.view", "births.view", "milk.view",
            "attachments.view", "reports.view",
        ],
    ),
]

CATALOG_TYPES = [
    (CatalogTypeCode.BRANCH, "Branch", "الفرع", False),
    (CatalogTypeCode.ANIMAL_TYPE, "Animal type", "نوع الحيوان", False),
    (CatalogTypeCode.BREED, "Breed", "السلالة", True),
    (CatalogTypeCode.ANIMAL_STATUS, "Animal status", "حالة الحيوان", False),
    (CatalogTypeCode.LOCATION, "Location", "الموقع", True),
    (CatalogTypeCode.EXPENSE_CATEGORY, "Expense category", "بند المصروف", True),
    (CatalogTypeCode.REVENUE_CATEGORY, "Revenue category", "بند الإيراد", True),
    (CatalogTypeCode.PAYMENT_METHOD, "Payment method", "طريقة الدفع", False),
    (CatalogTypeCode.ASSET_TYPE, "Asset type", "نوع الأصل", True),
    (CatalogTypeCode.INVENTORY_CATEGORY, "Inventory category", "تصنيف المخزون", True),
    (CatalogTypeCode.UNIT, "Unit", "وحدة القياس", False),
    (CatalogTypeCode.DISEASE, "Disease", "المرض", True),
    (CatalogTypeCode.VACCINE, "Vaccine", "اللقاح", True),
    (CatalogTypeCode.DEATH_REASON, "Death reason", "سبب النفوق", False),
    (CatalogTypeCode.SALE_REASON, "Sale reason", "سبب البيع", False),
    (CatalogTypeCode.DOCUMENT_TYPE, "Document type", "نوع المستند", False),
    (CatalogTypeCode.MILK_PRODUCT, "Milk product", "منتج الحليب", False),
]

# type code -> [(code, english, arabic, parent code or None[, metadata])]
CATALOG_ITEMS = {
    # The two production branches the farm is run as, plus a row for the costs
    # that belong to neither on their own (electricity, wages, admin).
    CatalogTypeCode.BRANCH: [
        # Each branch numbers its animals from one, so each carries the letters
        # its numbers start with. TR = تربية, TS = تسمين.
        (BranchCode.BREEDING, "Breeding", "التربية", None, {"tag_prefix": "TR"}),
        (BranchCode.FATTENING, "Fattening", "التسمين", None, {"tag_prefix": "TS"}),
        (BranchCode.SHARED, "Shared", "مشترك", None, {}),
    ],
    CatalogTypeCode.ANIMAL_TYPE: [
        ("sheep", "Sheep", "أغنام", None),
        ("goat", "Goat", "ماعز", None),
        ("cow", "Cow", "أبقار", None),
    ],
    CatalogTypeCode.BREED: [
        ("awassi", "Awassi", "عواس", None),
        ("hamdani", "Hamdani", "حمداني", None),
        ("shami_goat", "Shami goat", "ماعز شامي", None),
        ("local", "Local", "بلدي", None),
    ],
    CatalogTypeCode.ANIMAL_STATUS: [
        ("active", "On farm", "موجود", None),
        ("for_sale", "For sale", "مخصص للبيع", None),
        ("reserved", "Reserved", "محجوز", None),
        ("sick", "Sick", "مريض", None),
        ("quarantine", "Quarantine", "حجر صحي", None),
        ("sold", "Sold", "مباع", None),
        ("dead", "Dead", "نافق", None),
        ("lost", "Lost", "مفقود", None),
        ("transferred", "Transferred", "منقول", None),
    ],
    CatalogTypeCode.LOCATION: [
        ("barn_1", "Barn 1", "الحظيرة 1", None),
        ("barn_2", "Barn 2", "الحظيرة 2", None),
        ("pasture", "Pasture", "المرعى", None),
    ],
    CatalogTypeCode.EXPENSE_CATEGORY: [
        ("feed", "Feed", "أعلاف", None),
        ("barley", "Barley", "شعير", "feed"),
        ("corn", "Corn", "ذرة", "feed"),
        ("straw", "Straw", "تبن", "feed"),
        ("concentrate", "Concentrated feed", "أعلاف مركزة", "feed"),
        ("fodder_farming", "Fodder farming", "زراعة الأعلاف", "feed"),
        ("medicine", "Medicine", "أدوية", None),
        ("veterinary", "Veterinary", "بيطرة", None),
        ("wages", "Wages", "أجور عمال", None),
        ("transport", "Transport", "نقل", None),
        ("fuel", "Fuel", "وقود", None),
        ("electricity", "Electricity", "كهرباء", None),
        ("water", "Water", "مياه", None),
        ("maintenance", "Maintenance", "صيانة", None),
        ("construction", "Construction", "بناء", None),
        ("equipment", "Equipment", "معدات", None),
        ("admin", "Administrative", "مصاريف إدارية", None),
    ],
    CatalogTypeCode.REVENUE_CATEGORY: [
        ("animal_sale", "Animal sales", "بيع حيوانات", None),
        ("milk", "Milk", "بيع حليب", None),
        ("dairy", "Dairy products", "بيع مشتقات الحليب", "milk"),
        ("wool", "Wool", "بيع صوف", None),
        ("manure", "Manure", "بيع سماد", None),
        ("services", "Services", "خدمات", None),
        ("other_income", "Other income", "دخل آخر", None),
    ],
    CatalogTypeCode.PAYMENT_METHOD: [
        ("cash", "Cash", "نقدًا", None),
        ("bank", "Bank transfer", "حوالة بنكية", None),
        ("exchange", "Money exchange", "حوالة صرافة", None),
        ("credit", "On credit", "على الحساب", None),
    ],
    CatalogTypeCode.ASSET_TYPE: [
        ("building", "Building", "مباني", None),
        ("barn", "Barn", "حظائر", None),
        ("vehicle", "Vehicle", "سيارات", None),
        ("tractor", "Tractor", "جرارات", None),
        ("pump", "Pump", "مضخات", None),
        ("generator", "Generator", "مولدات", None),
        ("tank", "Water tank", "خزانات مياه", None),
        ("fence", "Fence", "أسوار", None),
        ("land", "Land", "أراضي", None),
    ],
    CatalogTypeCode.INVENTORY_CATEGORY: [
        ("feed_stock", "Feed", "أعلاف", None),
        ("medicine_stock", "Medicine", "أدوية", None),
        ("vaccine_stock", "Vaccines", "لقاحات", None),
        ("tools", "Tools", "أدوات", None),
        ("spare_parts", "Spare parts", "قطع غيار", None),
    ],
    CatalogTypeCode.UNIT: [
        ("kg", "Kilogram", "كغ", None),
        ("ton", "Ton", "طن", None),
        ("bag", "Bag", "كيس", None),
        ("liter", "Liter", "لتر", None),
        ("piece", "Piece", "قطعة", None),
        ("dose", "Dose", "جرعة", None),
    ],
    CatalogTypeCode.VACCINE: [
        ("enterotoxemia", "Enterotoxemia", "التسمم المعوي", None),
        ("brucella", "Brucellosis", "البروسيلا", None),
        ("fmd", "Foot and mouth", "الحمى القلاعية", None),
        ("sheep_pox", "Sheep pox", "جدري الأغنام", None),
    ],
    CatalogTypeCode.DISEASE: [
        ("pneumonia", "Pneumonia", "التهاب رئوي", None),
        ("diarrhea", "Diarrhea", "إسهال", None),
        ("mastitis", "Mastitis", "التهاب الضرع", None),
        ("parasites", "Parasites", "طفيليات", None),
    ],
    CatalogTypeCode.DEATH_REASON: [
        ("disease", "Disease", "مرض", None),
        ("birth_complication", "Birth complication", "تعسر ولادة", None),
        ("accident", "Accident", "حادث", None),
        ("predator", "Predator", "افتراس", None),
        ("unknown", "Unknown", "غير معروف", None),
    ],
    CatalogTypeCode.SALE_REASON: [
        ("routine", "Routine sale", "بيع اعتيادي", None),
        ("culling", "Culling", "استبعاد", None),
        ("cash_need", "Cash need", "حاجة نقدية", None),
        ("age", "Old age", "كبر السن", None),
    ],
    CatalogTypeCode.MILK_PRODUCT: [
        ("raw_milk", "Raw milk", "حليب خام", None),
        ("cheese", "Cheese", "جبنة", None),
        ("yoghurt", "Yoghurt", "لبن", None),
        ("labneh", "Labneh", "لبنة", None),
        ("ghee", "Ghee", "سمنة", None),
        ("cream", "Cream", "قشطة", None),
    ],
    CatalogTypeCode.DOCUMENT_TYPE: [
        ("invoice", "Invoice", "فاتورة", None),
        ("receipt", "Receipt", "إيصال", None),
        ("contract", "Contract", "عقد", None),
        ("certificate", "Certificate", "شهادة", None),
    ],
}

# Built-in animal fields exposed to the form builder: the admin can rename,
# reorder, require or hide them without touching the database columns.
ANIMAL_BUILTIN_FIELDS = [
    ("tag", "Animal number", "رقم الحيوان", FieldType.TEXT, True, True),
    ("name", "Name", "الاسم", FieldType.TEXT, False, False),
    ("branch", "Branch", "الفرع", FieldType.DROPDOWN, False, True),
    ("animal_type", "Type", "النوع", FieldType.DROPDOWN, True, True),
    ("breed", "Breed", "السلالة", FieldType.DROPDOWN, False, True),
    ("sex", "Sex", "الجنس", FieldType.DROPDOWN, True, True),
    ("birth_date", "Birth date", "تاريخ الميلاد", FieldType.DATE, False, True),
    ("mother", "Mother", "الأم", FieldType.RELATION, False, False),
    ("father", "Father", "الأب", FieldType.RELATION, False, False),
    ("status", "Status", "الحالة", FieldType.DROPDOWN, True, True),
    ("location", "Location", "الموقع", FieldType.DROPDOWN, False, False),
    ("current_weight", "Weight (kg)", "الوزن (كغ)", FieldType.DECIMAL, False, False),
    ("color", "Color", "اللون", FieldType.TEXT, False, False),
    ("ear_tag", "Ear tag", "رقم الأذن", FieldType.TEXT, False, False),
    ("chip_number", "Chip number", "رقم الشريحة", FieldType.TEXT, False, False),
    ("purchase_price", "Purchase price", "سعر الشراء", FieldType.CURRENCY, False, False),
    ("notes", "Notes", "ملاحظات", FieldType.LONG_TEXT, False, False),
]

EXPENSE_BUILTIN_FIELDS = [
    ("amount", "Amount", "المبلغ", FieldType.CURRENCY, True, True),
    ("date", "Date", "التاريخ", FieldType.DATE, True, True),
    ("category", "Category", "البند", FieldType.DROPDOWN, True, True),
    ("branch", "Branch", "الفرع", FieldType.DROPDOWN, False, True),
    ("paid_from", "Paid from", "مصدر الدفع", FieldType.DROPDOWN, True, True),
    ("supplier", "Supplier", "المورد", FieldType.RELATION, False, False),
    ("animal", "Related animal", "الحيوان المرتبط", FieldType.RELATION, False, False),
    ("memo", "Notes", "ملاحظات", FieldType.LONG_TEXT, False, False),
    ("attachment", "Receipt", "صورة الفاتورة", FieldType.IMAGE, False, False),
]


@transaction.atomic
def seed_currencies():
    for code, name, symbol, places in CURRENCIES:
        Currency.objects.get_or_create(
            code=code, defaults={"name": name, "symbol": symbol, "decimal_places": places}
        )


@transaction.atomic
def seed_permissions():
    created = []
    for module, module_ar, actions, sensitive in PERMISSION_MODULES:
        for action in actions:
            code = f"{module}.{action}"
            permission, was_new = Permission.objects.update_or_create(
                code=code,
                defaults={
                    "module": module,
                    "action": action,
                    "label": f"{action.title()} {module}",
                    "label_ar": f"{ACTION_LABELS.get(action, action)} - {module_ar}",
                    "is_sensitive": sensitive,
                },
            )
            if was_new:
                created.append(permission)
    return created


@transaction.atomic
def seed_catalog_types():
    for code, name, name_ar, allows_children in CATALOG_TYPES:
        CatalogType.objects.update_or_create(
            code=code,
            defaults={"name": name, "name_ar": name_ar, "allows_children": allows_children},
        )


@transaction.atomic
def seed_roles(farm):
    all_permissions = list(Permission.objects.all())
    by_code = {p.code: p for p in all_permissions}
    roles = []
    for code, name, name_ar, codes in DEFAULT_ROLES:
        role, _ = Role.objects.get_or_create(
            farm=farm,
            code=code,
            defaults={"name": name, "name_ar": name_ar, "is_system": True},
        )
        wanted = all_permissions if codes == "*" else [by_code[c] for c in codes if c in by_code]
        role.permissions.set(wanted)
        roles.append(role)
    return roles


@transaction.atomic
def seed_catalog_items(farm):
    created = {}
    for type_code, rows in CATALOG_ITEMS.items():
        catalog_type = CatalogType.objects.get(code=type_code)
        for order, row in enumerate(rows):
            code, name, name_ar, parent_code = row[:4]
            metadata = row[4] if len(row) > 4 else {}
            parent = created.get((type_code, parent_code)) if parent_code else None
            item, _ = CatalogItem.objects.get_or_create(
                farm=farm,
                type=catalog_type,
                code=code,
                defaults={
                    "name": name,
                    "name_ar": name_ar,
                    "parent": parent,
                    "sort_order": order * 10,
                    "is_system": True,
                    "metadata": dict(metadata),
                },
            )
            # A row seeded before this key existed still needs it. Only the
            # missing keys are filled, so anything the farm set is left alone.
            missing = {key: value for key, value in metadata.items() if key not in item.metadata}
            if missing:
                item.metadata.update(missing)
                item.save(update_fields=["metadata", "updated_at", "updated_by"])
            created[(type_code, code)] = item
    return created


# One store per production branch: the two are physically separate, so what
# each branch eats is never inferred from a shared pile.
DEFAULT_STORES = [
    ("Breeding feed store", "مستودع أعلاف التربية", BranchCode.BREEDING),
    ("Fattening feed store", "مستودع أعلاف التسمين", BranchCode.FATTENING),
]

DEFAULT_INVENTORY_ITEMS = [
    ("Barley", "شعير", "feed_stock", "kg"),
    ("Bran", "نخالة", "feed_stock", "kg"),
    ("Straw", "تبن", "feed_stock", "kg"),
    ("Concentrate", "علف مركز", "feed_stock", "kg"),
    ("Corn", "ذرة", "feed_stock", "kg"),
]


@transaction.atomic
def seed_inventory(farm):
    """A feed store for each branch, and the usual things kept in them."""
    from apps.inventory.models import InventoryItem, InventoryStore
    from apps.inventory.services import create_store

    branches = {
        item.code: item
        for item in CatalogItem.objects.filter(farm=farm, type_id=CatalogTypeCode.BRANCH)
    }
    for order, (name, name_ar, branch_code) in enumerate(DEFAULT_STORES):
        if InventoryStore.all_objects.filter(farm=farm, name=name).exists():
            continue
        create_store(
            farm,
            name=name,
            name_ar=name_ar,
            branch=branches.get(branch_code),
            sort_order=order * 10,
        )

    categories = {
        item.code: item
        for item in CatalogItem.objects.filter(farm=farm, type_id=CatalogTypeCode.INVENTORY_CATEGORY)
    }
    units = {
        item.code: item
        for item in CatalogItem.objects.filter(farm=farm, type_id=CatalogTypeCode.UNIT)
    }
    for order, (name, name_ar, category_code, unit_code) in enumerate(DEFAULT_INVENTORY_ITEMS):
        InventoryItem.objects.get_or_create(
            farm=farm,
            name=name,
            defaults={
                "name_ar": name_ar,
                "category": categories.get(category_code),
                "unit": units.get(unit_code),
                "sort_order": order * 10,
            },
        )


@transaction.atomic
def seed_field_definitions(farm):
    def build(entity, rows):
        for order, (key, label, label_ar, field_type, required, in_list) in enumerate(rows):
            FieldDefinition.objects.get_or_create(
                farm=farm,
                entity=entity,
                key=key,
                defaults={
                    "label": label,
                    "label_ar": label_ar,
                    "field_type": field_type,
                    "is_builtin": True,
                    "is_required": required,
                    "show_in_list": in_list,
                    "sort_order": order * 10,
                },
            )

    build(EntityType.ANIMAL, ANIMAL_BUILTIN_FIELDS)
    build(EntityType.EXPENSE, EXPENSE_BUILTIN_FIELDS)


@transaction.atomic
def bootstrap_farm(*, name, slug, currency_code="USD", timezone="Asia/Damascus"):
    """Create a farm with everything it needs to be usable on day one."""
    from apps.theme.services import create_default

    seed_currencies()
    seed_permissions()
    seed_catalog_types()

    currency = Currency.objects.get(code=currency_code)
    farm, created = Farm.objects.get_or_create(
        slug=slug,
        defaults={"name": name, "base_currency": currency, "timezone": timezone},
    )
    seed_chart_of_accounts(farm, currency)
    seed_catalog_items(farm)
    seed_roles(farm)
    seed_field_definitions(farm)
    seed_inventory(farm)
    if not farm.theme_set.filter(status="published").exists():
        create_default(farm)
    return farm, created
