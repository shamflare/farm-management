import React, { useState } from "react";
import { View } from "react-native";

import { useMe, useMilk, useMilkReport } from "../../src/api/queries";
import { formatDate, formatNumber, money } from "../../src/lib/format";
import { useTheme } from "../../src/theme/ThemeProvider";
import { DataCard, StatCard, StatGrid } from "../../src/ui/cards";
import { Body, Chips, Header, Screen, Section } from "../../src/ui/layout";
import { Card, CardSkeleton, Empty, T } from "../../src/ui/primitives";

const PERIODS = [
  { key: "week", label: "الأسبوع" },
  { key: "month", label: "الشهر" },
  { key: "year", label: "السنة" },
  { key: "all", label: "الكل" },
] as const;

export default function MilkScreen() {
  const theme = useTheme();
  const [period, setPeriod] = useState<string>("month");
  const { data: me } = useMe();
  const { data: report, refetch: refetchReport, isRefetching } = useMilkReport(period);
  const { data: rows, isLoading, refetch } = useMilk();
  const currency = me?.farm?.base_currency?.code ?? "USD";

  const produced = Number(report?.totals?.liters_produced ?? report?.liters_produced ?? 0);
  const sold = Number(report?.totals?.liters_sold ?? report?.liters_sold ?? 0);
  const average = Number(report?.totals?.daily_average ?? report?.daily_average ?? 0);
  const value = Number(report?.totals?.sales_value ?? report?.sales_value ?? 0);
  const kept = Math.max(0, produced - sold);

  return (
    <Screen>
      <Header back title="الحليب" subtitle="الكمية تُسجَّل يوميًا ولو لم يُبع شيء" />
      <Body
        onRefresh={() => {
          refetch();
          refetchReport();
        }}
        refreshing={isRefetching}
      >
        <Chips value={period} onChange={setPeriod} options={PERIODS as any} />

        <StatGrid>
          <StatCard label="أُنتج" value={`${formatNumber(produced)} ل`} icon="🥛" tone="info" />
          <StatCard
            label="المعدّل اليومي"
            value={`${formatNumber(average, 1)} ل`}
            icon="📈"
            tone="primary"
          />
          <StatCard label="بيع" value={`${formatNumber(sold)} ل`} icon="💰" tone="success" />
          <StatCard label="بقي للبيت" value={`${formatNumber(kept)} ل`} icon="🏠" tone="warning" />
        </StatGrid>

        {value > 0 && (
          <Card>
            <T variant="small" muted>
              قيمة المبيعات في الفترة
            </T>
            <T variant="heading" weight="bold" color={theme.colors.success}>
              {money(value, currency)}
            </T>
          </Card>
        )}

        <Section title="آخر التسجيلات" />
        {isLoading && !rows ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : !rows?.results?.length ? (
          <Empty title="لا تسجيلات بعد" text="سجّل حليب اليوم من تبويب التسجيل." />
        ) : (
          rows.results.map((row: any) => (
            <DataCard
              key={row.id}
              id={formatDate(row.happened_on)}
              title={`${formatNumber(row.liters, 1)} لتر`}
              facts={[
                ...(row.branch_name ? [{ icon: "🏠", label: row.branch_name }] : []),
                ...(row.notes ? [{ icon: "📝", label: row.notes }] : []),
              ]}
            />
          ))
        )}

        <View style={{ height: theme.space.lg }} />
      </Body>
    </Screen>
  );
}
