import React from "react";
import { TextInput, TextInputProps, View } from "react-native";

import { alpha } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { Card, T } from "./primitives";

/**
 * حقول النماذج.
 *
 * كل نموذج في التطبيق يُبنى من هذه القطع، فتُصلَح مسافة أو لون مرة واحدة لا
 * في اثني عشر ملفًا. والحقول كبيرة عمدًا: تُملأ بإبهام واحد وفي ضوء الشمس.
 */

export function Field({
  label,
  hint,
  big,
  style,
  ...rest
}: TextInputProps & { label: string; hint?: string; big?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space.sm }}>
      <T variant="small" weight="bold" muted>
        {label}
      </T>
      <TextInput
        placeholderTextColor={theme.colors.text_muted}
        {...rest}
        style={[
          {
            minHeight: big ? 66 : theme.touch,
            borderRadius: theme.radius - 6,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            paddingHorizontal: theme.space.lg,
            fontFamily: big ? theme.font("bold") : theme.font(),
            fontSize: big ? theme.size("display") : theme.size("body"),
            color: theme.colors.text,
            textAlign: big ? "center" : "right",
          },
          style as any,
        ]}
      />
      {!!hint && (
        <T variant="micro" muted>
          {hint}
        </T>
      )}
    </View>
  );
}

/** اختيار من قائمة قصيرة: أقراص تُلمس، لا قائمة منسدلة تحتاج نقرتين. */
export function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; display_name: string }[];
  onChange: (id: string) => void;
}) {
  const theme = useTheme();
  if (!options.length) return null;
  return (
    <View style={{ gap: theme.space.sm }}>
      <T variant="small" weight="bold" muted>
        {label}
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm }}>
        {options.map((option) => {
          const active = value === option.id;
          return (
            <Card
              key={option.id || "none"}
              onPress={() => onChange(option.id)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: theme.space.lg,
                borderRadius: 999,
                borderColor: active ? theme.colors.primary : theme.colors.border,
                backgroundColor: active
                  ? alpha(theme.colors.primary, theme.isDark ? 0.24 : 0.1)
                  : theme.colors.surface,
              }}
            >
              <T variant="small" weight={active ? "bold" : "regular"} muted={!active}>
                {option.display_name}
              </T>
            </Card>
          );
        })}
      </View>
    </View>
  );
}

/** رسالة خطأ أو نجاح بنفس الشكل في كل نموذج. */
export function Note({ text, tone }: { text: string; tone: "danger" | "success" }) {
  const theme = useTheme();
  if (!text) return null;
  const color = tone === "danger" ? theme.colors.danger : theme.colors.success;
  return (
    <View
      style={{
        backgroundColor: alpha(color, 0.12),
        padding: theme.space.md,
        borderRadius: theme.radius - 6,
      }}
    >
      <T variant="small" color={color}>
        {tone === "success" ? "✓ " : ""}
        {text}
      </T>
    </View>
  );
}
