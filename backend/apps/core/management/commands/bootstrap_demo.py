"""Seed the demo farm once, on a database that has none yet.

Free hosting has no shell, so the first deploy has to seed itself from the
start command. That command runs again on every restart, which is why this
wrapper checks for an existing farm first: `seed_demo` posts real ledger
entries, and running it twice would double the farm's financial history.

Run:  python manage.py bootstrap_demo
"""
import os

from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.core.models import Farm


class Command(BaseCommand):
    help = "Seed the demo farm if the database is still empty, then set demo passwords."

    def handle(self, *args, **options):
        if Farm.all_objects.exists():
            self.stdout.write("database already holds a farm — nothing seeded")
        else:
            self.stdout.write("empty database — seeding the demo farm")
            call_command("seed_demo")

        self._apply_demo_password()

    def _apply_demo_password(self):
        """Give the demo logins the password chosen for this deployment.

        The seed hardcodes a well-known password, which is fine on a laptop and
        not fine on a public URL. Setting DEMO_PASSWORD replaces it on every
        boot, so rotating the password is a restart rather than a migration.
        """
        password = os.getenv("DEMO_PASSWORD", "")
        if not password:
            self.stdout.write(self.style.WARNING("DEMO_PASSWORD unset — seeded passwords left as they are"))
            return

        users = User.objects.filter(username__in=["owner", "worker", "accountant", "partner"])
        for user in users:
            user.set_password(password)
            user.save(update_fields=["password"])
        self.stdout.write(self.style.SUCCESS(f"demo password applied to {users.count()} logins"))
