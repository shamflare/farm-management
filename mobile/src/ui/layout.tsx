import React from "react";
import { Pressable, RefreshControl, ScrollView, StatusBar, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { alpha, darken } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { T } from "./primitives";

/**
 * رأس الشاشة: متدرّج بلون المزرعة، عليه عنوان الشاشة وسطر يقول ما فيها.
 *
 * لا يتداخل مع المحتوى. جُرّبت حيلة سحب المحتوى تحت الرأس ليبدو خارجًا منه،
 * فابتلع الرأس أول عنصر في كل شاشة على أندرويد — الرفع (elevation) يجعل
 * الترتيب في الشيفرة لا يعني شيئًا. المسافة الواضحة أصدق من حيلة تكسر.
 */
export function Header({
  title,
  subtitle,
  right,
  back,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** يعرض زر رجوع — لكل شاشة تُفتح من «المزيد». */
  back?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const top = darken(theme.colors.primary, theme.isDark ? 0.5 : 0.12);

  return (
    <LinearGradient
      colors={[top, theme.colors.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingTop: insets.top + theme.space.md,
        paddingBottom: theme.space.lg,
        paddingHorizontal: theme.space.lg,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
      }}
    >
      <StatusBar barStyle="light-content" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
        {back && (
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: alpha("#FFFFFF", 0.16),
            }}
          >
            {/* في واجهة تُقرأ من اليمين، الرجوع يشير إلى اليمين */}
            <T variant="title" color="#FFFFFF">
              ›
            </T>
          </Pressable>
        )}
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

/** جسم الشاشة: كل ما تحت الرأس، بمسافة واضحة عنه. */
export function Body({
  children,
  onRefresh,
  refreshing,
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        padding: theme.space.lg,
        paddingBottom: theme.space.xxxl * 2,
        gap: theme.space.md,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
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

/**
 * شريط أقراص للاختيار.
 *
 * تكرّر في كل شاشة تقريبًا — الفترة، النوع، الفرع، الحالة — فصار مكوّنًا
 * واحدًا بدل نسخة في كل ملف تختلف عن أختها بأربعة بكسلات.
 */
export function Chips<T extends string>({
  value,
  onChange,
  options,
  scroll,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { key: T; label: string }[];
  scroll?: boolean;
}) {
  const theme = useTheme();
  const content = options.map((option) => {
    const active = value === option.key;
    return (
      <Pressable
        key={option.key}
        onPress={() => onChange(option.key)}
        style={{
          paddingHorizontal: theme.space.lg,
          paddingVertical: 9,
          borderRadius: 999,
          backgroundColor: active ? theme.colors.primary : theme.colors.surface,
          borderWidth: 1,
          borderColor: active ? theme.colors.primary : theme.colors.border,
        }}
      >
        <T
          variant="small"
          weight={active ? "bold" : "regular"}
          color={active ? "#FFFFFF" : theme.colors.text_muted}
        >
          {option.label}
        </T>
      </Pressable>
    );
  });

  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.space.sm, paddingVertical: 2 }}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm }}>{content}</View>
  );
}
