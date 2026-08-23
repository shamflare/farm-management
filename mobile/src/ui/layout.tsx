import React from "react";
import { RefreshControl, ScrollView, StatusBar, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { alpha, darken } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { T } from "./primitives";

/**
 * رأس الشاشة: متدرّج بلون المزرعة، عليه عنوان الشاشة وسطر يقول ما فيها.
 *
 * لماذا متدرّج لا لون مسطّح: الشاشة الصغيرة تحتاج عمقًا يفصل «أين أنا» عن
 * «ماذا أقرأ»، والمتدرّج يفعل ذلك بلا خط فاصل يقطع الشاشة عرضًا.
 */
export function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const top = darken(theme.colors.primary, theme.isDark ? 0.5 : 0.12);
  const bottom = theme.colors.primary;

  return (
    <LinearGradient
      colors={[top, bottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingTop: insets.top + theme.space.md,
        paddingBottom: theme.space.xxl,
        paddingHorizontal: theme.space.lg,
        borderBottomLeftRadius: 26,
        borderBottomRightRadius: 26,
      }}
    >
      <StatusBar barStyle="light-content" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="heading" weight="bold" color="#FFFFFF" numberOfLines={1}>
            {title}
          </T>
          {!!subtitle && (
            <T variant="small" color={alpha("#FFFFFF", 0.82)} numberOfLines={1}>
              {subtitle}
            </T>
          )}
        </View>
        {right}
      </View>
    </LinearGradient>
  );
}

/**
 * جسم الشاشة.
 *
 * يرفع نفسه فوق الرأس بمقدار الربع، فتبدو البطاقة الأولى وكأنها تخرج من
 * المتدرّج — الحيلة التي تجعل الشاشة تبدو مصمَّمة لا مركّبة.
 */
export function Body({
  children,
  onRefresh,
  refreshing,
  overlap = true,
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  overlap?: boolean;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        padding: theme.space.lg,
        paddingTop: overlap ? 0 : theme.space.lg,
        paddingBottom: theme.space.xxxl * 2,
        gap: theme.space.md,
        marginTop: overlap ? -theme.space.xl : 0,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

/** الشاشة كاملة: خلفية واحدة تحت الرأس والجسم. */
export function Screen({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>{children}</View>;
}

/** عنوان قسم داخل الشاشة. */
export function Section({ title, action }: { title: string; action?: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: theme.space.sm,
      }}
    >
      <T variant="title" weight="bold">
        {title}
      </T>
      {action}
    </View>
  );
}
