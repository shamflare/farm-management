"use client";

import { useEffect, useMemo, useState } from "react";
import { api, formatDate, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";

type Summary = {
  party_id: string;
  name: string;
  kind: string;
  owed_to_farm: number;
  owed_by_farm: number;
  capital_contributed: number;
  drawings: number;
  net_capital: number;
  ownership_percentage: number | null;
};
type Party = { id: string; name: string; kind: string; phone: string; is_active: boolean; summary: Summary };
type Account = { id: string; display_name: string; is_cash: boolean };
type Page<T> = { count: number; results: T[] };

const KIND_LABEL: Record<string, string> = {
  supplier: "مورد",
  customer: "عميل",
  worker: "عامل / مشرف",
  partner: "شريك",
  other: "أخرى",
};

const KINDS = ["", "partner", "worker", "supplier", "customer"];

export default function PartiesPage() {
  const { can, currency } = useApp();
  const [rows, setRows] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [kind, setKind] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [statement, setStatement] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const cashAccounts = useMemo(() => accounts.filter((a) => a.is_cash), [accounts]);

  async function load() {
    const params = new URLSearchParams({ page_size: "100" });
    if (kind) params.set("kind", kind);
    const data = await api.get<Page<Party>>(`/parties/?${params}`);
    setRows(data.results);
  }

  useEffect(() => {
    api.get<Page<Account>>("/accounts/?page_size=200").then((d) => setAccounts(d.results)).catch(() => {});
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function moneyAction(party: Party, operation: "settle" | "collect" | "capital" | "withdraw") {
    const amount = window.prompt(labelFor(operation, party.name));
    if (!amount) return;
    const accountId = cashAccounts[0]?.id;
    if (!accountId) {
      setError("لا يوجد صندوق نقدي");
      return;
    }
    try {
      await api.post(`/ops/${operation}/`, {
        date: new Date().toISOString().slice(0, 10),
        amount,
        party: party.id,
        account: accountId,
      });
      setNotice("تم تنفيذ العملية وتحديث الرصيد");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function openStatement(party: Party) {
    try {
      const data = await api.get<{ data: any }>(`/parties/${party.id}/statement/`);
      setStatement(data.data);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">الأشخاص والحسابات</h1>
          <p className="page-sub">لكل شخص حساب حقيقي في الدفتر — الأرصدة محسوبة من القيود</p>
        </div>
        {can("parties.create") && (
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "إغلاق" : "+ إضافة شخص"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {showForm && (
        <PartyForm
          onDone={() => {
            setShowForm(false);
            load();
          }}
          onError={setError}
        />
      )}

      <div className="tabs">
        {KINDS.map((value) => (
          <button key={value} className={`tab ${kind === value ? "active" : ""}`} onClick={() => setKind(value)}>
            {value ? KIND_LABEL[value] : "الكل"}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الصفة</th>
              <th>الهاتف</th>
              <th>لنا عنده</th>
              <th>له علينا</th>
              <th>رأس المال</th>
              <th>النسبة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="empty">لا توجد سجلات</td></tr>}
            {rows.map((party) => {
              const s = party.summary;
              return (
                <tr key={party.id}>
                  <td style={{ fontWeight: 600 }}>{party.name}</td>
                  <td><span className="badge">{KIND_LABEL[party.kind]}</span></td>
                  <td className="muted">{party.phone || "—"}</td>
                  <td className="num">{s.owed_to_farm ? money(s.owed_to_farm, currency) : "—"}</td>
                  <td className={`num ${s.owed_by_farm ? "negative" : ""}`}>
                    {s.owed_by_farm ? money(s.owed_by_farm, currency) : "—"}
                  </td>
                  <td className="num">{s.net_capital ? money(s.net_capital, currency) : "—"}</td>
                  <td className="num">{s.ownership_percentage != null ? `${s.ownership_percentage}%` : "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => openStatement(party)}>كشف حساب</button>{" "}
                    {s.owed_by_farm > 0 && can("workers.settle") && (
                      <button className="btn btn-sm" onClick={() => moneyAction(party, "settle")}>تسديد</button>
                    )}{" "}
                    {s.owed_to_farm > 0 && can("finance.create") && (
                      <button className="btn btn-sm" onClick={() => moneyAction(party, "collect")}>تحصيل</button>
                    )}{" "}
                    {party.kind === "partner" && can("partners.edit") && (
                      <>
                        <button className="btn btn-sm btn-ghost" onClick={() => moneyAction(party, "capital")}>إيداع</button>{" "}
                        <button className="btn btn-sm btn-ghost" onClick={() => moneyAction(party, "withdraw")}>سحب</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {statement && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title">
            <span>كشف حساب: {statement.party.name}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setStatement(null)}>إغلاق</button>
          </div>
          {statement.sections.map((section: any) => (
            <div key={section.slot} style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                {section.account} · الرصيد {money(section.closing_balance, currency)}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>البيان</th>
                      <th>مدين</th>
                      <th>دائن</th>
                      <th>الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.length === 0 && <tr><td colSpan={5} className="empty">لا توجد حركات</td></tr>}
                    {section.rows.map((row: any, index: number) => (
                      <tr key={index}>
                        <td>{formatDate(row.date)}</td>
                        <td>{row.memo || "—"}</td>
                        <td className="num">{Number(row.debit) ? money(row.debit, currency) : "—"}</td>
                        <td className="num">{Number(row.credit) ? money(row.credit, currency) : "—"}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{money(row.balance_after, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function labelFor(operation: string, name: string) {
  if (operation === "settle") return `كم تريد أن تسدد لـ ${name}؟`;
  if (operation === "collect") return `كم استلمت من ${name}؟`;
  if (operation === "capital") return `كم أودع ${name} في رأس المال؟`;
  return `كم سحب ${name}؟`;
}

function PartyForm({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const [form, setForm] = useState({ kind: "supplier", name: "", phone: "", ownership_percentage: "" });
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/parties/", {
        ...form,
        ownership_percentage: form.kind === "partner" && form.ownership_percentage ? form.ownership_percentage : null,
      });
      onDone();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
      <div className="card-title">شخص جديد</div>
      <div className="row">
        <div className="field">
          <label>الصفة</label>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الاسم</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="field">
          <label>الهاتف</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        {form.kind === "partner" && (
          <div className="field">
            <label>نسبة الملكية %</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={form.ownership_percentage}
              onChange={(e) => setForm({ ...form, ownership_percentage: e.target.value })}
            />
          </div>
        )}
      </div>
      <button className="btn" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</button>
    </form>
  );
}
