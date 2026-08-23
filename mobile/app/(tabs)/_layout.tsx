import React from "react";
import { Platform, View } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { T } from "../../src/ui/primitives";

/**
 * الشريط السفلي.
 *
 * أربعة أقسام لا أكثر: ما يُفتح كل يوم. كل ما عداه خلف «المزيد» — الشريط
 * المزدحم يجعل الإبهام يخطئ، والخطأ في الحظيرة يعني قيدًا خاطئًا.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.text_muted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 0,
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
          elevation: 12,
          shadowColor: "#0B120F",
          shadowOpacity: 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
        },
        tabBarLabelStyle: {
          fontFamily: theme.font("medium"),
          fontSize: 11,
          marginTop: Platform.OS === "android" ? -2 : 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "الرئيسية", tabBarIcon: (p) => <Glyph char="🏠" {...p} /> }}
      />
      <Tabs.Screen
        name="animals"
        options={{ title: "القطيع", tabBarIcon: (p) => <Glyph char="🐑" {...p} /> }}
      />
      <Tabs.Screen
        name="record"
        options={{ title: "تسجيل", tabBarIcon: (p) => <Glyph char="＋" {...p} accent /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: "المزيد", tabBarIcon: (p) => <Glyph char="☰" {...p} /> }}
      />
    </Tabs>
  );
}

/** أيقونة التبويب: حرف واحد داخل دائرة تُضاء عند الاختيار. */
function Glyph({
  char,
  focused,
  accent,
}: {
  char: string;
  focused: boolean;
  accent?: boolean;
}) {
  const theme = useTheme();
  const active = focused || accent;
  return (
    <View
      style={{
        width: 34,
        height: 30,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? alpha(theme.colors.primary, theme.isDark ? 0.26 : 0.12) : "transparent",
      }}
    >
      <T variant="body" color={active ? theme.colors.primary : theme.colors.text_muted}>
        {char}
      </T>
    </View>
  );
}
