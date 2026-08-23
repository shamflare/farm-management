import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { ServerTheme } from "../theme/tokens";

/* --- الأشكال التي يقرأها التطبيق ---------------------------------------- */

export type Me = {
  user: { id: string; username: string; full_name: string };
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

export type Catalog = {
  id: string;
  code: string;
  display_name: string;
  type: string;
};

export type Dashboard = {
  animals: Record<string, number>;
  money: {
    cash_on_hand: number;
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
    net_profit: number;
    animals_on_farm: number;
  }[];
  milk: { liters_produced: number; liters_sold: number; daily_average: number };
  stock_value: number;
  pending_approvals: number;
};

export type Alert = {
  kind: string;
  severity: "info" | "warning" | "danger";
  title: string;
  detail: string;
  link: string;
};

type Page<T> = { count: number; next: string | null; results: T[] };

/* --- الاستعلامات --------------------------------------------------------- */

export const keys = {
  me: ["me"] as const,
  dashboard: (period: string) => ["dashboard", period] as const,
  alerts: ["alerts"] as const,
  catalog: ["catalog"] as const,
  animals: (query: string) => ["animals", query] as const,
  animal: (id: string) => ["animal", id] as const,
  timeline: (id: string) => ["timeline", id] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<Me>("/auth/me/") });
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

/** القوائم (الفروع، الأنواع، الحالات…) تتغيّر نادرًا، فتُحفظ ساعة كاملة. */
export function useCatalog() {
  return useQuery({
    queryKey: keys.catalog,
    queryFn: () =>
      api.get<Page<Catalog>>("/catalog/?page_size=300").then((page) => {
        const grouped: Record<string, Catalog[]> = {};
        page.results.forEach((item) => {
          (grouped[item.type] ??= []).push(item);
        });
        return grouped;
      }),
    staleTime: 60 * 60 * 1000,
  });
}

export function useAnimals(params: {
  branch?: string;
  search?: string;
  status?: string;
  sex?: string;
  is_on_farm?: string;
}) {
  const query = new URLSearchParams({ page_size: "60" });
  Object.entries(params).forEach(([key, value]) => value && query.set(key, value));
  const path = `/animals/?${query}`;
  return useQuery({
    queryKey: keys.animals(path),
    queryFn: () => api.get<Page<Animal>>(path),
  });
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
      api
        .get<{ data: { events: any[] } }>(`/animals/${id}/timeline/`)
        .then((r) => r.data.events),
    enabled: !!id,
  });
}

/* --- الكتابة ------------------------------------------------------------- */

/**
 * كل تسجيل يمرّ من هنا.
 *
 * بعد أي كتابة يُبطل المخزون كله: قيد واحد يحرّك الأرصدة والتقارير والتنبيهات
 * معًا، وإعادة السؤال أرخص من تخمين ما تغيّر — نفس القاعدة التي في اللوحة.
 */
export function useCommand<TBody>(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api.post<any>(path, body),
    onSuccess: () => client.invalidateQueries(),
  });
}
