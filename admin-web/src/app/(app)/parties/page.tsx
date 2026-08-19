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
type Party = {
  id: string;
  name: string;
  kind: string;
  phone: string;
  address: string;
  notes: string;
  is_active: boolean;
  ownership_percentage: string | null;
  summary: Summary;
};
type Account = { id: string; display_name: string; is_cash: boolean };
type Page<T> = { count: number; results: T[] };

const KIND_LABEL: Record<string, string> = {
  supplier: "مورد",
  customer: "عميل",
  worker: "عامل / مشرف",
  partner: "شريك",
  other: "أخرى",
};

const KINDS = ["all", "partner", "worker", "supplier", "customer"];

export default function PartiesPage() {
  const { can, currency } = useApp();
  const [rows, setRows] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [kind, setKind] = useState("");
  const [editing, setEditing] = useState<Party | null>(null);
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

  function startEdit(party: Party) {
    setEditing(party);
    setShowForm(true);
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startCreate() {
    setEditing(null);
    setShowForm((v) => !v);
  }

  async function toggleActive(party: Party) {
    try {
      await api.patch(`/parties/${party.id}/`, { is_active: !party.is_active });
      setNotice(
        party.is_active
          ? `تم تعطيل «${party.name}» — يختفي من القوائم الجديدة وتبقى حركاته في الدفتر`
          : `تم تفعيل «${party.name}»`
      );
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  /** Why this person cannot be removed, in the owner's own terms.
   *  An empty list means the account is settled and the row is safe to hide. */
  function blockingBalances(party: Party) {
    const s = party.summary;
    const reasons: string[] = [];
    if (s.owed_to_farm) reasons.push(`لك عنده ${money(s.owed_to_farm, currency)} لم تُحصّل`);
    if (s.owed_by_farm) reasons.push(`له عليك ${money(s.owed_by_farm, currency)} لم تُسدَّد`);
    if (s.net_capital) reasons.push(`رأس مال قائم في المزرعة ${money(s.net_capital, currency)}`);
    return reasons;
  }

  async function remove(party: Party) {
    const reasons = blockingBalances(party);
    if (reasons.length) {
      const offer = party.is_active
        ? `

اضغط «موافق» لتعطيله بدل حذفه: يختفي من قوائم الاختيار ويبقى رصيده ظاهرًا في التقارير.`
        : "";
      const proceed = window.confirm(
        `تعذّر حذف «${party.name}» لأن حسابه ليس صفرًا:

${reasons.join("  ·  ")}

الحذف يُخفي الشخص من القوائم بينما يبقى المبلغ في الدفتر بلا صاحب واضح، لذلك يُسدَّد الرصيد أولًا (أو تُسحب مساهمة الشريك) ثم يُحذف.${offer}`
      );
      if (proceed && party.is_active) await toggleActive(party);
      return;
    }
    if (!window.confirm(`حذف «${party.name}»؟ حركاته السابقة تبقى في الدفتر ولن تُمس.`)) return;
    try {
      await api.delete(`/parties/${party.id}/`);
      setNotice(`تم حذف «${party.name}» — سجل الدفتر لم يتغير`);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

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
          <button className="btn" onClick={startCreate}>
            {showForm && !editing ? "إغلاق" : "+ إضافة شخص"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {showForm && (
        <PartyForm
          initial={editing}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onDone={(message) => {
            setShowForm(false);
            setEditing(null);
            setNotice(message);
            load();
          }}
          onError={setError}
        />
      )}

      <div className="tabs">
        {KINDS.map((value) => (
          <button
            key={value}
            className={`tab ${kind === (value === "all" ? "" : value) ? "active" : ""}`}
            onClick={() => setKind(value === "all" ? "" : value)}
          >
            {value === "all" ? "الكل" : KIND_LABEL[value]}
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
              <th>الحركات المالية</th>
              <th>إدارة السجل</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="empty">لا توجد سجلات</td></tr>}
            {rows.map((party) => {
              const s = party.summary;
              const locked = blockingBalances(party).length > 0;
              return (
                <tr key={party.id} style={party.is_active ? undefined : { opacity: 0.55 }}>
                  <td style={{ fontWeight: 600 }}>
                    {party.name}
                    {!party.is_active && (
                      <span className="badge badge-muted" style={{ marginInlineStart: 8 }}>معطّل</span>
                    )}
                  </td>
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

                  <td style={{ whiteSpace: "nowrap" }}>
                    {can("parties.edit") && (
                      <>
                        <button className="btn btn-sm btn-ghost" onClick={() => startEdit(party)}>تعديل</button>{" "}
                        <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(party)}>
                          {party.is_active ? "تعطيل" : "تفعيل"}
                        </button>{" "}
                      </>
                    )}
                    {can("parties.delete") && (
                      <button
                        className={`btn btn-sm ${locked ? "btn-ghost" : "btn-danger"}`}
                        onClick={() => remove(party)}
                        title={
                          locked
                            ? "حسابه ليس صفرًا — اضغط لمعرفة السبب والبديل"
                            : "حذف السجل"
                        }
                      >
                        {locked ? "🔒 حذف" : "حذف"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="page-sub" style={{ marginTop: 12 }}>
        🔒 يعني أن حساب الشخص ليس صفرًا: له أو عليه مبلغ، أو له رأس مال في المزرعة. اضغط الزر
        لترى المبلغ بالضبط. لتتمكن من الحذف: سدّد أو حصّل الرصيد (وللشريك اسحب مساهمته) — أو
        عطّله فيختفي من قوائم الاختيار ويبقى رصيده ظاهرًا في التقارير. الحذف نفسه لا يمس الدفتر:
        القيود وكشوف الحسابات تبقى كما هي.
      </p>

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

function PartyForm({
  initial,
  onDone,
  onCancel,
  onError,
}: {
  initial: Party | null;
  onDone: (message: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    kind: "supplier",
    name: "",
    phone: "",
    address: "",
    notes: "",
    ownership_percentage: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        kind: initial.kind,
        name: initial.name,
        phone: initial.phone ?? "",
        address: initial.address ?? "",
        notes: initial.notes ?? "",
        ownership_percentage:
          initial.ownership_percentage != null ? String(Number(initial.ownership_percentage)) : "",
      });
    } else {
      setForm({ kind: "supplier", name: "", phone: "", address: "", notes: "", ownership_percentage: "" });
    }
  }, [initial]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const body = {
      ...form,
      ownership_percentage:
        form.kind === "partner" && form.ownership_percentage ? form.ownership_percentage : null,
    };
    try {
      if (initial) {
        await api.patch(`/parties/${initial.id}/`, body);
        onDone(`تم تعديل «${form.name}»`);
      } else {
        await api.post("/parties/", body);
        onDone(`تمت إضافة «${form.name}» مع حساباته في الدفتر`);
      }
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
      <div className="card-title">
        <span>{initial ? `تعديل: ${initial.name}` : "شخص جديد"}</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>إلغاء</button>
      </div>
      <div className="row">
        <div className="field">
          <label>الصفة</label>
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
            disabled={Boolean(initial)}
            title={initial ? "لا تُغيّر صفة شخص له حسابات في الدفتر" : undefined}
          >
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
        <div className="field">
          <label>العنوان</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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
        <div className="field" style={{ flex: "2 1 240px" }}>
          <label>ملاحظات</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <button className="btn" disabled={busy}>
        {busy ? "جارٍ الحفظ…" : initial ? "حفظ التعديل" : "حفظ"}
      </button>
      {initial && form.kind === "partner" && (
        <span className="stat-hint" style={{ marginInlineStart: 12 }}>
          تغيير النسبة يُسجَّل في تاريخ الشراكة ولا يُمحى.
        </span>
      )}
    </form>
  );
}
