import React, { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useCatalog, useCommand, useMe } from "../../src/api/queries";
import { api } from "../../src/api/client";
import { money, today } from "../../src/lib/format";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { Body, Header, Screen } from "../../src/ui/layout";
import { Button, Card, T } from "../../src/ui/primitives";
import { useQuery } from "@tanstack/react-query";

/**
 * التسجيل السريع.
 *
 * هذه الشاشة هي سبب وجود التطبيق: ما يُسجَّل واقفًا في الحظيرة. ثلاثة أنواع
 * فقط في المرحلة الأولى، وكل واحد نموذج من ثلاثة حقول لا أكثر — كل حقل إضافي
 * هو سبب إضافي لتأجيل التسجيل إلى «لاحقًا» الذي لا يأتي.
 */

type Kind = "expense" | "income" | "milk";

const KINDS: { key: Kind; label: string; icon: string; tone: "danger" | "success" | "info" }[] = [
  { key: "expense", label: "مصروف", icon: "📤", tone: "danger" },
  { key: "income", label: "إيراد", icon: "📥", tone: "success" },
  { key: "milk", label: "حليب اليوم", icon: "🥛", tone: "info" },
];

export default function RecordScreen() {
  const theme = useTheme();
  const { data: me } = useMe();
  const { data: catalog } = useCatalog();

  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<string>("");
  const [branch, setBranch] = useState<string>("");
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  const currency = me?.farm?.base_currency?.code ?? "USD";

  // الصناديق التي يجوز الدفع منها — نقطة واحدة يعرفها حتى العامل.
  const { data: accounts } = useQuery({
    queryKey: ["pickable-accounts"],
    queryFn: () =>
      api
        .get<{ data: { id: string; display_name: string; is_cash: boolean }[] }>(
          "/accounts/pickable/"
        )
        .then((r) => r.data.filter((account) => account.is_cash)),
  });

  const cash = accounts?.[0];
  const branches = (catalog?.["branch"] ?? []).filter((item) => item.code !== "shared");
  const categories = useMemo(
    () => catalog?.[kind === "income" ? "revenue_category" : "expense_category"] ?? [],
    [catalog, kind]
  );

  const expense = useCommand<any>("/ops/expense/");
  const income = useCommand<any>("/ops/income/");
  const milk = useCommand<any>("/ops/milk-production/");
  const busy = expense.isPending || income.isPending || milk.isPending;

  function reset() {
    setAmount("");
    setNote("");
    setCategory("");
  }

  async function submit() {
    setError("");
    setDone("");
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("اكتب رقمًا أكبر من صفر");
      return;
    }

    try {
      if (kind === "milk") {
        await milk.mutateAsync({
          date: today(),
          liters: value,
          branch: branch || branches[0]?.id || null,
          notes: note,
        });
        setDone(`سُجّل ${value} لتر لليوم`);
      } else if (kind === "expense") {
        if (!cash) throw new Error("لا يوجد صندوق للدفع منه");
        await expense.mutateAsync({
          date: today(),
          amount: value,
          category: category || null,
          branch: branch || null,
          from_account: cash.id,
          notes: note,
        });
        setDone(`سُجّل مصروف ${money(value, currency)}`);
      } else {
        if (!cash) throw new Error("لا يوجد صندوق للقبض فيه");
        await income.mutateAsync({
          date: today(),
          amount: value,
          category: category || null,
          branch: branch || null,
          into_account: cash.id,
          notes: note,
        });
        setDone(`سُجّل إيراد ${money(value, currency)}`);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      reset();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(err.message ?? "تعذّر التسجيل");
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
      <Header title="تسجيل سريع" subtitle="ما يُكتب في الحظيرة، لا بعد العودة" />

      <Body>
        {/* نوع التسجيل */}
        <View style={{ flexDirection: "row", gap: theme.space.sm }}>
          {KINDS.map((item) => {
            const active = kind === item.key;
            const tint = theme.colors[item.tone];
            return (
              <Card
                key={item.key}
                onPress={() => {
                  setKind(item.key);
                  setError("");
                  setDone("");
                }}
                style={{
                  flex: 1,
                  alignItems: "center",
                  gap: 4,
                  paddingVertical: theme.space.lg,
                  borderColor: active ? tint : theme.colors.border,
                  backgroundColor: active
                    ? alpha(tint, theme.isDark ? 0.2 : 0.1)
                    : theme.colors.surface,
                }}
              >
                <T variant="title">{item.icon}</T>
                <T variant="micro" weight={active ? "bold" : "regular"} muted={!active}>
                  {item.label}
                </T>
              </Card>
            );
          })}
        </View>

        <Card style={{ gap: theme.space.lg }}>
          <View style={{ gap: theme.space.sm }}>
            <T variant="small" weight="bold" muted>
              {kind === "milk" ? "الكمية باللتر" : `المبلغ (${currency})`}
            </T>
            {/* الرقم كبير عمدًا: يُكتب بإبهام واحد ويُقرأ بنظرة */}
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.colors.text_muted}
              style={[
                field,
                {
                  fontSize: theme.size("display"),
                  fontFamily: theme.font("bold"),
                  minHeight: 68,
                  textAlign: "center",
                },
              ]}
            />
          </View>

          {kind !== "milk" && categories.length > 0 && (
            <Picker
              label="البند"
              value={category}
              options={[{ id: "", display_name: "بلا بند" }, ...categories]}
              onChange={setCategory}
            />
          )}

          {branches.length > 0 && (
            <Picker
              label="الفرع"
              value={branch}
              options={
                kind === "milk" ? branches : [{ id: "", display_name: "المزرعة كلها" }, ...branches]
              }
              onChange={setBranch}
            />
          )}

          <View style={{ gap: theme.space.sm }}>
            <T variant="small" weight="bold" muted>
              ملاحظة (اختيارية)
            </T>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="مثال: علف من معمل الشام"
              placeholderTextColor={theme.colors.text_muted}
              style={field}
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

          {!!done && (
            <View
              style={{
                backgroundColor: alpha(theme.colors.success, 0.12),
                padding: theme.space.md,
                borderRadius: theme.radius - 6,
              }}
            >
              <T variant="small" color={theme.colors.success}>
                ✓ {done}
              </T>
            </View>
          )}

          <Button title={busy ? "جارٍ الحفظ…" : "حفظ"} onPress={submit} busy={busy} />
        </Card>

        <T variant="micro" muted style={{ textAlign: "center" }}>
          كل تسجيل يُنسب لاسمك ويظهر في سجل التدقيق فورًا
        </T>
      </Body>
    </Screen>
  );
}

/** اختيار من قائمة قصيرة: أقراص تُلمس، لا قائمة منسدلة تحتاج نقرتين. */
function Picker({
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
