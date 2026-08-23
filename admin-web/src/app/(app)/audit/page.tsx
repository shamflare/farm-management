"use client";

import { Fragment, useEffect, useState } from "react";
import { api, formatDateTime, formatNumber, getCached, hasCache } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Icon from "@/components/Icon";
import { ErrorNote, PageHeader, TableMessage } from "@/components/ui";

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

/** لون الشارة يقول نوع الحدث قبل قراءة كلمته. */
const ACTION_TONE: Record<string, string> = {
  create: "badge-success",
  post: "badge-success",
  approve: "badge-success",
  update: "badge-info",
  setting: "badge-info",
  restore: "badge-info",
  delete: "badge-danger",
  void: "badge-danger",
  reject: "badge-danger",
  reverse: "badge-warning",
  login: "badge-muted",
};

function ValueBlock({ title, value }: { title: string; value: any }) {
  return (
    <div>
      <div className="stat-label mb-4">{title}</div>
      <pre
        style={{
          fontSize: "0.78rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          direction: "ltr",
          textAlign: "left",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          padding: "var(--s3)",
          margin: 0,
          maxHeight: 260,
          overflow: "auto",
        }}
      >
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}

export default function AuditPage() {
  const { me } = useApp();
  const [rows, setRows] = useState<Log[]>([]);
  const [count, setCount] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ page_size: "60" });
    if (action) params.set("action", action);
    const path = `/audit/?${params}`;
    setLoading(!hasCache(path));
    getCached<Page<Log>>(path, (data) => {
      setRows(data.results);
      setCount(data.count);
    })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [action]);

  return (
    <>
      <PageHeader
        title="سجل التدقيق"
        subtitle={`${formatNumber(count)} حدث · من فعل ماذا ومتى، بالقيمة قبل وبعد`}
        farm={me?.farm?.name}
      >
        <div className="field no-print" style={{ marginBottom: 0, width: 190 }}>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">كل الأحداث</option>
            {Object.entries(ACTION_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </PageHeader>

      <ErrorNote message={error} />

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
              <th className="cell-actions" />
            </tr>
          </thead>
          <tbody>
            <TableMessage
              colSpan={7}
              loading={loading}
              empty={rows.length === 0}
              emptyTitle="لا توجد أحداث"
              emptyText="السجل يُكتب ولا يُمحى: كل عملية على النظام تترك أثرها هنا باسم من نفّذها."
            />
            {!loading &&
              rows.map((log) => {
                const hasDetail = log.old_values || log.new_values;
                const open = expanded === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr
                      className={hasDetail ? "clickable" : ""}
                      onClick={() => hasDetail && setExpanded(open ? null : log.id)}
                    >
                      <td className="muted num">{formatDateTime(log.created_at)}</td>
                      <td className="strong">{log.user_name || "النظام"}</td>
                      <td>
                        <span className={`badge ${ACTION_TONE[log.action] ?? ""}`}>
                          {ACTION_LABEL[log.action] ?? log.action}
                        </span>
                      </td>
                      <td className="muted">{log.entity}</td>
                      <td className="truncate" style={{ maxWidth: 260 }}>
                        {log.label || "—"}
                      </td>
                      <td className="muted num">{log.ip_address || "—"}</td>
                      <td className="cell-actions">
                        {hasDetail && (
                          <Icon
                            name={open ? "chevronUp" : "chevronDown"}
                            size={16}
                            className="muted"
                          />
                        )}
                      </td>
                    </tr>
                    {open && hasDetail && (
                      <tr>
                        <td colSpan={7} className="subtable-cell">
                          <div className="grid grid-2" style={{ padding: "var(--s4)" }}>
                            <ValueBlock title="قبل" value={log.old_values} />
                            <ValueBlock title="بعد" value={log.new_values} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}
