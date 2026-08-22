"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, download, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import { visibleWidgets } from "@/lib/theme";

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
];

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value num ${tone ?? ""}`}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { can, currency, me, alerts } = useApp();
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  // The farm chooses which cards it wants from the branding screen; this page
  // only draws what was asked for, in the order it was asked for.
  const wanted = visibleWidgets(me?.theme);
  const show = (key: string) => wanted.includes(key);

  useEffect(() => {
    setData(null);
    api
      .get<Dashboard>(`/reports/dashboard/?period=${period}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [period]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="empty">جارٍ تحميل البيانات…</div>;

  const m = data.money;
  const a = data.animals;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">لوحة المعلومات</h1>
          <p className="page-sub">كل رقم هنا محسوب من قيود الدفتر، وليس مُدخلًا يدويًا</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {can("reports.export") && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => download("/export/branches/").catch((err) => setError(err.message))}
            >
              ⬇ تصدير الفروع
            </button>
          )}
          <div className="tabs" style={{ margin: 0 }}>
            {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`tab ${period === p.key ? "active" : ""}`}
              onClick={() => setPeriod(p.key)}
            >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {show("alerts") && alerts.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">
            <span>التنبيهات</span>
            <span className="badge badge-warning">{alerts.length}</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {alerts.map((alert, index) => (
              <Link
                key={index}
                href={alert.link || "/dashboard"}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "baseline",
                  color: "inherit",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <span>{alert.severity === "danger" ? "🔴" : alert.severity === "warning" ? "🟠" : "🔵"}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{alert.title}</span>
                  {alert.detail && <div className="stat-hint">{alert.detail}</div>}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.pending_approvals > 0 && (
        <div className="alert alert-error" style={{ marginBottom: 20 }}>
          يوجد {data.pending_approvals} عملية بانتظار الموافقة —{" "}
          <Link href="/finance" style={{ textDecoration: "underline" }}>
            راجعها الآن
          </Link>
        </div>
      )}

      {show("branches") && data.branches?.length > 0 && (
        <div className="grid grid-3" style={{ marginBottom: 20 }}>
          {data.branches.map((branch) => (
            <div className="card" key={branch.code}>
              <div className="card-title">
                <span>{branch.name}</span>
                <Link href="/reports" className="badge">التفاصيل</Link>
              </div>
              <div className={`stat-value num ${branch.net_profit >= 0 ? "positive" : "negative"}`}>
                {money(branch.net_profit, currency)}
              </div>
              <div className="stat-hint">
                دخل {money(branch.income, currency)} · مصروف {money(branch.expenses, currency)}
              </div>
              {branch.animals_on_farm > 0 && (
                <div className="stat-hint">{branch.animals_on_farm} حيوان</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        {show("cash") && (
          <Stat label="النقد المتوفر" value={money(m.cash_on_hand, currency)} hint="الصناديق والحسابات البنكية" />
        )}
        {show("profit") && (
          <Stat
            label="صافي الربح للفترة"
            value={money(m.net_profit, currency)}
            tone={m.net_profit >= 0 ? "positive" : "negative"}
            hint={`إيراد ${money(m.income, currency)} · مصروف ${money(m.expenses, currency)}`}
          />
        )}
        {show("livestock") && (
          <Stat label="قيمة الحيوانات" value={money(a.estimated_value, currency)} hint={`${a.on_farm} حيوان في المزرعة`} />
        )}
        {show("worker_due") && (
          <Stat
            label="مستحق للعامل"
            value={money(m.due_to_workers, currency)}
            tone={m.due_to_workers > 0 ? "negative" : undefined}
            hint="ما دفعه العاملون من جيوبهم ولم يُسدَّد"
          />
        )}
        {show("receivable") && (
          <Stat label="لنا عند الناس" value={money(m.owed_to_farm, currency)} hint="ذمم العملاء" />
        )}
        {show("payable") && (
          <Stat label="علينا للناس" value={money(m.owed_by_farm, currency)} hint="ذمم الموردين" />
        )}
        {show("births") && (
          <Stat
            label="المواليد في الفترة"
            value={String(a.newborns_in_period ?? 0)}
            hint={`${a.births_in_period ?? 0} ولادة`}
          />
        )}
        {show("sold_dead") && (
          <Stat label="المباع / النافق" value={`${a.sold ?? 0} / ${a.dead ?? 0}`} hint="محفوظون في السجل ولم يُحذفوا" />
        )}
        {show("milk") && (
          <Stat
            label="حليب الفترة"
            value={`${Number(data.milk?.liters_produced ?? 0).toLocaleString("en-US")} لتر`}
            hint={`مُباع منه ${Number(data.milk?.liters_sold ?? 0).toLocaleString("en-US")} لتر · ${money(
              data.milk?.sales_value ?? 0,
              currency
            )}`}
          />
        )}
        {show("stock") && (
          <Stat
            label="قيمة العلف في المستودعات"
            value={money(data.stock_value ?? 0, currency)}
            hint="أصل حتى يُصرف للحيوانات"
          />
        )}
        {show("founding") && (
          <Stat
            label="التكاليف التأسيسية"
            value={money(data.founding_total ?? 0, currency)}
            hint="خارج حساب أرباح الفترة"
          />
        )}
      </div>

      <div className="grid grid-2">
        {show("herd") && (
        <div className="card">
          <div className="card-title">
            <span>القطيع</span>
            <Link href="/animals" className="badge">
              عرض الكل
            </Link>
          </div>
          <div className="grid grid-4" style={{ gap: 12 }}>
            <div>
              <div className="stat-label">الإجمالي</div>
              <div className="stat-value num" style={{ fontSize: "1.3rem" }}>{a.total}</div>
            </div>
            <div>
              <div className="stat-label">في المزرعة</div>
              <div className="stat-value num" style={{ fontSize: "1.3rem" }}>{a.on_farm}</div>
            </div>
            <div>
              <div className="stat-label">إناث</div>
              <div className="stat-value num" style={{ fontSize: "1.3rem" }}>{a.females}</div>
            </div>
            <div>
              <div className="stat-label">ذكور</div>
              <div className="stat-value num" style={{ fontSize: "1.3rem" }}>{a.males}</div>
            </div>
          </div>
        </div>
        )}

        {show("cash_accounts") && (
        <div className="card">
          <div className="card-title">الصناديق</div>
          <div className="table-wrap" style={{ border: "none" }}>
            <table>
              <tbody>
                {m.cash_accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td className="num" style={{ textAlign: "left", fontWeight: 600 }}>
                      {money(account.balance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>

      {show("partners") && data.partners.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title">الشركاء</div>
          <div className="table-wrap" style={{ border: "none" }}>
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
                    <td>{partner.name}</td>
                    <td className="num">
                      {partner.ownership_percentage != null ? `${partner.ownership_percentage}%` : "—"}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {money(partner.net_capital, currency)}
                    </td>
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
