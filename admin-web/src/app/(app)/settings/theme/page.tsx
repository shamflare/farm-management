"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { applyTheme, DASHBOARD_WIDGETS } from "@/lib/theme";
import { fontStack, preloadFonts } from "@/lib/fonts";
import { useApp } from "@/components/AppShell";
import Icon from "@/components/Icon";
import {
  Button,
  ErrorNote,
  Loading,
  PageHeader,
  SuccessNote,
} from "@/components/ui";

type Draft = {
  id: string;
  status: string;
  version: number;
  brand_name: string;
  brand_tagline: string;
  colors: Record<string, string>;
  font_family: string;
  font_scale: string;
  corner_radius: number;
  density: string;
  dark_mode_enabled: boolean;
  dashboard_widgets: { key: string; visible: boolean }[];
  tokens: any;
};

type Problem = { field: string; message: string };
type Font = { family: string; label: string; note: string; kind: string };

/** طابع الخط، ليُقرأ من نظرة قبل قراءة الوصف. */
const KIND_LABEL: Record<string, string> = {
  sans: "حديث",
  kufi: "كوفي",
  display: "عناوين",
  naskh: "نسخ",
  system: "النظام",
};

/** جملة المعاينة: فيها حروف تتصل وتنفصل، وأرقام، لأن الجداول كلها أرقام. */
const SAMPLE = "مزرعة زاد · ١٢ نعجة · 1,250 ل.س";

const COLOR_LABELS: Record<string, string> = {
  primary: "اللون الأساسي",
  primary_contrast: "لون النص فوق الأساسي",
  accent: "اللون المميز",
  success: "النجاح",
  warning: "التحذير",
  danger: "الخطر",
  info: "المعلومات",
  background: "الخلفية",
  surface: "البطاقات",
  text: "النص",
  text_muted: "النص الثانوي",
  border: "الحدود",
  sidebar: "خلفية القائمة الجانبية",
  sidebar_text: "لون خط القائمة الجانبية",
  header: "خلفية الشريط العلوي",
  header_text: "لون خط الشريط العلوي",
};

/** إطار الشاشة يُلوَّن على حدة عن محتواها، فيُعرض في مجموعة تخصّه. */
const CHROME_COLORS = ["sidebar", "sidebar_text", "header", "header_text"];
const CONTENT_COLORS = Object.keys(COLOR_LABELS).filter((key) => !CHROME_COLORS.includes(key));

