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
from apps.catalog.models import CatalogItem, CatalogTypeCode
from apps.core.models import Farm
from apps.core.seed import bootstrap_farm
from apps.ledger import chart
from apps.ledger.services import cash_position, profit_and_loss, trial_balance
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
            Farm.all_objects.filter(slug=slug).delete()
            self.stdout.write(self.style.WARNING(f"removed existing farm '{slug}'"))

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
        inventory = chart.get(farm, chart.INVENTORY)

        # --- day one: the farm already existed ----------------------------
        record_opening_balances(
            farm,
            date=TODAY - timedelta(days=180),
            assets=[
                {"account": cash, "amount": 10000, "memo": "نقد موجود"},
                {"account": livestock, "amount": 30000, "memo": "قيمة الحيوانات"},
                {"account": fixed_assets, "amount": 75000, "memo": "مباني وسيارات ومعدات"},
                {"account": inventory, "amount": 3000, "memo": "أعلاف موجودة"},
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
                sex=Sex.FEMALE,
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
            notes="شراء 3 نعاج من السوق",
            actor=owner,
        )
        self.stdout.write(f"  purchase total {purchase.total_cost} USD")

        # --- the worker pays from his own pocket --------------------------
        feed = catalog(farm, CatalogTypeCode.EXPENSE_CATEGORY, "barley")
        record_expense(
            farm,
            date=TODAY - timedelta(days=60),
            amount=500,
            category=feed,
            paid_by_party=worker,
            memo="شعير - دفع العامل من ماله الخاص",
            actor=owner,
        )
        settle_with_party(
            farm,
            date=TODAY - timedelta(days=30),
            amount=300,
            party=worker,
            from_account=cash,
            memo="تسديد جزئي للعامل",
            actor=owner,
        )
        self.stdout.write("  worker spent 500, repaid 300")

        # --- ordinary running costs ---------------------------------------
        for days_ago, amount, code, note in [
            (50, 220, "concentrate", "أعلاف مركزة"),
            (40, 90, "medicine", "أدوية"),
            (35, 120, "wages", "أجور"),
            (20, 60, "fuel", "وقود"),
            (10, 75, "veterinary", "زيارة بيطري"),
        ]:
            record_expense(
                farm,
                date=TODAY - timedelta(days=days_ago),
                amount=amount,
                category=catalog(farm, CatalogTypeCode.EXPENSE_CATEGORY, code),
                from_account=cash,
                memo=note,
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

        # --- other income and a death ---------------------------------------
        record_income(
            farm,
            date=TODAY - timedelta(days=15),
            amount=340,
            category=catalog(farm, CatalogTypeCode.REVENUE_CATEGORY, "milk"),
            into_account=cash,
            memo="بيع حليب",
            actor=owner,
        )
        record_animal_death(
            farm,
            animal=bought[1],
            date=TODAY - timedelta(days=3),
            reason=catalog(farm, CatalogTypeCode.DEATH_REASON, "disease"),
            notes="نفوق بسبب مرض",
            actor=owner,
        )

        self._report(farm)

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
