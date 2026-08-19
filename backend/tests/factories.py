"""Shared test setup: a farm with its chart of accounts, catalog and roles."""
from apps.accounts.models import Membership, Role, User
from apps.catalog.models import CatalogItem, CatalogTypeCode
from apps.core.seed import bootstrap_farm
from apps.ledger import chart


def make_farm(slug="test-farm", name="مزرعة الاختبار"):
    farm, _ = bootstrap_farm(name=name, slug=slug, currency_code="USD")
    return farm


def make_user(username, farm, role_code="owner", password="test1234"):
    user = User.objects.create_user(username=username, password=password, full_name=username)
    user.last_farm = farm
    user.save()
    role = Role.objects.get(farm=farm, code=role_code)
    Membership.objects.create(user=user, farm=farm, role=role)
    return user


def catalog(farm, type_code, code):
    return CatalogItem.objects.get(farm=farm, type_id=type_code, code=code)


def cash(farm):
    return chart.get(farm, chart.CASH)


def sheep_type(farm):
    return catalog(farm, CatalogTypeCode.ANIMAL_TYPE, "sheep")


def expense_category(farm, code="feed"):
    return catalog(farm, CatalogTypeCode.EXPENSE_CATEGORY, code)
