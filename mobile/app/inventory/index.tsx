import React, { useState } from "react";

import { useMe, useMovements, useStockBalance, useStores } from "../../src/api/queries";
import { formatDate, formatNumber, money } from "../../src/lib/format";
import { useTheme } from "../../src/theme/ThemeProvider";
import { DataCard, StatCard, StatGrid } from "../../src/ui/cards";
import { Body, Chips, Header, Screen, Section } from "../../src/ui/layout";
import { Card, CardSkeleton, Empty, T } from "../../src/ui/primitives";

/** أسماء عربية لأنواع الحركة، فالجدول الإنجليزي لا يُقرأ في الحظيرة. */
const MOVE_LABEL: Record<string, string> = {
  receive: "استلام",
  issue: "صرف",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
  count: "جرد",
  write_off: "هدر",
};

const MOVE_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  receive: "success",
  issue: "warning",
  write_off: "danger",
  count: "neutral",
};

export default function InventoryScreen() {
  const theme = useTheme();
  const [store, setStore] = useState<string>("");
  const { data: me } = useMe();
  const { data: balance, isLoading, refetch, isRefetching } = useStockBalance();
  const { data: stores } = useStores();
  const { data: movements } = useMovements(store);
  const currency = me?.farm?.base_currency?.code ?? "USD";

  return (
    <Screen>
      <Header back title="مستودعات الأعلاف" subtitle="ما في المستودع وما خرج منه" />
      <Body onRefresh={refetch} refreshing={isRefetching}>
        {isLoading && !balance ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <StatGrid>
              <StatCard
                label="قيمة العلف كله"
                value={money(balance?.total_value ?? 0, currency)}
                icon="🌾"
                tone="primary"
                wide
              />
            </StatGrid>

            {(balance?.stores ?? []).map((row: any) => (
              <Card key={row.store_id ?? row.id} style={{ gap: theme.space.sm }}>
                <T variant="title" weight="bold">
                  {row.store_name ?? row.name}
                </T>
                <T variant="small" muted>
                  القيمة: {money(row.value ?? row.total_value ?? 0, currency)}
                </T>
                {(row.items ?? []).map((item: any, index: number) => (
                  <T key={index} variant="small">
                    • {item.item_name ?? item.name}:{" "}
                    <T variant="small" weight="bold">
                      {formatNumber(item.quantity ?? item.balance, 1)} {item.unit_name ?? ""}
                    </T>
                  </T>
                ))}
                {!(row.items ?? []).length && (
                  <T variant="small" muted>
                    لا رصيد في هذا المستودع
                  </T>
                )}
              </Card>
            ))}
          </>
        )}

        <Section title="آخر الحركات" />
        {!!stores?.length && (
          <Chips
            value={store}
            onChange={setStore}
            scroll
            options={[
              { key: "", label: "كل المستودعات" },
              ...stores.map((item) => ({
                key: item.id,
                label: item.display_name ?? item.name,
              })),
            ]}
          />
        )}

        {!movements?.results?.length ? (
          <Empty title="لا حركات بعد" text="الاستلام والصرف والجرد تظهر هنا." />
        ) : (
          movements.results.map((move: any) => (
            <DataCard
              key={move.id}
              id={formatDate(move.happened_on)}
              status={MOVE_LABEL[move.kind] ?? move.kind_label ?? move.kind}
              statusTone={MOVE_TONE[move.kind] ?? "neutral"}
              title={move.item_name ?? "صنف"}
              facts={[
                { icon: "⚖", label: `${formatNumber(move.quantity, 1)} ${move.unit_name ?? ""}` },
                ...(move.store_name ? [{ icon: "🏬", label: move.store_name }] : []),
                ...(move.notes ? [{ icon: "📝", label: move.notes }] : []),
              ]}
            />
          ))
        )}
      </Body>
    </Screen>
  );
}
