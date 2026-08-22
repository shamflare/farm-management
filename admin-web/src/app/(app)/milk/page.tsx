"use client";

import { useEffect, useState } from "react";
import { api, download, formatDate, formatNumber, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";

type Catalog = { id: string; code: string; display_name: string; type: string };
type Production = {
  id: string;
  happened_on: string;
  branch_name: string;
  session: string;
  liters: string;
  milking_animals: number | null;
  notes: string;
};
type Sale = {
  id: string;
  happened_on: string;
  product_name: string;
  unit_name: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  customer_name: string;
  branch_name: string;
};
type Summary = {
  liters_produced: string;
  liters_sold: string;
  liters_kept: string;
  daily_average: string;
  sales_value: string;
  days_recorded: number;
  by_product: { product: string; quantity: string; value: string }[];
  daily: { date: string; liters: string }[];
};
type Page<T> = { count: number; results: T[] };
type Account = { id: string; display_name: string; is_cash: boolean };
type Party = { id: string; name: string; kind: string };

const SESSION_LABEL: Record<string, string> = {
  morning: "حلبة الصباح",
  evening: "حلبة المساء",
  day: "اليوم كامل",
};

const PERIODS = [
  { key: "month", label: "هذا الشهر" },
  { key: "year", label: "هذه السنة" },
  { key: "all", label: "كل الفترة" },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function MilkPage() {
  const { can, currency } = useApp();
  const [period, setPeriod] = useState("month");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [production, setProduction] = useState<Production[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<Party[]>([]);
  const [openForm, setOpenForm] = useState("");
  const [error, setError] = useState("");

  const branches = catalog.filter((c) => c.type === "branch");
  const products = catalog.filter((c) => c.type === "milk_product");
  const units = catalog.filter((c) => c.type === "unit");
  const breeding = branches.find((b) => b.code === "breeding");

  async function loadSummary() {
    const data = await api.get<Summary>(`/reports/milk/?period=${period}`);
    setSummary(data);
  }

  async function loadRows() {
    const [prod, sold] = await Promise.all([
      api.get<Page<Production>>("/milk/?page_size=40&ordering=-happened_on"),
      api.get<Page<Sale>>("/milk-sales/?page_size=40&ordering=-happened_on"),
    ]);
    setProduction(prod.results);
    setSales(sold.results);
  }

  useEffect(() => {
    api
      .get<Page<Catalog>>("/catalog/?page_size=300")
      .then((res) => setCatalog(res.results))
      .catch((err) => setError(err.message));
    api
      .get<{ data: Account[] }>("/accounts/pickable/")
      .then((res) => setAccounts(res.data.filter((a) => a.is_cash)))
      .catch(() => {});
    api
      .get<Page<Party>>("/parties/?page_size=200")
      .then((res) => setCustomers(res.results.filter((p) => p.kind === "customer" || p.kind === "other")))
      .catch(() => {});
    loadRows().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadSummary().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function refresh() {
    setOpenForm("");
    loadSummary().catch(() => {});
    loadRows().catch(() => {});
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">الحليب</h1>
          <p className="page-sub">
            الكمية اليومية تُسجَّل حتى لو لم تُبَع · المبيعات بند إيراد مستقل لفرع التربية
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {can("reports.export") && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => download("/export/milk/").catch((err) => setError(err.message))}
            >
              ⬇ تصدير CSV
            </button>
          )}
          <div className="tabs" style={{ margin: 0 }}>
            {PERIODS.map((p) => (
            <button key={p.key} className={`tab ${period === p.key ? "active" : ""}`} onClick={() => setPeriod(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {summary && (
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="stat-label">الكمية المنتجة</div>
            <div className="stat-value num">{formatNumber(summary.liters_produced, 1)} لتر</div>
            <div className="stat-hint">{summary.days_recorded} يوم مسجّل</div>
          </div>
          <div className="card">
            <div className="stat-label">المتوسط اليومي</div>
            <div className="stat-value num">{formatNumber(summary.daily_average, 1)} لتر</div>
          </div>
          <div className="card">
            <div className="stat-label">المباع</div>
            <div className="stat-value num">{formatNumber(summary.liters_sold, 1)} لتر</div>
            <div className="stat-hint">{money(summary.sales_value, currency)}</div>
          </div>
          <div className="card">
            <div className="stat-label">لم يُبَع</div>
            <div className="stat-value num">{formatNumber(summary.liters_kept, 1)} لتر</div>
            <div className="stat-hint">استهلاك ذاتي أو تصنيع</div>
          </div>
        </div>
      )}

      {can("milk.create") && (
        <div className="tabs">
          <button
            className={`tab ${openForm === "production" ? "active" : ""}`}
            onClick={() => setOpenForm(openForm === "production" ? "" : "production")}
          >
            تسجيل حلبة
          </button>
          <button
            className={`tab ${openForm === "sale" ? "active" : ""}`}
            onClick={() => setOpenForm(openForm === "sale" ? "" : "sale")}
          >
            بيع حليب أو مشتقات
          </button>
        </div>
      )}

      {openForm === "production" && (
        <ProductionForm branches={branches} defaultBranch={breeding?.id ?? ""} onDone={refresh} />
      )}
      {openForm === "sale" && (
        <SaleForm
          branches={branches}
          defaultBranch={breeding?.id ?? ""}
          products={products}
          units={units}
          accounts={accounts}
          customers={customers}
          onDone={refresh}
        />
      )}

      {summary && summary.by_product.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">المبيعات حسب المنتج</div>
          <table>
            <thead>
              <tr><th>المنتج</th><th>الكمية</th><th>القيمة</th></tr>
            </thead>
            <tbody>
              {summary.by_product.map((row) => (
                <tr key={row.product}>
                  <td>{row.product}</td>
                  <td className="num">{formatNumber(row.quantity, 2)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{money(row.value, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">سجل الحلب</div>
          <table>
            <thead>
              <tr><th>التاريخ</th><th>الحلبة</th><th>اللترات</th><th>عدد الحلوبات</th></tr>
            </thead>
            <tbody>
              {production.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.happened_on)}</td>
                  <td className="muted">{SESSION_LABEL[row.session] ?? row.session}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{formatNumber(row.liters, 1)}</td>
                  <td className="num muted">{row.milking_animals ?? "—"}</td>
                </tr>
              ))}
              {production.length === 0 && (
                <tr><td colSpan={4} className="empty">لا توجد سجلات</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">مبيعات الحليب ومشتقاته</div>
          <table>
            <thead>
              <tr><th>التاريخ</th><th>المنتج</th><th>الكمية</th><th>القيمة</th><th>الزبون</th></tr>
            </thead>
            <tbody>
              {sales.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.happened_on)}</td>
                  <td>{row.product_name}</td>
                  <td className="num">
                    {formatNumber(row.quantity, 2)} {row.unit_name}
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>{money(row.total_price, currency)}</td>
                  <td className="muted">{row.customer_name || "—"}</td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr><td colSpan={5} className="empty">لا توجد مبيعات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ProductionForm({
  branches,
  defaultBranch,
  onDone,
}: {
  branches: Catalog[];
  defaultBranch: string;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    date: today(),
    session: "day",
    liters: "",
    branch: "",
    milking_animals: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm((prev) => ({ ...prev, branch: prev.branch || defaultBranch }));
  }, [defaultBranch]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/ops/milk-production/", {
        ...form,
        branch: form.branch || null,
        milking_animals: form.milking_animals ? Number(form.milking_animals) : null,
      });
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
      <div className="card-title">تسجيل كمية الحلب</div>
      <p className="page-sub" style={{ marginBottom: 12 }}>
        تسجيل نفس اليوم ونفس الحلبة مرة أخرى يصحّح الرقم ولا يضاعفه.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="row">
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>الحلبة</label>
          <select value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })}>
            <option value="day">اليوم كامل</option>
            <option value="morning">حلبة الصباح</option>
            <option value="evening">حلبة المساء</option>
          </select>
        </div>
        <div className="field">
          <label>اللترات</label>
          <input type="number" step="0.001" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} required />
        </div>
        <div className="field">
          <label>عدد الحلوبات</label>
          <input type="number" value={form.milking_animals} onChange={(e) => setForm({ ...form, milking_animals: e.target.value })} />
        </div>
        <div className="field">
          <label>الفرع</label>
          <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>ملاحظة</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <button className="btn" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</button>
    </form>
  );
}

function SaleForm({
  branches,
  defaultBranch,
  products,
  units,
  accounts,
  customers,
  onDone,
}: {
  branches: Catalog[];
  defaultBranch: string;
  products: Catalog[];
  units: Catalog[];
  accounts: Account[];
  customers: Party[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    date: today(),
    product: "",
    unit: "",
    quantity: "",
    unit_price: "",
    branch: "",
    into_account: "",
    customer: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      branch: prev.branch || defaultBranch,
      product: prev.product || products.find((p) => p.code === "raw_milk")?.id || products[0]?.id || "",
      unit: prev.unit || units.find((u) => u.code === "liter")?.id || "",
      into_account: prev.into_account || accounts[0]?.id || "",
    }));
  }, [defaultBranch, products, units, accounts]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/ops/milk-sale/", {
        ...form,
        product: form.product || null,
        unit: form.unit || null,
        branch: form.branch || null,
        customer: form.customer || null,
        into_account: form.customer ? null : form.into_account || null,
      });
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
      <div className="card-title">بيع حليب أو مشتقات</div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="row">
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>المنتج</label>
          <select value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الوحدة</label>
          <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            <option value="">—</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الكمية</label>
          <input type="number" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        </div>
        <div className="field">
          <label>سعر الوحدة</label>
          <input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} required />
        </div>
        <div className="field">
          <label>الفرع</label>
          <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>المبلغ دخل إلى</label>
          <select value={form.into_account} onChange={(e) => setForm({ ...form, into_account: e.target.value })}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>أو على حساب الزبون</label>
          <select value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })}>
            <option value="">—</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>ملاحظة</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <button className="btn" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ البيع"}</button>
    </form>
  );
}
