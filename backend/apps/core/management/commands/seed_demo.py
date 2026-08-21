"""Build a realistic demo farm and print the resulting financial position.

Run:  python manage.py seed_demo --reset
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Membership, Role, User
from apps.animals.models import Sex
from apps.animals.services import create_animal, register_birth, add_weight, add_health_record
from apps.assets.services import record_founding_cost
from apps.assets.services import summary as founding_summary
from apps.catalog.models import BranchCode, CatalogItem, CatalogTypeCode
from apps.core.models import Farm
from apps.core.seed import bootstrap_farm
from apps.inventory import services as stock
from apps.inventory.models import InventoryItem, InventoryStore
from apps.ledger import chart
from apps.ledger.services import (
    branch_comparison,
    cash_position,
    profit_and_loss,
    trial_balance,
)
from apps.production import services as milk
from apps.production.models import Milking
from apps.operations.services import (
    purchase_animals,
    record_animal_death,
    record_expense,
    record_income,
    record_opening_balances,
    sell_animals,
    settle_with_party,
)
from apps.parties.models import PartyKind
from apps.parties.services import create_party, party_summary, set_ownership

TODAY = date.today()


def catalog(farm, type_code, code):
    return CatalogItem.objects.get(farm=farm, type_id=type_code, code=code)


class Command(BaseCommand):
    help = "Seed a demo farm with animals, partners, and a full set of transactions."

    def add_arguments(self, parser):
        parser.add_argument("--slug", default="al-amal")
        parser.add_argument("--reset", action="store_true", help="Delete the demo farm first.")

    @transaction.atomic
    def handle(self, *args, **options):
        slug = options["slug"]
        if options["reset"]:
            self._purge_farm(slug)

        farm, _ = bootstrap_farm(name="مزرعة الأمل", slug=slug, currency_code="USD")
        usd = farm.base_currency
        self.stdout.write(self.style.SUCCESS(f"farm ready: {farm.name} ({farm.slug})"))

        # --- people -------------------------------------------------------
        owner = self._user("owner", "أبو محمد - المالك", farm, "owner")
        worker_user = self._user("worker", "خالد - المشرف", farm, "worker")
        self._user("accountant", "سامر - المحاسب", farm, "accountant")
        partner_user = self._user("partner", "أبو أحمد - شريك", farm, "partner")

        # Each person is one identity: the party that holds the money and the
        # login that signs in are linked, so the audit trail reads as one name.
        partner_a = create_party(farm, kind=PartyKind.PARTNER, name="أبو محمد", user=owner)
        partner_b = create_party(farm, kind=PartyKind.PARTNER, name="أبو أحمد", user=partner_user)
        set_ownership(partner_a, 60, effective_from=TODAY - timedelta(days=365))
        set_ownership(partner_b, 40, effective_from=TODAY - timedelta(days=365))

        worker = create_party(farm, kind=PartyKind.WORKER, name="خالد المشرف", user=worker_user)
        supplier = create_party(farm, kind=PartyKind.SUPPLIER, name="معمل الأعلاف")
        customer = create_party(farm, kind=PartyKind.CUSTOMER, name="تاجر السوق")

        cash = chart.get(farm, chart.CASH)
        livestock = chart.get(farm, chart.LIVESTOCK)
        fixed_assets = chart.get(farm, chart.FIXED_ASSETS)

        breeding = catalog(farm, CatalogTypeCode.BRANCH, BranchCode.BREEDING)
        fattening = catalog(farm, CatalogTypeCode.BRANCH, BranchCode.FATTENING)
        shared = catalog(farm, CatalogTypeCode.BRANCH, BranchCode.SHARED)
        breeding_store = InventoryStore.objects.get(farm=farm, branch=breeding)
        fattening_store = InventoryStore.objects.get(farm=farm, branch=fattening)
        barley = InventoryItem.objects.get(farm=farm, name="Barley")
        concentrate = InventoryItem.objects.get(farm=farm, name="Concentrate")

        # --- day one: the farm already existed ----------------------------
        record_opening_balances(
            farm,
            date=TODAY - timedelta(days=180),
            assets=[
                {"account": cash, "amount": 40000, "memo": "نقد موجود"},
                {"account": livestock, "amount": 30000, "memo": "قيمة الحيوانات"},
                {"account": fixed_assets, "amount": 51000, "memo": "مباني وسيارات ومعدات"},
            ],
            liabilities=[
                {"account": supplier.payable_account, "amount": 4000, "memo": "دين للمورد"},
                {"account": worker.payable_account, "amount": 2000, "memo": "مستحق للعامل"},
            ],
            partner_capital=[
                {"party": partner_a, "amount": 60000},
                {"party": partner_b, "amount": 40000},
            ],
            actor=owner,
        )
        self.stdout.write("  opening balances recorded")

        # --- animals ------------------------------------------------------
        sheep = catalog(farm, CatalogTypeCode.ANIMAL_TYPE, "sheep")
        awassi = catalog(farm, CatalogTypeCode.BREED, "awassi")
        barn = catalog(farm, CatalogTypeCode.LOCATION, "barn_1")

        ewes = [
            create_animal(
                farm,
                animal_type=sheep,
                breed=awassi,
                sex=Sex.FEMALE,
                branch=breeding,
                birth_date=TODAY - timedelta(days=900),
                location=barn,
                acquisition="opening",
                entered_at=TODAY - timedelta(days=180),
                name=f"نعجة {i + 1}",
                actor=owner,
            )
            for i in range(8)
        ]
        ram = create_animal(
            farm,
            animal_type=sheep,
            breed=awassi,
            sex=Sex.MALE,
            branch=breeding,
            birth_date=TODAY - timedelta(days=1100),
            location=barn,
            acquisition="opening",
            entered_at=TODAY - timedelta(days=180),
            name="الكبش",
            actor=owner,
        )
        self.stdout.write(f"  registered {len(ewes) + 1} animals")

        # --- a purchase paid in cash --------------------------------------
        bought = [
            create_animal(
                farm,
                animal_type=sheep,
                breed=awassi,
                sex=Sex.MALE,
                branch=fattening,
                birth_date=TODAY - timedelta(days=500),
                location=barn,
                acquisition="purchased",
                entered_at=TODAY - timedelta(days=120),
                actor=owner,
            )
            for _ in range(3)
        ]
        purchase = purchase_animals(
            farm,
            date=TODAY - timedelta(days=120),
            items=[{"animal": animal, "unit_price": 180} for animal in bought],
            supplier=supplier,
            transport_cost=45,
            commission_cost=15,
            from_account=cash,
            notes="شراء 3 خراف للتسمين",
            actor=owner,
        )
        self.stdout.write(f"  purchase total {purchase.total_cost} USD (fattening)")

        # --- feed: bought into a store, charged the day it is eaten -------
        stock.receive_stock(
            farm,
            store=breeding_store,
            item=barley,
            date=TODAY - timedelta(days=60),
            quantity=2000,
            total_cost=500,
            paid_by_party=worker,
            memo="شعير للتربية - دفع العامل من ماله الخاص",
            actor=owner,
        )
        stock.receive_stock(
            farm,
            store=fattening_store,
            item=concentrate,
            date=TODAY - timedelta(days=55),
            quantity=1500,
            total_cost=750,
            supplier=supplier,
            memo="علف مركز للتسمين - على حساب المورد",
            actor=owner,
        )
        for days_ago, quantity in ((45, 400), (30, 450), (15, 500)):
            stock.issue_stock(
                farm,
                store=breeding_store,
                item=barley,
                date=TODAY - timedelta(days=days_ago),
                quantity=quantity,
                memo="علف النعاج",
                actor=owner,
            )
        for days_ago, quantity in ((40, 350), (20, 400)):
            stock.issue_stock(
                farm,
                store=fattening_store,
                item=concentrate,
                date=TODAY - timedelta(days=days_ago),
                quantity=quantity,
                memo="علف التسمين",
                actor=owner,
            )
        self.stdout.write("  feed received into both stores, issued to each branch")
        settle_with_party(
            farm,
            date=TODAY - timedelta(days=30),
            amount=300,
            party=worker,
            from_account=cash,
            memo="تسديد جزئي للعامل",
            actor=owner,
        )
        self.stdout.write("  worker spent 500 on feed, repaid 300")

        # --- ordinary running costs ---------------------------------------
        for days_ago, amount, code, note, which in [
            (48, 180, "fodder_farming", "زراعة أعلاف", breeding),
            (40, 90, "medicine", "أدوية", breeding),
            (35, 120, "wages", "أجور", shared),
            (20, 60, "fuel", "وقود", shared),
            (10, 75, "veterinary", "زيارة بيطري", fattening),
        ]:
            record_expense(
                farm,
                date=TODAY - timedelta(days=days_ago),
                amount=amount,
                category=catalog(farm, CatalogTypeCode.EXPENSE_CATEGORY, code),
                from_account=cash,
                memo=note,
                branch=which,
                actor=owner,
            )

        # a medicine charged to one specific animal
        add_health_record(
            ewes[0],
            kind="treatment",
            happened_on=TODAY - timedelta(days=25),
            item=catalog(farm, CatalogTypeCode.DISEASE, "mastitis"),
            cost=20,
            from_account=cash,
            veterinarian="د. أحمد",
            notes="علاج التهاب الضرع",
            actor=owner,
        )
        add_weight(ewes[0], weight_kg=Decimal("54.500"), measured_on=TODAY - timedelta(days=5))

        # --- births --------------------------------------------------------
        birth, lambs = register_birth(
            farm,
            mother=ewes[0],
            father=ram,
            happened_on=TODAY - timedelta(days=45),
            offspring=[{"sex": Sex.MALE}, {"sex": Sex.FEMALE}],
            actor=owner,
        )
        register_birth(
            farm,
            mother=ewes[1],
            father=ram,
            happened_on=TODAY - timedelta(days=20),
            offspring=[{"sex": Sex.FEMALE}],
            stillborn=1,
            actor=owner,
        )
        self.stdout.write(f"  births recorded, {len(lambs)} lambs from {ewes[0].tag}")

        # --- a sale, partly on credit ---------------------------------------
        sale = sell_animals(
            farm,
            date=TODAY - timedelta(days=7),
            items=[{"animal": bought[0], "unit_price": 260, "weight_kg": Decimal("48.000")}],
            customer=customer,
            received_amount=200,
            into_account=cash,
            transport_cost=10,
            sale_reason=catalog(farm, CatalogTypeCode.SALE_REASON, "routine"),
            notes="بيع نعجة للتاجر",
            actor=owner,
        )
        self.stdout.write(f"  sale {sale.total_price} USD, received {sale.received_amount}")

        # The breeding branch earns from two different things, and the owner
        # reads them apart: a lamb raised and sold, and an ewe taken out of the
        # flock. Each lands on its own revenue line without being told to.
        sell_animals(
            farm,
            date=TODAY - timedelta(days=5),
            items=[{"animal": lambs[0], "unit_price": 190}],
            into_account=cash,
            sale_reason=catalog(farm, CatalogTypeCode.SALE_REASON, "routine"),
            notes="بيع مولود",
            actor=owner,
        )
        sell_animals(
            farm,
            date=TODAY - timedelta(days=4),
            items=[{"animal": ewes[7], "unit_price": 150}],
            into_account=cash,
            sale_reason=catalog(farm, CatalogTypeCode.SALE_REASON, "culling"),
            notes="بيع نعجة فرزة",
            actor=owner,
        )
        self.stdout.write("  lamb sale and cull sale recorded on separate revenue lines")

        # --- the milk: logged every day, sold twice -------------------------
        for days_ago in range(30, 0, -1):
            liters = 26 + (days_ago % 5) * 2
            milk.record_production(
                farm,
                date=TODAY - timedelta(days=days_ago),
                liters=liters,
                branch=breeding,
                session=Milking.DAY,
                milking_animals=8,
                actor=owner,
            )
        raw_milk = catalog(farm, CatalogTypeCode.MILK_PRODUCT, "raw_milk")
        cheese = catalog(farm, CatalogTypeCode.MILK_PRODUCT, "cheese")
        liter = catalog(farm, CatalogTypeCode.UNIT, "liter")
        kg = catalog(farm, CatalogTypeCode.UNIT, "kg")
        milk.record_sale(
            farm,
            date=TODAY - timedelta(days=15),
            quantity=600,
            unit_price=Decimal("0.90"),
            product=raw_milk,
            unit=liter,
            branch=breeding,
            customer=customer,
            into_account=cash,
            notes="بيع حليب خام",
            actor=owner,
        )
        milk.record_sale(
            farm,
            date=TODAY - timedelta(days=6),
            quantity=40,
            unit_price=Decimal("4.50"),
            product=cheese,
            unit=kg,
            branch=breeding,
            into_account=cash,
            notes="بيع جبنة",
            actor=owner,
        )
        self.stdout.write("  30 days of milk logged, two dairy sales recorded")

        # --- what the farm was built with, before it earned anything --------
        for days_ago, name, code, amount, which in [
            (150, "حظيرة التربية", "barn", 12000, breeding),
            (140, "حظيرة التسمين", "barn", 7000, fattening),
            (120, "سياج المزرعة", "fence", 2500, None),
            (100, "خزان مياه", "tank", 900, None),
            (90, "مولدة كهرباء", "generator", 1800, None),
        ]:
            record_founding_cost(
                farm,
                date=TODAY - timedelta(days=days_ago),
                name=name,
                amount=amount,
                asset_type=catalog(farm, CatalogTypeCode.ASSET_TYPE, code),
                branch=which,
                from_account=cash,
                actor=owner,
            )
        self.stdout.write("  founding costs registered")

        # --- a death ---------------------------------------------------------
        record_animal_death(
            farm,
            animal=bought[1],
            date=TODAY - timedelta(days=3),
            reason=catalog(farm, CatalogTypeCode.DEATH_REASON, "disease"),
            notes="نفوق بسبب مرض",
            actor=owner,
        )

        self._report(farm)

    def _purge_farm(self, slug):
        """Erase the demo farm for real, so the slug is free to be reused.

        A soft delete would leave the slug taken and the next bootstrap would
        collide with it. A hard delete trips over the PROTECT keys that guard
        financial history - which is exactly what they are for. So the rows go
        in whatever order the database will accept: keep sweeping the
        farm-scoped tables until a full pass removes nothing more.
        """
        from django.apps import apps as django_apps
        from django.db import models
        from django.db.models.deletion import ProtectedError

        farm = Farm.all_objects.filter(slug=slug).first()
        if farm is None:
            return

        scoped = [
            model
            for model in django_apps.get_models()
            if model is not Farm
            and any(
                field.name == "farm" and field.many_to_one and field.related_model is Farm
                for field in model._meta.get_fields()
            )
        ]

        # Break the loops first: a reversal points at the entry it reversed, a
        # catalog row at its parent, a document at its journal entry. Every one
        # of those is optional, so clearing them costs nothing and leaves the
        # tables free to be emptied in any order.
        for model in scoped:
            optional = [
                field.name
                for field in model._meta.get_fields()
                if (field.many_to_one or field.one_to_one)
                and field.concrete
                and field.null
                and getattr(field.remote_field, "on_delete", None) is models.PROTECT
            ]
            if optional:
                manager = getattr(model, "all_objects", model._default_manager)
                manager.filter(farm=farm).update(**{name: None for name in optional})

        remaining = list(scoped)
        while remaining:
            blocked = []
            removed = 0
            for model in remaining:
                manager = getattr(model, "all_objects", model._default_manager)
                rows = manager.filter(farm=farm)
                try:
                    count = rows.count()
                    if count == 0:
                        continue
                    if hasattr(rows, "hard_delete"):
                        rows.hard_delete()
                    else:
                        rows.delete()
                    removed += count
                except ProtectedError:
                    blocked.append(model)
            if not blocked:
                break
            if removed == 0:
                names = ", ".join(model.__name__ for model in blocked)
                raise RuntimeError(f"cannot clear the demo farm; blocked by {names}")
            remaining = blocked

        Farm.all_objects.filter(id=farm.id).hard_delete()
        self.stdout.write(self.style.WARNING(f"removed existing farm '{slug}'"))

    def _user(self, username, full_name, farm, role_code):
        user, created = User.objects.get_or_create(
            username=username, defaults={"full_name": full_name}
        )
        if created:
            user.set_password("farm1234")
            user.full_name = full_name
            user.last_farm = farm
            user.save()
        role = Role.objects.get(farm=farm, code=role_code)
        Membership.objects.get_or_create(user=user, farm=farm, defaults={"role": role})
        return user

    def _report(self, farm):
        out = self.stdout
        line = "-" * 62
        out.write("")
        out.write(self.style.MIGRATE_HEADING("FINANCIAL POSITION"))
        out.write(line)

        tb = trial_balance(farm)
        status = self.style.SUCCESS("BALANCED") if tb["balanced"] else self.style.ERROR("OUT OF BALANCE")
        out.write(f"trial balance: debit {tb['total_debit']} | credit {tb['total_credit']} -> {status}")

        cash = cash_position(farm)
        out.write(f"cash on hand:  {cash['total']} {farm.base_currency.code}")

        pl = profit_and_loss(farm)
        out.write(
            f"income {pl['total_income']} - expenses {pl['total_expenses']} "
            f"= net {pl['net_profit']} {farm.base_currency.code}"
        )
        out.write(line)

        comparison = branch_comparison(farm)
        for column in comparison["branches"]:
            out.write(
                f"  {column['name']:<10} income {column['total_income']:>10} | "
                f"expenses {column['total_expenses']:>10} | net {column['net_profit']:>10}"
            )
        out.write(f"  founding costs (outside profit): {founding_summary(farm)['total']}")
        out.write(line)

        for row in tb["rows"]:
            if row["balance"]:
                account = row["account"]
                out.write(f"  {account.code:<10} {account.display_name:<28} {row['balance']:>14}")

        out.write(line)
        from apps.parties.models import Party

        for party in Party.objects.filter(farm=farm):
            summary = party_summary(party)
            out.write(
                f"  {summary['kind']:<9} {summary['name']:<16} "
                f"owed to farm {summary['owed_to_farm']:>9} | "
                f"owed by farm {summary['owed_by_farm']:>9} | "
                f"capital {summary['net_capital']:>9}"
            )

        from apps.animals.models import Animal

        animals = Animal.objects.filter(farm=farm)
        out.write(line)
        out.write(
            f"  animals: {animals.count()} total | on farm {animals.filter(is_on_farm=True).count()} | "
            f"females {animals.filter(sex='female').count()} | "
            f"sold {animals.filter(status__code='sold').count()} | "
            f"dead {animals.filter(status__code='dead').count()}"
        )
        out.write("")
        out.write(self.style.SUCCESS("demo ready. users: owner / worker / accountant / partner  (password: farm1234)"))
