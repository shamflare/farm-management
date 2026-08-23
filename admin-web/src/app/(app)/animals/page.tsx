"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, download, formatDate, formatNumber, getCached, hasCache } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Icon from "@/components/Icon";
import {
  Button,
  ErrorNote,
  ExportButton,
  PageHeader,
  SearchField,
  SelectField,
  TableMessage,
  Tabs,
  Toolbar,
} from "@/components/ui";

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

const STATUS_TONE: Record<string, string> = {
  dead: "badge-danger",
  sold: "badge-muted",
  active: "badge-success",
};

/** الفلاتر التي يحملها كل تبويب على حدة. الفرع ليس منها: الفرع هو التبويب. */
type Filters = { animal_type: string; status: string; sex: string; is_on_farm: string };

const BLANK: { search: string; filters: Filters } = {
  search: "",
  filters: { animal_type: "", status: "", sex: "", is_on_farm: "true" },
};

const ALL_TAB = "all";

export default function AnimalsPage() {
  const { can, me } = useApp();
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [rows, setRows] = useState<Animal[]>([]);
  const [count, setCount] = useState(0);

  // كل تبويب يحفظ بحثه وفلاتره لوحده: تضبط التربية على «الإناث في المزرعة»،
  // تنتقل إلى التسمين وتضبطه على «الذكور»، ثم تعود فتجد كلًّا منهما كما تركته.
  const [tab, setTab] = useState<string>(ALL_TAB);
  const [tabs, setTabs] = useState<Record<string, { search: string; filters: Filters }>>({});
  const view = tabs[tab] ?? BLANK;
  const { search, filters } = view;
  const patch = (next: Partial<{ search: string; filters: Filters }>) =>
    setTabs((prev) => ({ ...prev, [tab]: { ...(prev[tab] ?? BLANK), ...next } }));

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

  const branches = byType["branch"] ?? [];
  const branchId = tab === ALL_TAB ? "" : tab;
  const branchKeys = branches.map((branch) => branch.id).join(",");

  // عدد رؤوس كل فرع مكتوب على تبويبه. طلب واحد صغير لكل فرع (صفحة برأس واحد،
  // المطلوب منها العدد فقط)، ويُحفظ كغيره فلا يُعاد إلا بعد تغيّر فعلي.
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    branches.forEach((branch) => {
      getCached<Page<Animal>>(
        `/animals/?page_size=1&is_on_farm=true&branch=${branch.id}`,
        (data) => setCounts((prev) => ({ ...prev, [branch.id]: data.count }))
      ).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchKeys]);

  // «مشترك» فرع للتكاليف المشتركة لا قطيع له، فلا يأخذ تبويبًا إلا إن وُجد فيه
  // رأس فعلًا — وعندها لا بد أن يكون له مكان يُفتح منه.
  const tabBranches = branches.filter(
    (branch) => branch.code !== "shared" || (counts[branch.id] ?? 0) > 0
  );

  const query = useMemo(() => {
    const params = new URLSearchParams({ page_size: "50" });
    if (search) params.set("search", search);
    if (branchId) params.set("branch", branchId);
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    return `/animals/?${params}`;
  }, [search, branchId, filters]);

  async function loadCatalog() {
    await getCached<Page<Catalog>>("/catalog/?page_size=200", (data) =>
      setCatalog(data.results)
    );
  }

  async function loadAnimals() {
    // الهيكل العظمي لا يظهر إلا حين لا يوجد ما يُعرض؛ إن كانت هناك نسخة
    // محفوظة فهي تُرسم فورًا ثم تُستبدل بالطازجة بلا وميض.
    setLoading(!hasCache(query));
    try {
      await getCached<Page<Animal>>(query, (data) => {
        setRows(data.results);
        setCount(data.count);
        setLoading(false);
      });
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
  }, [query]);

  const tabLabel =
    tab === ALL_TAB ? "كل الفروع" : branches.find((item) => item.id === tab)?.display_name ?? "—";

  const filtered =
    search !== "" || Object.values(filters).some((value) => value && value !== "true");

  return (
    <>
      <PageHeader
        title="الحيوانات"
        subtitle={`${formatNumber(count)} حيوان في ${tabLabel} · المباع والنافق يبقيان في السجل والنسب`}
        farm={me?.farm?.name}
      >
        {can("animals.export") && (
          <ExportButton
            onClick={() =>
              download(
                `/export/animals/?branch=${branchId}&is_on_farm=${filters.is_on_farm}`
              ).catch((err) => setError(err.message))
            }
          />
        )}
        {can("animals.create") && (
          <Button
            icon={showForm ? "close" : "plus"}
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm((open) => !open)}
          >
            {showForm ? "إغلاق النموذج" : "إضافة حيوان"}
          </Button>
        )}
      </PageHeader>

      {/* الفروع تبويبات لا فلترًا: فرع التربية وفرع التسمين قطيعان يُداران على
          حدة، والانتقال بينهما حركة يومية تستحق نقرة واحدة في أعلى الشاشة. */}
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { key: ALL_TAB, label: "الكل", icon: "sheep" as const },
          ...tabBranches.map((branch) => ({
            key: branch.id,
            label:
              counts[branch.id] === undefined
                ? branch.display_name
                : `${branch.display_name} · ${formatNumber(counts[branch.id])}`,
          })),
        ]}
      />

      <ErrorNote message={error} />

      {showForm && (
        <AnimalForm
          byType={byType}
          branch={branchId}
          onDone={() => {
            setShowForm(false);
            loadAnimals();
          }}
        />
      )}

      <Toolbar>
        <SearchField
          value={search}
          onChange={(value) => patch({ search: value })}
          placeholder="رقم الحيوان، الاسم، رقم الشريحة…"
        />
        <SelectField
          label="النوع"
          value={filters.animal_type}
          onChange={(value) => patch({ filters: { ...filters, animal_type: value } })}
        >
          <option value="">الكل</option>
          {(byType["animal_type"] ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.display_name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="الحالة"
          value={filters.status}
          onChange={(value) => patch({ filters: { ...filters, status: value } })}
        >
          <option value="">الكل</option>
          {(byType["animal_status"] ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.display_name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="الجنس"
          value={filters.sex}
          onChange={(value) => patch({ filters: { ...filters, sex: value } })}
        >
          <option value="">الكل</option>
          <option value="female">أنثى</option>
          <option value="male">ذكر</option>
        </SelectField>
        <SelectField
          label="الوجود"
          value={filters.is_on_farm}
          onChange={(value) => patch({ filters: { ...filters, is_on_farm: value } })}
        >
          <option value="true">في المزرعة</option>
          <option value="false">خارج المزرعة</option>
          <option value="">الكل</option>
        </SelectField>
      </Toolbar>

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
            <TableMessage
              colSpan={10}
              loading={loading}
              empty={rows.length === 0}
              emptyTitle={filtered ? "لا نتائج مطابقة" : "لا حيوانات بعد"}
              emptyText={
                filtered
                  ? "جرّب توسيع الفلاتر أو امسح كلمة البحث."
                  : "أضف أول حيوان، أو سجّل عملية شراء لتدخل الحيوانات مع قيدها المالي."
              }
            />
            {!loading &&
              rows.map((animal) => (
                <tr key={animal.id}>
                  <td>
                    <Link href={`/animals/${animal.id}`} className="link num">
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
                  <td className="num">{formatDate(animal.birth_date)}</td>
                  <td>
                    <span className={`badge ${STATUS_TONE[animal.status_code] ?? ""}`}>
                      {animal.status_name}
                    </span>
                  </td>
                  <td>{animal.location_name || "—"}</td>
                  <td className="num">
                    {animal.current_weight ? `${Number(animal.current_weight)} كغ` : "—"}
                  </td>
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
  branch,
  onDone,
}: {
  byType: Record<string, Catalog[]>;
  /** الفرع المفتوح تبويبه — الحيوان الجديد ينضم إليه ما لم يُغيَّر يدويًا. */
  branch: string;
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
      branch:
        prev.branch || branch || branches.find((b) => b.code === "breeding")?.id || "",
      animal_type: prev.animal_type || types[0]?.id || "",
      status: prev.status || statuses.find((s) => s.code === "active")?.id || statuses[0]?.id || "",
    }));
  }, [byType, branch]);

  // كل فرع يعدّ من واحد، فالاقتراح يحتاج أن يعرف الفرع الذي ينضم إليه
  // الحيوان. تغيير الفرع يستبدل الرقم المقترح، ولا يمسّ رقمًا كتبه المستخدم.
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
    <form className="card mb-4" onSubmit={submit}>
      <div className="card-title">
        <span className="inline">
          <Icon name="plus" size={17} className="muted" />
          حيوان جديد
        </span>
      </div>
      <ErrorNote message={error} />
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
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>النوع</label>
          <select
            value={form.animal_type}
            onChange={(e) => setForm({ ...form, animal_type: e.target.value })}
            required
          >
            {(byType["animal_type"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>السلالة</label>
          <select value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })}>
            <option value="">—</option>
            {(byType["breed"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
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
          <input
            type="date"
            value={form.birth_date}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
          />
        </div>
        <div className="field">
          <label>الحالة</label>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            required
          >
            {(byType["animal_status"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الموقع</label>
          <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
            <option value="">—</option>
            {(byType["location"] ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <Button icon="check" busy={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ الحيوان"}
        </Button>
      </div>
    </form>
  );
}
