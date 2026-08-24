import React, { useMemo, useState } from "react";
import { View } from "react-native";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../src/api/client";
import {
  useAnimals,
  useCan,
  useCatalog,
  useMe,
  usePickableAccounts,
  useSales,
} from "../../src/api/queries";
import { formatDate, formatNumber, money, today } from "../../src/lib/format";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { DataCard, StatCard, StatGrid } from "../../src/ui/cards";
import { Field, Note, Picker } from "../../src/ui/forms";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { Button, Card, CardSkeleton, Empty, T } from "../../src/ui/primitives";

export default function SalesScreen() {
  const theme = useTheme();
  const can = useCan();
  const { data: me } = useMe();
  const { data, isLoading, refetch, isRefetching } = useSales();
  const [selling, setSelling] = useState(false);
  const currency = me?.farm?.base_currency?.code ?? "USD";
  const rows = data?.results ?? [];

  const total = rows.reduce((sum, row: any) => sum + Number(row.total_price ?? 0), 0);
  const due = rows.reduce((sum, row: any) => sum + Number(row.remaining ?? 0), 0);

  return (
    <Screen>
      <Header
        back
        title="بيع الحيوانات"
        subtitle={`${data?.count ?? 0} عملية`}
        right={
          can("sales.create") ? (
            <Card
              onPress={() => setSelling((open) => !open)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: theme.space.md,
                borderRadius: 999,
                backgroundColor: alpha("#FFFFFF", 0.18),
                borderColor: "transparent",
              }}
            >
              <T variant="small" weight="bold" color="#FFFFFF">
                {selling ? "إغلاق" : "بيع جديد"}
              </T>
            </Card>
          ) : null
        }
      />

      <Body onRefresh={refetch} refreshing={isRefetching}>
        {selling && <SaleForm currency={currency} onDone={() => setSelling(false)} />}

        <StatGrid>
          <StatCard label="إجمالي البيع" value={money(total, currency)} icon="💰" tone="success" />
          <StatCard
            label="لنا عند الزبائن"
            value={money(due, currency)}
            icon="📥"
            tone={due > 0 ? "warning" : "success"}
          />
        </StatGrid>

        <Section title="العمليات" />
        {isLoading && !data ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : rows.length === 0 ? (
          <Empty title="لا مبيعات بعد" text="سجّل أول بيع من زر «بيع جديد» في الأعلى." />
        ) : (
          rows.map((row: any) => (
            <DataCard
              key={row.id}
              id={formatDate(row.happened_on)}
              status={
                row.settlement_status_label ?? (Number(row.remaining) > 0 ? "غير محصّل" : "محصّل")
              }
              statusTone={Number(row.remaining) > 0 ? "warning" : "success"}
              title={row.customer_name || "بلا زبون"}
              amount={money(row.total_price, currency)}
              amountTone="success"
              facts={[
                { icon: "🐑", label: `${formatNumber(row.items?.length ?? 0)} رأس` },
                ...(row.sale_reason_name ? [{ icon: "🏷️", label: row.sale_reason_name }] : []),
                ...(Number(row.remaining)
                  ? [{ icon: "📥", label: `باقٍ ${money(row.remaining, currency)}` }]
                  : []),
              ]}
            />
          ))
        )}
      </Body>
    </Screen>
  );
}

/**
 * بيع من السوق.
 *
 * أبسط ما يكفي ليُسجَّل البيع لحظة حدوثه: رأس واحد وثمنه واسم الزبون مكتوبًا.
 * البيع بعدة رؤوس في صفقة واحدة يبقى على اللوحة — نادر، ويحتاج جدولًا.
 */
