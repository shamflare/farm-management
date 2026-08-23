"use client";

import { useEffect, useMemo, useState } from "react";
import { api, download, formatDate, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Icon from "@/components/Icon";
import {
  Button,
  ErrorNote,
  ExportButton,
  PageHeader,
  RowMenu,
  SuccessNote,
  TableMessage,
  Tabs,
} from "@/components/ui";

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

const KIND_TABS = [
  { key: "", label: "الكل" },
  { key: "partner", label: "شريك" },
  { key: "worker", label: "عامل / مشرف" },
  { key: "supplier", label: "مورد" },
  { key: "customer", label: "عميل" },
];

export default function PartiesPage() {
  const { can, currency, me } = useApp();
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
      <PageHeader
        title="الأشخاص والحسابات"
        subtitle="لكل شخص حساب حقيقي في الدفتر — الأرصدة محسوبة من القيود"
        farm={me?.farm?.name}
      >
        {can("reports.export") && (
          <ExportButton
            onClick={() => download("/export/parties/").catch((err) => setError(err.message))}
          />
        )}
        {can("parties.create") && (
          <Button
            icon={showForm && !editing ? "close" : "plus"}
            variant={showForm && !editing ? "ghost" : "primary"}
            onClick={startCreate}
          >
            {showForm && !editing ? "إغلاق النموذج" : "إضافة شخص"}
          </Button>
        )}
      </PageHeader>

      <ErrorNote message={error} />
      <SuccessNote message={notice} />

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

      <Tabs value={kind} onChange={setKind} options={KIND_TABS} />

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
              <th className="cell-actions">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            <TableMessage
              colSpan={8}
              empty={rows.length === 0}
              emptyTitle="لا توجد سجلات"
              emptyText="أضف الشركاء والعاملين والموردين والزبائن؛ لكل واحد منهم حساب حقيقي في الدفتر."
            />
            {rows.map((party) => {
              const s = party.summary;
              const locked = blockingBalances(party).length > 0;
              return (
                <tr key={party.id} style={party.is_active ? undefined : { opacity: 0.55 }}>
                  <td className="strong">
                    <span className="inline" style={{ gap: "var(--s2)" }}>
                      {party.name}
                      {!party.is_active && <span className="badge badge-muted">معطّل</span>}
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-muted">{KIND_LABEL[party.kind]}</span>
                  </td>
                  <td className="muted num">{party.phone || "—"}</td>
                  <td className={`num ${s.owed_to_farm ? "positive" : "muted"}`}>
                    {s.owed_to_farm ? money(s.owed_to_farm, currency) : "—"}
                  </td>
                  <td className={`num ${s.owed_by_farm ? "negative" : "muted"}`}>
                    {s.owed_by_farm ? money(s.owed_by_farm, currency) : "—"}
                  </td>
                  <td className="num">{s.net_capital ? money(s.net_capital, currency) : "—"}</td>
                  <td className="num">
                    {s.ownership_percentage != null ? `${s.ownership_percentage}%` : "—"}
                  </td>

                  <td className="cell-actions">
                    <span className="cell-actions-group">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="file"
                        onClick={() => openStatement(party)}
                      >
                        كشف حساب
                      </Button>
                      <RowMenu
                        actions={[
                          {
                            label: "تسديد ما له علينا",
                            icon: "arrowStart",
                            hidden: !(s.owed_by_farm > 0 && can("workers.settle")),
                            onClick: () => moneyAction(party, "settle"),
                          },
                          {
                            label: "تحصيل ما لنا عنده",
                            icon: "arrowEnd",
                            hidden: !(s.owed_to_farm > 0 && can("finance.create")),
                            onClick: () => moneyAction(party, "collect"),
                          },
                          {
                            label: "إيداع رأس مال",
                            icon: "coins",
                            hidden: !(party.kind === "partner" && can("partners.edit")),
                            onClick: () => moneyAction(party, "capital"),
                          },
                          {
                            label: "سحب من رأس المال",
                            icon: "wallet",
                            hidden: !(party.kind === "partner" && can("partners.edit")),
                            onClick: () => moneyAction(party, "withdraw"),
                          },
                          {
                            label: "تعديل البيانات",
                            icon: "edit",
                            hidden: !can("parties.edit"),
                            onClick: () => startEdit(party),
                          },
                          {
                            label: party.is_active ? "تعطيل" : "تفعيل",
                            icon: party.is_active ? "lock" : "check",
                            hidden: !can("parties.edit"),
                            onClick: () => toggleActive(party),
                          },
                          {
                            label: locked ? "حذف (الحساب ليس صفرًا)" : "حذف",
                            icon: locked ? "lock" : "trash",
                            danger: !locked,
                            hidden: !can("parties.delete"),
                            title: locked
                              ? "حسابه ليس صفرًا — اضغط لمعرفة السبب والبديل"
                              : "حذف السجل",
                            onClick: () => remove(party),
                          },
                        ]}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="alert alert-info mt-4 no-print">
        <Icon name="lock" />
        <span>
          «الحساب ليس صفرًا» يعني أن للشخص أو عليه مبلغًا، أو له رأس مال في المزرعة. لتتمكن من
          الحذف: سدّد أو حصّل الرصيد (وللشريك اسحب مساهمته) — أو عطّله فيختفي من قوائم الاختيار
          ويبقى رصيده ظاهرًا في التقارير. الحذف نفسه لا يمس الدفتر: القيود وكشوف الحسابات تبقى كما هي.
        </span>
      </div>

      {statement && (
        <div className="card mt-5">
          <div className="card-title">
            <span className="inline">
              <Icon name="file" size={17} className="muted" />
              كشف حساب: {statement.party.name}
            </span>
            <Button size="sm" variant="ghost" icon="close" onClick={() => setStatement(null)}>
              إغلاق
            </Button>
          </div>
          <div className="stack-lg">
            {statement.sections.map((section: any) => (
              <div key={section.slot}>
                <div className="between mb-4">
                  <span className="strong">{section.account}</span>
                  <span className="badge">الرصيد {money(section.closing_balance, currency)}</span>
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
                      <TableMessage
                        colSpan={5}
                        empty={section.rows.length === 0}
                        emptyTitle="لا توجد حركات على هذا الحساب"
                      />
                      {section.rows.map((row: any, index: number) => (
                        <tr key={index}>
                          <td className="num">{formatDate(row.date)}</td>
                          <td>{row.memo || "—"}</td>
                          <td className="num">
                            {Number(row.debit) ? money(row.debit, currency) : "—"}
                          </td>
                          <td className="num">
                            {Number(row.credit) ? money(row.credit, currency) : "—"}
                          </td>
                          <td className="num strong">{money(row.balance_after, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
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
    <form className="card mb-4" onSubmit={submit}>
      <div className="card-title">
        <span className="inline">
          <Icon name={initial ? "edit" : "plus"} size={17} className="muted" />
          {initial ? `تعديل: ${initial.name}` : "شخص جديد"}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          إلغاء
        </Button>
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
        <div className="field row-wide">
          <label>ملاحظات</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <div className="form-actions">
        <Button icon="check" busy={busy}>
          {busy ? "جارٍ الحفظ…" : initial ? "حفظ التعديل" : "حفظ"}
        </Button>
        {initial && form.kind === "partner" && (
          <span className="stat-hint">تغيير النسبة يُسجَّل في تاريخ الشراكة ولا يُمحى.</span>
        )}
      </div>
    </form>
  );
}
