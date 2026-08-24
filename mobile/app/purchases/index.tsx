import React from "react";

import { useMe, usePurchases } from "../../src/api/queries";
import { formatDate, formatNumber, money } from "../../src/lib/format";
import { DataCard, StatCard, StatGrid } from "../../src/ui/cards";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { CardSkeleton, Empty } from "../../src/ui/primitives";

export default function PurchasesScreen() {
  const { data: me } = useMe();
  const { data, isLoading, refetch, isRefetching } = usePurchases();
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
            <DataCard
              key={row.id}
              id={formatDate(row.happened_on)}
              status={row.settlement_status_label ?? (Number(row.remaining) > 0 ? "غير مسدّد" : "مسدّد")}
              statusTone={Number(row.remaining) > 0 ? "warning" : "success"}
              title={row.supplier_name || "بلا مورد"}
              amount={money(row.total_cost, currency)}
              amountTone="danger"
              facts={[
                { icon: "🐑", label: `${formatNumber(row.items?.length ?? row.count ?? 0)} رأس` },
                ...(Number(row.transport_cost)
                  ? [{ icon: "🚚", label: money(row.transport_cost, currency) }]
                  : []),
                ...(Number(row.remaining)
                  ? [{ icon: "📤", label: `باقٍ ${money(row.remaining, currency)}` }]
                  : []),
              ]}
            />
          ))
        )}
      </Body>
    </Screen>
  );
}
