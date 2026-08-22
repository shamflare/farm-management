"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { applyTheme, DASHBOARD_WIDGETS } from "@/lib/theme";
import { useApp } from "@/components/AppShell";

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
};

const FONTS = ["Cairo", "Tajawal", "IBM Plex Sans Arabic", "Noto Sans Arabic", "Almarai", "System"];

export default function ThemePage() {
  const { can, reloadTheme } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.get<{ draft: Draft; problems: Problem[] }>("/theme/draft/");
    setDraft(data.draft);
    setProblems(data.problems);
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
      const res = await api.patch<{ draft: Draft; problems: Problem[] }>("/theme/draft/", body);
      setDraft(res.draft);
      setProblems(res.problems);
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

  async function reset() {
    if (!window.confirm("إعادة التصميم إلى الإعدادات الافتراضية؟")) return;
    await api.post("/theme/reset/");
    await load();
    setNotice("تمت الإعادة للإعدادات الافتراضية");
  }

  if (error && !draft) return <div className="alert alert-error">{error}</div>;
  if (!draft) return <div className="empty">جارٍ التحميل…</div>;

  const colors = { ...draft.tokens.colors, ...draft.colors };
  const readOnly = !can("theme.edit");

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">الهوية البصرية</h1>
          <p className="page-sub">
            الألوان والخط والشعار تُحفظ في الخادم — تغييرها لا يحتاج إصدار تطبيق جديد
          </p>
        </div>
        {!readOnly && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={reset} disabled={busy}>استعادة الافتراضي</button>
            <button className="btn btn-ghost" onClick={save} disabled={busy}>حفظ كمسودة</button>
            <button className="btn" onClick={publish} disabled={busy}>نشر</button>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}
      {problems.length > 0 && (
        <div className="alert alert-error">
          <strong>تحقق من التباين قبل النشر:</strong>
          <ul style={{ margin: "8px 20px 0" }}>
            {problems.map((problem, index) => (
              <li key={index}>{COLOR_LABELS[problem.field.replace("colors.", "")] ?? problem.field}: {problem.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">العلامة</div>
          <div className="field">
            <label>اسم المزرعة الظاهر</label>
            <input value={draft.brand_name} onChange={(e) => update({ brand_name: e.target.value })} disabled={readOnly} />
          </div>
          <div className="field">
            <label>الوصف المختصر</label>
            <input value={draft.brand_tagline} onChange={(e) => update({ brand_tagline: e.target.value })} disabled={readOnly} />
          </div>

          <div className="card-title" style={{ marginTop: 20 }}>الخط والشكل</div>
          <div className="row">
            <div className="field">
              <label>نوع الخط</label>
              <select value={draft.font_family} onChange={(e) => update({ font_family: e.target.value })} disabled={readOnly}>
                {FONTS.map((font) => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
            </div>
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
          <div className="card-title">الألوان</div>
          <div className="swatch-row">
            {Object.keys(COLOR_LABELS).map((key) => (
              <div className="field" key={key} style={{ marginBottom: 8 }}>
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
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">معاينة حية</div>
        <div className="preview">
          <div className="preview-head" style={{ background: colors.primary, color: colors.primary_contrast }}>
            {draft.brand_name || "مزرعتي"} — {draft.brand_tagline || "لوحة الإدارة"}
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
        <div className="stat-hint" style={{ marginTop: 10 }}>
          النسخة المنشورة الحالية: v{draft.tokens.version}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">بطاقات لوحة المعلومات</div>
        <p className="page-sub" style={{ marginBottom: 12 }}>
          أطفئ ما لا يهم مزرعتك، وحرّك ما يهمها إلى الأعلى. يُحفظ مع بقية الهوية
          البصرية ولا يظهر للجميع قبل النشر.
        </p>

        <div style={{ display: "grid", gap: 6 }}>
          {widgetRows(draft).map((row, index, all) => {
            const label =
              DASHBOARD_WIDGETS.find((widget) => widget.key === row.key)?.label ?? row.key;
            return (
              <div
                key={row.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  opacity: row.visible ? 1 : 0.55,
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, margin: 0 }}>
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
                  <span style={{ fontWeight: 600 }}>{label}</span>
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={index === 0 || !can("theme.edit")}
                  onClick={() => {
                    const next = [...all];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    update({ dashboard_widgets: next });
                  }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={index === all.length - 1 || !can("theme.edit")}
                  onClick={() => {
                    const next = [...all];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    update({ dashboard_widgets: next });
                  }}
                >
                  ▼
                </button>
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
