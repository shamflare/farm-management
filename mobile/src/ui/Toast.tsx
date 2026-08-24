import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { alpha } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { T } from "./primitives";

/**
 * تأكيد الحفظ.
 *
 * على شاشة صغيرة يمتلئ النموذج بالحقول، فرسالة النجاح بين الحقول تُقرأ إن
 * صادفتها العين. هذه تطفو فوق كل شيء قرب الإبهام، وتنزلق داخلة وخارجة،
 * وتختفي وحدها — ما يُقال بعد الفعل لا يحتاج أن يبقى.
 */
export function Toast({ message, tone = "success" }: { message: string; tone?: "success" | "danger" }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 9 }).start();
    return () => {
      slide.setValue(0);
    };
  }, [message, slide]);

  if (!message) return null;
  const color = tone === "danger" ? theme.colors.danger : theme.colors.success;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: theme.space.lg,
        right: theme.space.lg,
        bottom: insets.bottom + theme.space.xxl,
        alignItems: "center",
        opacity: slide,
        transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space.sm,
          paddingVertical: theme.space.md,
          paddingHorizontal: theme.space.xl,
          borderRadius: 999,
          backgroundColor: color,
          shadowColor: "#0B120F",
          shadowOpacity: 0.28,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
          borderWidth: 1,
          borderColor: alpha("#FFFFFF", 0.18),
        }}
      >
        <T weight="bold" color="#FFFFFF">
          {tone === "danger" ? "✕" : "✓"}
        </T>
        <T weight="bold" color="#FFFFFF" style={{ flexShrink: 1 }} numberOfLines={2}>
          {message}
        </T>
      </View>
    </Animated.View>
  );
}
