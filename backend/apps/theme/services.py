"""Theme validation and publishing.

A theme is only published when its colors are actually readable. An owner
picking a pale yellow for primary should be told, not shipped a white-on-white
app to every phone in the field.
"""
import re

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditAction
from apps.audit.services import record
from apps.theme.models import (
    ALLOWED_FONTS,
    DEFAULT_COLORS,
    DASHBOARD_WIDGETS,
    DEFAULT_DASHBOARD_WIDGETS,
    DEFAULT_SIDEBAR,
    Theme,
    ThemeStatus,
)

HEX_PATTERN = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

# أسماء الألوان كما تُعرض على الشاشة، لتقول الرسالة أي حقلين لا يتباينان.
COLOR_NAMES_AR = {
    "primary": "اللون الأساسي",
    "primary_contrast": "النص فوق الأساسي",
    "accent": "اللون المميز",
    "success": "النجاح",
    "warning": "التحذير",
    "danger": "الخطر",
    "info": "المعلومات",
    "background": "الخلفية",
    "surface": "البطاقات",
    "text": "النص",
    "text_muted": "النص الثانوي",
    "border": "الحدود",
    "sidebar": "خلفية القائمة الجانبية",
    "sidebar_text": "خط القائمة الجانبية",
    "header": "خلفية الشريط العلوي",
    "header_text": "خط الشريط العلوي",
}

# Pairs that must stay readable: (foreground, background, minimum ratio).
CONTRAST_RULES = [
    ("text", "background", 4.5),
    ("text", "surface", 4.5),
    ("primary_contrast", "primary", 4.5),
    ("text_muted", "surface", 3.0),
    # لون خط القائمة على لون القائمة، ولون خط الشريط على لون الشريط: أسماء
    # الأقسام تُقرأ في كل ثانية، وخطأ هنا يعمي نصف الشاشة.
    ("sidebar_text", "sidebar", 4.5),
    ("header_text", "header", 4.5),
]


def _to_rgb(value):
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def _relative_luminance(rgb):
    channels = []
    for raw in rgb:
        srgb = raw / 255
        channels.append(srgb / 12.92 if srgb <= 0.04045 else ((srgb + 0.055) / 1.055) ** 2.4)
    red, green, blue = channels
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast_ratio(foreground, background):
    """WCAG contrast ratio between two hex colors."""
    light = _relative_luminance(_to_rgb(foreground))
    dark = _relative_luminance(_to_rgb(background))
    if light < dark:
        light, dark = dark, light
    return (light + 0.05) / (dark + 0.05)


def validate_theme(theme, *, strict=True):
    """Returns a list of problems. Empty list means safe to publish."""
    problems = []
    colors = {**DEFAULT_COLORS, **(theme.colors or {})}

    for key, value in colors.items():
        if not isinstance(value, str) or not HEX_PATTERN.match(value):
            problems.append(
                {"field": f"colors.{key}", "message": "لون غير صالح — اكتبه بصيغة #1A2B3C"}
            )

    if problems:
        return problems

    if theme.font_family not in ALLOWED_FONTS:
        # الرسالة تُقرأ على الشاشة، والشاشة عربية.
        problems.append(
            {
                "field": "font_family",
                "message": "اختر خطًا من القائمة المعروضة — هذا الخط لا يُحمَّل في المتصفح",
            }
        )
    if not 0.8 <= float(theme.font_scale) <= 1.6:
        problems.append(
            {"field": "font_scale", "message": "حجم الخط يكون بين 0.8 و 1.6"}
        )
    if not 0 <= theme.corner_radius <= 32:
        problems.append(
            {"field": "corner_radius", "message": "استدارة الحواف تكون بين 0 و 32"}
        )

    if strict:
        for foreground, background, minimum in CONTRAST_RULES:
            ratio = contrast_ratio(colors[foreground], colors[background])
            if ratio < minimum:
                problems.append(
                    {
                        "field": f"colors.{foreground}",
                        "message": (
                            f"«{COLOR_NAMES_AR.get(foreground, foreground)}» على "
                            f"«{COLOR_NAMES_AR.get(background, background)}»: التباين "
                            f"{ratio:.2f}:1 وهو دون الحد {minimum}:1 — النص لن يُقرأ"
                        ),
                    }
                )
    return problems


