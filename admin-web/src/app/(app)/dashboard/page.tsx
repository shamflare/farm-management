"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, download, formatNumber, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import { visibleWidgets } from "@/lib/theme";
import Icon from "@/components/Icon";
import {
  CardSkeleton,
  ErrorNote,
  ExportButton,
  PageHeader,
  Stat,
  Tabs,
} from "@/components/ui";

type Dashboard = {
  period: { from: string | null; to: string | null };
  animals: Record<string, number>;
  money: {
    cash_on_hand: number;
    cash_accounts: { id: string; name: string; balance: number }[];
    income: number;
    expenses: number;
    net_profit: number;
    owed_to_farm: number;
    owed_by_farm: number;
    due_to_workers: number;
  };
  branches: {
    branch_id: string | null;
    code: string;
    name: string;
    income: number;
    expenses: number;
    net_profit: number;
    animals_on_farm: number;
  }[];
  milk: {
    liters_produced: number;
    liters_sold: number;
    daily_average: number;
    sales_value: number;
  };
  founding_total: number;
  stock_value: number;
  partners: {
    party_id: string;
    name: string;
    net_capital: number;
    ownership_percentage: number | null;
  }[];
  pending_approvals: number;
};

const PERIODS = [
  { key: "today", label: "اليوم" },
  { key: "week", label: "هذا الأسبوع" },
  { key: "month", label: "هذا الشهر" },
  { key: "year", label: "هذه السنة" },
  { key: "all", label: "كل الفترة" },
] as const;

type Period = (typeof PERIODS)[number]["key"];

