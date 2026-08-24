import React from "react";
import { Linking, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { clearSession } from "../../src/api/client";
import { useCan, useMe } from "../../src/api/queries";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { Button, Card, T } from "../../src/ui/primitives";

/**
 * كل أقسام النظام، مرتّبة كما في اللوحة تمامًا.
 *
 * الترتيب على دورة عمل المزرعة لا على ترتيب البناء: القطيع أولًا لأنه أصل
 * العمل، ثم ما يُنتجه ويأكله، ثم المال، ثم ما يُقرأ منه، وأخيرًا ما يُضبط مرة
 * ويُنسى. من لا يملك صلاحية قسم لا يراه أصلًا — لا زر يفتح رفضًا.
 */
const GROUPS: {
  label: string;
  items: { href: string; label: string; hint: string; icon: string; permission?: string }[];
}[] = [
  {
    label: "القطيع",
    items: [
      {
        href: "/purchases",
        label: "شراء الحيوانات",
        hint: "النقل والعمولة محمَّلة على قيمة الرؤوس",
        icon: "🛒",
        permission: "purchases.view",
      },
      {
        href: "/sales",
        label: "بيع الحيوانات",
        hint: "سبب البيع يحدّد بند الإيراد",
        icon: "💰",
        permission: "sales.view",
      },
    ],
  },
  {
    label: "الإنتاج والمخزون",
    items: [
      {
        href: "/milk",
        label: "الحليب",
        hint: "الكمية اليومية ومبيعاتها",
        icon: "🥛",
        permission: "milk.view",
      },
      {
        href: "/inventory",
        label: "مستودعات الأعلاف",
        hint: "الأرصدة والحركات والصرف",
        icon: "🌾",
        permission: "inventory.view",
      },
    ],
  },
  {
    label: "المال",
    items: [
      {
        href: "/money",
        label: "الحركات المالية",
        hint: "كل قيد بمبلغه وحالته",
        icon: "💵",
        permission: "finance.view",
      },
      {
        href: "/parties",
        label: "الأشخاص والحسابات",
        hint: "من له ومن عليه",
        icon: "👥",
        permission: "parties.view",
      },
      {
        href: "/founding",
        label: "التكاليف التأسيسية",
        hint: "ما بُنيت به المزرعة، خارج أرباح الشهر",
        icon: "🏗️",
        permission: "assets.view",
      },
    ],
  },
  {
    label: "التقارير والرقابة",
    items: [
      {
        href: "/reports",
        label: "التقارير",
        hint: "الفروع، الأرباح، الميزان، القطيع",
        icon: "📊",
        permission: "reports.view",
      },
      {
        href: "/audit",
        label: "سجل التدقيق",
        hint: "من فعل ماذا ومتى",
        icon: "🕓",
        permission: "audit.view",
      },
    ],
  },
  {
    label: "الإعدادات",
    items: [
      {
        href: "/settings/profile",
        label: "حسابي",
        hint: "اسمك الظاهر وكلمة المرور",
        icon: "👤",
      },
      {
        href: "/settings/lists",
        label: "القوائم والبنود",
        hint: "الفروع، الأنواع، بنود المصروف",
        icon: "📋",
        permission: "settings.view",
      },
      {
        href: "/settings/users",
        label: "المستخدمون",
        hint: "من يدخل النظام وبأي دور",
        icon: "🔑",
        permission: "users.view",
      },
      {
        href: "/settings/theme",
        label: "الهوية البصرية",
        hint: "ألوان المزرعة وخطها",
        icon: "🎨",
        permission: "theme.view",
      },
    ],
  },
];

export default function MoreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const can = useCan();
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
      <Header title="المزيد" subtitle={me?.farm?.name} />

      <Body>
        <Card
          onPress={() => router.push("/settings/profile")}
          style={{ flexDirection: "row", alignItems: "center", gap: theme.space.lg }}
        >
          <View
            style={{
              width: 52,
              height: 52,
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
              {me?.role?.display_name ?? "—"} · {me?.permissions?.length ?? 0} صلاحية
            </T>
          </View>
          <T variant="title" muted>
            ‹
          </T>
        </Card>

        {GROUPS.map((group) => {
          const items = group.items.filter((item) => can(item.permission));
          if (!items.length) return null;
          return (
            <View key={group.label} style={{ gap: theme.space.md }}>
              <Section title={group.label} />
              {items.map((item) => (
                <Card
                  key={item.href}
                  onPress={() => router.push(item.href as any)}
                  style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      backgroundColor: alpha(theme.colors.primary, theme.isDark ? 0.2 : 0.08),
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <T variant="title">{item.icon}</T>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T weight="bold" numberOfLines={1}>
                      {item.label}
                    </T>
                    <T variant="micro" muted numberOfLines={1}>
                      {item.hint}
                    </T>
                  </View>
                  <T variant="title" muted>
                    ‹
                  </T>
                </Card>
              ))}
            </View>
          );
        })}

        <Section title="أمور أخرى" />
        <Card style={{ gap: theme.space.md }}>
          <T variant="small" muted>
            بناء النماذج والحقول المخصّصة والرصيد الافتتاحي وحذف القيود تبقى على اللوحة:
            عمليات نادرة وخطرة، مكانها شاشة كبيرة لا جوال في حظيرة.
          </T>
          <Button
            title="فتح zadfarm.net"
            variant="ghost"
            onPress={() => Linking.openURL("https://zadfarm.net")}
          />
        </Card>

        <Button title="تسجيل الخروج" variant="danger" onPress={signOut} />

        <T variant="micro" muted style={{ textAlign: "center" }}>
          تطبيق زاد · الإصدار 1.0.0
        </T>
      </Body>
    </Screen>
  );
}
