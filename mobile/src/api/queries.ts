import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { ServerTheme } from "../theme/tokens";

/* --- الأشكال التي يقرأها التطبيق ---------------------------------------- */

export type Me = {
  user: { id: string; username: string; full_name: string; phone?: string };
  farm: { id: string; name: string; slug: string; base_currency: { code: string; symbol: string } };
  role: { display_name: string } | null;
  permissions: string[];
  theme: ServerTheme;
};

export type Animal = {
  id: string;
  tag: string;
  name: string;
  type_name: string;
  breed_name: string;
  status_name: string;
  status_code: string;
  branch_name: string;
  branch_code: string;
  location_name: string;
  sex: string;
  birth_date: string | null;
  current_weight: string | null;
  is_on_farm: boolean;
};

export type Catalog = { id: string; code: string; display_name: string; type: string };

export type Dashboard = {
  animals: Record<string, number>;
  money: {
    cash_on_hand: number;
    cash_accounts: { id: string; name: string; balance: number }[];
    income: number;
    expenses: number;
    net_profit: number;
    owed_to_farm: number;
    owed_by_farm: number;
    due_to_workers: number;
  };
  branches: {
    branch_id: string | null;
    code: string;
    name: string;
    income: number;
    expenses: number;
    net_profit: number;
    animals_on_farm: number;
  }[];
  milk: { liters_produced: number; liters_sold: number; daily_average: number; sales_value: number };
  stock_value: number;
  founding_total: number;
  pending_approvals: number;
  partners: { party_id: string; name: string; net_capital: number; ownership_percentage: number | null }[];
};

export type Alert = {
  kind: string;
  severity: "info" | "warning" | "danger";
  title: string;
  detail: string;
  link: string;
};

export type Entry = {
  id: string;
  number: string;
  date: string;
  kind: string;
  kind_label: string;
  memo: string;
  amount: string;
  status: string;
  status_label: string;
  branch_name?: string;
  created_by_name?: string;
};

export type Party = {
  id: string;
  kind: string;
  name: string;
  phone: string;
  is_active: boolean;
  summary?: { balance?: number; label?: string; net_capital?: number } | null;
};

export type Store = { id: string; name: string; display_name: string; branch_name?: string };

export type Page<T> = { count: number; next: string | null; results: T[] };

/* --- المفاتيح ------------------------------------------------------------ */

export const keys = {
  me: ["me"] as const,
  dashboard: (period: string) => ["dashboard", period] as const,
  alerts: ["alerts"] as const,
  catalog: ["catalog"] as const,
  animals: (query: string) => ["animals", query] as const,
  animal: (id: string) => ["animal", id] as const,
  timeline: (id: string) => ["timeline", id] as const,
  entries: (query: string) => ["entries", query] as const,
  parties: (kind: string) => ["parties", kind] as const,
  accounts: ["accounts"] as const,
  stock: ["stock"] as const,
  stores: ["stores"] as const,
  items: ["inventory-items"] as const,
  movements: (store: string) => ["movements", store] as const,
  milk: ["milk"] as const,
  milkReport: (period: string) => ["milk-report", period] as const,
  purchases: ["purchases"] as const,
  sales: ["sales"] as const,
  founding: ["founding"] as const,
  foundingReport: ["founding-report"] as const,
  audit: (action: string) => ["audit", action] as const,
  members: ["members"] as const,
  report: (name: string, period: string) => ["report", name, period] as const,
  catalogTypes: ["catalog-types"] as const,
  catalogItems: (type: string) => ["catalog-items", type] as const,
};

/* --- الهوية والأساسيات --------------------------------------------------- */

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<Me>("/auth/me/") });
}

/** هل يملك المستخدم هذه الصلاحية؟ يُستعمل لإخفاء ما لا يُفتح أصلًا. */
export function useCan() {
  const { data } = useMe();
  return (code?: string) => !code || !!data?.permissions?.includes(code);
}

