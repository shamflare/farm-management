"""Add the finance.delete permission and grant it to existing owner roles.

Seeding only runs for a new farm, so a farm created before this permission
existed would never see it. Owner roles are seeded with every permission there
is, which is what this restores for them; other roles are left exactly as the
farm configured them.
"""
from django.db import migrations


def add_permission(apps, schema_editor):
    Permission = apps.get_model("accounts", "Permission")
    Role = apps.get_model("accounts", "Role")

    permission, _ = Permission.objects.update_or_create(
        code="finance.delete",
        defaults={
            "module": "finance",
            "action": "delete",
            "label": "Delete finance",
            "label_ar": "حذف - المالية",
            "is_sensitive": True,
        },
    )
    for role in Role.objects.filter(code="owner"):
        role.permissions.add(permission)


def remove_permission(apps, schema_editor):
    apps.get_model("accounts", "Permission").objects.filter(code="finance.delete").delete()


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_initial")]
    operations = [migrations.RunPython(add_permission, remove_permission)]
