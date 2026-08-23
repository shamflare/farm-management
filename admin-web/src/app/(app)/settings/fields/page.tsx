"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Icon from "@/components/Icon";
import {
  Button,
  ErrorNote,
  PageHeader,
  SuccessNote,
  TableMessage,
  Tabs,
} from "@/components/ui";

type Field = {
  id: string;
  entity: string;
  key: string;
  label: string;
  label_ar: string;
  display_label: string;
  field_type: string;
  is_builtin: boolean;
  is_required: boolean;
  is_visible: boolean;
  is_active: boolean;
  show_in_list: boolean;
  sort_order: number;
};
type Page<T> = { count: number; results: T[] };

const ENTITIES = [
  { key: "animal", label: "نموذج الحيوان" },
  { key: "expense", label: "نموذج المصروف" },
];

const FIELD_TYPES: Record<string, string> = {
  text: "نص",
  long_text: "نص طويل",
  number: "رقم",
  decimal: "رقم عشري",
  currency: "مبلغ",
  date: "تاريخ",
  datetime: "تاريخ ووقت",
  boolean: "نعم / لا",
  dropdown: "قائمة منسدلة",
  multi_select: "اختيار متعدد",
  radio: "اختيار واحد",
  file: "ملف",
  image: "صورة",
  relation: "ارتباط",
  percentage: "نسبة مئوية",
};

export default function FieldsPage() {
  const { can, me } = useApp();
  const [entity, setEntity] = useState("animal");
  const [fields, setFields] = useState<Field[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ label_ar: "", key: "", field_type: "text" });

  const readOnly = !can("settings.edit");

  async function load() {
    const data = await api.get<Page<Field>>(`/fields/?entity=${entity}&page_size=100&ordering=sort_order`);
    setFields(data.results.sort((a, b) => a.sort_order - b.sort_order));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  async function patch(field: Field, body: Partial<Field>) {
    await api.patch(`/fields/${field.id}/`, body);
    load();
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...fields];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
    await api.post("/fields/reorder/", { order: next.map((f) => f.id) });
    setNotice("تم حفظ الترتيب");
  }

  async function addField(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.post("/fields/", {
        entity,
        key: form.key || `f_${Date.now().toString(36)}`,
        label: form.label_ar,
        label_ar: form.label_ar,
        field_type: form.field_type,
        sort_order: fields.length * 10,
      });
      setForm({ label_ar: "", key: "", field_type: "text" });
      setNotice("أُضيف الحقل — يظهر في التطبيق مباشرة بدون تعديل الكود");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <>
      <PageHeader
        title="بناء النماذج"
        subtitle="أظهر أو أخفِ أو أعد تسمية أي حقل، وأضف حقولًا جديدة — بدون مبرمج"
        farm={me?.farm?.name}
      />

      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      <Tabs value={entity} onChange={setEntity} options={ENTITIES} />

      {!readOnly && (
        <form className="card mb-4" onSubmit={addField}>
          <div className="row">
            <div className="field">
              <label>حقل جديد</label>
              <input
                placeholder="مثال: رقم الشريحة الإلكترونية"
                value={form.label_ar}
                onChange={(e) => setForm({ ...form, label_ar: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>نوع الحقل</label>
              <select value={form.field_type} onChange={(e) => setForm({ ...form, field_type: e.target.value })}>
                {Object.entries(FIELD_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <Button icon="plus">إضافة الحقل</Button>
            </div>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الترتيب</th>
              <th>التسمية الظاهرة</th>
              <th>المفتاح</th>
              <th>النوع</th>
              <th>ظاهر</th>
              <th>إجباري</th>
              <th>في الجدول</th>
              <th>المصدر</th>
            </tr>
          </thead>
          <tbody>
            <TableMessage
              colSpan={8}
              empty={fields.length === 0}
              emptyTitle="لا توجد حقول"
              emptyText="أضف حقلًا من النموذج أعلاه ليظهر في شاشة الإدخال مباشرة بلا تعديل كود."
            />
            {fields.map((field, index) => (
              <tr key={field.id}>
                <td className="nowrap">
                  <span className="cell-actions-group">
                    <button
                      className="icon-btn bordered"
                      title="أعلى"
                      aria-label="نقل لأعلى"
                      disabled={readOnly || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <Icon name="chevronUp" size={15} />
                    </button>
                    <button
                      className="icon-btn bordered"
                      title="أسفل"
                      aria-label="نقل لأسفل"
                      disabled={readOnly || index === fields.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <Icon name="chevronDown" size={15} />
                    </button>
                  </span>
                </td>
                <td style={{ minWidth: 220 }}>
                  <input
                    className="input"
                    defaultValue={field.display_label}
                    disabled={readOnly}
                    onBlur={(e) => {
                      if (e.target.value !== field.display_label) patch(field, { label_ar: e.target.value });
                    }}
                  />
                </td>
                <td className="muted num">{field.key}</td>
                <td className="muted">{FIELD_TYPES[field.field_type] ?? field.field_type}</td>
                <td>
                  <input type="checkbox" checked={field.is_visible} disabled={readOnly} onChange={() => patch(field, { is_visible: !field.is_visible })} />
                </td>
                <td>
                  <input type="checkbox" checked={field.is_required} disabled={readOnly} onChange={() => patch(field, { is_required: !field.is_required })} />
                </td>
                <td>
                  <input type="checkbox" checked={field.show_in_list} disabled={readOnly} onChange={() => patch(field, { show_in_list: !field.show_in_list })} />
                </td>
                <td>
                  <span className={`badge ${field.is_builtin ? "badge-muted" : "badge-info"}`}>
                    {field.is_builtin ? "حقل أساسي" : "حقل مخصص"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert alert-info mt-4 no-print">
        <Icon name="info" />
        <span>
          الحقول الأساسية مرتبطة بأعمدة حقيقية في قاعدة البيانات، لذلك يمكن إخفاؤها لا حذفها — حتى
          لا تنكسر التقارير والمحاسبة.
        </span>
      </div>
    </>
  );
}
