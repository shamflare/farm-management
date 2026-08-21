"""Bring farms created before the two-branch split up to date.

New rows only: the branch and milk-product lists, the milk, feed and stock
loss accounts, the milk permission, and one feed store per branch. Existing
data is left exactly where it is - animals and ledger lines simply carry no
branch until someone assigns one.
"""
from django.db import migrations


def seed_existing_farms(apps, schema_editor):
    from apps.accounts.models import Permission, Role
    from apps.core.models import Farm
    from apps.core.seed import (
        DEFAULT_ROLES,
        seed_catalog_items,
        seed_catalog_types,
        seed_field_definitions,
        seed_inventory,
        seed_permissions,
    )
    from apps.ledger.chart import seed_chart_of_accounts

    seed_permissions()
    seed_catalog_types()

    by_code = {permission.code: permission for permission in Permission.objects.all()}
    everything = list(by_code.values())

    for farm in Farm.objects.all():
        seed_chart_of_accounts(farm, farm.base_currency)
        seed_catalog_items(farm)
        seed_field_definitions(farm)
        seed_inventory(farm)

        # Grant the new milk permission to the roles that should have it,
        # without touching whatever else an admin has changed on those roles.
        for code, _name, _name_ar, codes in DEFAULT_ROLES:
            role = Role.objects.filter(farm=farm, code=code).first()
            if role is None:
                continue
            wanted = everything if codes == "*" else [
                by_code[permission] for permission in codes if permission in by_code
            ]
            role.permissions.add(*wanted)


def noop(apps, schema_editor):
    """Nothing to undo: the rows added here are safe to keep."""


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_initial"),
        ("accounts", "0003_finance_delete_permission"),
        ("catalog", "0001_initial"),
        ("customfields", "0001_initial"),
        ("ledger", "0002_ledgerline_branch_and_more"),
        ("inventory", "0001_initial"),
        ("animals", "0002_animal_branch_alter_animalevent_event_type_and_more"),
    ]

    operations = [migrations.RunPython(seed_existing_farms, noop)]
