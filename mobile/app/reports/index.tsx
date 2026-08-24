import React, { useState } from "react";
import { View } from "react-native";

import { useMe, useReport } from "../../src/api/queries";
import { formatNumber, money } from "../../src/lib/format";
import { alpha } from "../../src/theme/tokens";
import { useTheme } from "../../src/theme/ThemeProvider";
import { StatCard, StatGrid } from "../../src/ui/cards";
import { Body, Chips, Header, Screen, Section } from "../../src/ui/layout";
import { Badge, Card, CardSkeleton, Empty, T } from "../../src/ui/primitives";

const TABS = [
  { key: "branches", label: "الفروع" },
  { key: "profit-loss", label: "الأرباح" },
  { key: "trial-balance", label: "الميزان" },
  { key: "cash-flow", label: "النقد" },
  { key: "animals", label: "القطيع" },
] as const;

const PERIODS = [
  { key: "month", label: "الشهر" },
  { key: "year", label: "السنة" },
  { key: "all", label: "الكل" },
] as const;

export default function ReportsScreen() {
  const theme = useTheme();
  const [tab, setTab] = useState<string>("branches");
  const [period, setPeriod] = useState<string>("month");
  const { data: me } = useMe();
  const { data, isLoading, refetch, isRefetching } = useReport(tab, period);
  const currency = me?.farm?.base_currency?.code ?? "USD";
  const periodMatters = tab !== "trial-balance" && tab !== "animals";

  return (
    <Screen>
      <Header back title="التقارير" subtitle="محسوبة من القيود، لا مُدخلة يدويًا" />
      <Body onRefresh={refetch} refreshing={isRefetching}>
        <Chips value={tab} onChange={setTab} options={TABS as any} scroll />
        {periodMatters && <Chips value={period} onChange={setPeriod} options={PERIODS as any} />}

        {isLoading && !data ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {tab === "branches" && <Branches data={data} currency={currency} />}
            {tab === "profit-loss" && <ProfitLoss data={data} currency={currency} />}
            {tab === "trial-balance" && <TrialBalance data={data} currency={currency} />}
            {tab === "cash-flow" && <CashFlow data={data} currency={currency} />}
            {tab === "animals" && <Herd data={data} />}
          </>
        )}

        <View style={{ height: theme.space.lg }} />
      </Body>
    </Screen>
  );
}

/* --- مقارنة الفروع ------------------------------------------------------- */

function Branches({ data, currency }: { data: any; currency: string }) {
  const theme = useTheme();
  const branches = (data?.branches ?? []).filter((row: any) => row.code !== "shared");
  if (!branches.length) return <Empty title="لا بيانات فروع بعد" />;

  return (
    <>
      {branches.map((branch: any) => (
        <Card key={branch.code} style={{ gap: theme.space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <T variant="title" weight="bold" style={{ flex: 1 }}>
              {branch.name}
            </T>
            <Badge label={`${formatNumber(branch.animals_on_farm)} رأس`} tone="primary" />
          </View>
          <Line label="الإيراد" value={money(branch.total_income, currency)} tone="success" />
          <Line label="المصروف" value={money(branch.total_expenses, currency)} tone="danger" />
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 4 }} />
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <T weight="bold" style={{ flex: 1 }}>
              صافي الربح
            </T>
            <T
              variant="title"
              weight="bold"
              color={branch.net_profit >= 0 ? theme.colors.success : theme.colors.danger}
            >
              {money(branch.net_profit, currency)}
            </T>
          </View>
        </Card>
      ))}
    </>
  );
}

/* --- الأرباح والخسائر ---------------------------------------------------- */

function ProfitLoss({ data, currency }: { data: any; currency: string }) {
  const theme = useTheme();
  const net = Number(data?.net_profit ?? 0);
  return (
    <>
      <StatGrid>
        <StatCard label="الإيرادات" value={money(data?.total_income, currency)} icon="📥" tone="success" />
        <StatCard label="المصروفات" value={money(data?.total_expenses, currency)} icon="📤" tone="danger" />
        <StatCard
          label="صافي الربح"
          value={money(net, currency)}
          icon="📈"
          tone={net >= 0 ? "success" : "danger"}
          wide
        />
      </StatGrid>

      {!!data?.income?.length && (
        <>
          <Section title="الإيراد حسب البند" />
          <Card style={{ gap: 8 }}>
            {data.income.map((row: any, index: number) => (
              <Line key={index} label={row.name ?? row.category} value={money(row.total, currency)} tone="success" />
            ))}
          </Card>
        </>
      )}

      {!!data?.expenses?.length && (
        <>
          <Section title="المصروف حسب البند" />
          <Card style={{ gap: 8 }}>
            {data.expenses.map((row: any, index: number) => (
              <Line key={index} label={row.name ?? row.category} value={money(row.total, currency)} tone="danger" />
            ))}
          </Card>
        </>
      )}
      <View style={{ height: theme.space.sm }} />
    </>
  );
}

