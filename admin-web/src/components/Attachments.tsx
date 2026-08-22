"use client";

import { useEffect, useRef, useState } from "react";
import { api, formatBytes, formatDate, readFileAsDataUri } from "@/lib/api";
import { useApp } from "@/components/AppShell";

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
        <span>{title}</span>
        <span className="badge badge-muted">{rows.length}</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {can("attachments.create") && (
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>النوع</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.filter((k) => allowPhoto || k !== "photo").map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0, flex: "2 1 200px" }}>
            <label>ملاحظة</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" />
          </div>
          <div className="field" style={{ margin: 0 }}>
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

      {busy && <div className="empty">جارٍ الرفع…</div>}

      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <button className="btn btn-ghost btn-sm" onClick={() => open(row)}>
                  {row.is_image ? "🖼️" : "📄"} {row.name}
                </button>
                {row.is_primary && <span className="badge" style={{ marginRight: 6 }}>الصورة الأساسية</span>}
              </td>
              <td className="muted">{KIND_LABEL[row.kind] ?? row.kind}</td>
              <td className="num muted">{formatBytes(row.size)}</td>
              <td className="muted">{formatDate(row.created_at)}</td>
              <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                {row.is_image && !row.is_primary && can("attachments.create") && (
                  <button className="btn btn-ghost btn-sm" onClick={() => makePrimary(row)}>
                    اجعلها الأساسية
                  </button>
                )}{" "}
                {can("attachments.delete") && (
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(row)}>حذف</button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">لا توجد مرفقات</td>
            </tr>
          )}
        </tbody>
      </table>

      {preview && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="modal" style={{ maxWidth: 760 }}>
            <div className="modal-title">{preview.name}</div>
            {preview.isImage ? (
              <img src={preview.data} alt={preview.name} style={{ maxWidth: "100%", borderRadius: 8 }} />
            ) : (
              <iframe src={preview.data} style={{ width: "100%", height: "60vh", border: 0 }} />
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setPreview(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
