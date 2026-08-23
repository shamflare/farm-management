"use client";

import { useEffect, useState } from "react";
import { api, download, formatDateTime, getCached, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Icon from "@/components/Icon";
import {
  Button,
  ErrorNote,
  PageHeader,
  SuccessNote,
  TableMessage,
} from "@/components/ui";

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
    await getCached<Page<Rule>>("/approval-rules/?page_size=50", (data) => setRules(data.results));
  }

  useEffect(() => {
    if (can("finance.view")) load().catch((err) => setError(err.message));
    if (can("backup.export")) {
      getCached<{ data: Summary }>("/backup/summary/", (res) => setSummary(res.data)).catch(
        () => {}
      );
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
      <PageHeader
        title="الاعتماد والنسخ الاحتياطي"
        subtitle="ما الذي لا يدخل الحسابات قبل موافقة، وكيف تحتفظ بنسخة من كل شيء"
        farm={me?.farm?.name}
      />

      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      {can("finance.view") && (
        <div className="card mb-4">
          <div className="card-title">
            <span className="inline">
              <Icon name="shield" size={17} className="muted" />
              قواعد الاعتماد
            </span>
          </div>
          <p className="page-sub mb-4">
            أي عملية من النوع المحدد بمبلغ يساوي الحد أو يتجاوزه تُسجَّل «بانتظار الاعتماد»
            ولا تدخل الأرصدة حتى يعتمدها صاحب صلاحية.
          </p>

          {can("settings.edit") && (
            <form className="row mb-5" onSubmit={addRule}>
              <div className="field">
                <label>نوع العملية</label>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>
                  ))}
                </select>
              </div>
              <div className="field">
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
              <div className="field row-wide">
                <label>ملاحظة</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              <div style={{ flex: "0 0 auto" }}>
                <Button icon="plus" busy={busy}>
                  إضافة قاعدة
                </Button>
              </div>
            </form>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نوع العملية</th>
                  <th>الحد</th>
                  <th>الحالة</th>
                  <th>ملاحظة</th>
                  <th className="cell-actions" />
                </tr>
              </thead>
              <tbody>
                <TableMessage
                  colSpan={5}
                  empty={rules.length === 0}
                  emptyTitle="لا توجد قواعد اعتماد"
                  emptyText="كل العمليات تُرحَّل مباشرة. أضف قاعدة أعلاه لتوقف ما يتجاوز حدًا معيّنًا حتى يعتمده صاحب صلاحية."
                />
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{KIND_LABEL[rule.kind] ?? rule.kind}</td>
                    <td className="num strong">{money(rule.min_amount, rule.currency)}</td>
                    <td>
                      <span className={`badge ${rule.is_active ? "badge-success" : "badge-muted"}`}>
                        {rule.is_active ? "مفعّلة" : "موقوفة"}
                      </span>
                    </td>
                    <td className="muted">{rule.note || "—"}</td>
                    <td className="cell-actions">
                      {can("settings.edit") && (
                        <span className="cell-actions-group">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={rule.is_active ? "lock" : "check"}
                            onClick={() => toggle(rule)}
                          >
                            {rule.is_active ? "إيقاف" : "تفعيل"}
                          </Button>
                          <button
                            className="icon-btn"
                            title="حذف القاعدة"
                            aria-label="حذف القاعدة"
                            style={{ color: "var(--color-danger)" }}
                            onClick={() => remove(rule)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {can("backup.export") && (
        <div className="card">
          <div className="card-title">
            <span className="inline">
              <Icon name="download" size={17} className="muted" />
              النسخ الاحتياطي
            </span>
            {summary && <span className="badge">{summary.total_rows} سجل</span>}
          </div>
          <p className="page-sub mb-4">
            ملف JSON واحد يحوي بيانات هذه المزرعة كاملة — بلا كلمات مرور. احتفظ به
            خارج الخادم؛ فائدة النسخة أنها تبقى حين لا يبقى النظام.
          </p>

          {summary && (
            <div className="table-wrap mb-4" style={{ maxHeight: 320, overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>الجدول</th>
                    <th>عدد السجلات</th>
                  </tr>
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
                </tbody>
                <tfoot>
                  <tr>
                    <td>الإجمالي</td>
                    <td className="num">{summary.total_rows}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <Button
            icon="download"
            onClick={() =>
              download("/backup/?pretty=1", "backup.json").catch((err) => setError(err.message))
            }
          >
            تنزيل نسخة احتياطية الآن
          </Button>
        </div>
      )}
    </>
  );
}