# A logo lives in the database rather than on disk, so it has to stay small
# enough to ride along with every theme read. Roughly 400 KB of image once the
# base64 padding is accounted for.
MAX_LOGO_CHARS = 550_000
LOGO_PREFIXES = ("data:image/png", "data:image/jpeg", "data:image/svg+xml", "data:image/webp")


def validate_logo_data(value):
    """Only an inlined image, and only a small one.

    This value is served back to every browser inside the theme payload, so
    anything else here would be both a broken logo and a place to park content
    the page would then render.
    """
    if not value:
        return ""
    if not isinstance(value, str) or not value.startswith(LOGO_PREFIXES):
        raise ValidationError({"logo_data": "الشعار يجب أن يكون صورة PNG أو JPEG أو SVG أو WebP"})
    if len(value) > MAX_LOGO_CHARS:
        raise ValidationError(
            {"logo_data": "حجم الشعار كبير — استخدم صورة أصغر من 400 كيلوبايت"}
        )
    return value


# ما يُنسخ من المنشور إلى المسودة — كل ما يراه المستخدم على الشاشة.
COPIED_FIELDS = (
    "brand_name",
    "brand_tagline",
    "logo_data",
    "colors",
    "font_family",
    "font_scale",
    "corner_radius",
    "density",
    "dark_mode_enabled",
    "sidebar",
    "dashboard_widgets",
)


def copy_into_draft(draft, published):
    """يجعل المسودة نسخة مما هو منشور الآن."""
    for field in COPIED_FIELDS:
        setattr(draft, field, getattr(published, field))
    draft.version = published.version
    draft.save()
    return draft


def get_draft(farm):
    """المسودة التي تُفتح عليها شاشة الهوية.

    القاعدة: تُفتح على ما هو منشور فعلًا، لا على ما تركه أحدهم في مسودة
    منسية. مسودة قديمة تبقى حيّة إلى الأبد فخّ: تُعدَّل الألوان من جهاز
    وتُنشر، ثم تُفتح الشاشة على جهاز آخر فيرى مسودته القديمة، فيغيّر لونًا
    واحدًا وينشر — فيمحو بها كل ما نُشر بينهما.

    فإن كانت المسودة لم تُمسّ منذ آخر نشر، تُحدَّث منه. وإن كانت تحمل تعديلات
    أحدث من النشر فهي عمل لم يُنشر بعد، ولا يجوز محوه — والشاشة تقول للمستخدم
    إنها تختلف عمّا هو منشور، وتعطيه زر العودة.
    """
    theme = Theme.objects.filter(farm=farm, status=ThemeStatus.DRAFT).first()
    published = get_published(farm)

    if theme is not None:
        stale = (
            published is not None
            and published.published_at is not None
            and theme.updated_at <= published.published_at
        )
        return copy_into_draft(theme, published) if stale else theme

    if published is not None:
        draft = Theme.objects.create(farm=farm, status=ThemeStatus.DRAFT, version=published.version)
        return copy_into_draft(draft, published)

    return create_default(farm, status=ThemeStatus.DRAFT)


@transaction.atomic
def revert_draft(farm, actor=None):
    """يُعيد المسودة إلى ما هو منشور — طريق الخروج من تعديل نُدم عليه."""
    published = get_published(farm)
    if published is None:
        return reset_to_default(farm, actor=actor)

    draft = Theme.objects.filter(farm=farm, status=ThemeStatus.DRAFT).first()
    if draft is None:
        draft = Theme.objects.create(farm=farm, status=ThemeStatus.DRAFT, version=published.version)
    copy_into_draft(draft, published)

    record(
        AuditAction.SETTING,
        "theme",
        draft.id,
        farm=farm,
        label="أُعيدت المسودة إلى السمة المنشورة",
        user=actor,
    )
    return draft


