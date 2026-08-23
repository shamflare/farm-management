import React from "react";
import { Linking, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { clearSession } from "../../src/api/client";
import { useMe } from "../../src/api/queries";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { Button, Card, T } from "../../src/ui/primitives";

export default function MoreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const { data: me } = useMe();

  async function signOut() {
    await clearSession();
    client.clear();
    router.replace("/(auth)/login");
  }

  const initials = (me?.user?.full_name || me?.user?.username || "؟")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");

  return (
    <Screen>
      <Header title="حسابي" subtitle={me?.farm?.name} />

      <Body>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: theme.space.lg }}>
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 18,
              backgroundColor: alpha(theme.colors.primary, theme.isDark ? 0.28 : 0.12),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T variant="title" weight="bold" color={theme.colors.primary}>
              {initials}
            </T>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="title" weight="bold" numberOfLines={1}>
              {me?.user?.full_name || me?.user?.username}
            </T>
            <T variant="small" muted numberOfLines={1}>
              {me?.role?.display_name ?? "—"} · {me?.user?.username}
            </T>
          </View>
        </Card>

        <Section title="ما يبقى على اللوحة" />
        <Card style={{ gap: theme.space.sm }}>
          <T variant="small" muted>
            الإعدادات والصلاحيات وبناء النماذج والهوية البصرية والتقارير التفصيلية
            تُدار من لوحة الويب على شاشة كبيرة — التطبيق نافذة الميدان.
          </T>
          <Button
            title="فتح zadfarm.net"
            variant="ghost"
            onPress={() => Linking.openURL("https://zadfarm.net")}
          />
        </Card>

        <Section title="التطبيق" />
        <Card style={{ gap: theme.space.md }}>
          <Row label="المزرعة" value={me?.farm?.name ?? "—"} />
          <Row label="العملة" value={me?.farm?.base_currency?.code ?? "—"} />
          <Row label="الصلاحيات" value={`${me?.permissions?.length ?? 0}`} />
          <Row label="الإصدار" value="1.0.0" />
        </Card>

        <Button title="تسجيل الخروج" variant="danger" onPress={signOut} />
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
