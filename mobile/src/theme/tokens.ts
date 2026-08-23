/**
 * سمة التطبيق: نفس رموز الخادم، مترجَمة إلى ما يفهمه React Native.
 *
 * اللوحة والتطبيق يقرآن `GET /theme/` نفسه. فتغيير لون المزرعة أو خطّها من
 * شاشة الهوية البصرية يظهر في الجوال عند أول تشغيل — بلا APK جديد. هذا هو
 * العقد المكتوب في docs/architecture.md، وهذا الملف هو نصفه في الجوال.
 *
 * ما يضيفه التطبيق فوق الرموز: مقاسات اللمس والظلال والمسافات — أشياء لا
 * معنى لها في المتصفح، والشاشة الصغيرة لا تسامح فيها.
 */

export type ServerTheme = {
  version: number;
  brand: { name: string; tagline: string; logo: string | null };
  colors: Record<string, string>;
  typography: { font_family: string; scale: number };
  shape: { radius: number };
  density: "comfortable" | "compact";
  dark_mode_enabled: boolean;
};

/** ألوان الخادم كما تصل. الأسماء هي نفسها في اللوحة تمامًا. */
export const FALLBACK_COLORS = {
  primary: "#166534",
  primary_contrast: "#FFFFFF",
  accent: "#CA8A04",
  success: "#15803D",
  warning: "#B45309",
  danger: "#B91C1C",
  info: "#1D4ED8",
  background: "#F5F7F5",
  surface: "#FFFFFF",
  text: "#0F172A",
  text_muted: "#5B6B7C",
  border: "#E4E9E6",
  sidebar: "#0F2A1D",
  sidebar_text: "#F1F5F9",
  header: "#FFFFFF",
  header_text: "#0F172A",
};

/**
 * النسخة الداكنة تُشتقّ ولا تُطلب من الخادم.
 *
 * الخادم يصف هوية المزرعة لا وقت اليوم. فالوضع الداكن يبني خلفياته الخاصة
 * ويبقي لون الهوية كما هو بعد رفع سطوعه قليلًا، فالأخضر الغامق على أسود لا
 * يُرى.
 */
export function deriveDark(colors: Record<string, string>) {
  return {
    ...colors,
    primary: lighten(colors.primary ?? FALLBACK_COLORS.primary, 0.22),
    background: "#0B120F",
    surface: "#141C18",
    surface_raised: "#1B2621",
    text: "#ECF2EE",
    text_muted: "#9AAAA1",
    border: "#243029",
    header: "#141C18",
    header_text: "#ECF2EE",
  };
}

/** يفتح لونًا بخلطه بالأبيض — بلا مكتبة ألوان، الحساب أبسط من الاعتماد. */
export function lighten(hex: string, amount: number) {
  const { r, g, b } = toRgb(hex);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  return toHex(mix(r), mix(g), mix(b));
}

/** يعتم لونًا بخلطه بالأسود. */
export function darken(hex: string, amount: number) {
  const { r, g, b } = toRgb(hex);
  const mix = (channel: number) => Math.round(channel * (1 - amount));
  return toHex(mix(r), mix(g), mix(b));
}

/** لون بشفافية — لخلفيات الشارات وحلقات التركيز. */
export function alpha(hex: string, value: number) {
  const { r, g, b } = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${value})`;
}

/**
 * أبيض أم أسود فوق هذا اللون؟
 *
 * يُحسب بالسطوع النسبي لا بالتخمين: شارة «مباع» رمادية وشارة «نافق» حمراء
 * تحتاجان نصًّا مختلفًا، ولا أحد سيضبط ذلك يدويًا لكل حالة.
 */
export function readableOn(hex: string) {
  const { r, g, b } = toRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#0F172A" : "#FFFFFF";
}

function toRgb(hex: string) {
  let value = (hex || "#000000").replace("#", "");
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  return {
    r: parseInt(value.slice(0, 2), 16) || 0,
    g: parseInt(value.slice(2, 4), 16) || 0,
    b: parseInt(value.slice(4, 6), 16) || 0,
  };
}

function toHex(r: number, g: number, b: number) {
  const part = (channel: number) =>
    Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/* --- ما يضيفه الجوال ---------------------------------------------------- */

/** مقاس واحد للمسافات في كل التطبيق. الرقم مضاعف ٤: يبقى كل شيء على شبكة. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
};

/** أصغر مساحة يصيبها إبهام في الشمس. */
export const TOUCH = 46;

export const fontSize = {
  micro: 11,
  small: 13,
  body: 15,
  title: 19,
  heading: 24,
  display: 34,
};

/**
 * الظلال: طبقتان لا أكثر.
 *
 * ظل واحد ضعيف يرفع البطاقة عن الخلفية، وظل أقوى للعناصر العائمة. أي ظل ثالث
 * يجعل الشاشة تبدو كطبقات عشوائية بدل مستويين واضحين.
 */
export const shadow = {
  card: {
    shadowColor: "#0B120F",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  float: {
    shadowColor: "#0B120F",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
};
