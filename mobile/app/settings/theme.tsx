import React from "react";
import { View } from "react-native";

import { useMe } from "../../src/api/queries";
import { useTheme } from "../../src/theme/ThemeProvider";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { Card, T } from "../../src/ui/primitives";

const COLOR_LABEL: Record<string, string> = {
  primary: "اللون الأساسي",
  accent: "المميز",
  success: "النجاح",
  warning: "التحذير",
  danger: "الخطر",
  info: "المعلومات",
  sidebar: "القائمة الجانبية",
  header: "الشريط العلوي",
};

/**
 * الهوية البصرية — كما يراها التطبيق.
 *
 * لا تُحرَّر من هنا عمدًا: اختيار الألوان يحتاج شاشة تعرض المعاينة كاملة،
 * والتغيير يمسّ كل من يستعمل النظام. لكن أن يرى صاحب المزرعة أن تطبيقه يقرأ
 * هويته فعلًا — هذا يُطمئن.
 */
export default function ThemeScreen() {
  const theme = useTheme();
  const { data: me } = useMe();
  const server = me?.theme;

  return (
    <Screen>
      <Header back title="الهوية البصرية" subtitle="يقرؤها التطبيق من إعدادات مزرعتك" />
      <Body>
        <Card style={{ gap: theme.space.sm }}>
          <T variant="small" muted>
            العلامة
          </T>
          <T variant="title" weight="bold">
            {server?.brand?.name || me?.farm?.name}
          </T>
          {!!server?.brand?.tagline && <T variant="small" muted>{server.brand.tagline}</T>}
        </Card>

        <Section title="الألوان" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>
          {Object.entries(COLOR_LABEL).map(([key, label]) => {
            const value = (server?.colors as any)?.[key];
            if (!value) return null;
            return (
              <Card key={key} style={{ width: 150, gap: theme.space.sm, paddingVertical: theme.space.md }}>
                <View
                  style={{
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: value,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                />
                <T variant="micro" muted numberOfLines={1}>
                  {label}
                </T>
                <T variant="micro" weight="bold">
                  {String(value).toUpperCase()}
                </T>
              </Card>
            );
          })}
        </View>

        <Section title="الخط والشكل" />
        <Card style={{ gap: theme.space.md }}>
          <Row label="الخط" value={server?.typography?.font_family ?? "Cairo"} />
          <Row label="مقياس الخط" value={String(server?.typography?.scale ?? 1)} />
          <Row label="استدارة الحواف" value={`${server?.shape?.radius ?? 18}px`} />
          <Row label="الكثافة" value={server?.density === "compact" ? "مضغوطة" : "مريحة"} />
          <Row label="نسخة السمة" value={String(server?.version ?? "—")} />
        </Card>

        <Card>
          <T variant="small" muted>
            غيّر الألوان أو الخط من اللوحة (الإعدادات ← الهوية البصرية)، ثم أعد فتح
            التطبيق — يتبعها تلقائيًا بلا تحديث للتطبيق نفسه.
          </T>
        </Card>
      </Body>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <T variant="small" muted style={{ flex: 1 }}>
        {label}
      </T>
      <T variant="small" weight="bold">
        {value}
      </T>
    </View>
  );
}
