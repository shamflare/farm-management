import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { alpha } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { T } from "./primitives";

export type Option = { id: string; display_name: string; hint?: string };

/**
 * اختيار من قائمة.
 *
 * كانت الخيارات أقراصًا مبعثرة: سبعة عشر بندًا للمصروف تملأ الشاشة كلها،
 * فيصير حقل المبلغ في أولها وزر الحفظ خارجها، ويضيع البند المطلوب بين
 * أشباهه. القائمة المنسدلة تُظهر المختار في سطر واحد، وتفتح البقية حين
 * تُطلب.
 *
 * وفيها بحث حين تطول: البحث في سبعة عشر بندًا بالإصبع أبطأ من كتابة حرفين.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = "اختر…",
  hint,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (id: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const chosen = options.find((option) => option.id === value);
  const searchable = options.length > 8;

  const shown = useMemo(() => {
    const needle = query.trim();
    if (!needle) return options;
    return options.filter((option) => option.display_name.includes(needle));
  }, [options, query]);

  if (!options.length) return null;

  return (
    <View style={{ gap: theme.space.sm }}>
      <T variant="small" weight="bold" muted>
        {label}
      </T>

      <Pressable
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        style={{
          minHeight: theme.touch,
          borderRadius: theme.radius - 6,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          paddingHorizontal: theme.space.lg,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space.sm,
        }}
      >
        <T style={{ flex: 1 }} numberOfLines={1} muted={!chosen}>
          {chosen?.display_name ?? placeholder}
        </T>
        <T variant="small" muted>
          ▾
        </T>
      </Pressable>

      {!!hint && (
        <T variant="micro" muted>
          {hint}
        </T>
      )}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(11,18,15,0.45)", justifyContent: "flex-end" }}
        >
          {/* الورقة تُفتح من الأسفل: أقرب إلى الإبهام من أعلى الشاشة */}
          <Pressable
            onPress={() => {}}
            style={{
              maxHeight: "78%",
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              paddingTop: theme.space.md,
              paddingBottom: insets.bottom + theme.space.md,
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 44,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.border,
                marginBottom: theme.space.md,
              }}
            />

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: theme.space.lg,
                marginBottom: theme.space.sm,
              }}
            >
              <T variant="title" weight="bold" style={{ flex: 1 }}>
                {label}
              </T>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <T variant="title" muted>
                  ✕
                </T>
              </Pressable>
            </View>

            {searchable && (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="ابحث…"
                placeholderTextColor={theme.colors.text_muted}
                autoFocus
                style={{
                  marginHorizontal: theme.space.lg,
                  marginBottom: theme.space.sm,
                  minHeight: theme.touch,
                  borderRadius: theme.radius - 6,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.background,
                  paddingHorizontal: theme.space.lg,
                  fontFamily: theme.font(),
                  fontSize: theme.size("body"),
                  color: theme.colors.text,
                  textAlign: "right",
                }}
              />
            )}

            <ScrollView keyboardShouldPersistTaps="handled">
              {shown.map((option) => {
                const active = option.id === value;
                return (
                  <Pressable
                    key={option.id || "none"}
                    onPress={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    style={{
                      minHeight: theme.touch + 4,
                      paddingHorizontal: theme.space.lg,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.space.sm,
                      backgroundColor: active
                        ? alpha(theme.colors.primary, theme.isDark ? 0.2 : 0.08)
                        : "transparent",
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T weight={active ? "bold" : "regular"} numberOfLines={1}>
                        {option.display_name}
                      </T>
                      {!!option.hint && (
                        <T variant="micro" muted numberOfLines={1}>
                          {option.hint}
                        </T>
                      )}
                    </View>
                    {active && (
                      <T weight="bold" color={theme.colors.primary}>
                        ✓
                      </T>
                    )}
                  </Pressable>
                );
              })}

              {!shown.length && (
                <T muted style={{ textAlign: "center", paddingVertical: theme.space.xl }}>
                  لا نتائج
                </T>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