export function useDashboard(period = "month") {
  return useQuery({
    queryKey: keys.dashboard(period),
    queryFn: () => api.get<Dashboard>(`/reports/dashboard/?period=${period}`),
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: keys.alerts,
    queryFn: () => api.get<{ data: { alerts: Alert[] } }>("/alerts/").then((r) => r.data.alerts),
  });
}

/** القوائم (الفروع، الأنواع، البنود…) تتغيّر نادرًا، فتُحفظ ساعة. */
export function useCatalog() {
  return useQuery({
    queryKey: keys.catalog,
    queryFn: () =>
      api.get<Page<Catalog>>("/catalog/?page_size=400").then((page) => {
        const grouped: Record<string, Catalog[]> = {};
        page.results.forEach((item) => {
          (grouped[item.type] ??= []).push(item);
        });
        return grouped;
      }),
    staleTime: 60 * 60 * 1000,
  });
}

/** الصناديق التي يجوز الدفع منها أو القبض فيها. */
export function usePickableAccounts() {
  return useQuery({
    queryKey: keys.accounts,
    queryFn: () =>
      api
        .get<{ data: { id: string; display_name: string; is_cash: boolean }[] }>(
          "/accounts/pickable/"
        )
        .then((r) => r.data),
    staleTime: 30 * 60 * 1000,
  });
}

/* --- القطيع -------------------------------------------------------------- */

export function useAnimals(params: Record<string, string | undefined>) {
  const query = new URLSearchParams({ page_size: "60" });
  Object.entries(params).forEach(([key, value]) => value && query.set(key, value));
  const path = `/animals/?${query}`;
  return useQuery({ queryKey: keys.animals(path), queryFn: () => api.get<Page<Animal>>(path) });
}

export function useAnimal(id: string) {
  return useQuery({
    queryKey: keys.animal(id),
    queryFn: () => api.get<Animal & Record<string, any>>(`/animals/${id}/`),
    enabled: !!id,
  });
}

export function useTimeline(id: string) {
  return useQuery({
    queryKey: keys.timeline(id),
    queryFn: () =>
      api.get<{ data: { events: any[] } }>(`/animals/${id}/timeline/`).then((r) => r.data.events),
    enabled: !!id,
  });
}

export function useNextTag(animalType?: string, branch?: string) {
  return useQuery({
    queryKey: ["next-tag", animalType, branch],
    queryFn: () => {
      const query = new URLSearchParams();
      if (animalType) query.set("animal_type", animalType);
      if (branch) query.set("branch", branch);
      return api
        .get<{ data: { tag: string } }>(`/animals/next-tag/?${query}`)
        .then((r) => r.data.tag);
    },
    enabled: !!animalType,
  });
}

/* --- المال --------------------------------------------------------------- */

export function useEntries(kind = "") {
  const query = new URLSearchParams({ page_size: "40" });
  if (kind) query.set("kind", kind);
  const path = `/entries/?${query}`;
  return useQuery({ queryKey: keys.entries(path), queryFn: () => api.get<Page<Entry>>(path) });
}

export function useParties(kind = "") {
  const query = new URLSearchParams({ page_size: "100" });
  if (kind) query.set("kind", kind);
  return useQuery({
    queryKey: keys.parties(kind),
    queryFn: () => api.get<Page<Party>>(`/parties/?${query}`),
  });
}

/* --- الأعلاف ------------------------------------------------------------- */

export function useStockBalance() {
  return useQuery({
    queryKey: keys.stock,
    queryFn: () =>
      api
        .get<{ data: { stores: any[]; total_value: string } }>("/stock-balance/")
        .then((r) => r.data),
  });
}

export function useStores() {
  return useQuery({
    queryKey: keys.stores,
    queryFn: () => api.get<Page<Store>>("/stores/?page_size=50").then((r) => r.results),
    staleTime: 30 * 60 * 1000,
  });
}

