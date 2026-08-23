import React from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  TextProps,
  View,
  ViewProps,
} from "react-native";
import * as Haptics from "expo-haptics";

import { alpha, readableOn } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/* --- النص ---------------------------------------------------------------
 * كل نص في التطبيق يمرّ من هنا: الخط والمقياس يأتيان من سمة المزرعة، فلا
 * يكتب أحد اسم خط بيده ولا يشذّ حجم عن الشبكة.
 */

type Variant = "display" | "heading" | "title" | "body" | "small" | "micro";

export function T({
  variant = "body",
  weight = "regular",
  muted,
  color,
  style,
  ...rest
}: TextProps & {
  variant?: Variant;
  weight?: "regular" | "medium" | "bold";
  muted?: boolean;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: theme.font(weight),
          fontSize: theme.size(variant),
          color: color ?? (muted ? theme.colors.text_muted : theme.colors.text),
          lineHeight: theme.size(variant) * 1.55,
          writingDirection: "rtl",
        },
        style,
      ]}
    />
  );
}

/* --- البطاقة -------------------------------------------------------------
 * السطح الوحيد في التطبيق. لا جداول: كل «صف» يصير واحدة من هذه.
 */

export function Card({
  style,
  onPress,
  children,
  ...rest
}: ViewProps & { onPress?: () => void }) {
  const theme = useTheme();
  const body = (
    <View
      {...rest}
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          padding: theme.space.lg,
        },
        theme.shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({
        transform: [{ scale: pressed ? 0.985 : 1 }],
        opacity: pressed ? 0.96 : 1,
      })}
    >
      {body}
    </Pressable>
  );
}

/* --- الشارة -------------------------------------------------------------- */

export function Badge({
  label,
  tone = "neutral",
  solid,
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "primary";
  solid?: boolean;
}) {
  const theme = useTheme();
  const map = {
    neutral: theme.colors.text_muted,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    info: theme.colors.info,
    primary: theme.colors.primary,
  };
  const base = map[tone];
  return (
    <View
      style={{
        backgroundColor: solid ? base : alpha(base, theme.isDark ? 0.22 : 0.12),
        paddingHorizontal: theme.space.md,
        paddingVertical: 3,
        borderRadius: 999,
        alignSelf: "flex-start",
      }}
    >
      <T
        variant="micro"
        weight="bold"
        color={solid ? readableOn(base) : base}
        style={{ lineHeight: theme.size("micro") * 1.9 }}
      >
        {label}
      </T>
    </View>
  );
}

/* --- الزر ---------------------------------------------------------------- */

export function Button({
  title,
  onPress,
  variant = "primary",
  busy,
  disabled,
  style,
  ...rest
}: PressableProps & {
  title: string;
  variant?: "primary" | "ghost" | "danger";
  busy?: boolean;
}) {
  const theme = useTheme();
  const background =
    variant === "primary"
      ? theme.colors.primary
      : variant === "danger"
      ? theme.colors.danger
      : "transparent";
  const foreground = variant === "ghost" ? theme.colors.text : readableOn(background);
  const off = disabled || busy;

  return (
    <Pressable
      {...rest}
      disabled={off}
      onPress={(event) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(event);
      }}
      style={({ pressed }) => [
        {
          minHeight: theme.touch,
          borderRadius: theme.radius - 4,
          backgroundColor: background,
          borderWidth: variant === "ghost" ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.colors.border,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: theme.space.sm,
          paddingHorizontal: theme.space.xl,
          opacity: off ? 0.55 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        style as any,
      ]}
    >
      {busy && <ActivityIndicator size="small" color={foreground} />}
      <T weight="bold" color={foreground}>
        {title}
      </T>
    </Pressable>
  );
}

/* --- الهيكل العظمي -------------------------------------------------------
 * ينتظر بشكل ما سيأتي، لا بدوّارة في وسط الفراغ.
 */

export function Skeleton({ height = 14, width = "100%", radius = 8 }: {
  height?: number;
  width?: any;
  radius?: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        height,
        width,
        borderRadius: radius,
        backgroundColor: theme.isDark ? "#20302A" : "#E9EFEB",
      }}
    />
  );
}

export function CardSkeleton() {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.space.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Skeleton width={90} />
        <Skeleton width={60} />
      </View>
      <Skeleton width="55%" height={18} />
      <Skeleton width="80%" height={12} />
    </Card>
  );
}

/* --- الفراغ -------------------------------------------------------------- */

export function Empty({ title, text }: { title: string; text?: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: theme.space.xxxl, gap: theme.space.sm }}>
      <T variant="title" weight="bold">
        {title}
      </T>
      {!!text && (
        <T muted style={{ textAlign: "center", maxWidth: 280 }}>
          {text}
        </T>
      )}
    </View>
  );
}

/* --- سطر الحقائق ---------------------------------------------------------
 * الحقائق تلتفّ ولا تُقصّ: لا سكرول أفقي في هذا التطبيق، والحقيقة التي لا
 * تتّسع تنزل سطرًا لا تختفي.
 */

export function Facts({ items }: { items: { icon?: string; label: string }[] }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: theme.space.md,
        alignItems: "center",
      }}
    >
      {items.map((item, index) => (
        <View
          key={index}
          style={{ flexDirection: "row", alignItems: "center", gap: theme.space.xs }}
        >
          {!!item.icon && <T variant="small">{item.icon}</T>}
          <T variant="small" muted>
            {item.label}
          </T>
        </View>
      ))}
    </View>
  );
}
