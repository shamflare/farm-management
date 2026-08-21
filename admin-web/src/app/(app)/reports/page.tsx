"use client";

import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";

const TABS = [
  { key: "branches", label: "مقارنة الفروع" },
  { key: "trial", label: "ميزان المراجعة" },
  { key: "pl", label: "الأرباح والخسائر" },
  { key: "cash", label: "التدفق النقدي" },
  { key: "categories", label: "المصروفات حسب البند" },
  { key: "animals", label: "تقرير القطيع" },
];

const PERIODS = [
  { key: "month", label: "هذا الشهر" },
  { key: "year", label: "هذه السنة" },
  { key: "all", label: "كل الفترة" },
];

export default function ReportsPage() {
  const { currency } = useApp();
  const [tab, setTab] = useState("branches");
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const paths: Record<string, string> = {
      branches: `/reports/branches/?period=${period}`,
      trial: "/reports/trial-balance/",
      pl: `/reports/profit-loss/?period=${period}`,
      cash: `/reports/cash-flow/?period=${period}`,
      categories: `/reports/categories/?period=${period}&type=expense`,
      animals: "/reports/animals/",
    };
    setData(null);
    api.get(paths[tab]).then(setData).catch((err) => setError(err.message));
  }, [tab, period]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">التقارير</h1>
          <p className="page-sub">مشتقة بالكامل من قيود الدفتر المرحّلة</p>
        </div>
        {tab !== "trial" && tab !== "animals" && (
          <div className="tabs" style={{ margin: 0 }}>
            {PERIODS.map((p) => (
              <button key={p.key} className={`tab ${period === p.key ? "active" : ""}`} onClick={() => setPeriod(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!data && <div className="empty">جارٍ التحميل…</div>}

      {data && tab === "branches" && (
        <>
          <div className="grid grid-2" style={{ marginBottom: 16 }}>
            {data.branches.map((column: any) => (
              <div className="card" key={column.code}>
                <div className="card-title">{column.name}</div>
                <div className={`stat-value num ${Number(column.net_profit) >= 0 ? "positive" : "negative"}`}>
                  {money(column.net_profit, currency)}
                </div>
                <div className="stat-hint" style={{ marginBottom: 12 }}>
                  صافي الربح للفترة
                </div>
                <table>
                  <tbody>
                    <tr>
                      <td>الدخل</td>
                      <td className="num positive" style={{ textAlign: "left", fontWeight: 600 }}>
                        {money(column.total_income, currency)}
                      </td>
                    </tr>
                    <tr>
                      <td>المصروفات</td>
                      <td className="num negative" style={{ textAlign: "left", fontWeight: 600 }}>
                        {money(column.total_expenses, currency)}
                      </td>
                    </tr>
                    <tr>
                      <td>عدد الحيوانات</td>
                      <td className="num" style={{ textAlign: "left" }}>{column.animals_on_farm}</td>
                    </tr>
                    <tr>
                      <td>قيمة العلف في المستودع</td>
                      <td className="num" style={{ textAlign: "left" }}>{money(column.stock_value, currency)}</td>
                    </tr>
                    {column.milk && Number(column.milk.liters_produced) > 0 && (
                      <tr>
                        <td>الحليب المنتج</td>
                        <td className="num" style={{ textAlign: "left" }}>
                          {Number(column.milk.liters_produced).toLocaleString("en-US")} لتر
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="card-title" style={{ marginTop: 16 }}>بنود الدخل</div>
                <SimpleTable rows={column.income} currency={currency} />
                <div className="card-title" style={{ marginTop: 16 }}>بنود المصروف</div>
                <SimpleTable rows={column.expenses} currency={currency} />
              </div>
            ))}
          </div>

          <div className="grid grid-3">
            <div className="card">
              <div className="stat-label">دخل المزرعة كاملة</div>
              <div className="stat-value num positive">{money(data.farm_total.total_income, currency)}</div>
            </div>
            <div className="card">
              <div className="stat-label">مصروفات المزرعة كاملة</div>
              <div className="stat-value num negative">{money(data.farm_total.total_expenses, currency)}</div>
            </div>
            <div className="card">
              <div className="stat-label">التكاليف التأسيسية (خارج الأرباح)</div>
              <div className="stat-value num">{money(data.founding_total, currency)}</div>
            </div>
          </div>
        </>
      )}

      {data && tab === "trial" && (
        <>
          <div className={`alert ${data.balanced ? "alert-ok" : "alert-error"}`}>
            {data.balanced
              ? `الميزان متوازن: ${money(data.total_debit, currency)} مدين = ${money(data.total_credit, currency)} دائن`
              : `الميزان غير متوازن بفارق ${money(data.difference, currency)}`}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>الرمز</th><th>الحساب</th><th>النوع</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr>
              </thead>
              <tbody>
                {data.rows.map((row: any) => (
                  <tr key={row.code}>
                    <td className="num muted">{row.code}</td>
                    <td>{row.name}</td>
                    <td className="muted">{ACCOUNT_TYPE[row.type] ?? row.type}</td>
                    <td className="num">{money(row.debit, currency)}</td>
                    <td className="num">{money(row.credit, currency)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{money(row.balance, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data && tab === "pl" && (
        <div className="grid grid-2">
          <div className="card">
            <div className="card-title">الإيرادات · {money(data.total_income, currency)}</div>
            <SimpleTable rows={data.income} currency={currency} />
          </div>
          <div className="card">
            <div className="card-title">المصروفات · {money(data.total_expenses, currency)}</div>
            <SimpleTable rows={data.expenses} currency={currency} />
          </div>
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="stat-label">صافي الربح</div>
            <div className={`stat-value num ${data.net_profit >= 0 ? "positive" : "negative"}`}>
              {money(data.net_profit, currency)}
            </div>
          </div>
        </div>
      )}

      {data && tab === "cash" && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            <div className="card"><div className="stat-label">داخل</div><div className="stat-value num positive">{money(data.total_in, currency)}</div></div>
            <div className="card"><div className="stat-label">خارج</div><div className="stat-value num negative">{money(data.total_out, currency)}</div></div>
            <div className="card"><div className="stat-label">الصافي</div><div className="stat-value num">{money(data.net, currency)}</div></div>
            <div className="card"><div className="stat-label">النقد الحالي</div><div className="stat-value num">{money(data.closing_cash, currency)}</div></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>نوع العملية</th><th>داخل</th><th>خارج</th><th>عدد</th></tr></thead>
              <tbody>
                {data.by_kind.map((row: any) => (
                  <tr key={row.kind}>
                    <td>{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td className="num positive">{money(row.in, currency)}</td>
                    <td className="num negative">{money(row.out, currency)}</td>
                    <td className="num">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data && tab === "categories" && (
        <div className="card">
          <div className="card-title">الإجمالي · {money(data.total, currency)}</div>
          {data.items.map((item: any) => (
            <div key={item.account_id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>{item.name}</span>
                <span className="num" style={{ fontWeight: 600 }}>
                  {money(item.amount, currency)} · {item.share.toFixed(1)}%
                </span>
              </div>
              <div style={{ height: 8, background: "var(--color-border)", borderRadius: 999 }}>
                <div
                  style={{
                    width: `${item.share}%`,
                    height: "100%",
                    background: "var(--color-primary)",
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          ))}
          {data.items.length === 0 && <div className="empty">لا توجد بيانات</div>}
        </div>
      )}

      {data && tab === "animals" && (
        <div className="grid grid-3">
          <GroupCard title="حسب النوع" rows={data.by_type} />
          <GroupCard title="حسب السلالة" rows={data.by_breed} />
          <GroupCard title="حسب الحالة" rows={data.by_status} />
          <div className="card">
            <div className="card-title">حسب العمر</div>
            <table>
              <tbody>
                {Object.entries(data.by_age).map(([key, value]) => (
                  <tr key={key}>
                    <td>{AGE_LABEL[key] ?? key}</td>
                    <td className="num" style={{ textAlign: "left", fontWeight: 600 }}>{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ gridColumn: "span 2" }}>
            <div className="card-title">أكثر الإناث إنتاجًا</div>
            <table>
              <thead><tr><th>الرقم</th><th>الاسم</th><th>الولادات</th><th>المواليد</th></tr></thead>
              <tbody>
                {data.top_mothers.map((row: any) => (
                  <tr key={row.animal_id}>
                    <td style={{ fontWeight: 600 }}>{row.tag}</td>
                    <td>{row.name || "—"}</td>
                    <td className="num">{row.births}</td>
                    <td className="num">{row.offspring}</td>
                  </tr>
                ))}
                {data.top_mothers.length === 0 && <tr><td colSpan={4} className="empty">لا توجد ولادات مسجلة</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

const ACCOUNT_TYPE: Record<string, string> = {
  asset: "أصل",
  liability: "التزام",
  equity: "حقوق ملكية",
  income: "إيراد",
  expense: "مصروف",
};

const KIND_LABEL: Record<string, string> = {
  opening: "رصيد افتتاحي",
  expense: "مصروف",
  income: "إيراد",
  transfer: "تحويل",
  purchase: "شراء",
  sale: "بيع",
  capital: "رأس مال",
  withdrawal: "سحب",
  settlement: "تسديد",
  adjustment: "تسوية",
  reversal: "عكس قيد",
};

const AGE_LABEL: Record<string, string> = {
  under_6m: "أقل من 6 أشهر",
  "6m_to_1y": "6 أشهر - سنة",
  "1y_to_2y": "سنة - سنتان",
  over_2y: "أكثر من سنتين",
  unknown: "غير معروف",
};

function SimpleTable({ rows, currency }: { rows: any[]; currency: string }) {
  if (!rows?.length) return <div className="empty">لا توجد بيانات</div>;
  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.account_id}>
            <td>{row.name}</td>
            <td className="num" style={{ textAlign: "left", fontWeight: 600 }}>{money(row.amount, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GroupCard({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <table>
        <tbody>
          {rows?.filter((r) => r.key).map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td className="num" style={{ textAlign: "left", fontWeight: 600 }}>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