/* --- ميزان المراجعة ------------------------------------------------------ */

function TrialBalance({ data, currency }: { data: any; currency: string }) {
  const theme = useTheme();
  const rows = (data?.rows ?? []).filter((row: any) => Number(row.balance) !== 0);

  return (
    <>
      <Card
        style={{
          gap: 4,
          borderColor: data?.balanced ? theme.colors.success : theme.colors.danger,
        }}
      >
        <T variant="small" muted>
          حالة الدفتر
        </T>
        <T
          variant="title"
          weight="bold"
          color={data?.balanced ? theme.colors.success : theme.colors.danger}
        >
          {data?.balanced ? "✓ متوازن" : "✗ غير متوازن"}
        </T>
        <T variant="micro" muted>
          مدين {money(data?.total_debit, currency)} · دائن {money(data?.total_credit, currency)}
        </T>
      </Card>

      {!rows.length ? (
        <Empty title="لا أرصدة بعد" text="أول قيد يظهر هنا فورًا." />
      ) : (
        <Card style={{ gap: 10 }}>
          {rows.map((row: any, index: number) => (
            <Line
              key={index}
              label={`${row.account?.code ?? ""} ${row.account?.display_name ?? row.name ?? ""}`}
              value={money(row.balance, currency)}
            />
          ))}
        </Card>
      )}
    </>
  );
}

/* --- التدفق النقدي ------------------------------------------------------- */

function CashFlow({ data, currency }: { data: any; currency: string }) {
  const rows = data?.accounts ?? data?.rows ?? [];
  return (
    <>
      <StatGrid>
        <StatCard
          label="النقد المتوفر"
          value={money(data?.closing ?? data?.total ?? 0, currency)}
          icon="💵"
          tone="primary"
          wide
        />
        <StatCard label="داخل" value={money(data?.inflow ?? 0, currency)} icon="📥" tone="success" />
        <StatCard label="خارج" value={money(data?.outflow ?? 0, currency)} icon="📤" tone="danger" />
      </StatGrid>

      {!!rows.length && (
        <>
          <Section title="الصناديق" />
          <Card style={{ gap: 10 }}>
            {rows.map((row: any, index: number) => (
              <Line
                key={index}
                label={row.name ?? row.account_name ?? row.display_name}
                value={money(row.balance ?? row.closing ?? 0, currency)}
              />
            ))}
          </Card>
        </>
      )}
    </>
  );
}

/* --- تقرير القطيع -------------------------------------------------------- */

function Herd({ data }: { data: any }) {
  const totals = data?.totals ?? {};
  return (
    <>
      <StatGrid>
        <StatCard label="في المزرعة" value={formatNumber(totals.on_farm ?? 0)} icon="🐑" tone="primary" />
        <StatCard label="الكل" value={formatNumber(totals.all ?? 0)} icon="📋" />
        <StatCard label="مباع" value={formatNumber(totals.sold ?? 0)} icon="💰" tone="warning" />
        <StatCard label="نافق" value={formatNumber(totals.dead ?? 0)} icon="⚠️" tone="danger" />
      </StatGrid>

      {!!data?.by_branch?.length && (
        <>
          <Section title="حسب الفرع" />
          <Card style={{ gap: 10 }}>
            {data.by_branch.map((row: any, index: number) => (
              <Line key={index} label={row.name} value={`${formatNumber(row.count ?? row.on_farm)} رأس`} />
            ))}
          </Card>
        </>
      )}

      {!!data?.by_type?.length && (
        <>
          <Section title="حسب النوع" />
          <Card style={{ gap: 10 }}>
            {data.by_type.map((row: any, index: number) => (
              <Line key={index} label={row.name} value={`${formatNumber(row.count)} رأس`} />
            ))}
          </Card>
        </>
      )}
    </>
  );
}

/* --- سطر تقرير: اسم يسارًا ورقم يمينًا، بلا جدول ------------------------- */

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  const theme = useTheme();
  const color =
    tone === "success" ? theme.colors.success : tone === "danger" ? theme.colors.danger : undefined;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
      <T variant="small" muted style={{ flex: 1 }} numberOfLines={2}>
        {label}
      </T>
      <T variant="small" weight="bold" color={color}>
        {value}
      </T>
    </View>
  );
}
