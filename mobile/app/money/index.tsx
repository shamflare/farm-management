import React, { useState } from "react";

import { useEntries, useMe } from "../../src/api/queries";
import { formatDate, money } from "../../src/lib/format";
import { DataCard } from "../../src/ui/cards";
import { Body, Chips, Header, Screen } from "../../src/ui/layout";
import { CardSkeleton, Empty } from "../../src/ui/primitives";

const KINDS = [
  { key: "", label: "الكل" },
  { key: "expense", label: "مصروف" },
  { key: "income", label: "إيراد" },
  { key: "transfer", label: "تحويل" },
  { key: "purchase", label: "شراء" },
  { key: "sale", label: "بيع" },
] as const;

/** ما لون القيد: خروج مال أحمر، دخوله أخضر، وما عداهما محايد. */
function tone(kind: string) {
  if (["expense", "purchase", "withdraw", "death"].includes(kind)) return "danger" as const;
  if (["income", "sale", "capital", "collect"].includes(kind)) return "success" as const;
  return "text" as const;
}

export default function MoneyScreen() {
  const [kind, setKind] = useState<string>("");
  const { data: me } = useMe();
  const { data, isLoading, refetch, isRefetching } = useEntries(kind);
  const currency = me?.farm?.base_currency?.code ?? "USD";
  const rows = data?.results ?? [];

  return (
    <Screen>
      <Header
        back
        title="الحركات المالية"
        subtitle={`${data?.count ?? 0} قيد · كل رقم من الدفتر`}
      />
      <Body onRefresh={refetch} refreshing={isRefetching}>
        <Chips value={kind} onChange={setKind} options={KINDS as any} scroll />

        {isLoading && !data ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : rows.length === 0 ? (
          <Empty
            title="لا حركات بعد"
            text="سجّل مصروفًا أو إيرادًا من تبويب التسجيل، ويظهر هنا فورًا."
          />
        ) : (
          rows.map((entry) => (
            <DataCard
              key={entry.id}
              id={`${entry.number} · ${formatDate(entry.date)}`}
              status={entry.status_label}
              statusTone={entry.status === "posted" ? "success" : "warning"}
              title={entry.memo || entry.kind_label}
              amount={money(entry.amount, currency)}
              amountTone={tone(entry.kind)}
              facts={[
                { icon: "🏷️", label: entry.kind_label },
                ...(entry.branch_name ? [{ icon: "🏠", label: entry.branch_name }] : []),
                ...(entry.created_by_name ? [{ icon: "✍️", label: entry.created_by_name }] : []),
              ]}
            />
          ))
        )}
      </Body>
    </Screen>
  );
}
