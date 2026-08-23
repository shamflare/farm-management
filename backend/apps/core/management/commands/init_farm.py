"""أول إقلاع على خادم جديد: مزرعة فارغة وحساب مالك، ولا شيء غيرهما.

الفرق عن `bootstrap_demo` أن هذا لا يبذر بيانات عرض. الخادم الذي يعمل عليه
صاحب المزرعة فعلًا لا يريد نعاجًا وهمية ولا قيودًا مخترعة: يريد الفروع
والقوائم ودليل الحسابات جاهزة، وحسابًا يدخل به، ثم يبدأ الإدخال.

يُنفَّذ عند كل إقلاع وهو آمن: يُنشئ ما ينقص فقط ولا يلمس ما هو موجود.

Run:  python manage.py init_farm
"""
import os
import sys

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Membership, Role, User
from apps.core.models import Farm
from apps.core.seed import bootstrap_farm


class Command(BaseCommand):
    help = "Create an empty, ready-to-use farm and its owner login if they do not exist yet."

    @transaction.atomic
    def handle(self, *args, **options):
        for stream in (sys.stdout, sys.stderr):
            try:
                stream.reconfigure(encoding="utf-8")
            except (AttributeError, ValueError):  # pragma: no cover
                pass

        slug = os.getenv("FARM_SLUG", "farm").strip() or "farm"
        name = os.getenv("FARM_NAME", "مزرعتي").strip() or "مزرعتي"
        timezone = os.getenv("FARM_TIMEZONE", "Asia/Damascus")

        farm, created = bootstrap_farm(name=name, slug=slug, timezone=timezone)
        if created:
            self.stdout.write(self.style.SUCCESS(f"أُنشئت المزرعة «{farm.name}» فارغة وجاهزة"))
        else:
            self.stdout.write(f"المزرعة «{farm.name}» موجودة — لم يُمسّ شيء فيها")

        self._ensure_owner(farm)

    def _ensure_owner(self, farm):
        username = os.getenv("OWNER_USERNAME", "owner").strip() or "owner"
        password = os.getenv("OWNER_PASSWORD", "")
        full_name = os.getenv("OWNER_NAME", "").strip() or username

        user = User.objects.filter(username=username).first()
        if user is None:
            if not password:
                self.stdout.write(
                    self.style.WARNING(
                        f"لا يوجد حساب «{username}» ولا OWNER_PASSWORD — لن يُنشأ حساب دخول"
                    )
                )
                return
            user = User.objects.create_user(
                username=username, password=password, full_name=full_name
            )
            self.stdout.write(self.style.SUCCESS(f"أُنشئ حساب المالك «{username}»"))
        elif password and os.getenv("OWNER_PASSWORD_RESET", "0") == "1":
            # مخرج من نسيان كلمة المرور: متغيّر واحد وإعادة تشغيل. يبقى خطرًا
            # ما دام مضبوطًا، فالمكان الطبيعي لإطفائه هو بعد أول دخول ناجح.
            user.set_password(password)
            user.save(update_fields=["password"])
            self.stdout.write(self.style.WARNING(f"أُعيدت كلمة مرور «{username}» من OWNER_PASSWORD"))

        user.full_name = user.full_name or full_name
        user.last_farm = user.last_farm or farm
        user.save(update_fields=["full_name", "last_farm"])

        role = Role.objects.get(farm=farm, code="owner")
        membership, made = Membership.objects.get_or_create(
            user=user, farm=farm, defaults={"role": role}
        )
        if made:
            self.stdout.write(self.style.SUCCESS(f"«{username}» صار مالكًا لـ «{farm.name}»"))
