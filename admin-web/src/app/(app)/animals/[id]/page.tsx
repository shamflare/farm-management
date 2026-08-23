"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, formatDate, formatNumber, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Attachments from "@/components/Attachments";
import Icon, { IconName } from "@/components/Icon";
import {
  Button,
  EmptyState,
  ErrorNote,
  Loading,
  PageHeader,
  Stat,
  SuccessNote,
  TableCard,
  TableMessage,
  Tabs,
} from "@/components/ui";

type Animal = {
  id: string;
  tag: string;
  name: string;
  type_name: string;
  breed: string | null;
  breed_name: string;
  branch: string | null;
  branch_name: string;
  status: string;
  status_name: string;
  location: string | null;
  mother: string | null;
  mother_tag: string;
  father: string | null;
  father_tag: string;
  sex: string;
  birth_date: string | null;
  entered_at: string | null;
  exited_at: string | null;
  purchase_price: string | null;
  current_weight: string | null;
  acquisition: string;
  color: string;
  ear_tag: string;
  chip_number: string;
  notes: string;
  is_alive: boolean;
  is_on_farm: boolean;
  photo_url: string;
  custom_fields: Record<string, unknown>;
};

type Event = {
  id: string;
  event_type: string;
  happened_on: string;
  title: string;
  detail: string;
  amount: string | null;
};

type Cost = {
  purchase_price: string | null;
  total_cost: string;
  total_revenue: string;
  net: string;
};

type Tree = {
  animal: any;
  children: { id: string; tag: string; name: string; sex: string; status: string; birth_date: string }[];
};

type Catalog = { id: string; code: string; display_name: string; type: string };
type Health = {
  id: string;
  kind: string;
  item_name: string;
  happened_on: string;
  next_due_on: string | null;
  dose: string;
  veterinarian: string;
  cost: string | null;
  notes: string;
};
type Weight = { id: string; measured_on: string; weight_kg: string; note: string };
type Account = { id: string; display_name: string; is_cash: boolean };
type Party = { id: string; name: string; kind: string };
type Page<T> = { count: number; results: T[] };

const SEX_LABEL: Record<string, string> = { female: "أنثى", male: "ذكر", unknown: "غير محدد" };
const HEALTH_LABEL: Record<string, string> = {
  vaccine: "لقاح",
  treatment: "علاج",
  diagnosis: "تشخيص",
  checkup: "فحص",
};
const EVENT_ICON: Record<string, IconName> = {
  created: "file",
  purchased: "cart",
  birth: "heart",
  born: "heart",
  weight: "scale",
  health: "pulse",
  vaccine: "pulse",
  status: "refresh",
  branch: "swap",
  sold: "banknote",
  died: "warning",
  moved: "tag",
};

/** لون دائرة الحدث يقول نوعه قبل قراءة عنوانه. */
const EVENT_TONE: Record<string, string> = {
  purchased: "tone-info",
  birth: "tone-accent",
  born: "tone-accent",
  health: "tone-info",
  vaccine: "tone-info",
  sold: "tone-success",
  died: "tone-danger",
};

const today = () => new Date().toISOString().slice(0, 10);

