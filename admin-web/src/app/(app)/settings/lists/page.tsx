"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { api, getCached } from "@/lib/api";
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

type CatalogType = { code: string; name: string; name_ar: string; allows_children: boolean };
type Item = {
  id: string;
  type: string;
  parent: string | null;
  code: string;
  name: string;
  name_ar: string;
  display_name: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  children_count: number;
};
type Page<T> = { count: number; results: T[] };

export default function ListsPage() {
  const { can, me } = useApp();
  const [types, setTypes] = useState<CatalogType[]>([]);
  const [active, setActive] = useState("expense_category");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name_ar: "", code: "", parent: "" });

  const readOnly = !can("settings.edit");

  const tree = useMemo(() => {
    const roots = items.filter((item) => !item.parent);
    return roots.map((root) => ({
      root,
      children: items.filter((item) => item.parent === root.id),
    }));
  }, [items]);

  async function loadTypes() {
    await getCached<Page<CatalogType>>("/catalog-types/?page_size=100", (data) =>
      setTypes(data.results)
    );
  }

  async function loadItems() {
    await getCached<Page<Item>>(`/catalog/?type=${active}&page_size=200`, (data) =>
      setItems(data.results)
    );
  }

  useEffect(() => {
    loadTypes().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadItems().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.post("/catalog/", {
        type: active,
        parent: form.parent || null,
        code: form.code || slugify(form.name_ar),
        name: form.name_ar,
        name_ar: form.name_ar,
        sort_order: items.length * 10,
      });
      setForm({ name_ar: "", code: "", parent: "" });
      setNotice("تمت الإضافة — متاحة فورًا في كل النماذج");
      loadItems();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function rename(item: Item) {
    const name = window.prompt("الاسم الجديد", item.display_name);
    if (!name) return;
    await api.patch(`/catalog/${item.id}/`, { name_ar: name });
    setNotice("تم التعديل — العمليات التاريخية لم تتأثر لأنها مرتبطة بالسجل لا بالاسم");
    loadItems();
  }

  async function toggle(item: Item) {
    await api.patch(`/catalog/${item.id}/`, { is_active: !item.is_active });
    loadItems();
  }

  const currentType = types.find((t) => t.code === active);

  return (
    <>
      <PageHeader
        title="القوائم والبنود"
        subtitle="كل قائمة في النظام تُدار من هنا — لا شيء مكتوب داخل الكود"
        farm={me?.farm?.name}
      />

      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      <Tabs
        value={active}
        onChange={setActive}
        options={types.map((type) => ({ key: type.code, label: type.name_ar || type.name }))}
      />

      {!readOnly && (
        <form className="card mb-4" onSubmit={addItem}>
          <div className="row">
            <div className="field">
              <label>بند جديد في «{currentType?.name_ar}»</label>
              <input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} required placeholder="الاسم بالعربية" />
            </div>
            {currentType?.allows_children && (
              <div className="field">
                <label>تابع لـ</label>
                <select value={form.parent} onChange={(e) => setForm({ ...form, parent: e.target.value })}>
                  <option value="">بند رئيسي</option>
                  {items.filter((i) => !i.parent).map((item) => (
                    <option key={item.id} value={item.id}>{item.display_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ flex: "0 0 auto" }}>
              <Button icon="plus">إضافة</Button>
            </div>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الرمز</th>
              <th>الحالة</th>
              <th className="cell-actions" />
            </tr>
          </thead>
          <tbody>
            <TableMessage
              colSpan={4}
              empty={tree.length === 0}
              emptyTitle="لا توجد بنود في هذه القائمة"
              emptyText="أضف أول بند من النموذج أعلاه؛ العمليات ترتبط بالسجل لا بالاسم، فتغيير الاسم لاحقًا لا يفسد الماضي."
            />
            {tree.map(({ root, children }) => (
              <Fragment key={root.id}>
                <tr>
                  <td className="strong">{root.display_name}</td>
                  <td className="muted num">{root.code}</td>
                  <td>
                    <span className="inline" style={{ gap: "var(--s1)" }}>
                      <span className={`badge ${root.is_active ? "badge-success" : "badge-muted"}`}>
                        {root.is_active ? "مفعّل" : "معطّل"}
                      </span>
                      {root.is_system && <span className="badge badge-muted">افتراضي</span>}
                    </span>
                  </td>
                  <td className="cell-actions">
                    {!readOnly && (
                      <span className="cell-actions-group">
                        <button
                          className="icon-btn"
                          title="تعديل الاسم"
                          aria-label="تعديل الاسم"
                          onClick={() => rename(root)}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={root.is_active ? "lock" : "check"}
                          onClick={() => toggle(root)}
                        >
                          {root.is_active ? "تعطيل" : "تفعيل"}
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
                {children.map((child) => (
                  <tr key={child.id}>
                    <td className="muted" style={{ paddingInlineStart: 40 }}>
                      <span className="inline" style={{ gap: "var(--s2)" }}>
                        <Icon name="chevronStart" size={13} />
                        {child.display_name}
                      </span>
                    </td>
                    <td className="muted num">{child.code}</td>
                    <td>
                      <span className={`badge ${child.is_active ? "badge-success" : "badge-muted"}`}>
                        {child.is_active ? "مفعّل" : "معطّل"}
                      </span>
                    </td>
                    <td className="cell-actions">
                      {!readOnly && (
                        <span className="cell-actions-group">
                          <button
                            className="icon-btn"
                            title="تعديل الاسم"
                            aria-label="تعديل الاسم"
                            onClick={() => rename(child)}
                          >
                            <Icon name="edit" size={16} />
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={child.is_active ? "lock" : "check"}
                            onClick={() => toggle(child)}
                          >
                            {child.is_active ? "تعطيل" : "تفعيل"}
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function slugify(value: string) {
  const base = value.trim().replace(/\s+/g, "_").toLowerCase();
  return /^[a-z0-9_-]+$/.test(base) ? base : `item_${Date.now().toString(36)}`;
}
