"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, formatDate, formatNumber, getCached, hasCache, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Attachments from "@/components/Attachments";
import Icon from "@/components/Icon";
import {
  Button,
  ErrorNote,
  PageHeader,
  Stat,
  SuccessNote,
  TableMessage,
} from "@/components/ui";

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
  const { can, currency, me } = useApp();
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
    setLoading(!hasCache("/sales/?page_size=50&ordering=-happened_on"));
    try {
      await getCached<Page<Sale>>("/sales/?page_size=50&ordering=-happened_on", (data) => {
        setRows(data.results);
        setLoading(false);
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    getCached<Page<Catalog>>("/catalog/?page_size=300", (r) => setCatalog(r.results)).catch(
      () => {}
    );
    getCached<{ data: Account[] }>("/accounts/pickable/", (r) =>
      setAccounts(r.data.filter((a) => a.is_cash))
    ).catch(() => {});
    getCached<Page<Party>>("/parties/?page_size=200", (r) => setParties(r.results)).catch(() => {});
  }, []);

  const total = rows.reduce((sum, row) => sum + Number(row.total_price), 0);
  const due = rows.reduce((sum, row) => sum + Number(row.remaining), 0);

  return (
    <>
      <PageHeader
        title="بيع الحيوانات"
        subtitle="المولود المباع يدخل «مبيعات المواليد»، والمستبعَد «مبيعات الفرزة» — كل على فرعه"
        farm={me?.farm?.name}
      >
        {can("sales.create") && (
          <Button
            icon={showForm ? "close" : "plus"}
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "إغلاق النموذج" : "عملية بيع"}
          </Button>
        )}
      </PageHeader>

      <ErrorNote message={error} />
      <SuccessNote message={notice} />

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

      <div className="grid grid-3 mb-4">
        <Stat label="عدد العمليات" value={rows.length} icon="banknote" />
        <Stat
          label="إجمالي المبيعات"
          value={money(total, currency)}
          valueTone="positive"
          icon="trendUp"
          tone="success"
        />
        <Stat
          label="المتبقي عند الزبائن"
          value={money(due, currency)}
          valueTone={due > 0 ? "negative" : undefined}
          icon="arrowEnd"
          tone={due > 0 ? "warning" : "success"}
          hint={due > 0 ? "ذمم لم تُحصَّل بعد" : "لا متبقٍّ عند الزبائن"}
        />
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
              <th className="cell-actions" />
            </tr>
          </thead>
          <tbody>
            <TableMessage
              colSpan={8}
              loading={loading}
              empty={rows.length === 0}
              emptyTitle="لا توجد عمليات بيع"
              emptyText="سجّل أول عملية بيع؛ بند الإيراد يُختار من الحيوان نفسه بلا حقل إضافي."
            />
            {!loading &&
              rows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <td className="num">{formatDate(row.happened_on)}</td>
                  <td>{row.customer_name || "—"}</td>
                  <td className="num">{row.items.length}</td>
                  <td className="num strong">{money(row.total_price, currency)}</td>
                  <td className="num muted">
                    {money(Number(row.transport_cost) + Number(row.commission_cost), currency)}
                  </td>
                  <td className="num">{money(row.received_amount, currency)}</td>
                  <td>
                    <span
                      className={`badge ${
                        row.settlement_status === "paid" ? "badge-success" : "badge-warning"
                      }`}
                    >
                      {SETTLEMENT[row.settlement_status] ?? row.settlement_status}
                    </span>
                  </td>
                  <td className="cell-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={expanded === row.id ? "chevronUp" : "chevronDown"}
                      onClick={() => setExpanded(expanded === row.id ? "" : row.id)}
                    >
                      {expanded === row.id ? "إخفاء" : "الحيوانات"}
                    </Button>
                  </td>
                </tr>
                {expanded === row.id && (
                  <tr>
                    <td colSpan={8} className="subtable-cell">
                      <table className="subtable">
                        <thead>
                          <tr><th>الحيوان</th><th>السعر</th><th>الوزن</th></tr>
                        </thead>
                        <tbody>
                          {row.items.map((item) => (
                            <tr key={item.id}>
                              <td className="num">{item.animal_tag}</td>
                              <td className="num">{money(item.unit_price, currency)}</td>
                              <td className="num muted">
                                {item.weight_kg ? `${formatNumber(item.weight_kg, 1)} كغ` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ padding: "var(--s4)" }}>
                        {row.notes && <p className="muted text-sm mb-4">{row.notes}</p>}
                        {can("attachments.view") && (
                          <Attachments
                            subjectType="sale"
                            subjectId={row.id}
                            title="فاتورة البيع والإيصالات"
                            allowPhoto={false}
                          />
                        )}
                      </div>
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
    customer_name: "",
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
        customer_name: form.customer_name.trim(),
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
    <form className="card mb-4" onSubmit={submit}>
      <div className="card-title">
        <span className="inline">
          <Icon name="banknote" size={17} className="muted" />
          عملية بيع جديدة
        </span>
      </div>
      <p className="page-sub mb-4">
        سبب البيع يحدّد بند الإيراد: «نفوق» تذهب إلى مبيعات الفرزة، وغيرها إلى مبيعات المواليد.
      </p>
      <ErrorNote message={error} />

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
        {/* الزبون يُكتب اسمه: البيع يحدث في السوق، ومن يبيع لا يفتح شاشة
            الأشخاص ليُنشئ سجلًّا ثم يعود. الاسم الجديد يصير سجلًّا بحساباته
            تلقائيًا، والاسم المكرّر يعود إلى سجلّه هو لا سجلّ ثانٍ يشبهه. */}
        <div className="field">
          <label>الزبون</label>
          <input
            list="customer-names"
            value={form.customer_name}
            onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
            placeholder="اكتب اسم الزبون"
          />
          <datalist id="customer-names">
            {customers.map((party) => (
              <option key={party.id} value={party.name} />
            ))}
          </datalist>
          <span className="stat-hint">اسم جديد يُضاف إلى «الأشخاص والحسابات» وحده.</span>
        </div>
        <div className="field">
          <label>المرجع</label>
          <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
        </div>
      </div>

      <div className="divider" />
      <div className="section-title">الحيوانات المباعة ({lines.length})</div>

      <div className="stack">
        {lines.map((line, index) => (
          <div className="row" key={index}>
            <div className="field row-wide">
              <label>الحيوان</label>
              <select
                value={line.animal}
                onChange={(e) => update(index, { animal: e.target.value })}
                required
              >
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
            <div className="field">
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
            <div className="field">
              <label>الوزن (كغ)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={line.weight_kg}
                onChange={(e) => update(index, { weight_kg: e.target.value })}
              />
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <button
                type="button"
                className="icon-btn bordered"
                title="حذف السطر"
                aria-label="حذف السطر"
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
                disabled={lines.length === 1}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon="plus"
          onClick={() => setLines([...lines, { animal: "", unit_price: "", weight_kg: "" }])}
        >
          حيوان آخر
        </Button>
      </div>

      <div className="divider" />
      <div className="row">
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
        <div className="field row-wide">
          <label>ملاحظات</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      <div className="alert alert-info mt-5">
        <Icon name="coins" />
        <span>
          إجمالي البيع <strong>{money(animalsPrice, currency)}</strong>
        </span>
      </div>

      <div className="form-actions">
        <Button icon="check" busy={busy}>
          {busy ? "جارٍ الحفظ…" : "تسجيل البيع"}
        </Button>
      </div>
    </form>
  );
}
