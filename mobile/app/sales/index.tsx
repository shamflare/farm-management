import React from "react";

import { useMe, useSales } from "../../src/api/queries";
import { formatDate, formatNumber, money } from "../../src/lib/format";
import { DataCard, StatCard, StatGrid } from "../../src/ui/cards";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { CardSkeleton, Empty } from "../../src/ui/primitives";

export default function SalesScreen() {
  const { data: me } = useMe();
  const { data, isLoading, refetch, isRefetching } = useSales();
  const currency = me?.farm?.base_currency?.code ?? "USD";
  const rows = data?.results ?? [];

  const total = rows.reduce((sum, row: any) => sum + Number(row.total_price ?? 0), 0);
  const due = rows.reduce((sum, row: any) => sum + Number(row.remaining ?? 0), 0);

  return (
    <Screen>
      <Header back title="بيع الحيوانات" subtitle={`${data?.count ?? 0} عملية`} />
      <Body onRefresh={refetch} refreshing={isRefetching}>
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
          <Empty title="لا مبيعات بعد" text="عملية البيع تُسجَّل من اللوحة مع سبب البيع." />
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
                { icon: "🐑", label: `${formatNumber(row.items?.length ?? row.count ?? 0)} رأس` },
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
