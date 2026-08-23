"""Hand the owner an empty farm to start entering their own data into.

Run:  python manage.py empty_farm --slug al-amal

What goes:  animals, births, weights, health records, journal entries, all
            purchases and sales, stock movements, milk, people (partners,
            workers, suppliers, customers), founding costs, attachments and
            the audit trail.
What stays: the farm itself, the logins and their roles, the branches and
            lists, the chart of accounts, the form fields, the feed stores and
            their items, and the theme.

So the first screen after this command is a working farm with nothing in it -
not a blank database that cannot record anything.
"""
import sys

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import Farm
from apps.core.purge import empty_farm
from apps.core.seed import bootstrap_farm


class Command(BaseCommand):
    help = "Erase everything recorded in a farm, keep the farm set up and usable."

    def add_arguments(self, parser):
        parser.add_argument("--slug", default="al-amal", help="معرّف المزرعة المراد إفراغها")
        parser.add_argument(
            "--yes",
            action="store_true",
            help="نفّذ بلا سؤال (للاستخدام داخل سكربت).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # طرفية ويندوز تفتح بترميز لا يعرف العربية، فتنفجر عند أول حرف تطبعه
        # ويُلغى العمل كله بعد أن تمّ. الترميز يُضبط أولًا، قبل أي كلمة.
        for stream in (sys.stdout, sys.stderr):
            try:
                stream.reconfigure(encoding="utf-8")
            except (AttributeError, ValueError):  # pragma: no cover - بيئة غريبة
                pass

        slug = options["slug"]
        farm = Farm.all_objects.filter(slug=slug).first()
        if farm is None:
            self.stderr.write(self.style.ERROR(f"لا توجد مزرعة بالمعرّف '{slug}'"))
            return

        if not options["yes"]:
            answer = input(
                f"سيُمحى كل ما سُجّل في «{farm.name}» ولا يمكن التراجع. اكتب yes للمتابعة: "
            )
            if answer.strip().lower() not in {"y", "yes", "نعم"}:
                self.stdout.write("أُلغي الأمر.")
                return

        removed = empty_farm(farm)

        # يُعيد ما قد يكون نقص من الإعداد (حساب، قائمة، مستودع) دون أن يلمس
        # ما هو موجود — فالمزرعة تخرج من الأمر جاهزة للاستعمال لا ناقصة.
        bootstrap_farm(
            name=farm.name,
            slug=farm.slug,
            currency_code=farm.base_currency_id,
            timezone=farm.timezone,
        )

        self.stdout.write(self.style.SUCCESS(f"أُفرغت «{farm.name}» — حُذف {removed} سجلًا."))
        self.stdout.write("بقيت: حسابات الدخول والأدوار، الفروع والقوائم، دليل الحسابات،")
        self.stdout.write("      حقول النماذج، مستودعات الأعلاف وأصنافها، والهوية البصرية.")
