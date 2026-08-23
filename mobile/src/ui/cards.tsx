import React from "react";
import { View } from "react-native";

import { alpha } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { Badge, Card, Facts, T } from "./primitives";

/**
 * «صف الجدول» في الجوال.
 *
 * الجدول يفترض شاشة عريضة وعينًا تمسح يمينًا ويسارًا. على الجوال يصير الصف
 * بطاقة تُقرأ من أعلى إلى أسفل: معرّف وحالة، ثم اسم، ثم حقائق تلتفّ. لا سكرول
 * أفقي، ولا عمود يختفي خارج الشاشة.
 *
 * القاعدة: أربع حقائق كحد أقصى. ما زاد يذهب إلى صفحة التفصيل — البطاقة تُقرأ
 * من نصف متر، لا تُدرس.
 */
export function DataCard({
  id,
  status,
  statusTone = "neutral",
  title,
  facts,
  amount,
  amountTone,
  onPress,
}: {
  id: string;
  status?: string;
  statusTone?: "neutral" | "success" | "warning" | "danger" | "info" | "primary";
  title?: string;
  facts?: { icon?: string; label: string }[];
  amount?: string;
  amountTone?: "success" | "danger" | "text";
  onPress?: () => void;
}) {
  const theme = useTheme();
  const amountColor =
    amountTone === "success"
      ? theme.colors.success
      : amountTone === "danger"
      ? theme.colors.danger
      : theme.colors.text;

  return (
    <Card onPress={onPress} style={{ gap: theme.space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
        <T variant="small" weight="bold" muted style={{ flex: 1 }} numberOfLines={1}>
          {id}
        </T>
        {!!status && <Badge label={status} tone={statusTone} />}
      </View>

      {!!title && (
        <T variant="title" weight="bold" numberOfLines={1}>
          {title}
        </T>
      )}

      {!!amount && (
        <T variant="heading" weight="bold" color={amountColor}>
          {amount}
        </T>
      )}

      {!!facts?.length && (
        <>
          <View
            style={{
              height: 1,
              backgroundColor: alpha(theme.colors.border, 0.9),
              marginVertical: 2,
            }}
          />
          <Facts items={facts} />
        </>
      )}
    </Card>
  );
}

/**
 * بطاقة رقم: الرقم هو البطل، وما حوله شرح.
 *
 * الأرقام هي منتَج هذا التطبيق — تُقرأ والشمس على الشاشة واليد مشغولة، فتكبر
 * أكثر مما يبدو معقولًا على شاشة الحاسوب.
 */
export function StatCard({
  label,
  value,
  hint,
  tone,
  icon,
  wide,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "success" | "danger" | "warning" | "info";
  icon?: string;
  wide?: boolean;
}) {
  const theme = useTheme();
  const accent = tone ? theme.colors[tone] : theme.colors.primary;

  return (
    <Card
      style={{
        flex: wide ? undefined : 1,
        minWidth: wide ? "100%" : 150,
        gap: theme.space.xs,
        borderColor: alpha(accent, theme.isDark ? 0.35 : 0.18),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
        {!!icon && (
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              backgroundColor: alpha(accent, theme.isDark ? 0.24 : 0.12),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T variant="small">{icon}</T>
          </View>
        )}
        <T variant="small" muted numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </T>
      </View>
      <T variant="display" weight="bold" color={accent} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      {!!hint && (
        <T variant="micro" muted numberOfLines={1}>
          {hint}
        </T>
      )}
    </Card>
  );
}

/** صفّ بطاقات يلتفّ: بطاقتان في الشاشة العادية، وواحدة في الضيقة. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>{children}</View>
  );
}
