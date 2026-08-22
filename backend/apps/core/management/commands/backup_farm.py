"""Write a farm's backup to a file.

Run:  python manage.py backup_farm --slug al-amal --out backups/
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.core import backup
from apps.core.models import Farm


class Command(BaseCommand):
    help = "Write one farm, or every farm, to a JSON backup file."

    def add_arguments(self, parser):
        parser.add_argument("--slug", default="", help="One farm. Omit for all of them.")
        parser.add_argument("--out", default="backups", help="Directory to write into.")
        parser.add_argument(
            "--pretty", action="store_true", help="Indent the JSON so a human can read it."
        )

    def handle(self, *args, **options):
        farms = Farm.objects.all()
        if options["slug"]:
            farms = farms.filter(slug=options["slug"])
            if not farms.exists():
                raise CommandError(f"no farm with slug '{options['slug']}'")

        directory = Path(options["out"])
        directory.mkdir(parents=True, exist_ok=True)

        for farm in farms:
            payload = backup.to_json(farm, indent=2 if options["pretty"] else None)
            path = directory / backup.filename_for(farm)
            path.write_text(payload, encoding="utf-8")
            size = path.stat().st_size / 1024
            self.stdout.write(
                self.style.SUCCESS(f"{farm.slug}: {path} ({size:.0f} KB)")
            )
