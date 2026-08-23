"use client";

import { ensureFontLoaded, fontStack } from "@/lib/fonts";

/** The theme contract served by GET /theme/ - identical for web and mobile. */
export type ThemeTokens = {
  version: number;
  brand: { name: string; tagline: string; logo: string | null };
  colors: Record<string, string>;
  typography: { font_family: string; scale: number };
  shape: { radius: number };
  density: "comfortable" | "compact";
  dark_mode_enabled: boolean;
  sidebar: { key: string; label_ar: string; icon: string; permission: string }[];
  dashboard_widgets: { key: string; visible: boolean }[];
};

/** Every card the dashboard knows how to draw, with the name the farm sees. */
export const DASHBOARD_WIDGETS: { key: string; label: string }[] = [
  { key: "alerts", label: "التنبيهات" },
  { key: "branches", label: "بطاقات الفروع" },
  { key: "cash", label: "النقد المتوفر" },
  { key: "profit", label: "صافي الربح" },
  { key: "livestock", label: "قيمة الحيوانات" },
  { key: "worker_due", label: "المستحق للعاملين" },
  { key: "receivable", label: "لنا عند الناس" },
  { key: "payable", label: "علينا للناس" },
  { key: "births", label: "المواليد في الفترة" },
  { key: "sold_dead", label: "المباع والنافق" },
  { key: "milk", label: "الحليب" },
  { key: "stock", label: "قيمة العلف" },
  { key: "founding", label: "التكاليف التأسيسية" },
  { key: "herd", label: "ملخص القطيع" },
  { key: "cash_accounts", label: "الصناديق" },
  { key: "partners", label: "الشركاء" },
];

/**
 * Which cards to draw, in which order.
 *
 * An empty or missing setting means the farm has not chosen yet, so everything
 * shows. A card this build added after the farm last saved is appended rather
 * than hidden — a new feature should announce itself, not wait to be found.
 */
export function visibleWidgets(tokens: ThemeTokens | null | undefined): string[] {
  const stored = tokens?.dashboard_widgets ?? [];
  if (!stored.length) return DASHBOARD_WIDGETS.map((widget) => widget.key);

  const known = new Set(DASHBOARD_WIDGETS.map((widget) => widget.key));
  const chosen = stored.filter((row) => known.has(row.key));
  const mentioned = new Set(chosen.map((row) => row.key));
  const missing = DASHBOARD_WIDGETS.filter((widget) => !mentioned.has(widget.key));

  return [
    ...chosen.filter((row) => row.visible).map((row) => row.key),
    ...missing.map((widget) => widget.key),
  ];
}

/** Paint the tokens onto CSS variables. The whole UI reads only these. */
export function applyTheme(tokens: ThemeTokens) {
  if (typeof document === "undefined" || !tokens) return;
  const root = document.documentElement;
  Object.entries(tokens.colors || {}).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key.replace(/_/g, "-")}`, value);
  });
  root.style.setProperty("--radius", `${tokens.shape?.radius ?? 12}px`);
  root.style.setProperty("--font-scale", String(tokens.typography?.scale ?? 1));
  // الخط يُجلب أولًا ثم يُطلب رسمه: كتابة الاسم وحدها لا تحمّل شيئًا.
  const family = tokens.typography?.font_family ?? "Cairo";
  ensureFontLoaded(family);
  root.style.setProperty("--font-family", fontStack(family));
  root.style.setProperty("--space-unit", tokens.density === "compact" ? "0.7" : "1");
  if (tokens.brand?.name) document.title = `${tokens.brand.name} · إدارة المزرعة`;
}

export const FALLBACK_TOKENS: ThemeTokens = {
  version: 0,
  brand: { name: "إدارة المزرعة", tagline: "", logo: null },
  colors: {
    primary: "#166534",
    primary_contrast: "#FFFFFF",
    accent: "#CA8A04",
    success: "#15803D",
    warning: "#B45309",
    danger: "#B91C1C",
    info: "#1D4ED8",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    text: "#0F172A",
    text_muted: "#475569",
    border: "#E2E8F0",
    sidebar: "#FFFFFF",
    sidebar_text: "#0F172A",
    header: "#FFFFFF",
    header_text: "#0F172A",
  },
  typography: { font_family: "Cairo", scale: 1 },
  shape: { radius: 12 },
  density: "comfortable",
  dark_mode_enabled: false,
  sidebar: [],
  dashboard_widgets: [],
};
