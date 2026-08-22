"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, download, formatDate } from "@/lib/api";
import { useApp } from "@/components/AppShell";

type Catalog = { id: string; code: string; display_name: string; type: string; parent: string | null };
type Animal = {
  id: string;
  tag: string;
  name: string;
  type_name: string;
  breed_name: string;
  status_name: string;
  status_code: string;
  location_name: string;
  branch_name: string;
  branch_code: string;
  sex: string;
  birth_date: string | null;
  current_weight: string | null;
  is_on_farm: boolean;
};
type Page<T> = { count: number; next: string | null; results: T[] };

const SEX_LABEL: Record<string, string> = { female: "أنثى", male: "ذكر", unknown: "غير محدد" };

export default function AnimalsPage() {
  const { can } = useApp();
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [rows, setRows] = useState<Animal[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    branch: "",
    animal_type: "",
    status: "",
    sex: "",
    is_on_farm: "true",
  });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const byType = useMemo(() => {
    const grouped: Record<string, Catalog[]> = {};
    catalog.forEach((item) => {
      (grouped[item.type] ??= []).push(item);
    });
    return grouped;
  }, [catalog]);

  async function loadCatalog() {
    const data = await api.get<Page<Catalog>>("/catalog/?page_size=200");
    setCatalog(data.results);
  }

  async function loadAnimals() {
    setLoading(true);
    const params = new URLSearchParams({ page_size: "50" });
    if (search) params.set("search", search);
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    try {
      const data = await api.get<Page<Animal>>(`/animals/?${params}`);
      setRows(data.results);
      setCount(data.count);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCatalog().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadAnimals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, search]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">الحيوانات</h1>
          <p className="page-sub">{count} حيوان · المباع والنافق يبقيان في السجل والنسب</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {can("animals.export") && (
            <button
              className="btn btn-ghost"
              onClick={() =>
                download(
                  `/export/animals/?branch=${filters.branch}&is_on_farm=${filters.is_on_farm}`
                ).catch((err) => setError(err.message))
              }
            >
              ⬇ تصدير CSV
            </button>
          )}
          {can("animals.create") && (
            <button className="btn" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "إغلاق" : "+ إضافة حيوان"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <AnimalForm
          byType={byType}
          onDone={() => {
            setShowForm(false);
            loadAnimals();
          }}
        />
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <div className="field" style={{ margin: 0 }}>
            <label>بحث</label>
            <input
              placeholder="رقم الحيوان، الاسم، رقم الشريحة…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>الفرع</label>
            <select value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}>
              <option value="">كل الفروع</option>
              {(byType["branch"] ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.display_name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>النوع</label>
            <select value={filters.animal_type} onChange={(e) => setFilters({ ...filters, animal_type: e.target.value })}>
              <option value="">الكل</option>
              {(byType["animal_type"] ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.display_name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>الحالة</label>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">الكل</option>
              {(byType["animal_status"] ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.display_name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>الجنس</label>
            <select value={filters.sex} onChange={(e) => setFilters({ ...filters, sex: e.target.value })}>
              <option value="">الكل</option>
              <option value="female">أنثى</option>
              <option value="male">ذكر</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>الوجود</label>
            <select value={filters.is_on_farm} onChange={(e) => setFilters({ ...filters, is_on_farm: e.target.value })}>
              <option value="true">في المزرعة</option>
              <option value="false">خارج المزرعة</option>
              <option value="">الكل</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الرقم</th>
              <th>الاسم</th>
              <th>الفرع</th>
              <th>النوع</th>
              <th>السلالة</th>
              <th>الجنس</th>
              <th>تاريخ الميلاد</th>
              <th>الحالة</th>
              <th>الموقع</th>
              <th>الوزن</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="empty">جارٍ التحميل…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="empty">لا توجد نتائج</td>
              </tr>
            )}
            {rows.map((animal) => (
              <tr key={animal.id}>
                <td>
                  <Link href={`/animals/${animal.id}`} style={{ fontWeight: 700, color: "var(--color-primary)" }}>
                    {animal.tag}
                  </Link>
                </td>
                <td>{animal.name || "—"}</td>
                <td>
                  {animal.branch_name ? (
                    <span className="badge badge-muted">{animal.branch_name}</span>
                  ) : (
                    <span className="muted">غير محدد</span>
                  )}
                </td>
                <td>{animal.type_name}</td>
                <td>{animal.breed_name || "—"}</td>
                <td>{SEX_LABEL[animal.sex] ?? animal.sex}</td>
                <td>{formatDate(animal.birth_date)}</td>
                <td>
                  <span
                    className={`badge ${
                      animal.status_code === "dead"
                        ? "badge-danger"
                        : animal.status_code === "sold"
                        ? "badge-muted"
                        : ""
                    }`}
                  >
                    {animal.status_name}
                  </span>
                </td>
                <td>{animal.location_name || "—"}</td>
                <td className="num">{animal.current_weight ? `${Number(animal.current_weight)} كغ` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AnimalForm({
  byType,
  onDone,
}: {
  byType: Record<string, Catalog[]>;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    tag: "",
    name: "",
    branch: "",
    animal_type: "",
    breed: "",
    status: "",
    location: "",
    sex: "female",
    birth_date: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const suggested = useRef("");

  useEffect(() => {
    const types = byType["animal_type"] ?? [];
    const statuses = byType["animal_status"] ?? [];
    const branches = byType["branch"] ?? [];
    setForm((prev) => ({
      ...prev,
      branch: prev.branch || branches.find((b) => b.code === "breeding")?.id || "",
      animal_type: prev.animal_type || types[0]?.id || "",
      status: prev.status || statuses.find((s) => s.code === "active")?.id || statuses[0]?.id || "",
    }));
  }, [byType]);

  // Each branch counts from one, so the suggestion has to know which branch
  // the animal is joining. Switching branch replaces the suggested number but
  // never a number the user typed themselves.
  useEffect(() => {
    if (!form.animal_type) return;
    const params = new URLSearchParams({ animal_type: form.animal_type });
    if (form.branch) params.set("branch", form.branch);
    api
      .get<{ ok: boolean; data: { tag: string } }>(`/animals/next-tag/?${params}`)
      .then((res) => {
        setForm((prev) =>
          !prev.tag || prev.tag === suggested.current ? { ...prev, tag: res.data.tag } : prev
        );
        suggested.current = res.data.tag;
      })
      .catch(() => {});
  }, [form.animal_type, form.branch]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/animals/", {
        ...form,
        branch: form.branch || null,
        breed: form.breed || null,
        location: form.location || null,
        birth_date: form.birth_date || null,
        acquisition: "born",
      });
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ marginBottom: 16 }} onSubmit={submit}>
      <div className="card-title">حيوان جديد</div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="row">
        <div className="field">
          <label>رقم الحيوان</label>
          <input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} required />
        </div>
        <div className="field">
          <label>الاسم</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label>الفرع</label>
          <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
            <option value="">—</option>
            {(byType["branch"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>النوع</label>
          <select value={form.animal_type} onChange={(e) => setForm({ ...form, animal_type: e.target.value })} required>
            {(byType["animal_type"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>السلالة</label>
          <select value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })}>
            <option value="">—</option>
            {(byType["breed"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الجنس</label>
          <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
            <option value="female">أنثى</option>
            <option value="male">ذكر</option>
            <option value="unknown">غير محدد</option>
          </select>
        </div>
        <div className="field">
          <label>تاريخ الميلاد</label>
          <input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
        </div>
        <div className="field">
          <label>الحالة</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} required>
            {(byType["animal_status"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الموقع</label>
          <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
            <option value="">—</option>
            {(byType["location"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
          </select>
        </div>
      </div>
      <button className="btn" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</button>
    </form>
  );
}