def draft_differs(farm):
    """هل تختلف المسودة عمّا يراه المستخدمون الآن؟"""
    draft = Theme.objects.filter(farm=farm, status=ThemeStatus.DRAFT).first()
    published = get_published(farm)
    if draft is None or published is None:
        return False
    return any(getattr(draft, field) != getattr(published, field) for field in COPIED_FIELDS)


def get_published(farm):
    return Theme.objects.filter(farm=farm, status=ThemeStatus.PUBLISHED).first()


def create_default(farm, *, status=ThemeStatus.PUBLISHED):
    return Theme.objects.create(
        farm=farm,
        status=status,
        version=1,
        brand_name=farm.name,
        colors=dict(DEFAULT_COLORS),
        sidebar=list(DEFAULT_SIDEBAR),
        dashboard_widgets=list(DEFAULT_DASHBOARD_WIDGETS),
        published_at=timezone.now() if status == ThemeStatus.PUBLISHED else None,
    )


def clean_dashboard_widgets(value):
    """Keep only cards this build knows how to draw, in the order given.

    A card the client cannot render would be an invisible setting the owner
    keeps toggling with nothing happening, so unknown keys are dropped and any
    card left unmentioned is appended rather than silently lost.
    """
    if not isinstance(value, list):
        raise ValidationError({"dashboard_widgets": "expected a list of cards"})

    cleaned = []
    seen = set()
    for row in value:
        if isinstance(row, str):
            row = {"key": row, "visible": True}
        if not isinstance(row, dict):
            continue
        key = row.get("key")
        if key not in DASHBOARD_WIDGETS or key in seen:
            continue
        seen.add(key)
        cleaned.append({"key": key, "visible": bool(row.get("visible", True))})

    for key in DASHBOARD_WIDGETS:
        if key not in seen:
            cleaned.append({"key": key, "visible": True})
    return cleaned


@transaction.atomic
def save_draft(farm, data, actor=None):
    draft = get_draft(farm)
    editable = {
        "brand_name",
        "brand_tagline",
        "logo_data",
        "colors",
        "font_family",
        "font_scale",
        "corner_radius",
        "density",
        "dark_mode_enabled",
        "sidebar",
        "dashboard_widgets",
    }
    for key, value in (data or {}).items():
        if key in editable:
            if key == "colors" and isinstance(value, dict):
                merged = {**(draft.colors or {}), **value}
                setattr(draft, key, merged)
            elif key == "logo_data":
                setattr(draft, key, validate_logo_data(value))
            elif key == "dashboard_widgets":
                setattr(draft, key, clean_dashboard_widgets(value))
            else:
                setattr(draft, key, value)
    draft.save()
    return draft, validate_theme(draft)


@transaction.atomic
def publish(farm, actor=None):
    """Promote the draft to published, but only if it passes validation."""
    draft = get_draft(farm)
    problems = validate_theme(draft)
    if problems:
        raise ValidationError({"theme": problems})

    current = get_published(farm)
    next_version = (current.version + 1) if current else 1
    if current is not None:
        current.delete(hard=True)

    draft.status = ThemeStatus.PUBLISHED
    draft.version = next_version
    draft.published_at = timezone.now()
    draft.save(update_fields=["status", "version", "published_at", "updated_at"])

    record(
        AuditAction.SETTING,
        "theme",
        draft.id,
        farm=farm,
        label=f"published theme v{next_version}",
        new=draft.token_payload(),
        user=actor,
    )
    return draft


@transaction.atomic
def reset_to_default(farm, actor=None):
    Theme.all_objects.filter(farm=farm, status=ThemeStatus.DRAFT).delete()
    draft = create_default(farm, status=ThemeStatus.DRAFT)
    record(
        AuditAction.SETTING,
        "theme",
        draft.id,
        farm=farm,
        label="theme reset to defaults",
        user=actor,
    )
    return draft


def published_payload(farm):
    theme = get_published(farm)
    if theme is None:
        theme = create_default(farm)
    return theme.token_payload()
