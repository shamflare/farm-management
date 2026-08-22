"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, clearSession, getToken } from "@/lib/api";
import { applyTheme, FALLBACK_TOKENS, ThemeTokens } from "@/lib/theme";

type Alert = {
  kind: string;
  severity: "info" | "warning" | "danger";
  title: string;
  detail: string;
  count: number;
  link: string;
};

type Me = {
  user: { id: string; username: string; full_name: string };
  farm: { id: string; name: string; slug: string; base_currency: { code: string; symbol: string } };
  farms: { id: string; slug: string; name: string }[];
  role: { display_name: string } | null;
  permissions: string[];
  theme: ThemeTokens;
};

type Ctx = {
  me: Me | null;
  can: (code: string) => boolean;
  currency: string;
  alerts: Alert[];
  reloadTheme: () => Promise<void>;
  reloadAlerts: () => Promise<void>;
};

const AppContext = createContext<Ctx>({
  me: null,
  can: () => false,
  currency: "USD",
  alerts: [],
  reloadTheme: async () => {},
  reloadAlerts: async () => {},
});

export const useApp = () => useContext(AppContext);

const NAV = [
  { href: "/dashboard", label: "الرئيسية", icon: "🏠", permission: "dashboard.view" },
  { href: "/animals", label: "الحيوانات", icon: "🐑", permission: "animals.view" },
  { href: "/purchases", label: "شراء الحيوانات", icon: "🛒", permission: "purchases.view" },
  { href: "/sales", label: "بيع الحيوانات", icon: "💵", permission: "sales.view" },
  { href: "/milk", label: "الحليب", icon: "🥛", permission: "milk.view" },
  { href: "/inventory", label: "مستودعات الأعلاف", icon: "🌾", permission: "inventory.view" },
  { href: "/finance", label: "المالية", icon: "💰", permission: "finance.view|finance.create" },
  { href: "/founding-costs", label: "التكاليف التأسيسية", icon: "🏗️", permission: "assets.view" },
  { href: "/parties", label: "الأشخاص والحسابات", icon: "👥", permission: "parties.view" },
  { href: "/reports", label: "التقارير", icon: "📊", permission: "reports.view" },
  { href: "/settings/opening", label: "الرصيد الافتتاحي", icon: "🧾", permission: "settings.edit" },
  { href: "/settings/approvals", label: "الاعتماد والنسخ", icon: "🛡️", permission: "finance.view|backup.export" },
  { href: "/settings/lists", label: "القوائم والبنود", icon: "🗂️", permission: "settings.view" },
  { href: "/settings/fields", label: "بناء النماذج", icon: "🧩", permission: "settings.view" },
  { href: "/settings/users", label: "المستخدمون والدخول", icon: "🔑", permission: "users.view" },
  { href: "/settings/theme", label: "الهوية البصرية", icon: "🎨", permission: "theme.view" },
  { href: "/audit", label: "سجل التدقيق", icon: "🕓", permission: "audit.view" },
];

const SEVERITY_ICON: Record<string, string> = { danger: "🔴", warning: "🟠", info: "🔵" };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [error, setError] = useState("");

  async function loadMe() {
    const data = await api.get<Me>("/auth/me/");
    setMe(data);
    applyTheme(data.theme ?? FALLBACK_TOKENS);
  }

  async function loadAlerts() {
    try {
      const data = await api.get<{ data: { alerts: Alert[] } }>("/alerts/");
      setAlerts(data.data.alerts);
    } catch {
      // Alerts are a convenience; never let them block the screen.
      setAlerts([]);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    loadMe()
      .then(loadAlerts)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whatever the last action was, it may have cleared or raised something.
  useEffect(() => {
    if (me) loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const can = (code: string) => !!me?.permissions?.includes(code);
  // "a|b" means either permission opens the screen.
  const canAny = (codes: string) => codes.split("|").some((code) => can(code));

  async function switchFarm(slug: string) {
    await api.post("/auth/switch-farm/", { farm: slug });
    localStorage.setItem("farm.slug", slug);
    window.location.reload();
  }

  if (error) {
    return (
      <div className="main">
        <div className="alert alert-error">تعذر تحميل الجلسة: {error}</div>
        <button className="btn" onClick={() => { clearSession(); router.replace("/login"); }}>
          العودة لتسجيل الدخول
        </button>
      </div>
    );
  }

  if (!me) return <div className="empty">جارٍ التحميل…</div>;

  const brand = me.theme?.brand ?? FALLBACK_TOKENS.brand;
  const visibleNav = NAV.filter((item) => !item.permission || canAny(item.permission));
  const urgent = alerts.filter((alert) => alert.severity === "danger").length;

  return (
    <AppContext.Provider
      value={{
        me,
        can,
        currency: me.farm?.base_currency?.code ?? "USD",
        alerts,
        reloadTheme: loadMe,
        reloadAlerts: loadAlerts,
      }}
    >
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              {brand.logo ? <img src={brand.logo} alt="" /> : "🐑"}
            </div>
            <div>
              <div className="brand-name">{brand.name || me.farm.name}</div>
              <div className="brand-sub">{brand.tagline || me.farm.slug}</div>
            </div>
          </div>

          {me.farms?.length > 1 && (
            <div className="field" style={{ margin: "0 0 12px" }}>
              <label>المزرعة</label>
              <select value={me.farm.slug} onChange={(e) => switchFarm(e.target.value)}>
                {me.farms.map((farm) => (
                  <option key={farm.id} value={farm.slug}>{farm.name}</option>
                ))}
              </select>
            </div>
          )}

          {alerts.length > 0 && (
            <button
              className="nav-link"
              style={{ width: "100%", textAlign: "start", cursor: "pointer" }}
              onClick={() => setShowAlerts(true)}
            >
              <span className="nav-icon">{urgent > 0 ? "🔔" : "🔕"}</span>
              <span>التنبيهات</span>
              <span className={`badge ${urgent > 0 ? "badge-danger" : "badge-warning"}`} style={{ marginInlineStart: "auto" }}>
                {alerts.length}
              </span>
            </button>
          )}

          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${pathname?.startsWith(item.href) ? "active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}

          <div className="sidebar-footer">
            <div style={{ fontWeight: 600, color: "var(--color-text)" }}>{me.user.full_name || me.user.username}</div>
            <div>{me.role?.display_name ?? "—"}</div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 10, width: "100%" }}
              onClick={() => {
                clearSession();
                router.replace("/login");
              }}
            >
              تسجيل الخروج
            </button>
          </div>
        </aside>

        <main className="main">{children}</main>
      </div>

      {showAlerts && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setShowAlerts(false)}
        >
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-title">التنبيهات ({alerts.length})</div>
            <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
              {alerts.map((alert, index) => (
                <Link
                  key={index}
                  href={alert.link || "/dashboard"}
                  onClick={() => setShowAlerts(false)}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid var(--color-border)",
                    color: "inherit",
                  }}
                >
                  <span>{SEVERITY_ICON[alert.severity]}</span>
                  <span>
                    <div style={{ fontWeight: 700 }}>{alert.title}</div>
                    {alert.detail && <div className="stat-hint">{alert.detail}</div>}
                  </span>
                </Link>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowAlerts(false)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}
