import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

/**
 * عميل الـ API — نفس عقد lib/api.ts في اللوحة، بأدوات الجوال.
 *
 * الفرق الوحيد المهم: التوكن يعيش في المخزن المشفّر للجهاز لا في ذاكرة
 * المتصفح، لأن الجوال يُفقد ويُعار ويبقى مفتوحًا في الجيب.
 */

const BASE =
  (Constants.expoConfig?.extra as any)?.apiUrl ?? "https://zadfarm.net/api/v1";

const ACCESS = "zad.access";
const REFRESH = "zad.refresh";
const FARM = "zad.farm";

export type Session = {
  access: string;
  refresh: string;
  user: { id: string; username: string; full_name: string };
  farms: { id: string; slug: string; name: string; role: string; permissions: string[] }[];
};

let memoryToken: string | null = null;
let memoryFarm: string | null = null;

export async function loadSession() {
  memoryToken = await SecureStore.getItemAsync(ACCESS);
  memoryFarm = await SecureStore.getItemAsync(FARM);
  return { token: memoryToken, farm: memoryFarm };
}

export async function saveSession(session: Session) {
  memoryToken = session.access;
  memoryFarm = session.farms?.[0]?.slug ?? null;
  await SecureStore.setItemAsync(ACCESS, session.access);
  await SecureStore.setItemAsync(REFRESH, session.refresh);
  if (memoryFarm) await SecureStore.setItemAsync(FARM, memoryFarm);
}

export async function clearSession() {
  memoryToken = null;
  memoryFarm = null;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS),
    SecureStore.deleteItemAsync(REFRESH),
    SecureStore.deleteItemAsync(FARM),
  ]).catch(() => {});
}

export function currentToken() {
  return memoryToken;
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(readMessage(body) || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

/** يحوّل أشكال أخطاء DRF إلى سطر عربي واحد يُقرأ. */
function readMessage(body: any): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (body.detail) return String(body.detail);
  if (Array.isArray(body)) return body.map(readMessage).join(" · ");
  if (typeof body === "object") {
    return Object.values(body).map(readMessage).join(" · ");
  }
  return String(body);
}

/** يجدّد التوكن مرة واحدة عند انتهائه، فلا يُطرد المستخدم وهو يعمل. */
async function refreshAccess(): Promise<boolean> {
  const refresh = await SecureStore.getItemAsync(REFRESH);
  if (!refresh) return false;
  try {
    const response = await fetch(`${BASE}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!response.ok) return false;
    const body = await response.json();
    memoryToken = body.access;
    await SecureStore.setItemAsync(ACCESS, body.access);
    return true;
  } catch {
    return false;
  }
}

type Options = { method?: string; body?: unknown; retry?: boolean };

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (memoryToken) headers.Authorization = `Bearer ${memoryToken}`;
  if (memoryFarm) headers["X-Farm"] = memoryFarm;

  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 401 && options.retry !== false) {
    if (await refreshAccess()) return request<T>(path, { ...options, retry: false });
    await clearSession();
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ?? {} }),
  patch: <T,>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

export async function login(username: string, password: string) {
  const response = await fetch(`${BASE}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body);
  await saveSession(body as Session);
  return body as Session;
}