export function useInventoryItems() {
  return useQuery({
    queryKey: keys.items,
    queryFn: () =>
      api
        .get<Page<{ id: string; display_name: string; unit_name: string }>>(
          "/inventory-items/?page_size=200"
        )
        .then((r) => r.results),
    staleTime: 30 * 60 * 1000,
  });
}

export function useMovements(store = "") {
  const query = new URLSearchParams({ page_size: "40", ordering: "-happened_on" });
  if (store) query.set("store", store);
  return useQuery({
    queryKey: keys.movements(store),
    queryFn: () => api.get<Page<any>>(`/stock-movements/?${query}`),
  });
}

/* --- الحليب -------------------------------------------------------------- */

export function useMilk() {
  return useQuery({
    queryKey: keys.milk,
    queryFn: () => api.get<Page<any>>("/milk/?page_size=40&ordering=-happened_on"),
  });
}

export function useMilkReport(period = "month") {
  return useQuery({
    queryKey: keys.milkReport(period),
    queryFn: () => api.get<any>(`/reports/milk/?period=${period}`),
  });
}

/* --- شراء وبيع ----------------------------------------------------------- */

export function usePurchases() {
  return useQuery({
    queryKey: keys.purchases,
    queryFn: () => api.get<Page<any>>("/purchases/?page_size=40&ordering=-happened_on"),
  });
}

export function useSales() {
  return useQuery({
    queryKey: keys.sales,
    queryFn: () => api.get<Page<any>>("/sales/?page_size=40&ordering=-happened_on"),
  });
}

/* --- التكاليف التأسيسية والتقارير والتدقيق -------------------------------- */

export function useFoundingCosts() {
  return useQuery({
    queryKey: keys.founding,
    queryFn: () => api.get<Page<any>>("/founding-costs/?page_size=60&ordering=-happened_on"),
  });
}

export function useFoundingSummary() {
  return useQuery({
    queryKey: keys.foundingReport,
    queryFn: () => api.get<any>("/reports/founding-costs/"),
  });
}

export function useReport(name: string, period = "all") {
  const withPeriod = ["branches", "profit-loss", "cash-flow"].includes(name);
  const path = withPeriod ? `/reports/${name}/?period=${period}` : `/reports/${name}/`;
  return useQuery({ queryKey: keys.report(name, period), queryFn: () => api.get<any>(path) });
}

export function useAudit(action = "") {
  const query = new URLSearchParams({ page_size: "50" });
  if (action) query.set("action", action);
  return useQuery({
    queryKey: keys.audit(action),
    queryFn: () => api.get<Page<any>>(`/audit/?${query}`),
  });
}

export function useMembers() {
  return useQuery({
    queryKey: keys.members,
    queryFn: () => api.get<Page<any>>("/members/?page_size=60"),
  });
}

/* --- الإعدادات: القوائم --------------------------------------------------- */

export function useCatalogTypes() {
  return useQuery({
    queryKey: keys.catalogTypes,
    queryFn: () => api.get<Page<any>>("/catalog-types/?page_size=60").then((r) => r.results),
    staleTime: 60 * 60 * 1000,
  });
}

export function useCatalogItems(type: string) {
  return useQuery({
    queryKey: keys.catalogItems(type),
    queryFn: () => api.get<Page<Catalog>>(`/catalog/?type=${type}&page_size=200`),
    enabled: !!type,
  });
}

/* --- الكتابة ------------------------------------------------------------- */

/**
 * كل تسجيل يمرّ من هنا.
 *
 * بعد أي كتابة يُبطل المخزون كله: قيد واحد يحرّك الأرصدة والتقارير والتنبيهات
 * معًا، وإعادة السؤال أرخص من تخمين ما تغيّر — نفس القاعدة التي في اللوحة.
 */
export function useCommand<TBody = any>(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api.post<any>(path, body),
    onSuccess: () => client.invalidateQueries(),
  });
}

export function usePatch<TBody = any>(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api.patch<any>(path, body),
    onSuccess: () => client.invalidateQueries(),
  });
}