function SaleForm({ currency, onDone }: { currency: string; onDone: () => void }) {
  const theme = useTheme();
  const client = useQueryClient();
  const { data: catalog } = useCatalog();
  const { data: accounts } = usePickableAccounts();
  const { data: herd } = useAnimals({ is_on_farm: "true" });

  const [form, setForm] = useState({
    animal: "",
    unit_price: "",
    customer_name: "",
    sale_reason: "",
    received: "",
  });
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const cash = accounts?.find((account) => account.is_cash);
  const reasons = catalog?.["sale_reason"] ?? [];
  const animals = useMemo(() => {
    const rows = herd?.results ?? [];
    const needle = search.trim();
    return (needle ? rows.filter((row) => `${row.tag} ${row.name}`.includes(needle)) : rows).slice(0, 12);
  }, [herd, search]);

  const chosen = (herd?.results ?? []).find((row) => row.id === form.animal);

  async function submit() {
    setError("");
    setDone("");
    if (!form.animal) return setError("اختر الرأس المباع");
    const price = Number(form.unit_price);
    if (!price || price <= 0) return setError("اكتب سعر البيع");
    if (!cash) return setError("لا يوجد صندوق يُقبض فيه");

    setBusy(true);
    try {
      await api.post("/sales/", {
        date: today(),
        customer_name: form.customer_name.trim(),
        into_account: cash.id,
        sale_reason: form.sale_reason || null,
        received_amount: form.received === "" ? String(price) : form.received,
        items: [{ animal: form.animal, unit_price: String(price) }],
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await client.invalidateQueries();
      setDone(`بيع ${chosen?.tag ?? ""} بـ ${money(price, currency)}`);
      setForm({ animal: "", unit_price: "", customer_name: "", sale_reason: "", received: "" });
      setSearch("");
      setTimeout(onDone, 1200);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(err.message ?? "تعذّر تسجيل البيع");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: theme.space.lg }}>
      <T variant="title" weight="bold">
        بيع جديد
      </T>

      <Field
        label="ابحث عن الرأس"
        placeholder="رقم الحيوان أو اسمه"
        value={search}
        onChangeText={setSearch}
      />

      <View style={{ gap: theme.space.sm }}>
        <T variant="small" weight="bold" muted>
          الرأس المباع
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm }}>
          {animals.map((animal) => {
            const active = form.animal === animal.id;
            return (
              <Card
                key={animal.id}
                onPress={() => setForm({ ...form, animal: animal.id })}
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
                  {animal.tag}
                  {animal.branch_name ? ` · ${animal.branch_name}` : ""}
                </T>
              </Card>
            );
          })}
          {!animals.length && (
            <T variant="small" muted>
              لا رؤوس مطابقة
            </T>
          )}
        </View>
      </View>

      <Field
        label={`سعر البيع (${currency})`}
        big
        keyboardType="decimal-pad"
        placeholder="0"
        value={form.unit_price}
        onChangeText={(value) => setForm({ ...form, unit_price: value })}
      />

      <Field
        label="الزبون"
        placeholder="اكتب اسم الزبون"
        value={form.customer_name}
        onChangeText={(value) => setForm({ ...form, customer_name: value })}
        hint="اسم جديد يُضاف إلى الأشخاص وحده، والمكرّر يعود إلى سجلّه"
      />

      {!!reasons.length && (
        <Picker
          label="سبب البيع"
          value={form.sale_reason}
          onChange={(value) => setForm({ ...form, sale_reason: value })}
          options={[
            { id: "", display_name: "—" },
            ...reasons.map((item) => ({ id: item.id, display_name: item.display_name })),
          ]}
        />
      )}

      <Field
        label="المقبوض"
        keyboardType="decimal-pad"
        placeholder={form.unit_price || "0"}
        value={form.received}
        onChangeText={(value) => setForm({ ...form, received: value })}
        hint="اتركه فارغًا إن قُبض الثمن كاملًا؛ الباقي يُسجَّل دَينًا على الزبون"
      />

      <Note text={error} tone="danger" />
      <Note text={done} tone="success" />
      <Button title={busy ? "جارٍ التسجيل…" : "تسجيل البيع"} onPress={submit} busy={busy} />
    </Card>
  );
}
