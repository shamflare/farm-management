import React, { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../src/api/client";
import { useMe } from "../../src/api/queries";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { Button, Card, T } from "../../src/ui/primitives";

/**
 * حسابي.
 *
 * الاسم الذي تناديك به كل الشاشات، وكلمة المرور. لا شيء غيرهما: اسم الدخول
 * لا يتغيّر لأنه ما يربط الشخص بما سجّله في سجل التدقيق.
 */
export default function ProfileScreen() {
  const theme = useTheme();
  const client = useQueryClient();
  const { data: me } = useMe();

  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (me) setForm({ full_name: me.user.full_name ?? "", phone: me.user.phone ?? "" });
  }, [me]);

  async function saveProfile() {
    if (!form.full_name.trim()) return setError("الاسم لا يكون فارغًا");
    setBusy("profile");
    setError("");
    setNote("");
    try {
      await api.patch("/auth/me/", { full_name: form.full_name.trim(), phone: form.phone });
      await client.invalidateQueries();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setNote("حُفظ الاسم");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function changePassword() {
    if (passwords.next.length < 8) return setError("كلمة المرور الجديدة ٨ أحرف على الأقل");
    setBusy("password");
    setError("");
    setNote("");
    try {
      await api.post("/auth/change-password/", {
        current_password: passwords.current,
        new_password: passwords.next,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPasswords({ current: "", next: "" });
      setNote("تغيّرت كلمة المرور");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const field = {
    minHeight: theme.touch,
    borderRadius: theme.radius - 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.space.lg,
    fontFamily: theme.font(),
    fontSize: theme.size("body"),
    color: theme.colors.text,
    textAlign: "right" as const,
  };

  return (
    <Screen>
      <Header back title="حسابي" subtitle={me?.user?.username} />
      <Body>
        <Card style={{ gap: theme.space.lg }}>
          <View style={{ gap: theme.space.sm }}>
            <T variant="small" weight="bold" muted>
              الاسم كما يظهر في التطبيق واللوحة
            </T>
            <TextInput
              value={form.full_name}
              onChangeText={(value) => setForm({ ...form, full_name: value })}
              style={field}
              placeholder="مثال: أبو محمد"
              placeholderTextColor={theme.colors.text_muted}
            />
          </View>
          <View style={{ gap: theme.space.sm }}>
            <T variant="small" weight="bold" muted>
              الهاتف
            </T>
            <TextInput
              value={form.phone}
              onChangeText={(value) => setForm({ ...form, phone: value })}
              keyboardType="phone-pad"
              style={field}
              placeholder="اختياري"
              placeholderTextColor={theme.colors.text_muted}
            />
          </View>
          <Button
            title={busy === "profile" ? "جارٍ الحفظ…" : "حفظ"}
            onPress={saveProfile}
            busy={busy === "profile"}
          />
        </Card>

        <Section title="كلمة المرور" />
        <Card style={{ gap: theme.space.lg }}>
          <View style={{ gap: theme.space.sm }}>
            <T variant="small" weight="bold" muted>
              كلمة المرور الحالية
            </T>
            <TextInput
              value={passwords.current}
              onChangeText={(value) => setPasswords({ ...passwords, current: value })}
              secureTextEntry
              style={field}
            />
          </View>
          <View style={{ gap: theme.space.sm }}>
            <T variant="small" weight="bold" muted>
              الجديدة (٨ أحرف فأكثر)
            </T>
            <TextInput
              value={passwords.next}
              onChangeText={(value) => setPasswords({ ...passwords, next: value })}
              secureTextEntry
              style={field}
            />
          </View>
          <Button
            title={busy === "password" ? "جارٍ التغيير…" : "تغيير كلمة المرور"}
            variant="ghost"
            onPress={changePassword}
            busy={busy === "password"}
          />
        </Card>

        {!!error && (
          <Card style={{ backgroundColor: alpha(theme.colors.danger, 0.12) }}>
            <T variant="small" color={theme.colors.danger}>
              {error}
            </T>
          </Card>
        )}
        {!!note && (
          <Card style={{ backgroundColor: alpha(theme.colors.success, 0.12) }}>
            <T variant="small" color={theme.colors.success}>
              ✓ {note}
            </T>
          </Card>
        )}

        <Section title="المزرعة" />
        <Card style={{ gap: theme.space.md }}>
          <Row label="الاسم" value={me?.farm?.name ?? "—"} />
          <Row label="العملة" value={me?.farm?.base_currency?.code ?? "—"} />
          <Row label="دوري" value={me?.role?.display_name ?? "—"} />
          <Row label="اسم الدخول" value={me?.user?.username ?? "—"} />
        </Card>
      </Body>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <T variant="small" muted style={{ flex: 1 }}>
        {label}
      </T>
      <T variant="small" weight="bold">
        {value}
      </T>
    </View>
  );
}