export default function AnimalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can, currency, me } = useApp();
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [cost, setCost] = useState<Cost | null>(null);
  const [tree, setTree] = useState<Tree | null>(null);
  const [productivity, setProductivity] = useState<any>(null);
  const [health, setHealth] = useState<Health[]>([]);
  const [weights, setWeights] = useState<Weight[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [openForm, setOpenForm] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const byType = useMemo(() => {
    const grouped: Record<string, Catalog[]> = {};
    catalog.forEach((item) => {
      (grouped[item.type] ??= []).push(item);
    });
    return grouped;
  }, [catalog]);

  async function load() {
    const id = params.id;
    const [a, t, c, f, p, h, w] = await Promise.all([
      api.get<Animal>(`/animals/${id}/`),
      api.get<{ data: { events: Event[] } }>(`/animals/${id}/timeline/`),
      api.get<{ data: Cost }>(`/animals/${id}/cost/`),
      api.get<{ data: Tree }>(`/animals/${id}/family-tree/`),
      api.get<{ data: any }>(`/animals/${id}/productivity/`),
      api.get<Page<Health>>(`/health/?animal=${id}&page_size=50`),
      api.get<Page<Weight>>(`/weights/?animal=${id}&page_size=50`),
    ]);
    setAnimal(a);
    setEvents(t.data.events);
    setCost(c.data);
    setTree(f.data);
    setProductivity(p.data);
    setHealth(h.results);
    setWeights(w.results);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    api
      .get<Page<Catalog>>("/catalog/?page_size=300")
      .then((res) => setCatalog(res.results))
      .catch(() => {});
    api
      .get<{ data: Account[] }>("/accounts/pickable/")
      .then((res) => setAccounts(res.data.filter((a) => a.is_cash)))
      .catch(() => {});
    api
      .get<Page<Party>>("/parties/?page_size=200")
      .then((res) => setParties(res.results))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  function done(message: string) {
    setOpenForm("");
    setNotice(message);
    load().catch((err) => setError(err.message));
  }

  if (error) return <ErrorNote message={error} />;
  if (!animal) return <Loading />;

  const allActions: {
    key: string;
    label: string;
    icon: IconName;
    permission: string;
    when: boolean;
  }[] = [
    { key: "edit", label: "تعديل البيانات", icon: "edit", permission: "animals.edit", when: true },
    {
      key: "health",
      label: "لقاح أو علاج",
      icon: "pulse",
      permission: "health.create",
      when: animal.is_on_farm,
    },
    {
      key: "weight",
      label: "تسجيل وزن",
      icon: "scale",
      permission: "animals.edit",
      when: animal.is_on_farm,
    },
    {
      key: "birth",
      label: "تسجيل ولادة",
      icon: "heart",
      permission: "births.create",
      when: animal.sex === "female" && animal.is_on_farm,
    },
    {
      key: "branch",
      label: "نقل بين الفروع",
      icon: "swap",
      permission: "animals.edit",
      when: animal.is_on_farm,
    },
    {
      key: "death",
      label: "تسجيل نفوق",
      icon: "warning",
      permission: "finance.create",
      when: animal.is_alive,
    },
  ];

  const actions = allActions.filter((action) => action.when && can(action.permission));

  return (
    <>
      <Link href="/animals" className="btn btn-ghost btn-sm mb-4 no-print">
        <Icon name="chevronEnd" size={15} />
        عودة لقائمة الحيوانات
      </Link>

      <div className="page-head">
        <div className="inline" style={{ alignItems: "flex-start", gap: "var(--s4)" }}>
          {animal.photo_url ? (
            <img
              src={animal.photo_url}
              alt={animal.tag}
              style={{
                width: 78,
                height: 78,
                objectFit: "cover",
                borderRadius: "var(--radius)",
                border: "1px solid var(--color-border)",
              }}
            />
          ) : (
            <div
              className="stat-icon"
              style={{ width: 78, height: 78, borderRadius: "var(--radius)" }}
            >
              <Icon name="sheep" size={34} />
            </div>
          )}
          <div>
            <h1 className="page-title num" data-farm={me?.farm?.name}>
              {animal.tag} {animal.name && `· ${animal.name}`}
            </h1>
            <p className="page-sub">
              {animal.type_name} · {animal.breed_name || "بدون سلالة"} · {SEX_LABEL[animal.sex]}
              {animal.branch_name && ` · فرع ${animal.branch_name}`}
            </p>
          </div>
        </div>
        <span className={`badge ${animal.is_on_farm ? "badge-success" : "badge-muted"}`}>
          {animal.status_name}
        </span>
      </div>

      <SuccessNote message={notice} />

      {actions.length > 0 && (
        <Tabs
          value={openForm}
          onChange={(key) => setOpenForm(openForm === key ? "" : key)}
          options={actions}
        />
      )}

      {openForm === "edit" && (
        <EditForm animal={animal} byType={byType} onDone={() => done("تم حفظ التعديل")} />
      )}
      {openForm === "health" && (
        <HealthForm
          animal={animal}
          byType={byType}
          accounts={accounts}
          parties={parties}
          onDone={() => done("تم تسجيل السجل الصحي")}
        />
      )}
      {openForm === "weight" && (
        <WeightForm animal={animal} onDone={() => done("تم تسجيل الوزن")} />
      )}
      {openForm === "birth" && (
        <BirthForm animal={animal} byType={byType} onDone={() => done("تم تسجيل الولادة والمواليد")} />
      )}
      {openForm === "branch" && (
        <BranchForm animal={animal} byType={byType} onDone={() => done("تم نقل الحيوان")} />
      )}
      {openForm === "death" && (
        <DeathForm
          animal={animal}
          byType={byType}
          onDone={() => done("تم تسجيل النفوق، والسجل محفوظ")}
        />
      )}

      <div className="grid grid-4 mb-5">
        <Stat
          label="تاريخ الميلاد"
          value={formatDate(animal.birth_date)}
          hint={
            animal.current_weight
              ? `آخر وزن ${formatNumber(animal.current_weight, 1)} كغ`
              : "لم يُسجَّل وزن بعد"
          }
          icon="calendar"
        />
        <Stat
          label="إجمالي التكلفة"
          value={money(cost?.total_cost, currency)}
          hint="سعر الشراء + كل مصروف مرتبط به"
          icon="coins"
          tone="warning"
        />
        <Stat
          label="الإيراد المتحقق"
          value={money(cost?.total_revenue, currency)}
          hint="ما دخل المزرعة من هذا الحيوان"
          icon="banknote"
          tone="success"
        />
        <Stat
          label="الصافي"
          value={money(cost?.net, currency)}
          valueTone={Number(cost?.net ?? 0) >= 0 ? "positive" : "negative"}
          icon={Number(cost?.net ?? 0) >= 0 ? "trendUp" : "trendDown"}
          tone={Number(cost?.net ?? 0) >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">
            <span className="inline">
              <Icon name="history" size={17} className="muted" />
              السجل الزمني
            </span>
            <span className="badge badge-muted">{events.length}</span>
          </div>

          {events.length === 0 ? (
            <EmptyState
              icon="history"
              title="لا توجد أحداث بعد"
              text="كل ما يجري على هذا الحيوان — شراء، لقاح، وزن، ولادة، نقل، بيع — يُضاف هنا بترتيبه الزمني."
            />
          ) : (
            <div className="stack-sm">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="inline"
                  style={{
                    alignItems: "flex-start",
                    gap: "var(--s3)",
                    padding: "var(--s3) 0",
                    borderBottom: "1px solid var(--border-subtle)",
                    flexWrap: "nowrap",
                  }}
                >
                  <div
                    className={`stat-icon ${EVENT_TONE[event.event_type] ?? ""}`}
                    style={{ width: 30, height: 30 }}
                  >
                    <Icon name={EVENT_ICON[event.event_type] ?? "tag"} size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="strong">{event.title}</div>
                    {event.detail && <div className="stat-hint">{event.detail}</div>}
                  </div>
                  <div className="stat-hint nowrap text-end">
                    <div className="num">{formatDate(event.happened_on)}</div>
                    {event.amount && (
                      <div className="num strong" style={{ color: "var(--color-text)" }}>
                        {money(event.amount, currency)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack-lg" style={{ alignContent: "start" }}>
          <TableCard
            title={
              <span className="inline">
                <Icon name="pulse" size={17} className="muted" />
                اللقاحات والعلاجات
              </span>
            }
            action={<span className="badge badge-muted">{health.length}</span>}
          >
            <table>
              <thead>
                <tr><th>النوع</th><th>البند</th><th>التاريخ</th><th>الجرعة القادمة</th></tr>
              </thead>
              <tbody>
                <TableMessage
                  colSpan={4}
                  empty={health.length === 0}
                  emptyTitle="لا توجد سجلات صحية"
                  emptyText="سجّل لقاحًا أو علاجًا من الأزرار أعلاه؛ الجرعة القادمة تصير تنبيهًا في وقتها."
                />
                {health.map((row) => {
                  const overdue = row.next_due_on && row.next_due_on < today();
                  return (
                    <tr key={row.id}>
                      <td>{HEALTH_LABEL[row.kind] ?? row.kind}</td>
                      <td>{row.item_name || row.notes || "—"}</td>
                      <td className="muted num">{formatDate(row.happened_on)}</td>
                      <td>
                        {row.next_due_on ? (
                          <span className={`badge ${overdue ? "badge-danger" : "badge-warning"}`}>
                            {formatDate(row.next_due_on)}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableCard>

          <TableCard
            title={
              <span className="inline">
                <Icon name="scale" size={17} className="muted" />
                الأوزان
              </span>
            }
            action={<span className="badge badge-muted">{weights.length}</span>}
          >
            <table>
              <tbody>
                <TableMessage
                  colSpan={3}
                  empty={weights.length === 0}
                  emptyTitle="لا توجد أوزان مسجلة"
                  emptyText="الوزن الأخير يظهر في بطاقة الحيوان وفي جدول القطيع."
                />
                {weights.map((row) => (
                  <tr key={row.id}>
                    <td className="muted num">{formatDate(row.measured_on)}</td>
                    <td className="num strong">{formatNumber(row.weight_kg, 1)} كغ</td>
                    <td className="muted">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          <div className="card">
            <div className="card-title">
              <span className="inline">
                <Icon name="users" size={17} className="muted" />
                النسب
              </span>
            </div>
            <div className="row mb-5">
              <div>
                <div className="stat-label">الأم</div>
                <div className="strong">
                  {animal.mother ? (
                    <Link href={`/animals/${animal.mother}`} className="link num">
                      {animal.mother_tag}
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="stat-label">الأب</div>
                <div className="strong">
                  {animal.father ? (
                    <Link href={`/animals/${animal.father}`} className="link num">
                      {animal.father_tag}
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </div>
            </div>
            <div className="stat-label">الأبناء ({tree?.children.length ?? 0})</div>
            <div className="inline mt-4">
              {(tree?.children ?? []).map((child) => (
                <Link key={child.id} href={`/animals/${child.id}`} className="badge">
                  {child.tag} · {child.status}
                </Link>
              ))}
              {(tree?.children.length ?? 0) === 0 && <span className="muted">لا يوجد</span>}
            </div>
          </div>

          {animal.sex === "female" && productivity && (
            <div className="card">
              <div className="card-title">
                <span className="inline">
                  <Icon name="heart" size={17} className="muted" />
                  الإنتاجية
                </span>
              </div>
              <div className="grid grid-4" style={{ gap: "var(--s3)" }}>
                {[
                  { label: "الولادات", value: productivity.births },
                  { label: "المواليد", value: productivity.total_offspring },
                  { label: "أحياء", value: productivity.alive },
                  { label: "أموات عند الولادة", value: productivity.stillborn },
                ].map((cell) => (
                  <div key={cell.label}>
                    <div className="stat-label">{cell.label}</div>
                    <div className="stat-value num" style={{ fontSize: "1.2rem" }}>
                      {formatNumber(cell.value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(animal.custom_fields ?? {}).length > 0 && (
            <TableCard
              title={
                <span className="inline">
                  <Icon name="blocks" size={17} className="muted" />
                  حقول مخصصة
                </span>
              }
            >
              <table>
                <tbody>
                  {Object.entries(animal.custom_fields).map(([key, value]) => (
                    <tr key={key}>
                      <td className="muted">{key}</td>
                      <td className="strong">{String(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}

          {can("attachments.view") && (
            <Attachments
              subjectType="animal"
              subjectId={animal.id}
              title="الصور والمستندات"
              onChange={() => load().catch(() => {})}
            />
          )}
        </div>
      </div>
    </>
  );
}

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function FormCard({
  title,
  hint,
  error,
  busy,
  label,
  onSubmit,
  children,
}: {
  title: string;
  hint?: string;
  error: string;
  busy: boolean;
  label: string;
  onSubmit: (event: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <form className="card mb-4" onSubmit={onSubmit}>
      <div className="card-title">{title}</div>
      {hint && <p className="page-sub mb-4">{hint}</p>}
      <ErrorNote message={error} />
      <div className="row">{children}</div>
      <div className="form-actions">
        <Button icon="check" busy={busy}>
          {busy ? "جارٍ الحفظ…" : label}
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  animal,
  byType,
  onDone,
}: {
  animal: Animal;
  byType: Record<string, Catalog[]>;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    name: animal.name,
    breed: animal.breed ?? "",
    location: animal.location ?? "",
    birth_date: animal.birth_date ?? "",
    color: animal.color,
    ear_tag: animal.ear_tag,
    chip_number: animal.chip_number,
    notes: animal.notes,
  });
  const { busy, error, run } = useSubmit(onDone);

  return (
    <FormCard
      title="تعديل بيانات الحيوان"
      hint="الرقم والفرع والحالة تُغيَّر من أزرارها الخاصة، فلكل منها أثر مسجَّل."
      error={error}
      busy={busy}
      label="حفظ التعديل"
      onSubmit={(event) => {
        event.preventDefault();
        run(() =>
          api.patch(`/animals/${animal.id}/`, {
            ...form,
            breed: form.breed || null,
            location: form.location || null,
            birth_date: form.birth_date || null,
          })
        );
      }}
    >
      <div className="field">
        <label>الاسم</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
        <label>الموقع</label>
        <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
          <option value="">—</option>
          {(byType["location"] ?? []).map((item) => (
            <option key={item.id} value={item.id}>{item.display_name}</option>
          ))}
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
        <label>اللون</label>
        <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
      </div>
      <div className="field">
        <label>رقم الأذن</label>
        <input value={form.ear_tag} onChange={(e) => setForm({ ...form, ear_tag: e.target.value })} />
      </div>
      <div className="field">
        <label>رقم الشريحة</label>
        <input
          value={form.chip_number}
          onChange={(e) => setForm({ ...form, chip_number: e.target.value })}
        />
      </div>
      <div className="field" style={{ flex: "3 1 320px" }}>
        <label>ملاحظات</label>
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
    </FormCard>
  );
}

function HealthForm({
  animal,
  byType,
  accounts,
  parties,
  onDone,
}: {
  animal: Animal;
  byType: Record<string, Catalog[]>;
  accounts: Account[];
  parties: Party[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    kind: "vaccine",
    happened_on: today(),
    item: "",
    next_due_on: "",
    dose: "",
    veterinarian: "",
    cost: "",
    payer: "",
    notes: "",
  });
  const { busy, error, run } = useSubmit(onDone);
  const items = form.kind === "vaccine" ? byType["vaccine"] ?? [] : byType["disease"] ?? [];

  return (
    <FormCard
      title="تسجيل لقاح أو علاج"
      hint="لو أدخلت تكلفة فستُقيَّد مصروفًا على هذا الحيوان وعلى فرعه."
      error={error}
      busy={busy}
      label="حفظ السجل"
      onSubmit={(event) => {
        event.preventDefault();
        const [mode, id] = form.payer.split(":");
        run(() =>
          api.post(`/animals/${animal.id}/health/`, {
            kind: form.kind,
            happened_on: form.happened_on,
            item: form.item || null,
            next_due_on: form.next_due_on || null,
            dose: form.dose,
            veterinarian: form.veterinarian,
            cost: form.cost || null,
            from_account: mode === "account" ? id : null,
            paid_by_party: mode === "party" ? id : null,
            notes: form.notes,
          })
        );
      }}
    >
      <div className="field">
        <label>النوع</label>
        <select
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value, item: "" })}
        >
          <option value="vaccine">لقاح</option>
          <option value="treatment">علاج</option>
          <option value="diagnosis">تشخيص</option>
          <option value="checkup">فحص</option>
        </select>
      </div>
      <div className="field">
        <label>{form.kind === "vaccine" ? "اللقاح" : "المرض"}</label>
        <select value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })}>
          <option value="">—</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>{item.display_name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>التاريخ</label>
        <input
          type="date"
          value={form.happened_on}
          onChange={(e) => setForm({ ...form, happened_on: e.target.value })}
          required
        />
      </div>
      <div className="field">
        <label>الجرعة القادمة</label>
        <input
          type="date"
          value={form.next_due_on}
          onChange={(e) => setForm({ ...form, next_due_on: e.target.value })}
        />
      </div>
      <div className="field">
        <label>الجرعة</label>
        <input value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} />
      </div>
      <div className="field">
        <label>الطبيب</label>
        <input
          value={form.veterinarian}
          onChange={(e) => setForm({ ...form, veterinarian: e.target.value })}
        />
      </div>
      <div className="field">
        <label>التكلفة</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={form.cost}
          onChange={(e) => setForm({ ...form, cost: e.target.value })}
        />
      </div>
      <div className="field">
        <label>من دفع؟</label>
        <select
          value={form.payer}
          onChange={(e) => setForm({ ...form, payer: e.target.value })}
          required={!!form.cost}
        >
          <option value="">—</option>
          {accounts.map((account) => (
            <option key={account.id} value={`account:${account.id}`}>من {account.display_name}</option>
          ))}
          {parties
            .filter((party) => party.kind === "worker" || party.kind === "partner")
            .map((party) => (
              <option key={party.id} value={`party:${party.id}`}>{party.name} من ماله الخاص</option>
            ))}
        </select>
      </div>
      <div className="field row-wide">
        <label>ملاحظات</label>
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
    </FormCard>
  );
}

function WeightForm({ animal, onDone }: { animal: Animal; onDone: () => void }) {
  const [form, setForm] = useState({ measured_on: today(), weight_kg: "", note: "" });
  const { busy, error, run } = useSubmit(onDone);

  return (
    <FormCard
      title="تسجيل وزن"
      hint="تسجيل وزن آخر بنفس التاريخ يصحّح الرقم ولا يضيف سطرًا ثانيًا."
      error={error}
      busy={busy}
      label="حفظ الوزن"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => api.post(`/animals/${animal.id}/weight/`, form));
      }}
    >
      <div className="field">
        <label>التاريخ</label>
        <input
          type="date"
          value={form.measured_on}
          onChange={(e) => setForm({ ...form, measured_on: e.target.value })}
          required
        />
      </div>
      <div className="field">
        <label>الوزن (كغ)</label>
        <input
          type="number"
          step="0.001"
          min="0"
          value={form.weight_kg}
          onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
          required
        />
      </div>
      <div className="field row-wide">
        <label>ملاحظة</label>
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </div>
    </FormCard>
  );
}

function BirthForm({
  animal,
  byType,
  onDone,
}: {
  animal: Animal;
  byType: Record<string, Catalog[]>;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ happened_on: today(), father: "", stillborn: "0", notes: "" });
  const [offspring, setOffspring] = useState([{ sex: "female", tag: "", name: "" }]);
  const [males, setMales] = useState<{ id: string; tag: string; name: string }[]>([]);
  const { busy, error, run } = useSubmit(onDone);

  useEffect(() => {
    api
      .get<Page<{ id: string; tag: string; name: string }>>("/animals/?sex=male&is_on_farm=true&page_size=100")
      .then((res) => setMales(res.results))
      .catch(() => {});
  }, []);

  return (
    <FormCard
      title={`تسجيل ولادة للنعجة ${animal.tag}`}
      hint="المواليد تُسجَّل كحيوانات جديدة، وترث فرع أمها وسلالتها، ويأخذ كل مولود رقمه التالي في الفرع."
      error={error}
      busy={busy}
      label="حفظ الولادة"
      onSubmit={(event) => {
        event.preventDefault();
        run(() =>
          api.post("/births/", {
            mother: animal.id,
            father: form.father || null,
            happened_on: form.happened_on,
            stillborn: Number(form.stillborn || 0),
            notes: form.notes,
            offspring: offspring.map((row) => ({
              sex: row.sex,
              tag: row.tag || undefined,
              name: row.name,
            })),
          })
        );
      }}
    >
      <div className="field">
        <label>تاريخ الولادة</label>
        <input
          type="date"
          value={form.happened_on}
          onChange={(e) => setForm({ ...form, happened_on: e.target.value })}
          required
        />
      </div>
      <div className="field">
        <label>الأب</label>
        <select value={form.father} onChange={(e) => setForm({ ...form, father: e.target.value })}>
          <option value="">غير معروف</option>
          {males.map((male) => (
            <option key={male.id} value={male.id}>{male.tag} {male.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>عدد الأموات عند الولادة</label>
        <input
          type="number"
          min="0"
          value={form.stillborn}
          onChange={(e) => setForm({ ...form, stillborn: e.target.value })}
        />
      </div>
      <div className="field row-wide">
        <label>ملاحظات</label>
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>

      <div style={{ flex: "1 1 100%" }}>
        <div className="stat-label" style={{ marginBottom: 8 }}>
          المواليد الأحياء ({offspring.length})
        </div>
        {offspring.map((row, index) => (
          <div className="row" key={index} style={{ marginBottom: 8 }}>
            <div className="field">
              <label>الجنس</label>
              <select
                value={row.sex}
                onChange={(e) => {
                  const next = [...offspring];
                  next[index] = { ...row, sex: e.target.value };
                  setOffspring(next);
                }}
              >
                <option value="female">أنثى</option>
                <option value="male">ذكر</option>
              </select>
            </div>
            <div className="field">
              <label>الرقم (اتركه فارغًا ليُرقَّم تلقائيًا)</label>
              <input
                value={row.tag}
                onChange={(e) => {
                  const next = [...offspring];
                  next[index] = { ...row, tag: e.target.value };
                  setOffspring(next);
                }}
              />
            </div>
            <div className="field">
              <label>الاسم</label>
              <input
                value={row.name}
                onChange={(e) => {
                  const next = [...offspring];
                  next[index] = { ...row, name: e.target.value };
                  setOffspring(next);
                }}
              />
            </div>
            <div style={{ alignSelf: "end" }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setOffspring(offspring.filter((_, i) => i !== index))}
                disabled={offspring.length === 1}
              >
                حذف
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOffspring([...offspring, { sex: "female", tag: "", name: "" }])}
        >
          + مولود آخر
        </button>
      </div>
    </FormCard>
  );
}

function BranchForm({
  animal,
  byType,
  onDone,
}: {
  animal: Animal;
  byType: Record<string, Catalog[]>;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ branch: "", date: today(), note: "" });
  const { busy, error, run } = useSubmit(onDone);

  return (
    <FormCard
      title="نقل الحيوان بين الفروع"
      hint="الرقم لا يتغيّر بالنقل، والنقل نفسه يُسجَّل في السجل الزمني."
      error={error}
      busy={busy}
      label="تنفيذ النقل"
      onSubmit={(event) => {
        event.preventDefault();
        run(() =>
          api.post(`/animals/${animal.id}/branch/`, {
            branch: form.branch || null,
            date: form.date,
            note: form.note,
          })
        );
      }}
    >
      <div className="field">
        <label>الفرع الحالي</label>
        <input value={animal.branch_name || "غير محدد"} readOnly />
      </div>
      <div className="field">
        <label>إلى فرع</label>
        <select
          value={form.branch}
          onChange={(e) => setForm({ ...form, branch: e.target.value })}
          required
        >
          <option value="">اختر…</option>
          {(byType["branch"] ?? [])
            .filter((item) => item.id !== animal.branch)
            .map((item) => (
              <option key={item.id} value={item.id}>{item.display_name}</option>
            ))}
        </select>
      </div>
      <div className="field">
        <label>التاريخ</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
      </div>
      <div className="field row-wide">
        <label>السبب</label>
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </div>
    </FormCard>
  );
}

function DeathForm({
  animal,
  byType,
  onDone,
}: {
  animal: Animal;
  byType: Record<string, Catalog[]>;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ date: today(), reason: "", notes: "" });
  const { busy, error, run } = useSubmit(onDone);

  return (
    <FormCard
      title="تسجيل نفوق"
      hint="السجل يبقى في النظام وفي شجرة النسب. قيمة الحيوان الدفترية تخرج من حساب الحيوانات كخسارة على فرعه."
      error={error}
      busy={busy}
      label="تسجيل النفوق"
      onSubmit={(event) => {
        event.preventDefault();
        run(() =>
          api.post("/ops/death/", {
            animal: animal.id,
            date: form.date,
            reason: form.reason || null,
            notes: form.notes,
          })
        );
      }}
    >
      <div className="field">
        <label>التاريخ</label>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          required
        />
      </div>
      <div className="field">
        <label>السبب</label>
        <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
          <option value="">—</option>
          {(byType["death_reason"] ?? []).map((item) => (
            <option key={item.id} value={item.id}>{item.display_name}</option>
          ))}
        </select>
      </div>
      <div className="field row-wide">
        <label>ملاحظات</label>
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
    </FormCard>
  );
}
