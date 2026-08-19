"use client";

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
};

/** Paint the tokens onto CSS variables. The whole UI reads only these. */
export function applyTheme(tokens: ThemeTokens) {
  if (typeof document === "undefined" || !tokens) return;
  const root = document.documentElement;
  Object.entries(tokens.colors || {}).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key.replace(/_/g, "-")}`, value);
  });
  root.style.setProperty("--radius", `${tokens.shape?.radius ?? 12}px`);
  root.style.setProperty("--font-scale", String(tokens.typography?.scale ?? 1));
  root.style.setProperty(
    "--font-family",
    `"${tokens.typography?.font_family ?? "Cairo"}", "Segoe UI", system-ui, sans-serif`
  );
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
  },
  typography: { font_family: "Cairo", scale: 1 },
  shape: { radius: 12 },
  density: "comfortable",
  dark_mode_enabled: false,
  sidebar: [],
};
