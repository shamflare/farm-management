import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../src/api/client";
import { useAnimals, useCatalog, useMe, usePickableAccounts } from "../../src/api/queries";
import { money, today } from "../../src/lib/format";
import { recall, recallFrom, remember } from "../../src/lib/recall";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { Field, Note } from "../../src/ui/forms";
import { Select } from "../../src/ui/Select";
import { Body, Header, Screen } from "../../src/ui/layout";
import { Button, Card, T } from "../../src/ui/primitives";
import { Toast } from "../../src/ui/Toast";

/**
 * التسجيل السريع.
 *
 * هذه الشاشة هي سبب وجود التطبيق: ما يُسجَّل واقفًا في الحظيرة. أربعة أشياء
 * تُكتب يوميًا — مصروف، إيراد، حليب، وزن — وكل واحد نموذج من ثلاثة حقول لا
 * أكثر: كل حقل إضافي سبب إضافي لتأجيل التسجيل إلى «لاحقًا» الذي لا يأتي.
 *
 * وكل قائمة تُفتح على آخر ما اختير: العلف يُدفع من نفس الصندوق ويُحمَّل على
 * نفس الفرع كل أسبوع، والسؤال عنه كل مرة عمل بلا فائدة.
 */

type Kind = "expense" | "income" | "milk" | "weight";

const KINDS: { key: Kind; label: string; icon: string; tone: "danger" | "success" | "info" | "primary" }[] = [
  { key: "expense", label: "مصروف", icon: "📤", tone: "danger" },
  { key: "income", label: "إيراد", icon: "📥", tone: "success" },
  { key: "milk", label: "حليب", icon: "🥛", tone: "info" },
  { key: "weight", label: "وزن", icon: "⚖", tone: "primary" },
];

