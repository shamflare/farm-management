"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, clearSession, getToken } from "@/lib/api";
import { applyTheme, FALLBACK_TOKENS, ThemeTokens } from "@/lib/theme";
import Icon, { IconName } from "@/components/Icon";

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

type NavItem = { href: string; label: string; icon: IconName; permission?: string };

/**
 * الشريط الجانبي مرتّب على دورة عمل المزرعة لا على ترتيب بناء الشاشات:
 * القطيع أولًا لأنه أصل العمل، ثم ما يُنتجه ويأكله، ثم المال الذي ينتج عنه،
 * ثم ما يُقرأ منه، وأخيرًا ما يُضبط مرة ويُنسى. الإعدادات في الأسفل عمدًا —
 * تُفتح مرة في الشهر، لا مرة في الساعة.
 */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "",
    items: [{ href: "/dashboard", label: "الرئيسية", icon: "home", permission: "dashboard.view" }],
  },
  {
    label: "القطيع",
    items: [
      { href: "/animals", label: "الحيوانات", icon: "sheep", permission: "animals.view" },
      { href: "/purchases", label: "شراء الحيوانات", icon: "cart", permission: "purchases.view" },
      { href: "/sales", label: "بيع الحيوانات", icon: "banknote", permission: "sales.view" },
    ],
  },
  {
    label: "الإنتاج والمخزون",
    items: [
      { href: "/milk", label: "الحليب", icon: "droplet", permission: "milk.view" },
      { href: "/inventory", label: "مستودعات الأعلاف", icon: "wheat", permission: "inventory.view" },
    ],
  },
  {
    label: "المال",
    items: [
      {
        href: "/finance",
        label: "الحركات المالية",
        icon: "wallet",
        permission: "finance.view|finance.create",
      },
      { href: "/parties", label: "الأشخاص والحسابات", icon: "users", permission: "parties.view" },
      {
        href: "/founding-costs",
        label: "التكاليف التأسيسية",
        icon: "building",
        permission: "assets.view",
      },
    ],
  },
  {
    label: "التقارير والرقابة",
    items: [
      { href: "/reports", label: "التقارير", icon: "chart", permission: "reports.view" },
      { href: "/audit", label: "سجل التدقيق", icon: "history", permission: "audit.view" },
    ],
  },
  {
    label: "الإعدادات",
    items: [
      {
        href: "/settings/opening",
        label: "الرصيد الافتتاحي",
        icon: "receipt",
        permission: "settings.edit",
      },
      {
        href: "/settings/approvals",
        label: "الاعتماد والنسخ",
        icon: "shield",
        permission: "finance.view|backup.export",
      },
      { href: "/settings/lists", label: "القوائم والبنود", icon: "list", permission: "settings.view" },
      { href: "/settings/fields", label: "بناء النماذج", icon: "blocks", permission: "settings.view" },
      {
        href: "/settings/users",
        label: "المستخدمون والصلاحيات",
        icon: "key",
        permission: "users.view",
      },
      { href: "/settings/theme", label: "الهوية البصرية", icon: "palette", permission: "theme.view" },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

/** يغلق القائمة عند النقر خارجها أو ضغط Escape. */
function useDismiss(onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);
  return ref;
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("") || "؟";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<"farm" | "user" | "alerts" | null>(null);

  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const menuRef = useDismiss(closeMenu);

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
      // التنبيهات خدمة إضافية؛ لا يجوز أن تمنع الشاشة من الظهور.
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

  // أي عملية سابقة قد تكون أزالت تنبيهًا أو أنشأت غيره.
  useEffect(() => {
    if (me) loadAlerts();
    setDrawerOpen(false);
    setOpenMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const can = (code: string) => !!me?.permissions?.includes(code);
  // "a|b" تعني أن أيًّا من الصلاحيتين تفتح الشاشة.
  const canAny = (codes?: string) =>
    !codes || codes.split("|").some((code) => can(code));

  async function switchFarm(slug: string) {
    await api.post("/auth/switch-farm/", { farm: slug });
    localStorage.setItem("farm.slug", slug);
    window.location.reload();
  }

  function signOut() {
    clearSession();
    router.replace("/login");
  }

  if (error) {
    return (
      <div className="main">
        <div className="alert alert-error">
          <Icon name="warning" />
          <span>تعذّر تحميل الجلسة: {error}</span>
        </div>
        <button className="btn" onClick={signOut}>
          <Icon name="logout" />
          العودة لتسجيل الدخول
        </button>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="empty inline" style={{ justifyContent: "center", minHeight: "60vh" }}>
        <span className="spinner" />
        <span>جارٍ التحميل…</span>
      </div>
    );
  }

  const brand = me.theme?.brand ?? FALLBACK_TOKENS.brand;
  const urgent = alerts.filter((alert) => alert.severity === "danger").length;
  const current = ALL_ITEMS.filter((item) => pathname?.startsWith(item.href)).sort(
    (a, b) => b.href.length - a.href.length
  )[0];
  const personName = me.user.full_name || me.user.username;

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
      <div className="app">
        {drawerOpen && <div className="nav-backdrop" onClick={() => setDrawerOpen(false)} />}

        <aside className={`sidebar${drawerOpen ? " open" : ""}`}>
          <div className="brand">
            <div className="brand-mark">
              {brand.logo ? <img src={brand.logo} alt="" /> : <Icon name="sheep" size={21} />}
            </div>
            <div className="brand-text">
              <div className="brand-name">{brand.name || me.farm.name}</div>
              <div className="brand-sub">{brand.tagline || me.farm.name}</div>
            </div>
            <button
              className="icon-btn only-mobile push-end"
              onClick={() => setDrawerOpen(false)}
              aria-label="إغلاق القائمة"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          <nav className="nav">
            {NAV_GROUPS.map((group) => {
              const items = group.items.filter((item) => canAny(item.permission));
              if (!items.length) return null;
              return (
                <div className="nav-group" key={group.label || "main"}>
                  {group.label && <div className="nav-group-label">{group.label}</div>}
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`nav-link ${current?.href === item.href ? "active" : ""}`}
                      aria-current={current?.href === item.href ? "page" : undefined}
                    >
                      <Icon name={item.icon} className="nav-icon" />
                      <span className="nav-label">{item.label}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <div className="avatar">{initials(personName)}</div>
            <div className="identity">
              <div className="identity-name">{personName}</div>
              <div className="identity-role">{me.role?.display_name ?? "—"}</div>
            </div>
            <button className="icon-btn" onClick={signOut} title="تسجيل الخروج" aria-label="تسجيل الخروج">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </aside>

        <div className="app-body">
          <header className="topbar no-print">
            <button
              className="icon-btn only-mobile"
              onClick={() => setDrawerOpen(true)}
              aria-label="فتح القائمة"
            >
              <Icon name="menu" size={20} />
            </button>

            <span className="topbar-title">{current?.label ?? brand.name}</span>
            <span className="topbar-spacer" />

            <div className="topbar-tools" ref={menuRef}>
              {me.farms?.length > 1 && (
                <div className="menu-anchor">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setOpenMenu(openMenu === "farm" ? null : "farm")}
                    aria-expanded={openMenu === "farm"}
                  >
                    <Icon name="home" size={15} />
                    <span className="truncate" style={{ maxWidth: 130 }}>
                      {me.farm.name}
                    </span>
                    <Icon name="chevronDown" size={14} />
                  </button>
                  {openMenu === "farm" && (
                    <div className="menu">
                      <div className="menu-label">المزرعة النشطة</div>
                      <div className="menu-scroll">
                        {me.farms.map((farm) => (
                          <button
                            key={farm.id}
                            className={`menu-item ${farm.slug === me.farm.slug ? "active" : ""}`}
                            onClick={() => switchFarm(farm.slug)}
                          >
                            {farm.slug === me.farm.slug ? (
                              <Icon name="check" size={16} />
                            ) : (
                              <span style={{ width: 16 }} />
                            )}
                            <span className="truncate">{farm.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="menu-anchor">
                <button
                  className="icon-btn bordered"
                  onClick={() => setOpenMenu(openMenu === "alerts" ? null : "alerts")}
                  aria-label={`التنبيهات (${alerts.length})`}
                  aria-expanded={openMenu === "alerts"}
                >
                  <Icon name="bell" size={18} />
                  {alerts.length > 0 && (
                    <span className={`dot${urgent ? "" : " quiet"}`}>{alerts.length}</span>
                  )}
                </button>
                {openMenu === "alerts" && (
                  <div className="menu" style={{ minWidth: 320 }}>
                    <div className="menu-label">
                      التنبيهات {alerts.length > 0 && `(${alerts.length})`}
                    </div>
                    {alerts.length === 0 ? (
                      <div className="empty" style={{ padding: "var(--s5)" }}>
                        لا شيء يحتاج انتباهك الآن
                      </div>
                    ) : (
                      <div className="menu-scroll stack-sm" style={{ padding: "var(--s1)" }}>
                        {alerts.map((alert, index) => (
                          <Link
                            key={index}
                            href={alert.link || "/dashboard"}
                            className="alert-row"
                            onClick={closeMenu}
                          >
                            <span className={`alert-mark ${alert.severity}`} />
                            <span style={{ minWidth: 0 }}>
                              <div className="alert-row-title">{alert.title}</div>
                              {alert.detail && <div className="stat-hint">{alert.detail}</div>}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="menu-anchor">
                <button
                  className="icon-btn bordered"
                  onClick={() => setOpenMenu(openMenu === "user" ? null : "user")}
                  aria-label="حسابي"
                  aria-expanded={openMenu === "user"}
                >
                  <Icon name="user" size={18} />
                </button>
                {openMenu === "user" && (
                  <div className="menu">
                    <div className="menu-item" style={{ cursor: "default" }}>
                      <div className="avatar">{initials(personName)}</div>
                      <div className="identity">
                        <div className="identity-name">{personName}</div>
                        <div className="identity-role">
                          {me.role?.display_name ?? "—"} · {me.farm.name}
                        </div>
                      </div>
                    </div>
                    <div className="menu-sep" />
                    <button className="menu-item danger" onClick={signOut}>
                      <Icon name="logout" size={16} />
                      تسجيل الخروج
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="main">{children}</main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
