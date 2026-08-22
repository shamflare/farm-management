"use client";

import { useEffect, useState } from "react";
import { api, download, formatDate, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";

type Catalog = { id: string; code: string; display_name: string; type: string };
type Cost = {
  id: string;
  happened_on: string;
  name: string;
  type_name: string;
  branch_name: string;
  amount: string;
  quantity: string;
  supplier_name: string;
  notes: string;
};
type Summary = {
  total: string;
  count: number;
  book_value: string;
  by_type: { type: string; total: string; count: string }[];
  by_branch: { branch: string; total: string }[];
};
type Page<T> = { count: number; results: T[] };
type Account = { id: string; display_name: string; is_cash: boolean };
type Party = { id: string; name: string; kind: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function FoundingCostsPage() {
  const { can, currency } = useApp();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Cost[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const assetTypes = catalog.filter((c) => c.type === "asset_type");
  const branches = catalog.filter((c) => c.type === "branch");

  async function load() {
    const [report, list] = await Promise.all([
      api.get<Summary>("/reports/founding-costs/"),
      api.get<Page<Cost>>("/founding-costs/?page_size=100&ordering=-happened_on"),
    ]);
    setSummary(report);
    setRows(list.results);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    api
      .get<Page<Catalog>>("/catalog/?page_size=300")
      .then((res) => setCatalog(res.results))
      .catch(() => {});
    api
      .get<{ data: Account[] }>("/accounts/pickable/")
      .then((res) => setAccounts(res.data.filter((a) => a.is_cash)))
      .catch(() => {});
    api
      .get<Page<Party>>("/parties/?page_size=200")
      .then((res) => setSuppliers(res.results.filter((p) => p.kind === "supplier" || p.kind === "other")))
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">التكاليف التأسيسية</h1>
          <p className="page-sub">
            ما صُرف مرة واحدة لبناء المزرعة · لا يدخل في أرباح الشهر، ويتراكم مع كل إضافة جديدة
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {can("reports.export") && (
            <button
              className="btn btn-ghost"
              onClick={() =>
                download("/export/founding-costs/").catch((err) => setError(err.message))
              }
            >
              ⬇ تصدير CSV
            </button>
          )}
          {can("assets.create") && (
            <button className="btn" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "إغلاق" : "+ إضافة بند تأسيسي"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <CostForm
          assetTypes={assetTypes}
          branches={branches}
          accounts={accounts}
          suppliers={suppliers}
          onDone={() => {
            setShowForm(false);
            load().catch(() => {});
          }}
        />
      )}

      {summary && (
        <div className="grid grid-3" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="stat-label">إجمالي ما صُرف على التأسيس</div>
            <div className="stat-value num">{money(summary.total, currency)}</div>
            <div className="stat-hint">{summary.count} بند</div>
          </div>
          <div className="card">
            <div className="card-title">حسب النوع</div>
            <table>
              <tbody>
                {summary.by_type.map((row) => (
                  <tr key={row.type}>
                    <td>{row.type}</td>
                    <td className="num" style={{ textAlign: "left", fontWeight: 600 }}>
                      {money(row.total, currency)}
                    </td>
                  </tr>
                ))}
                {summary.by_type.length === 0 && (
                  <tr><td className="empty">لا توجد بنود</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-title">حسب الفرع</div>
            <table>
              <tbody>
                {summary.by_branch.map((row) => (
                  <tr key={row.branch}>
                    <td>{row.branch}</td>
                    <td className="num" style={{ textAlign: "left", fontWeight: 600 }}>
                      {money(row.total, currency)}
                    </td>
                  </tr>
                ))}
                {summary.by_branch.length === 0 && (
                  <tr><td className="empty">لا توجد بنود</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>البند</th>
              <th>النوع</th>
              <th>الفرع</th>
              <th>المبلغ</th>
              <th>المورد</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.happened_on)}</td>
                <td style={{ fontWeight: 600 }}>{row.name}</td>
                <td className="muted">{row.type_name || "—"}</td>
                <td className="muted">{row.branch_name || "عام"}</td>
                <td className="num" style={{ fontWeight: 600 }}>{money(row.amount, currency)}</td>
                <td className="muted">{row.supplier_name || "—"}</td>
                <td className="muted">{row.notes || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="empty">لم يُسجَّل أي بند تأسيسي بعد</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CostForm({
  assetTypes,
  branches,
  accounts,
  suppliers,
  onDone,
}: {
  assetTypes: Catalog[];
  branches: Catalog[];
  accounts: Account[];
  suppliers: Party[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    date: today(),
    name: "",
    amount: "",
    asset_type: "",
    branch: "",
    quantity: "1",
    from_account: "",
    supplier: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm((prev) => ({ ...prev, from_account: prev.from_account || accounts[0]?.id || "" }));
  }, [accounts]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/ops/founding-cost/", {
        ...form,
        asset_type: form.asset_type || null,
        branch: form.branch || null,
        supplier: form.supplier || null,
        from_account: form.supplier ? null : form.from_account || null,
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
      <div className="card-title">بند تأسيسي جديد</div>
      <p className="page-sub" style={{ marginBottom: 12 }}>
        يُسجَّل كأصل ثابت، فلا يظهر ضمن مصاريف الشهر ولا يقلّل ربحه.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="row">
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>البند</label>
          <input
            placeholder="حظيرة، سياج، خزان مياه…"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>النوع</label>
          <select value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })}>
            <option value="">—</option>
            {assetTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>المبلغ</label>
          <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div className="field">
          <label>العدد</label>
          <input type="number" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        </div>
        <div className="field">
          <label>الفرع (اختياري)</label>
          <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
            <option value="">عام لكل المزرعة</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>مدفوع من</label>
          <select value={form.from_account} onChange={(e) => setForm({ ...form, from_account: e.target.value })}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>أو على حساب المورد</label>
          <select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}>
            <option value="">—</option>
            {suppliers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>ملاحظات</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <button className="btn" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</button>
    </form>
  );
}
