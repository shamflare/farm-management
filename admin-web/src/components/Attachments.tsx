"use client";

import { useEffect, useRef, useState } from "react";
import { api, formatBytes, formatDate, readFileAsDataUri } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Icon from "@/components/Icon";
import { Button, ErrorNote, TableMessage } from "@/components/ui";

type Attachment = {
  id: string;
  kind: string;
  name: string;
  content_type: string;
  size: number;
  note: string;
  is_primary: boolean;
  is_image: boolean;
  uploaded_by: string;
  created_at: string;
};
type Page<T> = { count: number; results: T[] };

const KIND_LABEL: Record<string, string> = {
  photo: "صورة",
  invoice: "فاتورة",
  receipt: "إيصال",
  contract: "عقد",
  document: "مستند",
};

const KINDS = ["photo", "invoice", "receipt", "contract", "document"];

/**
 * The papers that belong to a record: a photo of the animal, the invoice for a
 * purchase, the receipt for a payment.
 *
 * Files are held in the database as data URIs rather than on disk, so nothing
 * vanishes when a free host hands the service a fresh disk. That is also why
 * the ceiling is 3 MB and the listing never carries the bytes — a row is only
 * fetched in full when someone asks to look at it.
 */
export default function Attachments({
  subjectType,
  subjectId,
  title = "المرفقات",
  allowPhoto = true,
  onChange,
}: {
  subjectType: string;
  subjectId: string;
  title?: string;
  allowPhoto?: boolean;
  onChange?: () => void;
}) {
  const { can } = useApp();
  const [rows, setRows] = useState<Attachment[]>([]);
  const [kind, setKind] = useState(allowPhoto ? "photo" : "invoice");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ name: string; data: string; isImage: boolean } | null>(
    null
  );
  const picker = useRef<HTMLInputElement>(null);

  async function load() {
    const data = await api.get<Page<Attachment>>(
      `/attachments/?subject_type=${subjectType}&subject_id=${subjectId}&page_size=50`
    );
    setRows(data.results);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectType, subjectId]);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const data = await readFileAsDataUri(file);
      await api.post("/attachments/upload/", {
        subject_type: subjectType,
        subject_id: subjectId,
        data,
        name: file.name,
        kind,
        note,
        // The first picture uploaded becomes the one that represents the record.
        is_primary: kind === "photo" && !rows.some((row) => row.is_primary),
      });
      setNote("");
      if (picker.current) picker.current.value = "";
      await load();
      onChange?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function open(row: Attachment) {
    const full = await api.get<Attachment & { data: string }>(`/attachments/${row.id}/`);
    setPreview({ name: row.name, data: full.data, isImage: row.is_image });
  }

  async function makePrimary(row: Attachment) {
    await api.post(`/attachments/${row.id}/primary/`);
    await load();
    onChange?.();
  }

  async function remove(row: Attachment) {
    await api.delete(`/attachments/${row.id}/`);
    await load();
    onChange?.();
  }

  return (
    <div className="card">
      <div className="card-title">
        <span className="inline">
          <Icon name="image" size={17} className="muted" />
          {title}
        </span>
        <span className="badge badge-muted">{rows.length}</span>
      </div>

      <ErrorNote message={error} />

      {can("attachments.create") && (
        <div className="row mb-5">
          <div className="field">
            <label>النوع</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.filter((k) => allowPhoto || k !== "photo").map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div className="field row-wide">
            <label>ملاحظة</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" />
          </div>
          <div className="field">
            <label>الملف (صورة أو PDF، حتى 3 ميغابايت)</label>
            <input
              ref={picker}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
              }}
            />
          </div>
        </div>
      )}

      {busy && (
        <div className="empty inline" style={{ justifyContent: "center", padding: "var(--s5)" }}>
          <span className="spinner" />
          <span>جارٍ الرفع…</span>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <tbody>
            <TableMessage
              colSpan={5}
              empty={rows.length === 0}
              emptyTitle="لا توجد مرفقات"
              emptyText="الملفات تُحفظ داخل قاعدة البيانات لا على القرص، فتسافر مع النسخة الاحتياطية ولا تختفي مع النشر."
            />
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className="inline" style={{ gap: "var(--s2)" }}>
                    <button className="link inline" onClick={() => open(row)} style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}>
                      <Icon name={row.is_image ? "image" : "file"} size={16} />
                      {row.name}
                    </button>
                    {row.is_primary && <span className="badge">الصورة الأساسية</span>}
                  </span>
                </td>
                <td className="muted">{KIND_LABEL[row.kind] ?? row.kind}</td>
                <td className="num muted">{formatBytes(row.size)}</td>
                <td className="muted num">{formatDate(row.created_at)}</td>
                <td className="cell-actions">
                  <span className="cell-actions-group">
                    {row.is_image && !row.is_primary && can("attachments.create") && (
                      <Button size="sm" variant="ghost" icon="check" onClick={() => makePrimary(row)}>
                        اجعلها الأساسية
                      </Button>
                    )}
                    {can("attachments.delete") && (
                      <button
                        className="icon-btn"
                        title="حذف المرفق"
                        aria-label="حذف المرفق"
                        style={{ color: "var(--color-danger)" }}
                        onClick={() => remove(row)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="modal" style={{ maxWidth: 760 }}>
            <div className="modal-title">{preview.name}</div>
            {preview.isImage ? (
              <img
                src={preview.data}
                alt={preview.name}
                style={{ maxWidth: "100%", borderRadius: "var(--radius-sm)" }}
              />
            ) : (
              <iframe
                src={preview.data}
                title={preview.name}
                style={{
                  width: "100%",
                  height: "60vh",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
            )}
            <div className="modal-actions">
              <Button variant="ghost" icon="close" onClick={() => setPreview(null)}>
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
