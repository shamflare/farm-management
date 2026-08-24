import React, { useState } from "react";
import { View } from "react-native";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../src/api/client";
import { useCan, useMe, usePurchases } from "../../src/api/queries";
import { formatDate, formatNumber, money } from "../../src/lib/format";
import { useTheme } from "../../src/theme/ThemeProvider";
import { DataCard, StatCard, StatGrid } from "../../src/ui/cards";
import { Field, Note } from "../../src/ui/forms";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { Button, Card, CardSkeleton, Empty, T } from "../../src/ui/primitives";

export default function PurchasesScreen() {
  const theme = useTheme();
  const can = useCan();
  const { data: me } = useMe();
  const { data, isLoading, refetch, isRefetching } = usePurchases();
  const [editing, setEditing] = useState<string>("");
  const currency = me?.farm?.base_currency?.code ?? "USD";
  const rows = data?.results ?? [];

  const total = rows.reduce((sum, row: any) => sum + Number(row.total_cost ?? 0), 0);
  const owed = rows.reduce((sum, row: any) => sum + Number(row.remaining ?? 0), 0);

  return (
    <Screen>
      <Header back title="شراء الحيوانات" subtitle={`${data?.count ?? 0} عملية`} />
      <Body onRefresh={refetch} refreshing={isRefetching}>
        <StatGrid>
          <StatCard label="إجمالي الشراء" value={money(total, currency)} icon="🛒" tone="primary" />
          <StatCard
            label="باقٍ على المزرعة"
            value={money(owed, currency)}
            icon="📤"
            tone={owed > 0 ? "warning" : "success"}
          />
        </StatGrid>

        <Section title="العمليات" />
        {isLoading && !data ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : rows.length === 0 ? (
          <Empty
            title="لا مشتريات بعد"
            text="عملية الشراء تُسجَّل من اللوحة: عدة رؤوس بقيدها المالي دفعة واحدة."
          />
        ) : (
          rows.map((row: any) => (
            <View key={row.id} style={{ gap: theme.space.sm }}>
              <DataCard
                id={formatDate(row.happened_on)}
                status={
                  row.settlement_status_label ?? (Number(row.remaining) > 0 ? "غير مسدّد" : "مسدّد")
                }
                statusTone={Number(row.remaining) > 0 ? "warning" : "success"}
                title={row.supplier_name || "بلا مورد"}
                amount={money(row.total_cost, currency)}
                amountTone="danger"
                onPress={can("purchases.edit") ? () => setEditing(editing === row.id ? "" : row.id) : undefined}
                facts={[
                  { icon: "🐑", label: `${formatNumber(row.items?.length ?? 0)} رأس` },
                  ...(Number(row.transport_cost)
                    ? [{ icon: "🚚", label: money(row.transport_cost, currency) }]
                    : []),
                  ...(Number(row.remaining)
                    ? [{ icon: "📤", label: `باقٍ ${money(row.remaining, currency)}` }]
                    : []),
                  ...(can("purchases.edit") ? [{ icon: "✏️", label: "اضغط للتصحيح" }] : []),
                ]}
              />

              {editing === row.id && (
                <CorrectionForm
                  purchase={row}
                  currency={currency}
                  onCancel={() => setEditing("")}
                  onDone={() => setEditing("")}
                />
              )}
            </View>
          ))
        )}
      </Body>
    </Screen>
  );
}

/**
 * تصحيح أرقام صفقة قائمة.
 *
 * القيد المرحّل لا يُعدَّل: يُعكس ويُكتب قيد صحيح مكانه، فتبقى القصة كاملة
 * في الدفتر. والرؤوس نفسها تبقى — إضافة رأس أو إخراجه صفقة أخرى.
 */
function CorrectionForm({
  purchase,
  currency,
  onCancel,
  onDone,
}: {
  purchase: any;
  currency: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const theme = useTheme();
  const client = useQueryClient();
  const [form, setForm] = useState({
    supplier_name: purchase.supplier_name ?? "",
    transport_cost: String(Number(purchase.transport_cost ?? 0)),
    commission_cost: String(Number(purchase.commission_cost ?? 0)),
    paid_amount: String(Number(purchase.paid_amount ?? 0)),
  });
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(
      (purchase.items ?? []).map((item: any) => [String(item.id), String(Number(item.unit_price))])
    )
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const animalsPrice = Object.values(prices).reduce((sum, value) => sum + Number(value || 0), 0);
  const total =
    animalsPrice + Number(form.transport_cost || 0) + Number(form.commission_cost || 0);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/purchases/${purchase.id}/`, {
        supplier_name: form.supplier_name.trim(),
        prices,
        transport_cost: form.transport_cost || 0,
        commission_cost: form.commission_cost || 0,
        paid_amount: form.paid_amount === "" ? null : form.paid_amount,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await client.invalidateQueries();
      onDone();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(err.message ?? "تعذّر التصحيح");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: theme.space.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <T weight="bold" style={{ flex: 1 }}>
          تصحيح الصفقة
        </T>
        <Button title="إلغاء" variant="ghost" onPress={onCancel} style={{ minHeight: 34 }} />
      </View>

      <Field
        label="البائع"
        value={form.supplier_name}
        onChangeText={(value) => setForm({ ...form, supplier_name: value })}
        placeholder="اكتب اسم البائع"
      />

      {(purchase.items ?? []).map((item: any) => (
        <Field
          key={item.id}
          label={`ثمن ${item.animal_tag}`}
          keyboardType="decimal-pad"
          value={prices[String(item.id)] ?? ""}
          onChangeText={(value) => setPrices({ ...prices, [String(item.id)]: value })}
        />
      ))}

      <Field
        label="النقل"
        keyboardType="decimal-pad"
        value={form.transport_cost}
        onChangeText={(value) => setForm({ ...form, transport_cost: value })}
      />
      <Field
        label="العمولة"
        keyboardType="decimal-pad"
        value={form.commission_cost}
        onChangeText={(value) => setForm({ ...form, commission_cost: value })}
      />
      <Field
        label="المدفوع"
        keyboardType="decimal-pad"
        value={form.paid_amount}
        onChangeText={(value) => setForm({ ...form, paid_amount: value })}
        hint={`المجموع الجديد ${money(total, currency)}`}
      />

      <Note text={error} tone="danger" />
      <T variant="micro" muted>
        يُعكس القيد القديم ويُكتب قيد صحيح مكانه، فيبقى أثر التصحيح في الدفتر وسجل التدقيق.
      </T>
      <Button title={busy ? "جارٍ التصحيح…" : "حفظ التصحيح"} onPress={submit} busy={busy} />
    </Card>
  );
}
