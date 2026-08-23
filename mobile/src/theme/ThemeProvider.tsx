import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  deriveDark,
  FALLBACK_COLORS,
  fontSize,
  ServerTheme,
  shadow,
  space,
  TOUCH,
} from "./tokens";

type Colors = typeof FALLBACK_COLORS & { surface_raised?: string };

export type Theme = {
  colors: Colors;
  radius: number;
  scale: number;
  brand: { name: string; tagline: string; logo: string | null };
  isDark: boolean;
  space: typeof space;
  fontSize: typeof fontSize;
  shadow: typeof shadow;
  touch: number;
  /** حجم نص مضروبًا بمقياس المزرعة — تكبير الخط من اللوحة يصل الجوال. */
  size: (key: keyof typeof fontSize) => number;
  /** عائلة الخط حسب الوزن المطلوب. */
  font: (weight?: "regular" | "medium" | "bold") => string;
};

const STORE_KEY = "zad.theme";

const ThemeContext = createContext<Theme | null>(null);

/** يبني السمة الكاملة من رموز الخادم ووضع الجهاز. */
function build(server: ServerTheme | null, isDark: boolean): Theme {
  const base = { ...FALLBACK_COLORS, ...(server?.colors ?? {}) };
  const colors = (isDark ? deriveDark(base) : base) as Colors;
  const scale = server?.typography?.scale ?? 1;

  return {
    colors,
    radius: server?.shape?.radius ?? 18,
    scale,
    brand: server?.brand ?? { name: "زاد", tagline: "", logo: null },
    isDark,
    space,
    fontSize,
    shadow,
    touch: TOUCH,
    size: (key) => Math.round(fontSize[key] * scale),
    font: (weight = "regular") =>
      weight === "bold" ? "Cairo_700Bold" : weight === "medium" ? "Cairo_600SemiBold" : "Cairo_400Regular",
  };
}

export function ThemeProvider({
  server,
  children,
}: {
  server: ServerTheme | null;
  children: React.ReactNode;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  // آخر سمة معروفة تُحفظ، فأول شاشة بعد الفتح تُرسم بألوان المزرعة لا
  // بالألوان الافتراضية ثم تقفز. نفس مبدأ «اعرض المحفوظ ثم حدّث» في اللوحة.
  const [cached, setCached] = useState<ServerTheme | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => raw && setCached(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (server) AsyncStorage.setItem(STORE_KEY, JSON.stringify(server)).catch(() => {});
  }, [server]);

  const theme = useMemo(() => build(server ?? cached, isDark), [server, cached, isDark]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme خارج ThemeProvider");
  return theme;
}
