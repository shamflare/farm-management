"use client";

import { Fragment, useEffect, useState } from "react";
import { api, formatDateTime } from "@/lib/api";

type Log = {
  id: string;
  action: string;
  entity: string;
  object_id: string;
  label: string;
  old_values: any;
  new_values: any;
  user_name: string;
  ip_address: string;
  created_at: string;
};
type Page<T> = { count: number; results: T[] };

const ACTION_LABEL: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  restore: "استرجاع",
  post: "ترحيل",
  void: "إلغاء",
  reverse: "عكس قيد",
  approve: "اعتماد",
  reject: "رفض",
  login: "دخول",
  setting: "تغيير إعداد",
};

export default function AuditPage() {
  const [rows, setRows] = useState<Log[]>([]);
  const [count, setCount] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ page_size: "60" });
    if (action) params.set("action", action);
    api
      .get<Page<Log>>(`/audit/?${params}`)
      .then((data) => {
        setRows(data.results);
        setCount(data.count);
      })
      .catch((err) => setError(err.message));
  }, [action]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">سجل التدقيق</h1>
          <p className="page-sub">{count} حدث · من فعل ماذا ومتى، بالقيمة قبل وبعد</p>
        </div>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          style={{ padding: 8, borderRadius: "var(--radius)", border: "1px solid var(--color-border)" }}
        >
          <option value="">كل الأحداث</option>
          {Object.entries(ACTION_LABEL).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الوقت</th>
              <th>المستخدم</th>
              <th>الحدث</th>
              <th>السجل</th>
              <th>الوصف</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="empty">لا توجد أحداث</td></tr>}
            {rows.map((log) => (
              <Fragment key={log.id}>
                <tr style={{ cursor: "pointer" }} onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                  <td className="muted">{formatDateTime(log.created_at)}</td>
                  <td>{log.user_name || "النظام"}</td>
                  <td><span className="badge">{ACTION_LABEL[log.action] ?? log.action}</span></td>
                  <td className="muted">{log.entity}</td>
                  <td>{log.label || "—"}</td>
                  <td className="muted num">{log.ip_address || "—"}</td>
                </tr>
                {expanded === log.id && (log.old_values || log.new_values) && (
                  <tr>
                    <td colSpan={6} style={{ background: "color-mix(in srgb, var(--color-primary) 3%, transparent)" }}>
                      <div className="grid grid-2">
                        <div>
                          <div className="stat-label">قبل</div>
                          <pre style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap", direction: "ltr", textAlign: "left" }}>
                            {log.old_values ? JSON.stringify(log.old_values, null, 2) : "—"}
                          </pre>
                        </div>
                        <div>
                          <div className="stat-label">بعد</div>
                          <pre style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap", direction: "ltr", textAlign: "left" }}>
                            {log.new_values ? JSON.stringify(log.new_values, null, 2) : "—"}
                          </pre>
                        </div>
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
