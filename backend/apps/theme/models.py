"""Farm branding served from the API.

Colors, fonts, logo, density and corner style live in the database, so changing
the look of the mobile app is a settings change, not a new APK. Each farm keeps
one draft and one published theme; clients only ever read the published one.
"""
from django.db import models

from apps.core.models import FarmScopedModel

DEFAULT_COLORS = {
    "primary": "#166534",
    "primary_contrast": "#FFFFFF",
    "accent": "#CA8A04",
    "success": "#15803D",
    "warning": "#B45309",
    "danger": "#B91C1C",
    "info": "#1D4ED8",
    "background": "#F8FAFC",
    "surface": "#FFFFFF",
    "text": "#0F172A",
    "text_muted": "#475569",
    "border": "#E2E8F0",
    # القائمة الجانبية والشريط العلوي يُلوَّنان على حدة: هما إطار الشاشة الثابت،
    # وكثير من المزارع تريدهما بلون هويتها بينما يبقى المحتوى أبيض هادئًا.
    # القيم الافتراضية هي نفسها لون البطاقات ولون النص، فلا يتغيّر شيء عند
    # الترقية حتى تختار المزرعة غيرها.
    "sidebar": "#FFFFFF",
    "sidebar_text": "#0F172A",
    "header": "#FFFFFF",
    "header_text": "#0F172A",
}

DEFAULT_SIDEBAR = [
    {"key": "dashboard", "label_ar": "الرئيسية", "icon": "home", "permission": ""},
    {"key": "animals", "label_ar": "الحيوانات", "icon": "sheep", "permission": "animals.view"},
    {"key": "finance", "label_ar": "المالية", "icon": "wallet", "permission": "finance.view"},
    {"key": "parties", "label_ar": "الأشخاص", "icon": "users", "permission": "parties.view"},
    {"key": "reports", "label_ar": "التقارير", "icon": "chart", "permission": "reports.view"},
    {"key": "settings", "label_ar": "الإعدادات", "icon": "settings", "permission": "settings.view"},
]

# The cards the dashboard can show. The farm chooses which of them it wants
# and in what order; the labels live in the client that draws them.
DASHBOARD_WIDGETS = [
    "alerts",
    "branches",
    "cash",
    "profit",
    "livestock",
    "worker_due",
    "receivable",
    "payable",
    "births",
    "sold_dead",
    "milk",
    "stock",
    "founding",
    "herd",
    "cash_accounts",
    "partners",
]

DEFAULT_DASHBOARD_WIDGETS = [{"key": key, "visible": True} for key in DASHBOARD_WIDGETS]

# الخطوط التي تختار المزرعة من بينها.
#
# كلها خطوط عربية مفتوحة تُحمَّل من Google Fonts، مرتّبة من الأكثر حيادية إلى
# الأكثر شخصية. القائمة مغلقة عمدًا: خط لا يعرفه المتصفح يعني واجهة تنهار إلى
# خط النظام بلا أن يفهم أحد لماذا، فالتحقق هنا يمنع اختيار ما لا يُحمَّل.
#
# كل مدخلة: (المعرّف، الاسم العربي، وصف قصير، الطابع)
FONT_CATALOG = [
    ("Cairo", "القاهرة", "خط الواجهة الافتراضي — واضح ومتوازن", "sans"),
    ("Tajawal", "تجوال", "هندسي أنيق، حروفه مفتوحة ومريحة", "sans"),
    ("Almarai", "المراعي", "بسيط وعملي، ممتاز للجداول والأرقام", "sans"),
    ("Alexandria", "الإسكندرية", "حديث ونظيف، شخصية هادئة", "sans"),
    ("Readex Pro", "ريدكس", "صُمّم للقراءة الطويلة — الأوضح على الشاشة", "sans"),
    ("IBM Plex Sans Arabic", "بلكس", "رصين ومهني، مناسب للتقارير", "sans"),
    ("Noto Sans Arabic", "نوتو", "محايد تمامًا، يغطي كل الحروف", "sans"),
    ("Rubik", "روبيك", "زواياه مستديرة، ودود وعصري", "sans"),
    ("Noto Kufi Arabic", "كوفي نوتو", "كوفي حديث، قوي في العناوين", "kufi"),
    ("Reem Kufi", "ريم كوفي", "كوفي زخرفي، طابع تراثي", "kufi"),
    ("El Messiri", "المسيري", "أنيق بلمسة كلاسيكية", "display"),
    ("Changa", "تشانجا", "عريض وجريء، يلفت النظر", "display"),
    ("Amiri", "أميري", "نسخ كلاسيكي بجمال المطبوعات القديمة", "naskh"),
    ("System", "خط النظام", "خط الجهاز نفسه — الأسرع، بلا تحميل", "system"),
]

ALLOWED_FONTS = [family for family, *_ in FONT_CATALOG]


class ThemeStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"


class Density(models.TextChoices):
    COMFORTABLE = "comfortable", "Comfortable"
    COMPACT = "compact", "Compact"


class Theme(FarmScopedModel):
    status = models.CharField(
        max_length=12, choices=ThemeStatus.choices, default=ThemeStatus.DRAFT, db_index=True
    )
    version = models.PositiveIntegerField(default=1)
    brand_name = models.CharField(max_length=96, blank=True)
    brand_tagline = models.CharField(max_length=160, blank=True)
    logo = models.ImageField(upload_to="branding/", null=True, blank=True)
    # The same picture, inlined as a data URI. An uploaded file lives on the
    # server's disk, and a farm hosted on a free plan gets a fresh disk on every
    # restart -- the logo would quietly vanish. Held here it travels with the
    # database, and takes precedence over the file when both exist.
    logo_data = models.TextField(blank=True, default="")
    logo_dark = models.ImageField(upload_to="branding/", null=True, blank=True)
    favicon = models.ImageField(upload_to="branding/", null=True, blank=True)
    colors = models.JSONField(default=dict, blank=True)
    font_family = models.CharField(max_length=64, default="Cairo")
    font_scale = models.DecimalField(max_digits=4, decimal_places=2, default=1)
    corner_radius = models.PositiveSmallIntegerField(default=12, help_text="0 = sharp corners.")
    density = models.CharField(max_length=12, choices=Density.choices, default=Density.COMFORTABLE)
    dark_mode_enabled = models.BooleanField(default=False)
    sidebar = models.JSONField(default=list, blank=True)
    dashboard_widgets = models.JSONField(default=list, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-version"]
        constraints = [
            models.UniqueConstraint(
                fields=["farm", "status"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_theme_per_status",
            )
        ]

    def __str__(self):
        return f"{self.farm_id} theme v{self.version} ({self.status})"

    def token_payload(self):
        """The exact contract both the web admin and the mobile app consume."""
        colors = {**DEFAULT_COLORS, **(self.colors or {})}
        return {
            "version": self.version,
            "brand": {
                "name": self.brand_name or self.farm.name,
                "tagline": self.brand_tagline,
                "logo": self.logo_data or (self.logo.url if self.logo else None),
                "logo_dark": self.logo_dark.url if self.logo_dark else None,
                "favicon": self.favicon.url if self.favicon else None,
            },
            "colors": colors,
            "typography": {
                "font_family": self.font_family,
                "scale": float(self.font_scale),
            },
            "shape": {"radius": self.corner_radius},
            "density": self.density,
            "dark_mode_enabled": self.dark_mode_enabled,
            "sidebar": self.sidebar or DEFAULT_SIDEBAR,
            "dashboard_widgets": self.dashboard_widgets or list(DEFAULT_DASHBOARD_WIDGETS),
            "published_at": self.published_at.isoformat() if self.published_at else None,
        }
