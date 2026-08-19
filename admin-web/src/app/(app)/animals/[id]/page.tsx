"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, formatDate, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";

type Animal = {
  id: string;
  tag: string;
  name: string;
  type_name: string;
  breed_name: string;
  status_name: string;
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
  notes: string;
  is_on_farm: boolean;
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

const SEX_LABEL: Record<string, string> = { female: "أنثى", male: "ذكر", unknown: "غير محدد" };
const EVENT_ICON: Record<string, string> = {
  created: "📝",
  purchased: "🛒",
  birth: "🐣",
  born: "🐣",
  weight: "⚖️",
  health: "💊",
  vaccine: "💉",
  status: "🔄",
  sold: "💵",
  died: "⚰️",
  moved: "📍",
};

export default function AnimalDetailPage() {
  const params = useParams<{ id: string }>();
  const { currency } = useApp();
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [cost, setCost] = useState<Cost | null>(null);
  const [tree, setTree] = useState<Tree | null>(null);
  const [productivity, setProductivity] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = params.id;
    Promise.all([
      api.get<Animal>(`/animals/${id}/`),
      api.get<{ data: { events: Event[] } }>(`/animals/${id}/timeline/`),
      api.get<{ data: Cost }>(`/animals/${id}/cost/`),
      api.get<{ data: Tree }>(`/animals/${id}/family-tree/`),
      api.get<{ data: any }>(`/animals/${id}/productivity/`),
    ])
      .then(([a, t, c, f, p]) => {
        setAnimal(a);
        setEvents(t.data.events);
        setCost(c.data);
        setTree(f.data);
        setProductivity(p.data);
      })
      .catch((err) => setError(err.message));
  }, [params.id]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!animal) return <div className="empty">جارٍ التحميل…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/animals" className="page-sub">← عودة للقائمة</Link>
          <h1 className="page-title" style={{ marginTop: 6 }}>
            {animal.tag} {animal.name && `· ${animal.name}`}
          </h1>
          <p className="page-sub">
            {animal.type_name} · {animal.breed_name || "بدون سلالة"} · {SEX_LABEL[animal.sex]}
          </p>
        </div>
        <span className={`badge ${animal.is_on_farm ? "" : "badge-muted"}`}>{animal.status_name}</span>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="stat-label">تاريخ الميلاد</div>
          <div className="stat-value" style={{ fontSize: "1.1rem" }}>{formatDate(animal.birth_date)}</div>
        </div>
        <div className="card">
          <div className="stat-label">إجمالي التكلفة</div>
          <div className="stat-value num" style={{ fontSize: "1.2rem" }}>{money(cost?.total_cost, currency)}</div>
          <div className="stat-hint">سعر الشراء + كل مصروف مرتبط به</div>
        </div>
        <div className="card">
          <div className="stat-label">الإيراد المتحقق</div>
          <div className="stat-value num" style={{ fontSize: "1.2rem" }}>{money(cost?.total_revenue, currency)}</div>
        </div>
        <div className="card">
          <div className="stat-label">الصافي</div>
          <div
            className={`stat-value num ${Number(cost?.net ?? 0) >= 0 ? "positive" : "negative"}`}
            style={{ fontSize: "1.2rem" }}
          >
            {money(cost?.net, currency)}
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">السجل الزمني</div>
          {events.length === 0 && <div className="empty">لا توجد أحداث</div>}
          <div style={{ display: "grid", gap: 2 }}>
            {events.map((event) => (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <span style={{ fontSize: "1.1rem" }}>{EVENT_ICON[event.event_type] ?? "•"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{event.title}</div>
                  {event.detail && <div className="stat-hint">{event.detail}</div>}
                </div>
                <div className="stat-hint" style={{ whiteSpace: "nowrap" }}>
                  {formatDate(event.happened_on)}
                  {event.amount && (
                    <div className="num" style={{ fontWeight: 600, color: "var(--color-text)" }}>
                      {money(event.amount, currency)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div className="card">
            <div className="card-title">النسب</div>
            <div className="row" style={{ marginBottom: 12 }}>
              <div>
                <div className="stat-label">الأم</div>
                <div style={{ fontWeight: 600 }}>
                  {animal.mother ? (
                    <Link href={`/animals/${animal.mother}`} style={{ color: "var(--color-primary)" }}>
                      {animal.mother_tag}
                    </Link>
                  ) : "—"}
                </div>
              </div>
              <div>
                <div className="stat-label">الأب</div>
                <div style={{ fontWeight: 600 }}>
                  {animal.father ? (
                    <Link href={`/animals/${animal.father}`} style={{ color: "var(--color-primary)" }}>
                      {animal.father_tag}
                    </Link>
                  ) : "—"}
                </div>
              </div>
            </div>
            <div className="stat-label">الأبناء ({tree?.children.length ?? 0})</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
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
              <div className="card-title">الإنتاجية</div>
              <div className="grid grid-4" style={{ gap: 12 }}>
                <div>
                  <div className="stat-label">الولادات</div>
                  <div className="stat-value num" style={{ fontSize: "1.2rem" }}>{productivity.births}</div>
                </div>
                <div>
                  <div className="stat-label">المواليد</div>
                  <div className="stat-value num" style={{ fontSize: "1.2rem" }}>{productivity.total_offspring}</div>
                </div>
                <div>
                  <div className="stat-label">أحياء</div>
                  <div className="stat-value num" style={{ fontSize: "1.2rem" }}>{productivity.alive}</div>
                </div>
                <div>
                  <div className="stat-label">أموات عند الولادة</div>
                  <div className="stat-value num" style={{ fontSize: "1.2rem" }}>{productivity.stillborn}</div>
                </div>
              </div>
            </div>
          )}

          {Object.keys(animal.custom_fields ?? {}).length > 0 && (
            <div className="card">
              <div className="card-title">حقول مخصصة</div>
              <table>
                <tbody>
                  {Object.entries(animal.custom_fields).map(([key, value]) => (
                    <tr key={key}>
                      <td className="muted">{key}</td>
                      <td>{String(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
