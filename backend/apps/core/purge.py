"""Erasing a farm's rows, for real.

Deleting a farm is not a normal operation - the whole system is built so that
financial history cannot be removed. So the erasing lives here, in one place,
named for what it does, and used only by the two commands that are allowed to
do it: rebuilding the demo farm, and handing the owner an empty farm to start
entering their own data into.
"""
from django.apps import apps as django_apps
from django.db import models
from django.db.models.deletion import ProtectedError

from apps.core.models import Farm

# The rows that describe *how the farm works* rather than *what happened in
# it*: branches and lists, the chart of accounts, roles, form fields, the
# theme. Emptying a farm keeps these, so the owner opens a clean farm that is
# still usable instead of a blank one that cannot record anything.
CONFIG_MODELS = {
    "catalog.CatalogType",
    "catalog.CatalogItem",
    "ledger.Account",
    "accounts.Role",
    "accounts.Permission",
    "accounts.Membership",
    "customfields.FieldDefinition",
    "theme.Theme",
    "core.Currency",
    "core.ExchangeRate",
    "core.Farm",
    # مستودعات الأعلاف وأصنافها وصف لتنظيم المزرعة؛ ما يُمحى هو الحركات
    # عليها، فتعود الأرصدة إلى صفر والمستودعات في مكانها.
    "inventory.InventoryStore",
    "inventory.InventoryItem",
}


def farm_scoped_models(exclude=()):
    """Every model that hangs off a farm, optionally minus a named set."""
    excluded = set(exclude)
    return [
        model
        for model in django_apps.get_models()
        if model is not Farm
        and model._meta.label not in excluded
        and any(
            field.name == "farm" and field.many_to_one and field.related_model is Farm
            for field in model._meta.get_fields()
        )
    ]


def _break_optional_links(models_to_clear, farm):
    """Null the optional PROTECT keys that make the tables un-deletable.

    A reversal points at the entry it reversed, a catalog row at its parent, a
    document at its journal entry. Every one of those is optional, so clearing
    it costs nothing and leaves the tables free to be emptied in any order.
    """
    for model in models_to_clear:
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


def _sweep(models_to_clear, farm):
    """Delete farm rows table by table until a full pass removes nothing.

    A hard delete trips over the PROTECT keys that guard financial history -
    which is exactly what they are for. So the rows go in whatever order the
    database will accept, and the loop keeps trying until the blocked tables
    unblock each other.
    """
    removed_total = 0
    remaining = list(models_to_clear)
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
        removed_total += removed
        if not blocked:
            break
        if removed == 0:
            names = ", ".join(model.__name__ for model in blocked)
            raise RuntimeError(f"cannot clear the farm; blocked by {names}")
        remaining = blocked
    return removed_total


def _drop_orphan_party_accounts(farm):
    """Remove the ledger accounts that belonged to people who are now gone.

    Every supplier, worker or partner gets their own account under the standard
    parent ("ذمم دائنة - أبو محمد"). Emptying the farm removes the people, and
    an account named after someone who no longer exists is noise in the chart -
    so it goes with them. Only childless accounts with no lines are touched,
    which after an emptying is exactly the party accounts and nothing else.
    """
    from apps.ledger.models import Account

    parents = ["1050", "1100", "2100", "2200", "3100", "3200"]
    orphans = Account.all_objects.filter(farm=farm, parent__code__in=parents).exclude(
        lines__isnull=False
    )
    removed = orphans.count()
    if removed:
        orphans.hard_delete() if hasattr(orphans, "hard_delete") else orphans.delete()
    return removed


def empty_farm(farm):
    """Remove everything that happened in this farm, keep how it is set up.

    Animals, journal entries, stock movements, milk, people's files, founding
    costs and the audit trail all go. Branches, lists, accounts, roles, form
    fields, users and the theme stay, so the owner can start entering real
    data the moment the command finishes.
    """
    targets = farm_scoped_models(exclude=CONFIG_MODELS)
    _break_optional_links(targets, farm)
    removed = _sweep(targets, farm)
    return removed + _drop_orphan_party_accounts(farm)


def purge_farm(slug):
    """Erase a farm completely, so its slug is free to be reused.

    A soft delete would leave the slug taken and the next bootstrap would
    collide with it, so this goes all the way down to the farm row itself.
    Returns True when a farm was found and removed.
    """
    farm = Farm.all_objects.filter(slug=slug).first()
    if farm is None:
        return False

    targets = farm_scoped_models()
    _break_optional_links(targets, farm)
    _sweep(targets, farm)
    Farm.all_objects.filter(id=farm.id).hard_delete()
    return True
