"use client";

import { useEffect, useState } from "react";
import { api, download, formatDateTime, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";

type Rule = {
  id: string;
  kind: string;
  min_amount: string;
  currency: string;
  is_active: boolean;
  note: string;
};
type Page<T> = { count: number; results: T[] };
type Summary = { row_counts: Record<string, number>; total_rows: number; taken_at: string };

const KIND_LABEL: Record<string, string> = {
  expense: "مصروف",
  income: "إيراد",
  transfer: "تحويل بين الصناديق",
  purchase: "شراء",
  sale: "بيع",
  capital: "إيداع رأس مال",
  withdrawal: "سحب شريك",
  settlement: "تسديد",
  adjustment: "تسوية",
};

const KINDS = Object.keys(KIND_LABEL);

/**
 * Two settings that share a page because both are about control rather than
 * data: what has to be approved before it counts, and how the owner walks away
 * with a copy of everything.
 */
export default function ApprovalsAndBackupPage() {
  const { can, currency, me } = useApp();
  const [rules, setRules] = useState<Rule[]>([]);
  const [form, setForm] = useState({ kind: "expense", min_amount: "", note: "" });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const data = await api.get<Page<Rule>>("/approval-rules/?page_size=50");
    setRules(data.results);
  }

  useEffect(() => {
    if (can("finance.view")) load().catch((err) => setError(err.message));
    if (can("backup.export")) {
      api
        .get<{ data: Summary }>("/backup/summary/")
        .then((res) => setSummary(res.data))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addRule(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/approval-rules/", {
        kind: form.kind,
        min_amount: form.min_amount,
        currency: me?.farm?.base_currency?.code ?? currency,
        is_active: true,
        note: form.note,
      });
      setForm({ kind: "expense", min_amount: "", note: "" });
      setNotice("تمت إضافة القاعدة");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(rule: Rule) {
    await api.patch(`/approval-rules/${rule.id}/`, { is_active: !rule.is_active });
    await load();
  }

  async function remove(rule: Rule) {
    await api.delete(`/approval-rules/${rule.id}/`);
    await load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">الاعتماد والنسخ الاحتياطي</h1>
          <p className="page-sub">
            ما الذي لا يدخل الحسابات قبل موافقة، وكيف تحتفظ بنسخة من كل شيء
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {can("finance.view") && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">قواعد الاعتماد</div>
          <p className="page-sub" style={{ marginBottom: 12 }}>
            أي عملية من النوع المحدد بمبلغ يساوي الحد أو يتجاوزه تُسجَّل «بانتظار الاعتماد»
            ولا تدخل الأرصدة حتى يعتمدها صاحب صلاحية.
          </p>

          {can("settings.edit") && (
            <form className="row" onSubmit={addRule} style={{ marginBottom: 12 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>نوع العملية</label>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>الحد الذي يستوجب الاعتماد</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.min_amount}
                  onChange={(e) => setForm({ ...form, min_amount: e.target.value })}
                  required
                />
              </div>
              <div className="field" style={{ margin: 0, flex: "2 1 240px" }}>
                <label>ملاحظة</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              <div style={{ alignSelf: "end" }}>
                <button className="btn" disabled={busy}>إضافة قاعدة</button>
              </div>
            </form>
          )}

          <table>
            <thead>
              <tr><th>نوع العملية</th><th>الحد</th><th>الحالة</th><th>ملاحظة</th><th></th></tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{KIND_LABEL[rule.kind] ?? rule.kind}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{money(rule.min_amount, rule.currency)}</td>
                  <td>
                    <span className={`badge ${rule.is_active ? "" : "badge-muted"}`}>
                      {rule.is_active ? "مفعّلة" : "موقوفة"}
                    </span>
                  </td>
                  <td className="muted">{rule.note || "—"}</td>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                    {can("settings.edit") && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggle(rule)}>
                          {rule.is_active ? "إيقاف" : "تفعيل"}
                        </button>{" "}
                        <button className="btn btn-ghost btn-sm" onClick={() => remove(rule)}>حذف</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    لا توجد قواعد — كل العمليات تُرحَّل مباشرة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {can("backup.export") && (
        <div className="card">
          <div className="card-title">النسخ الاحتياطي</div>
          <p className="page-sub" style={{ marginBottom: 12 }}>
            ملف JSON واحد يحوي بيانات هذه المزرعة كاملة — بلا كلمات مرور. احتفظ به
            خارج الخادم؛ فائدة النسخة أنها تبقى حين لا يبقى النظام.
          </p>

          {summary && (
            <div className="table-wrap" style={{ border: "none", marginBottom: 12 }}>
              <table>
                <thead>
                  <tr><th>الجدول</th><th>عدد السجلات</th></tr>
                </thead>
                <tbody>
                  {Object.entries(summary.row_counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => (
                      <tr key={name}>
                        <td className="muted">{name}</td>
                        <td className="num">{count}</td>
                      </tr>
                    ))}
                  <tr>
                    <td style={{ fontWeight: 700 }}>الإجمالي</td>
                    <td className="num" style={{ fontWeight: 700 }}>{summary.total_rows}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <button
            className="btn"
            onClick={() =>
              download("/backup/?pretty=1", "backup.json").catch((err) => setError(err.message))
            }
          >
            تنزيل نسخة احتياطية الآن
          </button>
        </div>
      )}
    </>
  );
}
