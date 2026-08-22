"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { api, download, formatDate, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";

type Account = { id: string; code: string; display_name: string; type: string; is_cash: boolean; balance: number };
type Catalog = { id: string; code: string; display_name: string; type: string };
type Party = { id: string; name: string; kind: string };
type Line = { id: number; account_code: string; account_name: string; debit: string; credit: string };
type Entry = {
  id: string;
  number: number;
  date: string;
  kind: string;
  status: string;
  amount: string;
  currency_code: string;
  memo: string;
  created_by_name: string;
  lines: Line[];
};
type Page<T> = { count: number; results: T[] };

const KIND_LABEL: Record<string, string> = {
  opening: "رصيد افتتاحي",
  expense: "مصروف",
  income: "إيراد",
  transfer: "تحويل",
  purchase: "شراء",
  sale: "بيع",
  capital: "رأس مال",
  withdrawal: "سحب",
  loan: "قرض",
  settlement: "تسديد",
  adjustment: "تسوية",
  reversal: "عكس قيد",
};

const STATUS_LABEL: Record<string, string> = {
  posted: "مُرحّل",
  pending: "بانتظار الموافقة",
  draft: "مسودة",
  rejected: "مرفوض",
  void: "ملغى",
};

export default function FinancePage() {
  const { can, currency } = useApp();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [tab, setTab] = useState<"expense" | "income" | "transfer">("expense");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [purging, setPurging] = useState<{ entry: Entry; alsoRemoved: string[] } | null>(null);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeError, setPurgeError] = useState("");

  const canReadBooks = can("finance.view");
  const cashAccounts = useMemo(() => accounts.filter((a) => a.is_cash), [accounts]);
  const expenseCategories = useMemo(
    () => catalog.filter((c) => c.type === "expense_category"),
    [catalog]
  );
  const revenueCategories = useMemo(
    () => catalog.filter((c) => c.type === "revenue_category"),
    [catalog]
  );
  const branches = useMemo(() => catalog.filter((c) => c.type === "branch"), [catalog]);

  async function loadEntries() {
    const params = new URLSearchParams({ page_size: "40" });
    if (kind) params.set("kind", kind);
    const data = await api.get<Page<Entry>>(`/entries/?${params}`);
    setEntries(data.results);
  }

  useEffect(() => {
    // A worker may record money without being allowed to read the books, so
    // the pickers fall back to endpoints that carry names but no balances.
    const accountsCall = canReadBooks
      ? api.get<Page<Account>>("/accounts/?page_size=200").then((d) => d.results)
      : api.get<{ data: Account[] }>("/accounts/pickable/").then((d) => d.data);
    const partiesCall = canReadBooks
      ? api.get<Page<Party>>("/parties/?page_size=200").then((d) => d.results)
      : api.get<{ data: Party[] }>("/parties/pickable/").then((d) => d.data);

    Promise.all([accountsCall, api.get<Page<Catalog>>("/catalog/?page_size=200"), partiesCall])
      .then(([accountRows, c, partyRows]) => {
        setAccounts(accountRows);
        setCatalog(c.results);
        setParties(partyRows);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canReadBooks) return;
    loadEntries().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, canReadBooks]);

  async function startPurge(entry: Entry) {
    setPurgeError("");
    try {
      const preview = await api.get<{ data: { also_removed: string[] } }>(
        `/entries/${entry.id}/purge-preview/`
      );
      setPurging({ entry, alsoRemoved: preview.data.also_removed });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function confirmPurge(password: string) {
    if (!purging) return;
    setPurgeBusy(true);
    setPurgeError("");
    try {
      await api.post(`/entries/${purging.entry.id}/purge/`, {
        password,
        reason: "حذف نهائي من شاشة المالية",
      });
      setPurging(null);
      setNotice("تم الحذف النهائي — بقي أثره في سجل التدقيق وحده");
      loadEntries();
    } catch (err: any) {
      setPurgeError(err.message);
    } finally {
      setPurgeBusy(false);
    }
  }

  async function act(entryId: string, action: string) {
    const reason = action === "reverse" ? window.prompt("سبب عكس القيد؟") ?? "" : "";
    try {
      await api.post(`/entries/${entryId}/${action}/`, { reason, note: reason });
      setNotice(action === "reverse" ? "تم إنشاء قيد عكسي — الأصل محفوظ" : "تم التنفيذ");
      loadEntries();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <>
      {purging && (
        <ConfirmDialog
          title={`حذف القيد رقم ${purging.entry.number} نهائيًا`}
          message="العكس بقيد مضاد هو التصحيح الآمن ويبقى بضغطة واحدة. الحذف النهائي يمحو القيد من الدفتر، ولا يبقى منه إلا صورته في سجل التدقيق."
          consequences={purging.alsoRemoved}
          requirePassword
          confirmLabel="احذف نهائيًا"
          busy={purgeBusy}
          error={purgeError}
          onCancel={() => setPurging(null)}
          onConfirm={confirmPurge}
        />
      )}

      <div className="page-head">
        <div>
          <h1 className="page-title">المالية</h1>
          <p className="page-sub">
            {canReadBooks
              ? "كل عملية هنا قيد مزدوج متوازن، ولا يمكن حذفها — تُعكس فقط"
              : "سجّل ما صرفته؛ دفتر القيود والأرصدة يطّلع عليها من يملك صلاحية المالية"}
          </p>
        </div>
        {can("finance.export") && (
          <button
            className="btn btn-ghost"
            onClick={() => download("/export/entries/").catch((err) => setError(err.message))}
          >
            ⬇ تصدير القيود CSV
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {can("finance.create") && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="tabs">
            <button className={`tab ${tab === "expense" ? "active" : ""}`} onClick={() => setTab("expense")}>
              تسجيل مصروف
            </button>
            <button className={`tab ${tab === "income" ? "active" : ""}`} onClick={() => setTab("income")}>
              تسجيل إيراد
            </button>
            <button className={`tab ${tab === "transfer" ? "active" : ""}`} onClick={() => setTab("transfer")}>
              تحويل بين الحسابات
            </button>
          </div>

          {tab === "expense" && (
            <ExpenseForm
              categories={expenseCategories}
              branches={branches}
              cashAccounts={cashAccounts}
              parties={parties}
              onDone={(msg) => {
                setNotice(msg);
                loadEntries();
              }}
              onError={setError}
            />
          )}
          {tab === "income" && (
            <IncomeForm
              categories={revenueCategories}
              branches={branches}
              cashAccounts={cashAccounts}
              parties={parties.filter((p) => p.kind === "customer")}
              onDone={(msg) => {
                setNotice(msg);
                loadEntries();
              }}
              onError={setError}
            />
          )}
          {tab === "transfer" && (
            <TransferForm
              accounts={accounts.filter((a) => a.type === "asset")}
              onDone={(msg) => {
                setNotice(msg);
                loadEntries();
              }}
              onError={setError}
            />
          )}
        </div>
      )}

      {!canReadBooks && (
        <p className="page-sub">
          العمليات التي تسجّلها تُحفظ باسمك في سجل التدقيق، ويراجعها صاحب المزرعة.
        </p>
      )}

      {canReadBooks && (
      <>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 700 }}>دفتر القيود</h2>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ padding: 8, borderRadius: "var(--radius)", border: "1px solid var(--color-border)" }}>
          <option value="">كل الأنواع</option>
          {Object.entries(KIND_LABEL).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>البيان</th>
              <th>المبلغ</th>
              <th>الحالة</th>
              <th>بواسطة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={8} className="empty">لا توجد قيود</td></tr>
            )}
            {entries.map((entry) => (
              <Fragment key={entry.id}>
                <tr onClick={() => setExpanded(expanded === entry.id ? null : entry.id)} style={{ cursor: "pointer" }}>
                  <td className="num">{entry.number}</td>
                  <td>{formatDate(entry.date)}</td>
                  <td>{KIND_LABEL[entry.kind] ?? entry.kind}</td>
                  <td>{entry.memo || "—"}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{money(entry.amount, entry.currency_code)}</td>
                  <td>
                    <span className={`badge ${entry.status === "pending" ? "badge-warning" : entry.status === "posted" ? "" : "badge-muted"}`}>
                      {STATUS_LABEL[entry.status] ?? entry.status}
                    </span>
                  </td>
                  <td className="muted">{entry.created_by_name || "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {entry.status === "pending" && can("finance.approve") && (
                      <>
                        <button className="btn btn-sm" onClick={() => act(entry.id, "approve")}>اعتماد</button>{" "}
                        <button className="btn btn-sm btn-ghost" onClick={() => act(entry.id, "reject")}>رفض</button>
                      </>
                    )}
                    {entry.status === "posted" && can("finance.reverse") && entry.kind !== "reversal" && (
                      <button className="btn btn-sm btn-ghost" onClick={() => act(entry.id, "reverse")}>عكس</button>
                    )}
                    {can("finance.delete") && (
                      <>
                        {" "}
                        <button className="btn btn-sm btn-danger" onClick={() => startPurge(entry)}>
                          حذف نهائي
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {expanded === entry.id && (
                  <tr>
                    <td colSpan={8} style={{ background: "color-mix(in srgb, var(--color-primary) 3%, transparent)" }}>
                      <table>
                        <thead>
                          <tr>
                            <th>الحساب</th>
                            <th>مدين</th>
                            <th>دائن</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.lines.map((line) => (
                            <tr key={line.id}>
                              <td>{line.account_code} · {line.account_name}</td>
                              <td className="num">{Number(line.debit) ? money(line.debit, entry.currency_code) : "—"}</td>
                              <td className="num">{Number(line.credit) ? money(line.credit, entry.currency_code) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
    </>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function ExpenseForm({
  categories,
  branches,
  cashAccounts,
  parties,
  onDone,
  onError,
}: {
  categories: Catalog[];
  branches: Catalog[];
  cashAccounts: Account[];
  parties: Party[];
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    date: today(),
    amount: "",
    category: "",
    branch: "",
    payer: "",
    memo: "",
  });
  const [busy, setBusy] = useState(false);

  const payerOptions = [
    ...cashAccounts.map((a) => ({ value: `account:${a.id}`, label: `من ${a.display_name}` })),
    ...parties
      .filter((p) => p.kind === "worker" || p.kind === "partner")
      .map((p) => ({ value: `party:${p.id}`, label: `${p.name} دفع من ماله الخاص` })),
    ...parties
      .filter((p) => p.kind === "supplier")
      .map((p) => ({ value: `supplier:${p.id}`, label: `على حساب ${p.name} (آجل)` })),
  ];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const [mode, id] = form.payer.split(":");
    const payload: any = {
      date: form.date,
      amount: form.amount,
      category: form.category || null,
      branch: form.branch || null,
      memo: form.memo,
    };
    if (mode === "account") payload.from_account = id;
    if (mode === "party") payload.paid_by_party = id;
    if (mode === "supplier") payload.supplier = id;
    try {
      const res = await api.post<{ ok: boolean; needs_approval: boolean }>("/ops/expense/", payload);
      onDone(res.needs_approval ? "تم التسجيل — بانتظار الموافقة" : "تم تسجيل المصروف");
      setForm({ ...form, amount: "", memo: "" });
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="row">
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>المبلغ</label>
          <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div className="field">
          <label>البند</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">مصروفات أخرى</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الفرع</label>
          <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
            <option value="">غير محدد</option>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>من دفع؟</label>
          <select value={form.payer} onChange={(e) => setForm({ ...form, payer: e.target.value })} required>
            <option value="">اختر…</option>
            {payerOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: "2 1 240px" }}>
          <label>ملاحظة</label>
          <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
      </div>
      <button className="btn" disabled={busy}>{busy ? "جارٍ الحفظ…" : "تسجيل المصروف"}</button>
    </form>
  );
}

function IncomeForm({
  categories,
  branches,
  cashAccounts,
  parties,
  onDone,
  onError,
}: {
  categories: Catalog[];
  branches: Catalog[];
  cashAccounts: Account[];
  parties: Party[];
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    date: today(),
    amount: "",
    category: "",
    branch: "",
    target: "",
    memo: "",
  });
  const [busy, setBusy] = useState(false);

  const targets = [
    ...cashAccounts.map((a) => ({ value: `account:${a.id}`, label: `إلى ${a.display_name}` })),
    ...parties.map((p) => ({ value: `customer:${p.id}`, label: `على حساب ${p.name} (آجل)` })),
  ];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const [mode, id] = form.target.split(":");
    const payload: any = {
      date: form.date,
      amount: form.amount,
      category: form.category || null,
      branch: form.branch || null,
      memo: form.memo,
    };
    if (mode === "account") payload.into_account = id;
    if (mode === "customer") payload.customer = id;
    try {
      await api.post("/ops/income/", payload);
      onDone("تم تسجيل الإيراد");
      setForm({ ...form, amount: "", memo: "" });
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="row">
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>المبلغ</label>
          <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div className="field">
          <label>البند</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">إيرادات أخرى</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الفرع</label>
          <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
            <option value="">غير محدد</option>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>إلى أين؟</label>
          <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required>
            <option value="">اختر…</option>
            {targets.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: "2 1 240px" }}>
          <label>ملاحظة</label>
          <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
      </div>
      <button className="btn" disabled={busy}>{busy ? "جارٍ الحفظ…" : "تسجيل الإيراد"}</button>
    </form>
  );
}

function TransferForm({
  accounts,
  onDone,
  onError,
}: {
  accounts: Account[];
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({ date: today(), amount: "", from_account: "", to_account: "", memo: "" });
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/ops/transfer/", form);
      onDone("تم التحويل — هذه ليست إيرادًا ولا مصروفًا");
      setForm({ ...form, amount: "", memo: "" });
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="row">
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>المبلغ</label>
          <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div className="field">
          <label>من حساب</label>
          <select value={form.from_account} onChange={(e) => setForm({ ...form, from_account: e.target.value })} required>
            <option value="">اختر…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>إلى حساب</label>
          <select value={form.to_account} onChange={(e) => setForm({ ...form, to_account: e.target.value })} required>
            <option value="">اختر…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: "2 1 240px" }}>
          <label>ملاحظة</label>
          <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
      </div>
      <button className="btn" disabled={busy}>{busy ? "جارٍ التنفيذ…" : "تنفيذ التحويل"}</button>
    </form>
  );
}