export default function ThemePage() {
  const { can, me, reloadTheme } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [differs, setDiffers] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.get<{
      draft: Draft;
      problems: Problem[];
      fonts: Font[];
      differs_from_published?: boolean;
    }>("/theme/draft/");
    setDraft(data.draft);
    setProblems(data.problems);
    setDiffers(!!data.differs_from_published);
    setFonts(data.fonts ?? []);
    // هذه الشاشة وحدها تعرض كل الخطوط جنبًا إلى جنب، فتحتاجها كلها محمّلة
    // لتكون المعاينة صادقة. بقية الشاشات تحمّل الخط المختار فقط.
    preloadFonts((data.fonts ?? []).map((font) => font.family));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  /** Live preview: paint the draft onto the running UI without publishing. */
  function preview(next: Draft) {
    applyTheme({
      ...next.tokens,
      colors: { ...next.tokens.colors, ...next.colors },
      typography: { font_family: next.font_family, scale: Number(next.font_scale) },
      shape: { radius: Number(next.corner_radius) },
      density: next.density as any,
      brand: { ...next.tokens.brand, name: next.brand_name },
    });
  }

  function update(patch: Partial<Draft>) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    preview(next);
  }

  function updateColor(key: string, value: string) {
    if (!draft) return;
    update({ colors: { ...draft.colors, [key]: value } });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        brand_name: draft.brand_name,
        brand_tagline: draft.brand_tagline,
        colors: draft.colors,
        font_family: draft.font_family,
        font_scale: draft.font_scale,
        corner_radius: draft.corner_radius,
        density: draft.density,
        dark_mode_enabled: draft.dark_mode_enabled,
        dashboard_widgets: draft.dashboard_widgets,
      };
      const res = await api.patch<{ draft: Draft; problems: Problem[]; fonts: Font[] }>(
        "/theme/draft/",
        body
      );
      setDraft(res.draft);
      setProblems(res.problems);
      setDiffers(!!(res as any).differs_from_published);
      if (res.fonts?.length) setFonts(res.fonts);
      setNotice(res.problems.length ? "حُفظت المسودة، لكن هناك ملاحظات قبل النشر" : "حُفظت المسودة");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError("");
    try {
      await save();
      const res = await api.post<{ ok: boolean; data: any }>("/theme/publish/");
      setNotice("تم النشر — سيظهر التصميم الجديد على الويب والموبايل فورًا دون إعادة بناء APK");
      await reloadTheme();
      await load();
    } catch (err: any) {
      if (err.body?.problems) {
        setProblems(err.body.problems);
        setError("لا يمكن النشر: بعض الألوان غير مقروءة");
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  /** يُلغي ما لم يُنشر ويعود إلى ما يراه المستخدمون الآن. */
  async function revertToPublished() {
    setBusy(true);
    setError("");
    try {
      await api.post("/theme/revert/");
      await load();
      await reloadTheme();
      setNotice("عادت الشاشة إلى الألوان المنشورة");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (
      !window.confirm(
        "إعادة كل شيء إلى ألوان النظام الافتراضية — وليس إلى ألوان مزرعتك المنشورة.\n\nللعودة إلى ألوانك المنشورة استعمل «استعادة المنشور».\n\nهل تريد المتابعة؟"
      )
    )
      return;
    await api.post("/theme/reset/");
    await load();
    setNotice("تمت الإعادة للإعدادات الافتراضية — لم يُنشر شيء بعد");
  }

  if (error && !draft) return <ErrorNote message={error} />;
  if (!draft) return <Loading />;

  const colors = { ...draft.tokens.colors, ...draft.colors };
  const readOnly = !can("theme.edit");

  return (
    <>
      <PageHeader
        title="الهوية البصرية"
        subtitle="الألوان والخط والشعار تُحفظ في الخادم — تغييرها لا يحتاج إصدار تطبيق جديد"
        farm={me?.farm?.name}
      >
        {!readOnly && (
          <>
            <Button variant="ghost" icon="history" onClick={revertToPublished} disabled={busy}>
              استعادة المنشور
            </Button>
            <Button variant="ghost" icon="refresh" onClick={reset} disabled={busy}>
              استعادة الافتراضي
            </Button>
            <Button variant="ghost" icon="file" onClick={save} disabled={busy}>
              حفظ كمسودة
            </Button>
            <Button icon="check" onClick={publish} disabled={busy}>
              نشر
            </Button>
          </>
        )}
      </PageHeader>

      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      {/* ما على الشاشة ليس ما يراه الناس: يُقال صراحةً، ويُعطى طريق للعودة */}
      {differs && !readOnly && (
        <div className="alert alert-warning no-print">
          <Icon name="warning" />
          <span style={{ flex: 1 }}>
            هذه مسودة لم تُنشر — ما يراه المستخدمون الآن مختلف عمّا أمامك. اضغط
            «نشر» لتعتمدها، أو «استعادة المنشور» لتعود إلى الألوان الحالية.
          </span>
        </div>
      )}
      {problems.length > 0 && (
        <div className="alert alert-warning">
          <Icon name="warning" />
          <span>
            <strong>تحقق من التباين قبل النشر:</strong>
            <ul style={{ margin: "6px 0 0", paddingInlineStart: 20 }}>
              {problems.map((problem, index) => (
                <li key={index}>
                  {COLOR_LABELS[problem.field.replace("colors.", "")] ?? problem.field}:{" "}
                  {problem.message}
                </li>
              ))}
            </ul>
          </span>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">
            <span className="inline">
              <Icon name="tag" size={17} className="muted" />
              العلامة
            </span>
          </div>
          <div className="field">
            <label>اسم المزرعة الظاهر</label>
            <input value={draft.brand_name} onChange={(e) => update({ brand_name: e.target.value })} disabled={readOnly} />
          </div>
          <div className="field">
            <label>الوصف المختصر</label>
            <input value={draft.brand_tagline} onChange={(e) => update({ brand_tagline: e.target.value })} disabled={readOnly} />
          </div>

          <div className="divider" />
          <div className="card-title">
            <span className="inline">
              <Icon name="blocks" size={17} className="muted" />
              الخط والشكل
            </span>
          </div>
          {/* الخط يُختار بالنظر إليه لا بقراءة اسمه: كل بطاقة مكتوبة بخطّها. */}
          <div className="field">
            <label>نوع الخط</label>
            <div className="font-grid">
              {fonts.map((font) => {
                const active = draft.font_family === font.family;
                return (
                  <button
                    type="button"
                    key={font.family}
                    className={`font-card${active ? " active" : ""}`}
                    onClick={() => !readOnly && update({ font_family: font.family })}
                    disabled={readOnly}
                    aria-pressed={active}
                    title={font.note}
                  >
                    <span className="font-card-head">
                      <span className="font-card-name">{font.label}</span>
                      <span className="badge badge-muted">{KIND_LABEL[font.kind] ?? font.kind}</span>
                      {active && <Icon name="check" size={15} className="font-card-tick" />}
                    </span>
                    <span className="font-card-sample" style={{ fontFamily: fontStack(font.family) }}>
                      {SAMPLE}
                    </span>
                    <span className="font-card-note">{font.note}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>حجم الخط ({Number(draft.font_scale).toFixed(2)})</label>
              <input
                type="range"
                min="0.8"
                max="1.6"
                step="0.05"
                value={draft.font_scale}
                onChange={(e) => update({ font_scale: e.target.value })}
                disabled={readOnly}
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>استدارة الحواف ({draft.corner_radius}px)</label>
              <input
                type="range"
                min="0"
                max="28"
                step="1"
                value={draft.corner_radius}
                onChange={(e) => update({ corner_radius: Number(e.target.value) })}
                disabled={readOnly}
              />
            </div>
            <div className="field">
              <label>كثافة الواجهة</label>
              <select value={draft.density} onChange={(e) => update({ density: e.target.value })} disabled={readOnly}>
                <option value="comfortable">مريحة</option>
                <option value="compact">مضغوطة</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span className="inline">
              <Icon name="palette" size={17} className="muted" />
              الألوان
            </span>
          </div>
          <div className="swatch-row">
            {CONTENT_COLORS.map((key) => (
              <div className="field" key={key}>
                <label>{COLOR_LABELS[key]}</label>
                <input
                  type="color"
                  value={colors[key] ?? "#000000"}
                  onChange={(e) => updateColor(key, e.target.value.toUpperCase())}
                  disabled={readOnly}
                />
              </div>
            ))}
          </div>

          <div className="divider" />
          <div className="card-title">
            <span className="inline">
              <Icon name="blocks" size={17} className="muted" />
              القائمة الجانبية والشريط العلوي
            </span>
          </div>
          <div className="swatch-row">
            {CHROME_COLORS.map((key) => (
              <div className="field" key={key}>
                <label>{COLOR_LABELS[key]}</label>
                <input
                  type="color"
                  value={colors[key] ?? "#000000"}
                  onChange={(e) => updateColor(key, e.target.value.toUpperCase())}
                  disabled={readOnly}
                />
              </div>
            ))}
          </div>
          <span className="stat-hint">
            جرّب قائمة داكنة بلون هويتك ونصًّا فاتحًا — المحتوى يبقى أبيض هادئًا،
            والعناصر داخل القائمة تتبع لون خطّها تلقائيًا.
          </span>
        </div>
      </div>

      <div className="card mt-5">
        <div className="card-title">
          <span className="inline">
            <Icon name="eye" size={17} className="muted" />
            معاينة حية
          </span>
          <span className="badge badge-muted">v{draft.tokens.version}</span>
        </div>
        {/* المعاينة تُظهر الشاشة كما هي: قائمة جانبية وشريط علوي ومحتوى —
            لأن ألوان الإطار لا يمكن الحكم عليها إلا داخل شكل الإطار. */}
        <div className="preview">
          <div className="preview-head" style={{ background: colors.primary, color: colors.primary_contrast }}>
            {draft.brand_name || "مزرعتي"} — {draft.brand_tagline || "لوحة الإدارة"}
          </div>

          <div className="preview-chrome">
            <div
              className="preview-side"
              style={{ background: colors.sidebar, color: colors.sidebar_text }}
            >
              <div className="preview-side-brand">{draft.brand_name || "مزرعتي"}</div>
              {["الرئيسية", "الحيوانات", "المالية"].map((item, index) => (
                <div
                  key={item}
                  className="preview-side-link"
                  style={
                    index === 1
                      ? {
                          background: `color-mix(in srgb, ${colors.primary} 14%, transparent)`,
                          color: `color-mix(in srgb, ${colors.primary} 55%, ${colors.sidebar_text})`,
                          fontWeight: 700,
                        }
                      : { color: `color-mix(in srgb, ${colors.sidebar_text} 62%, transparent)` }
                  }
                >
                  {item}
                </div>
              ))}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="preview-top"
                style={{
                  background: colors.header,
                  color: colors.header_text,
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <span style={{ fontWeight: 700 }}>الحيوانات</span>
                <span
                  style={{
                    marginInlineStart: "auto",
                    fontSize: "0.78rem",
                    color: `color-mix(in srgb, ${colors.header_text} 65%, transparent)`,
                  }}
                >
                  ٣ تنبيهات · أبو محمد
                </span>
              </div>
              <div className="preview-body" style={{ background: colors.background, color: colors.text }}>
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: draft.corner_radius, padding: 16 }}>
              <div style={{ color: colors.text_muted, fontSize: "0.85rem" }}>النقد المتوفر</div>
              <div style={{ fontWeight: 700, fontSize: "1.6rem" }}>9,045 USD</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <span style={{ background: colors.success, color: "#fff", padding: "4px 12px", borderRadius: 999, fontSize: "0.8rem" }}>مُرحّل</span>
                <span style={{ background: colors.warning, color: "#fff", padding: "4px 12px", borderRadius: 999, fontSize: "0.8rem" }}>بانتظار الموافقة</span>
                <span style={{ background: colors.danger, color: "#fff", padding: "4px 12px", borderRadius: 999, fontSize: "0.8rem" }}>نافق</span>
              </div>
              <button
                style={{
                  marginTop: 14,
                  background: colors.primary,
                  color: colors.primary_contrast,
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: draft.corner_radius,
                  fontWeight: 600,
                  fontFamily: "inherit",
                }}
              >
                إضافة مصروف
              </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="stat-hint mt-4">
          هذه معاينة للمسودة. النسخة المنشورة الحالية التي يراها الجميع هي v{draft.tokens.version}.
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-title">
          <span className="inline">
            <Icon name="home" size={17} className="muted" />
            بطاقات لوحة المعلومات
          </span>
        </div>
        <p className="page-sub mb-4">
          أطفئ ما لا يهم مزرعتك، وحرّك ما يهمها إلى الأعلى. يُحفظ مع بقية الهوية
          البصرية ولا يظهر للجميع قبل النشر.
        </p>

        <div className="stack-sm">
          {widgetRows(draft).map((row, index, all) => {
            const label =
              DASHBOARD_WIDGETS.find((widget) => widget.key === row.key)?.label ?? row.key;
            return (
              <div
                key={row.key}
                className="alert-row"
                style={{ alignItems: "center", opacity: row.visible ? 1 : 0.55 }}
              >
                <label className="field-inline" style={{ flex: 1, marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={row.visible}
                    disabled={!can("theme.edit")}
                    onChange={(e) => {
                      const next = [...all];
                      next[index] = { ...row, visible: e.target.checked };
                      update({ dashboard_widgets: next });
                    }}
                  />
                  <span className="strong" style={{ color: "var(--color-text)" }}>
                    {label}
                  </span>
                </label>
                <span className="cell-actions-group">
                  <button
                    type="button"
                    className="icon-btn bordered"
                    title="أعلى"
                    aria-label="نقل لأعلى"
                    disabled={index === 0 || !can("theme.edit")}
                    onClick={() => {
                      const next = [...all];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      update({ dashboard_widgets: next });
                    }}
                  >
                    <Icon name="chevronUp" size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn bordered"
                    title="أسفل"
                    aria-label="نقل لأسفل"
                    disabled={index === all.length - 1 || !can("theme.edit")}
                    onClick={() => {
                      const next = [...all];
                      [next[index], next[index + 1]] = [next[index + 1], next[index]];
                      update({ dashboard_widgets: next });
                    }}
                  >
                    <Icon name="chevronDown" size={15} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** The saved order, with any card this build added since appended at the end. */
function widgetRows(draft: Draft) {
  const stored = draft.dashboard_widgets ?? [];
  const known = new Map(stored.map((row) => [row.key, row]));
  return DASHBOARD_WIDGETS.map(
    (widget) => known.get(widget.key) ?? { key: widget.key, visible: true }
  ).sort((a, b) => {
    const order = stored.map((row) => row.key);
    const left = order.indexOf(a.key);
    const right = order.indexOf(b.key);
    return (left === -1 ? 999 : left) - (right === -1 ? 999 : right);
  });
}
