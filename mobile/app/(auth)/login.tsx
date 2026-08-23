import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import { login } from "../../src/api/client";
import { Button, Card, T } from "../../src/ui/primitives";
import { alpha, darken } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useQueryClient();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!username.trim() || !password) {
      setError("اكتب اسم المستخدم وكلمة المرور");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
      // الجلسة تغيّرت، فكل ما حُفظ لمستخدم سابق يسقط.
      await client.resetQueries();
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err?.status === 401 ? "اسم المستخدم أو كلمة المرور غير صحيحة" : err.message);
    } finally {
      setBusy(false);
    }
  }

  const field = {
    minHeight: theme.touch,
    borderRadius: theme.radius - 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.space.lg,
    fontFamily: theme.font(),
    fontSize: theme.size("body"),
    color: theme.colors.text,
    textAlign: "right" as const,
  };

  return (
    <LinearGradient
      colors={[darken(theme.colors.primary, 0.55), theme.colors.primary]}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: theme.space.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", marginBottom: theme.space.xxl }}>
            <View
              style={{
                width: 78,
                height: 78,
                borderRadius: 26,
                backgroundColor: alpha("#FFFFFF", 0.14),
                alignItems: "center",
                justifyContent: "center",
                marginBottom: theme.space.lg,
              }}
            >
              <T variant="display">🐑</T>
            </View>
            <T variant="heading" weight="bold" color="#FFFFFF">
              مزرعة زاد
            </T>
            <T variant="small" color={alpha("#FFFFFF", 0.8)}>
              كل رأس، وكل ليرة، في مكان واحد
            </T>
          </View>

          <Card style={{ gap: theme.space.lg }}>
            <View style={{ gap: theme.space.sm }}>
              <T variant="small" weight="bold" muted>
                اسم المستخدم
              </T>
              <TextInput
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="owner"
                placeholderTextColor={theme.colors.text_muted}
                style={field}
                returnKeyType="next"
              />
            </View>

            <View style={{ gap: theme.space.sm }}>
              <T variant="small" weight="bold" muted>
                كلمة المرور
              </T>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={theme.colors.text_muted}
                style={field}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            </View>

            {!!error && (
              <View
                style={{
                  backgroundColor: alpha(theme.colors.danger, 0.12),
                  padding: theme.space.md,
                  borderRadius: theme.radius - 6,
                }}
              >
                <T variant="small" color={theme.colors.danger}>
                  {error}
                </T>
              </View>
            )}

            <Button title={busy ? "جارٍ الدخول…" : "دخول"} onPress={submit} busy={busy} />
          </Card>

          <T
            variant="micro"
            color={alpha("#FFFFFF", 0.6)}
            style={{ textAlign: "center", marginTop: theme.space.xl }}
          >
            zadfarm.net
          </T>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
