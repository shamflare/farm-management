"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/components/AppShell";

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
  const { can } = useApp();
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
    const data = await api.get<Page<CatalogType>>("/catalog-types/?page_size=100");
    setTypes(data.results);
  }

  async function loadItems() {
    const data = await api.get<Page<Item>>(`/catalog/?type=${active}&page_size=200`);
    setItems(data.results);
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
      <div className="page-head">
        <div>
          <h1 className="page-title">القوائم والبنود</h1>
          <p className="page-sub">
            كل قائمة في النظام تُدار من هنا — لا شيء مكتوب داخل الكود
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="tabs">
        {types.map((type) => (
          <button key={type.code} className={`tab ${active === type.code ? "active" : ""}`} onClick={() => setActive(type.code)}>
            {type.name_ar || type.name}
          </button>
        ))}
      </div>

      {!readOnly && (
        <form className="card" style={{ marginBottom: 16 }} onSubmit={addItem}>
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
            <div className="field" style={{ flex: "0 0 auto" }}>
              <label>&nbsp;</label>
              <button className="btn">إضافة</button>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tree.length === 0 && <tr><td colSpan={4} className="empty">لا توجد بنود</td></tr>}
            {tree.map(({ root, children }) => (
              <Fragment key={root.id}>
                <tr>
                  <td style={{ fontWeight: 600 }}>{root.display_name}</td>
                  <td className="muted num">{root.code}</td>
                  <td>
                    <span className={`badge ${root.is_active ? "" : "badge-muted"}`}>
                      {root.is_active ? "مفعّل" : "معطّل"}
                    </span>
                    {root.is_system && <span className="badge badge-muted" style={{ marginInlineStart: 6 }}>افتراضي</span>}
                  </td>
                  <td>
                    {!readOnly && (
                      <>
                        <button className="btn btn-sm btn-ghost" onClick={() => rename(root)}>تعديل الاسم</button>{" "}
                        <button className="btn btn-sm btn-ghost" onClick={() => toggle(root)}>
                          {root.is_active ? "تعطيل" : "تفعيل"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {children.map((child) => (
                  <tr key={child.id}>
                    <td style={{ paddingInlineStart: 36 }} className="muted">↳ {child.display_name}</td>
                    <td className="muted num">{child.code}</td>
                    <td>
                      <span className={`badge ${child.is_active ? "" : "badge-muted"}`}>
                        {child.is_active ? "مفعّل" : "معطّل"}
                      </span>
                    </td>
                    <td>
                      {!readOnly && (
                        <>
                          <button className="btn btn-sm btn-ghost" onClick={() => rename(child)}>تعديل الاسم</button>{" "}
                          <button className="btn btn-sm btn-ghost" onClick={() => toggle(child)}>
                            {child.is_active ? "تعطيل" : "تفعيل"}
                          </button>
                        </>
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
