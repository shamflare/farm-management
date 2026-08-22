"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, formatDate, formatNumber, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Attachments from "@/components/Attachments";

type Catalog = { id: string; code: string; display_name: string; type: string };
type Account = { id: string; display_name: string; is_cash: boolean };
type Party = { id: string; name: string; kind: string };
type Animal = {
  id: string;
  tag: string;
  name: string;
  branch_name: string;
  branch_code: string;
  sex: string;
  current_weight: string | null;
};
type Sale = {
  id: string;
  reference: string;
  customer_name: string;
  happened_on: string;
  animals_price: string;
  transport_cost: string;
  commission_cost: string;
  total_price: string;
  received_amount: string;
  remaining: string;
  settlement_status: string;
  notes: string;
  items: { id: string; animal_tag: string; unit_price: string; weight_kg: string | null }[];
};
type Page<T> = { count: number; results: T[] };

const SETTLEMENT: Record<string, string> = {
  paid: "محصَّلة",
  partial: "محصَّلة جزئيًا",
  unpaid: "غير محصَّلة",
};

const today = () => new Date().toISOString().slice(0, 10);

export default function SalesPage() {
  const { can, currency } = useApp();
  const [rows, setRows] = useState<Sale[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const byType = useMemo(() => {
    const grouped: Record<string, Catalog[]> = {};
    catalog.forEach((item) => {
      (grouped[item.type] ??= []).push(item);
    });
    return grouped;
  }, [catalog]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<Page<Sale>>("/sales/?page_size=50&ordering=-happened_on");
      setRows(data.results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.get<Page<Catalog>>("/catalog/?page_size=300").then((r) => setCatalog(r.results)).catch(() => {});
    api
      .get<{ data: Account[] }>("/accounts/pickable/")
      .then((r) => setAccounts(r.data.filter((a) => a.is_cash)))
      .catch(() => {});
    api.get<Page<Party>>("/parties/?page_size=200").then((r) => setParties(r.results)).catch(() => {});
  }, []);

  const total = rows.reduce((sum, row) => sum + Number(row.total_price), 0);
  const due = rows.reduce((sum, row) => sum + Number(row.remaining), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">بيع الحيوانات</h1>
          <p className="page-sub">
            المولود المباع يدخل «مبيعات المواليد»، والمستبعَد «مبيعات الفرزة» — كل على فرعه
          </p>
        </div>
        {can("sales.create") && (
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "إغلاق" : "+ عملية بيع"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {showForm && (
        <SaleForm
          byType={byType}
          accounts={accounts}
          customers={parties.filter((p) => p.kind === "customer" || p.kind === "other")}
          onDone={(message) => {
            setShowForm(false);
            setNotice(message);
            load();
          }}
        />
      )}

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="stat-label">عدد العمليات</div>
          <div className="stat-value num">{rows.length}</div>
        </div>
        <div className="card">
          <div className="stat-label">إجمالي المبيعات</div>
          <div className="stat-value num positive">{money(total, currency)}</div>
        </div>
        <div className="card">
          <div className="stat-label">المتبقي عند الزبائن</div>
          <div className={`stat-value num ${due > 0 ? "negative" : ""}`}>{money(due, currency)}</div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الزبون</th>
              <th>العدد</th>
              <th>قيمة البيع</th>
              <th>نقل وعمولة</th>
              <th>المحصَّل</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">جارٍ التحميل…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="empty">لا توجد عمليات بيع</td></tr>
            )}
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td>{formatDate(row.happened_on)}</td>
                  <td>{row.customer_name || "—"}</td>
                  <td className="num">{row.items.length}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{money(row.total_price, currency)}</td>
                  <td className="num muted">
                    {money(Number(row.transport_cost) + Number(row.commission_cost), currency)}
                  </td>
                  <td className="num">{money(row.received_amount, currency)}</td>
                  <td>
                    <span className={`badge ${row.settlement_status === "paid" ? "" : "badge-warning"}`}>
                      {SETTLEMENT[row.settlement_status] ?? row.settlement_status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExpanded(expanded === row.id ? "" : row.id)}
                    >
                      {expanded === row.id ? "إخفاء" : "الحيوانات"}
                    </button>
                  </td>
                </tr>
                {expanded === row.id && (
                  <tr>
                    <td colSpan={8} style={{ background: "var(--color-bg)" }}>
                      <table>
                        <thead>
                          <tr><th>الحيوان</th><th>السعر</th><th>الوزن</th></tr>
                        </thead>
                        <tbody>
                          {row.items.map((item) => (
                            <tr key={item.id}>
                              <td>{item.animal_tag}</td>
                              <td className="num">{money(item.unit_price, currency)}</td>
                              <td className="num muted">
                                {item.weight_kg ? `${formatNumber(item.weight_kg, 1)} كغ` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {row.notes && <div className="muted" style={{ padding: 8 }}>{row.notes}</div>}
                      {can("attachments.view") && (
                        <Attachments
                          subjectType="sale"
                          subjectId={row.id}
                          title="فاتورة البيع والإيصالات"
                          allowPhoto={false}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type Line = { animal: string; unit_price: string; weight_kg: string };

function SaleForm({
  byType,
  accounts,
  customers,
  onDone,
}: {
  byType: Record<string, Catalog[]>;
  accounts: Account[];
  customers: Party[];
  onDone: (message: string) => void;
}) {
  const { currency } = useApp();
  const [form, setForm] = useState({
    date: today(),
    customer: "",
    branch: "",
    sale_reason: "",
    transport_cost: "",
    commission_cost: "",
    into_account: "",
    received_amount: "",
    reference: "",
    notes: "",
  });
  const [lines, setLines] = useState<Line[]>([{ animal: "", unit_price: "", weight_kg: "" }]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      into_account: prev.into_account || accounts[0]?.id || "",
      sale_reason:
        prev.sale_reason || (byType["sale_reason"] ?? []).find((r) => r.code === "routine")?.id || "",
    }));
  }, [accounts, byType]);

  useEffect(() => {
    const params = new URLSearchParams({ is_on_farm: "true", page_size: "300", ordering: "tag" });
    if (form.branch) params.set("branch", form.branch);
    api
      .get<Page<Animal>>(`/animals/?${params}`)
      .then((res) => setAnimals(res.results))
      .catch(() => {});
  }, [form.branch]);

  const chosen = new Set(lines.map((line) => line.animal).filter(Boolean));
  const animalsPrice = lines.reduce((sum, line) => sum + Number(line.unit_price || 0), 0);

  function update(index: number, patch: Partial<Line>) {
    const next = [...lines];
    next[index] = { ...next[index], ...patch };
    setLines(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/sales/", {
        date: form.date,
        customer: form.customer || null,
        transport_cost: form.transport_cost || 0,
        commission_cost: form.commission_cost || 0,
        received_amount: form.received_amount === "" ? null : form.received_amount,
        into_account: form.into_account || null,
        sale_reason: form.sale_reason || null,
        reference: form.reference,
        notes: form.notes,
        items: lines
          .filter((line) => line.animal)
          .map((line) => ({
            animal: line.animal,
            unit_price: line.unit_price || 0,
            weight_kg: line.weight_kg || null,
          })),
      });
      onDone("تم تسجيل البيع");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
      <div className="card-title">عملية بيع جديدة</div>
      <p className="page-sub" style={{ marginBottom: 12 }}>
        اختر «استبعاد» في سبب البيع لتذهب القيمة إلى بند مبيعات الفرزة بدل مبيعات المواليد.
      </p>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="row">
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>تصفية حسب الفرع</label>
          <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
            <option value="">كل الفروع</option>
            {(byType["branch"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>سبب البيع</label>
          <select value={form.sale_reason} onChange={(e) => setForm({ ...form, sale_reason: e.target.value })}>
            <option value="">—</option>
            {(byType["sale_reason"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الزبون</label>
          <select value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })}>
            <option value="">—</option>
            {customers.map((party) => (
              <option key={party.id} value={party.id}>{party.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>المرجع</label>
          <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
        </div>
      </div>

      <div className="stat-label" style={{ margin: "12px 0 8px" }}>الحيوانات المباعة ({lines.length})</div>
      {lines.map((line, index) => (
        <div className="row" key={index} style={{ marginBottom: 8 }}>
          <div className="field" style={{ margin: 0, flex: "2 1 260px" }}>
            <label>الحيوان</label>
            <select value={line.animal} onChange={(e) => update(index, { animal: e.target.value })} required>
              <option value="">اختر…</option>
              {animals
                .filter((animal) => animal.id === line.animal || !chosen.has(animal.id))
                .map((animal) => (
                  <option key={animal.id} value={animal.id}>
                    {animal.tag} {animal.name} {animal.branch_name && `· ${animal.branch_name}`}
                  </option>
                ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>سعر البيع</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={line.unit_price}
              onChange={(e) => update(index, { unit_price: e.target.value })}
              required
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>الوزن (كغ)</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={line.weight_kg}
              onChange={(e) => update(index, { weight_kg: e.target.value })}
            />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setLines(lines.filter((_, i) => i !== index))}
              disabled={lines.length === 1}
            >
              حذف
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setLines([...lines, { animal: "", unit_price: "", weight_kg: "" }])}
      >
        + حيوان آخر
      </button>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="field">
          <label>تكلفة النقل</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.transport_cost}
            onChange={(e) => setForm({ ...form, transport_cost: e.target.value })}
          />
        </div>
        <div className="field">
          <label>العمولة</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.commission_cost}
            onChange={(e) => setForm({ ...form, commission_cost: e.target.value })}
          />
        </div>
        <div className="field">
          <label>المبلغ دخل إلى</label>
          <select value={form.into_account} onChange={(e) => setForm({ ...form, into_account: e.target.value })}>
            <option value="">لم يُقبض (على حساب الزبون)</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>المحصَّل (اتركه فارغًا = قبض كامل)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.received_amount}
            onChange={(e) => setForm({ ...form, received_amount: e.target.value })}
          />
        </div>
        <div className="field" style={{ flex: "2 1 240px" }}>
          <label>ملاحظات</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      <div className="alert alert-ok" style={{ marginTop: 12 }}>
        إجمالي البيع <strong>{money(animalsPrice, currency)}</strong>
      </div>

      <button className="btn" disabled={busy}>{busy ? "جارٍ الحفظ…" : "تسجيل البيع"}</button>
    </form>
  );
}
