"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, clearSession, getToken } from "@/lib/api";
import { applyTheme, FALLBACK_TOKENS, ThemeTokens } from "@/lib/theme";

type Me = {
  user: { id: string; username: string; full_name: string };
  farm: { id: string; name: string; slug: string; base_currency: { code: string; symbol: string } };
  role: { display_name: string } | null;
  permissions: string[];
  theme: ThemeTokens;
};

type Ctx = {
  me: Me | null;
  can: (code: string) => boolean;
  currency: string;
  reloadTheme: () => Promise<void>;
};

const AppContext = createContext<Ctx>({
  me: null,
  can: () => false,
  currency: "USD",
  reloadTheme: async () => {},
});

export const useApp = () => useContext(AppContext);

const NAV = [
  { href: "/dashboard", label: "الرئيسية", icon: "🏠", permission: "dashboard.view" },
  { href: "/animals", label: "الحيوانات", icon: "🐑", permission: "animals.view" },
  { href: "/milk", label: "الحليب", icon: "🥛", permission: "milk.view" },
  { href: "/inventory", label: "مستودعات الأعلاف", icon: "🌾", permission: "inventory.view" },
  { href: "/finance", label: "المالية", icon: "💰", permission: "finance.view|finance.create" },
  { href: "/founding-costs", label: "التكاليف التأسيسية", icon: "🏗️", permission: "assets.view" },
  { href: "/parties", label: "الأشخاص والحسابات", icon: "👥", permission: "parties.view" },
  { href: "/reports", label: "التقارير", icon: "📊", permission: "reports.view" },
  { href: "/settings/lists", label: "القوائم والبنود", icon: "🗂️", permission: "settings.view" },
  { href: "/settings/fields", label: "بناء النماذج", icon: "🧩", permission: "settings.view" },
  { href: "/settings/users", label: "المستخدمون والدخول", icon: "🔑", permission: "users.view" },
  { href: "/settings/theme", label: "الهوية البصرية", icon: "🎨", permission: "theme.view" },
  { href: "/audit", label: "سجل التدقيق", icon: "🕓", permission: "audit.view" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  async function loadMe() {
    const data = await api.get<Me>("/auth/me/");
    setMe(data);
    applyTheme(data.theme ?? FALLBACK_TOKENS);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    loadMe().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const can = (code: string) => !!me?.permissions?.includes(code);
  // "a|b" means either permission opens the screen.
  const canAny = (codes: string) => codes.split("|").some((code) => can(code));

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

  return (
    <AppContext.Provider
      value={{ me, can, currency: me.farm?.base_currency?.code ?? "USD", reloadTheme: loadMe }}
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
    </AppContext.Provider>
  );
}
