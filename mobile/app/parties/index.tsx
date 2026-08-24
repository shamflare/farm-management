import React, { useState } from "react";

import { useMe, useParties } from "../../src/api/queries";
import { money } from "../../src/lib/format";
import { DataCard } from "../../src/ui/cards";
import { Body, Chips, Header, Screen } from "../../src/ui/layout";
import { CardSkeleton, Empty } from "../../src/ui/primitives";

const KINDS = [
  { key: "", label: "الكل" },
  { key: "partner", label: "شركاء" },
  { key: "worker", label: "عاملون" },
  { key: "supplier", label: "موردون" },
  { key: "customer", label: "زبائن" },
] as const;

const KIND_LABEL: Record<string, string> = {
  partner: "شريك",
  worker: "عامل",
  supplier: "مورد",
  customer: "زبون",
  other: "أخرى",
};

export default function PartiesScreen() {
  const [kind, setKind] = useState<string>("");
  const { data: me } = useMe();
  const { data, isLoading, refetch, isRefetching } = useParties(kind);
  const currency = me?.farm?.base_currency?.code ?? "USD";
  const rows = data?.results ?? [];

  return (
    <Screen>
      <Header back title="الأشخاص والحسابات" subtitle={`${data?.count ?? 0} سجل`} />
      <Body onRefresh={refetch} refreshing={isRefetching}>
        <Chips value={kind} onChange={setKind} options={KINDS as any} scroll />

        {isLoading && !data ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : rows.length === 0 ? (
          <Empty
            title="لا أشخاص بعد"
            text="الشركاء والعاملون والموردون والزبائن يُضافون من اللوحة."
          />
        ) : (
          rows.map((party) => {
            // الرصيد يأتي بإشارة: موجب يعني لنا عنده، سالب يعني علينا له.
            const balance = Number(
              party.summary?.balance ?? party.summary?.net_capital ?? 0
            );
            return (
              <DataCard
                key={party.id}
                id={KIND_LABEL[party.kind] ?? party.kind}
                status={party.is_active ? undefined : "موقوف"}
                statusTone="neutral"
                title={party.name}
                amount={balance ? money(Math.abs(balance), currency) : undefined}
                amountTone={balance > 0 ? "success" : balance < 0 ? "danger" : "text"}
                facts={[
                  {
                    icon: balance > 0 ? "📥" : balance < 0 ? "📤" : "⚖",
                    label:
                      balance > 0 ? "لنا عنده" : balance < 0 ? "علينا له" : "لا رصيد",
                  },
                  ...(party.phone ? [{ icon: "📞", label: party.phone }] : []),
                ]}
              />
            );
          })
        )}
      </Body>
    </Screen>
  );
}
