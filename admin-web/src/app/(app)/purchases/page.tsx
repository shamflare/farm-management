"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, download, formatDate, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Attachments from "@/components/Attachments";

type Catalog = { id: string; code: string; display_name: string; type: string };
type Account = { id: string; display_name: string; is_cash: boolean };
type Party = { id: string; name: string; kind: string };
type Purchase = {
  id: string;
  reference: string;
  supplier_name: string;
  happened_on: string;
  animals_price: string;
  transport_cost: string;
  commission_cost: string;
  other_cost: string;
  total_cost: string;
  paid_amount: string;
  remaining: string;
  settlement_status: string;
  notes: string;
  items: { id: string; animal: string; animal_tag: string; unit_price: string; allocated_cost: string }[];
};
type Page<T> = { count: number; results: T[] };

const SETTLEMENT: Record<string, string> = {
  paid: "مدفوعة",
  partial: "مدفوعة جزئيًا",
  unpaid: "غير مدفوعة",
};

const today = () => new Date().toISOString().slice(0, 10);

type Line = { tag: string; name: string; sex: string; unit_price: string; birth_date: string };

const emptyLine = (): Line => ({ tag: "", name: "", sex: "male", unit_price: "", birth_date: "" });

export default function PurchasesPage() {
  const { can, currency } = useApp();
  const [rows, setRows] = useState<Purchase[]>([]);
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
      const data = await api.get<Page<Purchase>>("/purchases/?page_size=50&ordering=-happened_on");
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

  const total = rows.reduce((sum, row) => sum + Number(row.total_cost), 0);
  const owed = rows.reduce((sum, row) => sum + Number(row.remaining), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">شراء الحيوانات</h1>
          <p className="page-sub">
            النقل والعمولة تُحمَّل على قيمة الحيوانات، فيحمل كل حيوان تكلفته الحقيقية
          </p>
        </div>
        {can("purchases.create") && (
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "إغلاق" : "+ عملية شراء"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {showForm && (
        <PurchaseForm
          byType={byType}
          accounts={accounts}
          suppliers={parties.filter((p) => p.kind === "supplier" || p.kind === "other")}
          payers={parties.filter((p) => p.kind === "worker" || p.kind === "partner")}
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
          <div className="stat-label">إجمالي المشتريات</div>
          <div className="stat-value num">{money(total, currency)}</div>
        </div>
        <div className="card">
          <div className="stat-label">المتبقي على المزرعة</div>
          <div className={`stat-value num ${owed > 0 ? "negative" : ""}`}>{money(owed, currency)}</div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>المورد</th>
              <th>العدد</th>
              <th>قيمة الحيوانات</th>
              <th>نقل وعمولة</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="empty">جارٍ التحميل…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="empty">لا توجد عمليات شراء</td></tr>
            )}
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td>{formatDate(row.happened_on)}</td>
                  <td>{row.supplier_name || "—"}</td>
                  <td className="num">{row.items.length}</td>
                  <td className="num">{money(row.animals_price, currency)}</td>
                  <td className="num muted">
                    {money(
                      Number(row.transport_cost) + Number(row.commission_cost) + Number(row.other_cost),
                      currency
                    )}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>{money(row.total_cost, currency)}</td>
                  <td className="num">{money(row.paid_amount, currency)}</td>
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
                    <td colSpan={9} style={{ background: "var(--color-bg)" }}>
                      <table>
                        <thead>
                          <tr><th>الحيوان</th><th>سعر الوحدة</th><th>التكلفة المحمَّلة</th></tr>
                        </thead>
                        <tbody>
                          {row.items.map((item) => (
                            <tr key={item.id}>
                              <td>
                                <Link href={`/animals/${item.animal}`} style={{ color: "var(--color-primary)" }}>
                                  {item.animal_tag}
                                </Link>
                              </td>
                              <td className="num">{money(item.unit_price, currency)}</td>
                              <td className="num" style={{ fontWeight: 600 }}>
                                {money(item.allocated_cost, currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {row.notes && <div className="muted" style={{ padding: 8 }}>{row.notes}</div>}
                      {can("attachments.view") && (
                        <Attachments
                          subjectType="purchase"
                          subjectId={row.id}
                          title="فاتورة الشراء والمستندات"
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

function PurchaseForm({
  byType,
  accounts,
  suppliers,
  payers,
  onDone,
}: {
  byType: Record<string, Catalog[]>;
  accounts: Account[];
  suppliers: Party[];
  payers: Party[];
  onDone: (message: string) => void;
}) {
  const { currency } = useApp();
  const [form, setForm] = useState({
    date: today(),
    supplier: "",
    animal_type: "",
    branch: "",
    breed: "",
    transport_cost: "",
    commission_cost: "",
    other_cost: "",
    payer: "",
    paid_amount: "",
    reference: "",
    notes: "",
  });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const types = byType["animal_type"] ?? [];
    const branches = byType["branch"] ?? [];
    setForm((prev) => ({
      ...prev,
      animal_type: prev.animal_type || types[0]?.id || "",
      // Buying animals is what the fattening branch does, so it leads.
      branch: prev.branch || branches.find((b) => b.code === "fattening")?.id || "",
      payer: prev.payer || (accounts[0] ? `account:${accounts[0].id}` : ""),
    }));
  }, [byType, accounts]);

  const animalsPrice = lines.reduce((sum, line) => sum + Number(line.unit_price || 0), 0);
  const extra =
    Number(form.transport_cost || 0) + Number(form.commission_cost || 0) + Number(form.other_cost || 0);
  const total = animalsPrice + extra;

  function update(index: number, patch: Partial<Line>) {
    const next = [...lines];
    next[index] = { ...next[index], ...patch };
    setLines(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const [mode, id] = form.payer.split(":");
    try {
      await api.post("/purchases/", {
        date: form.date,
        supplier: form.supplier || null,
        transport_cost: form.transport_cost || 0,
        commission_cost: form.commission_cost || 0,
        other_cost: form.other_cost || 0,
        paid_amount: form.paid_amount === "" ? null : form.paid_amount,
        from_account: mode === "account" ? id : null,
        paid_by_party: mode === "party" ? id : null,
        reference: form.reference,
        notes: form.notes,
        items: lines.map((line) => ({
          unit_price: line.unit_price || 0,
          tag: line.tag || undefined,
          name: line.name,
          sex: line.sex,
          birth_date: line.birth_date || null,
          animal_type: form.animal_type,
          branch: form.branch || null,
          breed: form.breed || null,
        })),
      });
      onDone(`تم تسجيل شراء ${lines.length} حيوان`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
      <div className="card-title">عملية شراء جديدة</div>
      <p className="page-sub" style={{ marginBottom: 12 }}>
        الحيوانات تُسجَّل تلقائيًا بأرقامها التالية في الفرع المختار. اترك الرقم فارغًا ليُرقَّم وحده.
      </p>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="row">
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>الفرع</label>
          <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
            <option value="">غير محدد</option>
            {(byType["branch"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>النوع</label>
          <select value={form.animal_type} onChange={(e) => setForm({ ...form, animal_type: e.target.value })} required>
            {(byType["animal_type"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>السلالة</label>
          <select value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })}>
            <option value="">—</option>
            {(byType["breed"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>المورد</label>
          <select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}>
            <option value="">—</option>
            {suppliers.map((party) => (
              <option key={party.id} value={party.id}>{party.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>المرجع</label>
          <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
        </div>
      </div>

      <div className="stat-label" style={{ margin: "12px 0 8px" }}>الحيوانات ({lines.length})</div>
      {lines.map((line, index) => (
        <div className="row" key={index} style={{ marginBottom: 8 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>الرقم</label>
            <input
              placeholder="تلقائي"
              value={line.tag}
              onChange={(e) => update(index, { tag: e.target.value })}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>الاسم</label>
            <input value={line.name} onChange={(e) => update(index, { name: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>الجنس</label>
            <select value={line.sex} onChange={(e) => update(index, { sex: e.target.value })}>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
              <option value="unknown">غير محدد</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>تاريخ الميلاد</label>
            <input
              type="date"
              value={line.birth_date}
              onChange={(e) => update(index, { birth_date: e.target.value })}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>سعر الشراء</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={line.unit_price}
              onChange={(e) => update(index, { unit_price: e.target.value })}
              required
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
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, emptyLine()])}>
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
          <label>مصاريف أخرى</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.other_cost}
            onChange={(e) => setForm({ ...form, other_cost: e.target.value })}
          />
        </div>
        <div className="field">
          <label>من دفع؟</label>
          <select value={form.payer} onChange={(e) => setForm({ ...form, payer: e.target.value })}>
            <option value="">على حساب المورد (آجل)</option>
            {accounts.map((account) => (
              <option key={account.id} value={`account:${account.id}`}>من {account.display_name}</option>
            ))}
            {payers.map((party) => (
              <option key={party.id} value={`party:${party.id}`}>{party.name} من ماله الخاص</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>المدفوع (اتركه فارغًا = دفع كامل)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.paid_amount}
            onChange={(e) => setForm({ ...form, paid_amount: e.target.value })}
          />
        </div>
        <div className="field" style={{ flex: "2 1 240px" }}>
          <label>ملاحظات</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      <div className="alert alert-ok" style={{ marginTop: 12 }}>
        قيمة الحيوانات {money(animalsPrice, currency)} + مصاريف {money(extra, currency)} ={" "}
        <strong>الإجمالي {money(total, currency)}</strong>
      </div>

      <button className="btn" disabled={busy}>{busy ? "جارٍ الحفظ…" : "تسجيل الشراء"}</button>
    </form>
  );
}