export default function RecordScreen() {
  const theme = useTheme();
  const client = useQueryClient();
  const { data: me } = useMe();
  const { data: catalog } = useCatalog();
  const { data: accounts } = usePickableAccounts();

  const [kind, setKind] = useState<Kind>(() => (recall("record_kind", "expense") as Kind));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("");
  const [branch, setBranch] = useState("");
  const [account, setAccount] = useState("");
  const [search, setSearch] = useState("");
  const [animal, setAnimal] = useState<{ id: string; tag: string; name: string } | null>(null);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const currency = me?.farm?.base_currency?.code ?? "USD";
  const branches = useMemo(
    () => (catalog?.["branch"] ?? []).filter((item) => item.code !== "shared"),
    [catalog]
  );
  const categories = useMemo(
    () => catalog?.[kind === "income" ? "revenue_category" : "expense_category"] ?? [],
    [catalog, kind]
  );
  const cashAccounts = useMemo(
    () => (accounts ?? []).filter((item) => item.is_cash),
    [accounts]
  );

  const { data: herd } = useAnimals({ is_on_farm: "true", search: search.trim() });
  const matches = (herd?.results ?? []).slice(0, 8);

  // الاختيارات تُفتح على آخر ما استُعمل، ما دام لا يزال موجودًا.
  useEffect(() => {
    setBranch((prev) => prev || recallFrom("branch", branches, branches[0]?.id ?? ""));
  }, [branches]);

  useEffect(() => {
    const field = kind === "income" ? "into" : "from";
    setAccount(recallFrom(field, cashAccounts, cashAccounts[0]?.id ?? ""));
  }, [cashAccounts, kind]);

  useEffect(() => {
    const field = kind === "income" ? "revenue_category" : "expense_category";
    setCategory(recallFrom(field, categories, ""));
  }, [categories, kind]);

  useEffect(() => {
    remember("record_kind", kind);
  }, [kind]);

  function reset() {
    setAmount("");
    setNote("");
    setAnimal(null);
    setSearch("");
  }

  async function submit() {
    setError("");
    setDone("");
    const value = Number(amount);
    if (!value || value <= 0) return setError("اكتب رقمًا أكبر من صفر");

    setBusy(true);
    try {
      if (kind === "milk") {
        await api.post("/ops/milk-production/", {
          date: today(),
          liters: value,
          branch: branch || null,
          notes: note,
        });
        remember("branch", branch);
        setDone(`سُجّل ${value} لتر لليوم`);
      } else if (kind === "weight") {
        if (!animal) throw new Error("اختر الحيوان أولًا");
        await api.post("/weights/", {
          animal: animal.id,
          weight_kg: value,
          measured_on: today(),
          note,
        });
        setDone(`وزن ${animal.tag}: ${value} كغ`);
      } else {
        if (!account) throw new Error("لا يوجد صندوق");
        const payload: any = {
          date: today(),
          amount: value,
          category: category || null,
          branch: branch || null,
          notes: note,
        };
        if (kind === "expense") payload.from_account = account;
        else payload.into_account = account;

        await api.post(kind === "expense" ? "/ops/expense/" : "/ops/income/", payload);
        remember("branch", branch);
        remember(kind === "income" ? "into" : "from", account);
        remember(kind === "income" ? "revenue_category" : "expense_category", category);
        setDone(`سُجّل ${money(value, currency)}`);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await client.invalidateQueries();
      reset();
      setTimeout(() => setDone(""), 3600);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(err.message ?? "تعذّر التسجيل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Header title="تسجيل سريع" subtitle="ما يُكتب في الحظيرة، لا بعد العودة" />

      <Body>
        {/* النوع */}
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
                  paddingVertical: theme.space.md,
                  paddingHorizontal: 4,
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
          {kind === "weight" && (
            <View style={{ gap: theme.space.sm }}>
              {animal ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
                  <T variant="small" muted style={{ flex: 1 }}>
                    الحيوان
                  </T>
                  <T weight="bold">{animal.tag}</T>
                  <Button
                    title="تغيير"
                    variant="ghost"
                    onPress={() => setAnimal(null)}
                    style={{ minHeight: 34, paddingHorizontal: theme.space.lg }}
                  />
                </View>
              ) : (
                <>
                  <Field
                    label="ابحث عن الحيوان"
                    placeholder="رقم الحيوان أو اسمه"
                    value={search}
                    onChangeText={setSearch}
                  />
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm }}>
                    {matches.map((row) => (
                      <Card
                        key={row.id}
                        onPress={() => setAnimal(row)}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: theme.space.lg,
                          borderRadius: 999,
                        }}
                      >
                        <T variant="small">{row.tag}</T>
                      </Card>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

          <Field
            label={
              kind === "milk"
                ? "الكمية باللتر"
                : kind === "weight"
                ? "الوزن بالكيلوغرام"
                : `المبلغ (${currency})`
            }
            big
            keyboardType="decimal-pad"
            placeholder="0"
            value={amount}
            onChangeText={setAmount}
          />

          {(kind === "expense" || kind === "income") && (
            <>
              {categories.length > 0 && (
                <Select
                  label="البند"
                  value={category}
                  onChange={setCategory}
                  placeholder="بلا بند"
                  options={[
                    { id: "", display_name: "بلا بند" },
                    ...categories.map((item) => ({ id: item.id, display_name: item.display_name })),
                  ]}
                />
              )}
              <Select
                label={kind === "income" ? "إلى أين دخل؟" : "من أي صندوق؟"}
                value={account}
                onChange={setAccount}
                options={cashAccounts.map((item) => ({
                  id: item.id,
                  display_name: item.display_name,
                }))}
              />
            </>
          )}

          {kind !== "weight" && branches.length > 0 && (
            <Select
              label="الفرع"
              value={branch}
              onChange={setBranch}
              placeholder="المزرعة كلها"
              options={
                kind === "milk"
                  ? branches.map((item) => ({ id: item.id, display_name: item.display_name }))
                  : [
                      { id: "", display_name: "المزرعة كلها" },
                      ...branches.map((item) => ({ id: item.id, display_name: item.display_name })),
                    ]
              }
            />
          )}

          <Field
            label="ملاحظة"
            placeholder="اختيارية"
            value={note}
            onChangeText={setNote}
          />

          <Note text={error} tone="danger" />
          <Button title={busy ? "جارٍ الحفظ…" : "حفظ"} onPress={submit} busy={busy} />
        </Card>

        <T variant="micro" muted style={{ textAlign: "center" }}>
          كل تسجيل يُنسب لاسمك ويظهر في سجل التدقيق فورًا
        </T>
      </Body>

      <Toast message={done} />
    </Screen>
  );
}
