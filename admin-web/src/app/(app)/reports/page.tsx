"use client";

import { useEffect, useState } from "react";
import { api, download, formatNumber, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Icon from "@/components/Icon";
import {
  EmptyState,
  ErrorNote,
  ExportButton,
  PageHeader,
  PrintButton,
  Stat,
  TableCard,
  TableMessage,
  TableSkeleton,
  Tabs,
} from "@/components/ui";

const TABS = [
  { key: "branches", label: "مقارنة الفروع", icon: "sheep" },
  { key: "trial", label: "ميزان المراجعة", icon: "list" },
  { key: "pl", label: "الأرباح والخسائر", icon: "trendUp" },
  { key: "cash", label: "التدفق النقدي", icon: "wallet" },
  { key: "categories", label: "المصروفات حسب البند", icon: "chart" },
  { key: "animals", label: "تقرير القطيع", icon: "sheep" },
] as const;

type Tab = (typeof TABS)[number]["key"];

// أي تصدير يجيب عن كل تبويب. تبويب القطيع له ملفه الخاص.
const EXPORT_FOR: Record<string, string> = {
  branches: "branches",
  trial: "trial-balance",
  pl: "profit-loss",
  categories: "profit-loss",
  animals: "animals",
};

const PERIODS = [
  { key: "month", label: "هذا الشهر" },
  { key: "year", label: "هذه السنة" },
  { key: "all", label: "كل الفترة" },
] as const;

type Period = (typeof PERIODS)[number]["key"];

export default function ReportsPage() {
  const { can, currency, me } = useApp();
  const [tab, setTab] = useState<Tab>("branches");
  const [period, setPeriod] = useState<Period>("all");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const paths: Record<Tab, string> = {
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

  const periodMatters = tab !== "trial" && tab !== "animals";

  return (
    <>
      <PageHeader
        title="التقارير"
        subtitle="مشتقة بالكامل من قيود الدفتر المرحّلة — لا رقم منها مُدخَل يدويًا"
        farm={me?.farm?.name}
      >
        <PrintButton label="طباعة / PDF" />
        {EXPORT_FOR[tab] && can("reports.export") && (
          <ExportButton
            onClick={() =>
              download(`/export/${EXPORT_FOR[tab]}/?period=${period}`).catch((err) =>
                setError(err.message)
              )
            }
          />
        )}
        {periodMatters && <Tabs value={period} onChange={setPeriod} options={PERIODS as any} />}
      </PageHeader>

      <Tabs value={tab} onChange={setTab} options={TABS as any} />

      <ErrorNote message={error} />

      {!data && !error && (
        <div className="card">
          <TableSkeleton rows={6} />
        </div>
      )}

      {data && tab === "branches" && (
        <>
          <div className="grid grid-2 mb-4">
            {data.branches.map((column: any) => (
              <div className="card" key={column.code}>
                <div className="card-title">
                  <span className="inline">
                    <Icon name="sheep" size={17} className="muted" />
                    {column.name}
                  </span>
                  <span
                    className={`badge ${
                      Number(column.net_profit) >= 0 ? "badge-success" : "badge-danger"
                    }`}
                  >
                    {Number(column.net_profit) >= 0 ? "رابح" : "خاسر"}
                  </span>
                </div>
                <div
                  className={`stat-value num ${
                    Number(column.net_profit) >= 0 ? "positive" : "negative"
                  }`}
                >
                  {money(column.net_profit, currency)}
                </div>
                <div className="stat-hint mb-4">صافي الربح للفترة</div>

                <div className="table-wrap">
                  <table>
                    <tbody>
                      <tr>
                        <td>الدخل</td>
                        <td className="num positive strong text-end">
                          {money(column.total_income, currency)}
                        </td>
                      </tr>
                      <tr>
                        <td>المصروفات</td>
                        <td className="num negative strong text-end">
                          {money(column.total_expenses, currency)}
                        </td>
                      </tr>
                      <tr>
                        <td>عدد الحيوانات</td>
                        <td className="num text-end">{formatNumber(column.animals_on_farm)}</td>
                      </tr>
                      <tr>
                        <td>قيمة العلف في المستودع</td>
                        <td className="num text-end">{money(column.stock_value, currency)}</td>
                      </tr>
                      {column.milk && Number(column.milk.liters_produced) > 0 && (
                        <tr>
                          <td>الحليب المنتج</td>
                          <td className="num text-end">
                            {formatNumber(column.milk.liters_produced, 1)} لتر
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="section-title mt-5">بنود الدخل</div>
                <SimpleTable rows={column.income} currency={currency} />
                <div className="section-title mt-5">بنود المصروف</div>
                <SimpleTable rows={column.expenses} currency={currency} />
              </div>
            ))}
          </div>

          <div className="grid grid-3">
            <Stat
              label="دخل المزرعة كاملة"
              value={money(data.farm_total.total_income, currency)}
              valueTone="positive"
              icon="trendUp"
              tone="success"
            />
            <Stat
              label="مصروفات المزرعة كاملة"
              value={money(data.farm_total.total_expenses, currency)}
              valueTone="negative"
              icon="trendDown"
              tone="danger"
            />
            <Stat
              label="التكاليف التأسيسية"
              value={money(data.founding_total, currency)}
              hint="خارج حساب الأرباح"
              icon="building"
              tone="accent"
            />
          </div>
        </>
      )}

      {data && tab === "trial" && (
        <>
          <div className={`alert ${data.balanced ? "alert-ok" : "alert-error"}`}>
            <Icon name={data.balanced ? "check" : "warning"} />
            <span>
              {data.balanced
                ? `الميزان متوازن: ${money(data.total_debit, currency)} مدين = ${money(
                    data.total_credit,
                    currency
                  )} دائن`
                : `الميزان غير متوازن بفارق ${money(data.difference, currency)}`}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الرمز</th>
                  <th>الحساب</th>
                  <th>النوع</th>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                <TableMessage
                  colSpan={6}
                  empty={data.rows.length === 0}
                  emptyTitle="لا توجد حسابات ذات حركة"
                />
                {data.rows.map((row: any) => (
                  <tr key={row.code}>
                    <td className="num muted">{row.code}</td>
                    <td>{row.name}</td>
                    <td className="muted">{ACCOUNT_TYPE[row.type] ?? row.type}</td>
                    <td className="num">{money(row.debit, currency)}</td>
                    <td className="num">{money(row.credit, currency)}</td>
                    <td className="num strong">{money(row.balance, currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>الإجمالي</td>
                  <td className="num">{money(data.total_debit, currency)}</td>
                  <td className="num">{money(data.total_credit, currency)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {data && tab === "pl" && (
        <div className="grid grid-2">
          <div className="card">
            <div className="card-title">
              <span>الإيرادات</span>
              <span className="badge badge-success">{money(data.total_income, currency)}</span>
            </div>
            <SimpleTable rows={data.income} currency={currency} />
          </div>
          <div className="card">
            <div className="card-title">
              <span>المصروفات</span>
              <span className="badge badge-danger">{money(data.total_expenses, currency)}</span>
            </div>
            <SimpleTable rows={data.expenses} currency={currency} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Stat
              label="صافي الربح"
              value={money(data.net_profit, currency)}
              valueTone={data.net_profit >= 0 ? "positive" : "negative"}
              icon={data.net_profit >= 0 ? "trendUp" : "trendDown"}
              tone={data.net_profit >= 0 ? "success" : "danger"}
              hint="الإيرادات ناقص المصروفات — التكاليف التأسيسية غير داخلة"
            />
          </div>
        </div>
      )}

      {data && tab === "cash" && (
        <>
          <div className="grid grid-4 mb-4">
            <Stat
              label="داخل"
              value={money(data.total_in, currency)}
              valueTone="positive"
              icon="arrowEnd"
              tone="success"
            />
            <Stat
              label="خارج"
              value={money(data.total_out, currency)}
              valueTone="negative"
              icon="arrowStart"
              tone="danger"
            />
            <Stat label="الصافي" value={money(data.net, currency)} icon="swap" />
            <Stat label="النقد الحالي" value={money(data.closing_cash, currency)} icon="wallet" />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نوع العملية</th>
                  <th>داخل</th>
                  <th>خارج</th>
                  <th>عدد</th>
                </tr>
              </thead>
              <tbody>
                <TableMessage
                  colSpan={4}
                  empty={data.by_kind.length === 0}
                  emptyTitle="لا حركة نقدية في هذه الفترة"
                />
                {data.by_kind.map((row: any) => (
                  <tr key={row.kind}>
                    <td>{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td className="num positive">{money(row.in, currency)}</td>
                    <td className="num negative">{money(row.out, currency)}</td>
                    <td className="num">{formatNumber(row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data && tab === "categories" && (
        <div className="card">
          <div className="card-title">
            <span>المصروفات حسب البند</span>
            <span className="badge badge-danger">{money(data.total, currency)}</span>
          </div>
          {data.items.length === 0 ? (
            <EmptyState
              icon="chart"
              title="لا توجد مصروفات في هذه الفترة"
              text="سجّل مصروفًا من شاشة الحركات المالية ليظهر هنا موزّعًا على بنوده."
            />
          ) : (
            <div className="stack">
              {data.items.map((item: any) => (
                <div key={item.account_id}>
                  <div className="between" style={{ marginBottom: 5 }}>
                    <span>{item.name}</span>
                    <span className="num strong">
                      {money(item.amount, currency)}{" "}
                      <span className="muted">· {item.share.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      background: "var(--surface-sunken)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-pill)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(1, item.share))}%`,
                        height: "100%",
                        background: "var(--color-primary)",
                        borderRadius: "var(--radius-pill)",
                        transition: "width 0.4s var(--ease)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {data && tab === "animals" && (
        <div className="grid grid-3">
          <GroupCard title="حسب النوع" rows={data.by_type} />
          <GroupCard title="حسب السلالة" rows={data.by_breed} />
          <GroupCard title="حسب الحالة" rows={data.by_status} />

          <TableCard title="حسب العمر">
            <table>
              <tbody>
                {Object.entries(data.by_age).map(([key, value]) => (
                  <tr key={key}>
                    <td>{AGE_LABEL[key] ?? key}</td>
                    <td className="num strong text-end">{formatNumber(value as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          <div style={{ gridColumn: "span 2" }}>
            <TableCard title="أكثر الإناث إنتاجًا">
              <table>
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>الاسم</th>
                    <th>الولادات</th>
                    <th>المواليد</th>
                  </tr>
                </thead>
                <tbody>
                  <TableMessage
                    colSpan={4}
                    empty={data.top_mothers.length === 0}
                    emptyTitle="لا توجد ولادات مسجلة"
                    emptyText="سجّل ولادة من صفحة الحيوان لتظهر أمهات القطيع مرتّبات هنا."
                  />
                  {data.top_mothers.map((row: any) => (
                    <tr key={row.animal_id}>
                      <td className="strong num">{row.tag}</td>
                      <td>{row.name || "—"}</td>
                      <td className="num">{formatNumber(row.births)}</td>
                      <td className="num">{formatNumber(row.offspring)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
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
  if (!rows?.length) {
    return <p className="muted text-sm">لا توجد بيانات في هذه الفترة</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.account_id}>
              <td>{row.name}</td>
              <td className="num strong text-end">{money(row.amount, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupCard({ title, rows }: { title: string; rows: any[] }) {
  const visible = rows?.filter((row) => row.key) ?? [];
  return (
    <TableCard title={title}>
      <table>
        <tbody>
          <TableMessage colSpan={2} empty={visible.length === 0} emptyTitle="لا توجد بيانات" />
          {visible.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td className="num strong text-end">{formatNumber(row.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}