export default function DashboardPage() {
  const { can, currency, me, alerts } = useApp();
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  // المزرعة تختار البطاقات التي تريدها من شاشة الهوية البصرية؛ هذه الصفحة
  // ترسم ما طُلب منها فقط، وبالترتيب الذي طُلب به.
  const wanted = visibleWidgets(me?.theme);
  const show = (key: string) => wanted.includes(key);

  useEffect(() => {
    setData(null);
    api
      .get<Dashboard>(`/reports/dashboard/?period=${period}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [period]);

  const head = (
    <PageHeader
      title="لوحة المعلومات"
      subtitle="كل رقم هنا محسوب من قيود الدفتر، وليس مُدخلًا يدويًا"
      farm={me?.farm?.name}
    >
      {can("reports.export") && (
        <ExportButton
          label="تصدير الفروع"
          onClick={() => download("/export/branches/").catch((err) => setError(err.message))}
        />
      )}
      <Tabs value={period} onChange={setPeriod} options={PERIODS as any} />
    </PageHeader>
  );

  if (error) {
    return (
      <>
        {head}
        <ErrorNote message={error} />
      </>
    );
  }

  if (!data) {
    return (
      <>
        {head}
        <CardSkeleton count={8} />
      </>
    );
  }

  const m = data.money;
  const a = data.animals;

  return (
    <>
      {head}

      {show("alerts") && alerts.length > 0 && (
        <div className="card mb-4 no-print">
          <div className="card-title">
            <span className="inline">
              <Icon name="bell" size={17} />
              ما يحتاج انتباهك
            </span>
            <span className="badge badge-warning">{alerts.length}</span>
          </div>
          <div className="stack-sm">
            {alerts.map((alert, index) => (
              <Link key={index} href={alert.link || "/dashboard"} className="alert-row">
                <span className={`alert-mark ${alert.severity}`} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <div className="alert-row-title">{alert.title}</div>
                  {alert.detail && <div className="stat-hint">{alert.detail}</div>}
                </span>
                <Icon name="chevronStart" size={16} className="muted" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.pending_approvals > 0 && (
        <div className="alert alert-warning no-print">
          <Icon name="shield" />
          <span>
            يوجد {data.pending_approvals} عملية بانتظار الموافقة —{" "}
            <Link href="/finance" className="link">
              راجعها الآن
            </Link>
          </span>
        </div>
      )}

      {show("branches") && data.branches?.length > 0 && (
        <div className="grid grid-3 mb-4">
          {data.branches.map((branch) => (
            <div className="card" key={branch.code}>
              <div className="card-title">
                <span className="inline">
                  <Icon name="sheep" size={16} className="muted" />
                  {branch.name}
                </span>
                <Link href="/reports" className="badge">
                  التفاصيل
                </Link>
              </div>
              <div className={`stat-value num ${branch.net_profit >= 0 ? "positive" : "negative"}`}>
                {money(branch.net_profit, currency)}
              </div>
              <div className="stat-hint">
                دخل {money(branch.income, currency)} · مصروف {money(branch.expenses, currency)}
              </div>
              {branch.animals_on_farm > 0 && (
                <div className="stat-hint">{formatNumber(branch.animals_on_farm)} حيوان في المزرعة</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-4 mb-4">
        {show("cash") && (
          <Stat
            label="النقد المتوفر"
            value={money(m.cash_on_hand, currency)}
            hint="الصناديق والحسابات البنكية"
            icon="wallet"
          />
        )}
        {show("profit") && (
          <Stat
            label="صافي الربح للفترة"
            value={money(m.net_profit, currency)}
            valueTone={m.net_profit >= 0 ? "positive" : "negative"}
            hint={`إيراد ${money(m.income, currency)} · مصروف ${money(m.expenses, currency)}`}
            icon={m.net_profit >= 0 ? "trendUp" : "trendDown"}
            tone={m.net_profit >= 0 ? "success" : "danger"}
          />
        )}
        {show("livestock") && (
          <Stat
            label="قيمة الحيوانات"
            value={money(a.estimated_value, currency)}
            hint={`${formatNumber(a.on_farm)} حيوان في المزرعة`}
            icon="sheep"
          />
        )}
        {show("worker_due") && (
          <Stat
            label="مستحق للعاملين"
            value={money(m.due_to_workers, currency)}
            valueTone={m.due_to_workers > 0 ? "negative" : undefined}
            hint="ما دفعه العاملون من جيوبهم ولم يُسدَّد"
            icon="users"
            tone={m.due_to_workers > 0 ? "danger" : undefined}
          />
        )}
        {show("receivable") && (
          <Stat
            label="لنا عند الناس"
            value={money(m.owed_to_farm, currency)}
            hint="ذمم العملاء"
            icon="arrowEnd"
            tone="success"
          />
        )}
        {show("payable") && (
          <Stat
            label="علينا للناس"
            value={money(m.owed_by_farm, currency)}
            hint="ذمم الموردين"
            icon="arrowStart"
            tone="warning"
          />
        )}
        {show("births") && (
          <Stat
            label="المواليد في الفترة"
            value={formatNumber(a.newborns_in_period ?? 0)}
            hint={`${formatNumber(a.births_in_period ?? 0)} ولادة`}
            icon="heart"
            tone="accent"
          />
        )}
        {show("sold_dead") && (
          <Stat
            label="المباع / النافق"
            value={`${formatNumber(a.sold ?? 0)} / ${formatNumber(a.dead ?? 0)}`}
            hint="محفوظون في السجل ولم يُحذفوا"
            icon="tag"
          />
        )}
        {show("milk") && (
          <Stat
            label="حليب الفترة"
            value={`${formatNumber(data.milk?.liters_produced ?? 0)} لتر`}
            hint={`مُباع منه ${formatNumber(data.milk?.liters_sold ?? 0)} لتر · ${money(
              data.milk?.sales_value ?? 0,
              currency
            )}`}
            icon="droplet"
            tone="info"
          />
        )}
        {show("stock") && (
          <Stat
            label="قيمة العلف في المستودعات"
            value={money(data.stock_value ?? 0, currency)}
            hint="أصل حتى يُصرف للحيوانات"
            icon="wheat"
            tone="accent"
          />
        )}
        {show("founding") && (
          <Stat
            label="التكاليف التأسيسية"
            value={money(data.founding_total ?? 0, currency)}
            hint="خارج حساب أرباح الفترة"
            icon="building"
          />
        )}
      </div>

      <div className="grid grid-2">
        {show("herd") && (
          <div className="card">
            <div className="card-title">
              <span className="inline">
                <Icon name="sheep" size={17} className="muted" />
                القطيع
              </span>
              <Link href="/animals" className="badge">
                عرض الكل
              </Link>
            </div>
            <div className="grid grid-4" style={{ gap: "var(--s3)" }}>
              {[
                { label: "الإجمالي", value: a.total },
                { label: "في المزرعة", value: a.on_farm },
                { label: "إناث", value: a.females },
                { label: "ذكور", value: a.males },
              ].map((cell) => (
                <div key={cell.label}>
                  <div className="stat-label">{cell.label}</div>
                  <div className="stat-value num" style={{ fontSize: "1.3rem" }}>
                    {formatNumber(cell.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {show("cash_accounts") && (
          <div className="card card-flush">
            <div className="card-title">
              <span className="inline">
                <Icon name="coins" size={17} className="muted" />
                الصناديق
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <tbody>
                  {m.cash_accounts.length === 0 && (
                    <tr>
                      <td className="muted">لا توجد صناديق بعد</td>
                    </tr>
                  )}
                  {m.cash_accounts.map((account) => (
                    <tr key={account.id}>
                      <td>{account.name}</td>
                      <td className="num strong text-end">{money(account.balance, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {show("partners") && data.partners.length > 0 && (
        <div className="card card-flush mt-4">
          <div className="card-title">
            <span className="inline">
              <Icon name="users" size={17} className="muted" />
              الشركاء
            </span>
            <Link href="/parties" className="badge">
              عرض الكل
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الشريك</th>
                  <th>نسبة الملكية</th>
                  <th>صافي رأس المال</th>
                </tr>
              </thead>
              <tbody>
                {data.partners.map((partner) => (
                  <tr key={partner.party_id}>
                    <td className="strong">{partner.name}</td>
                    <td className="num">
                      {partner.ownership_percentage != null
                        ? `${partner.ownership_percentage}%`
                        : "—"}
                    </td>
                    <td className="num strong">{money(partner.net_capital, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
