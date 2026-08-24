import React from "react";

import { useFoundingCosts, useFoundingSummary, useMe } from "../../src/api/queries";
import { formatDate, money } from "../../src/lib/format";
import { DataCard, StatCard, StatGrid } from "../../src/ui/cards";
import { Body, Header, Screen, Section } from "../../src/ui/layout";
import { Card, CardSkeleton, Empty, T } from "../../src/ui/primitives";

export default function FoundingScreen() {
  const { data: me } = useMe();
  const { data: summary, refetch: refetchSummary, isRefetching } = useFoundingSummary();
  const { data, isLoading, refetch } = useFoundingCosts();
  const currency = me?.farm?.base_currency?.code ?? "USD";
  const rows = data?.results ?? [];

  return (
    <Screen>
      <Header back title="التكاليف التأسيسية" subtitle="ما بُنيت به المزرعة" />
      <Body
        onRefresh={() => {
          refetch();
          refetchSummary();
        }}
        refreshing={isRefetching}
      >
        <StatGrid>
          <StatCard
            label="مجموع ما صُرف على التأسيس"
            value={money(summary?.total ?? 0, currency)}
            icon="🏗️"
            tone="primary"
            wide
          />
        </StatGrid>

        <Card>
          <T variant="small" muted>
            هذه المبالغ **لا تدخل** في أرباح الشهر: صُرفت مرة واحدة لبناء المزرعة،
            وتتراكم مع كل إضافة جديدة.
          </T>
        </Card>

        {!!summary?.by_type?.length && (
          <>
            <Section title="حسب النوع" />
            <Card style={{ gap: 8 }}>
              {summary.by_type.map((row: any, index: number) => (
                <T key={index} variant="small">
                  • {row.name ?? row.type_name}:{" "}
                  <T variant="small" weight="bold">
                    {money(row.total, currency)}
                  </T>
                </T>
              ))}
            </Card>
          </>
        )}

        <Section title="البنود" />
        {isLoading && !data ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : rows.length === 0 ? (
          <Empty title="لا بنود بعد" text="البناء والسيارات والمعدّات تُسجَّل من اللوحة." />
        ) : (
          rows.map((row: any) => (
            <DataCard
              key={row.id}
              id={formatDate(row.happened_on)}
              title={row.name ?? row.description ?? "بند تأسيسي"}
              amount={money(row.amount, currency)}
              facts={[
                ...(row.asset_type_name ? [{ icon: "🏷️", label: row.asset_type_name }] : []),
                ...(row.branch_name ? [{ icon: "🏠", label: row.branch_name }] : []),
              ]}
            />
          ))
        )}
      </Body>
    </Screen>
  );
}
