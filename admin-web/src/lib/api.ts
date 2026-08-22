"use client";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";

const TOKEN_KEY = "farm.access";
const REFRESH_KEY = "farm.refresh";
const FARM_KEY = "farm.slug";

export type Session = {
  access: string;
  refresh: string;
  user: { id: string; username: string; full_name: string };
  farms: { id: string; slug: string; name: string; role: string; permissions: string[] }[];
};

export function getToken() {
  return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
}

export function getFarm() {
  return typeof window === "undefined" ? null : localStorage.getItem(FARM_KEY);
}

export function setSession(session: Session) {
  localStorage.setItem(TOKEN_KEY, session.access);
  localStorage.setItem(REFRESH_KEY, session.refresh);
  if (session.farms?.length) localStorage.setItem(FARM_KEY, session.farms[0].slug);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(FARM_KEY);
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

/** Turn DRF's error shapes into one readable Arabic-friendly line. */
function readMessage(body: any): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (body.detail) return String(body.detail);
  if (Array.isArray(body)) return body.map(readMessage).join(" · ");
  if (typeof body === "object") {
    return Object.entries(body)
      .map(([key, value]) => `${key}: ${readMessage(value)}`)
      .join(" · ");
  }
  return String(body);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const farm = getFarm();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (farm) headers["X-Farm"] = farm;

  const response = await fetch(`${BASE}${path}`, { ...options, headers, cache: "no-store" });
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      clearSession();
      window.location.href = "/login";
    }
    throw new ApiError(response.status, body);
  }
  return body as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

/**
 * Fetch a file the API guards behind a token and hand it to the browser.
 *
 * A plain <a href> cannot carry the Authorization header, so the bytes are
 * fetched, wrapped in a blob, and clicked programmatically. The filename comes
 * from the server, which knows the Arabic name it chose.
 */
export async function download(path: string, fallbackName = "download") {
  const token = getToken();
  const farm = getFarm();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (farm) headers["X-Farm"] = farm;

  const response = await fetch(`${BASE}${path}`, { headers, cache: "no-store" });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text ? JSON.parse(text) : null);
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Read a picked file into the base64 data URI the API stores. */
export function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("تعذّر قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} بايت`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} كيلوبايت`;
  return `${(size / 1024 / 1024).toFixed(1)} ميغابايت`;
}

export async function login(username: string, password: string) {
  const response = await fetch(`${BASE}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body);
  setSession(body as Session);
  return body as Session;
}

// Digits are always Western Arabic (0-9), never Arabic-Indic. The `-u-nu-latn`
// extension keeps the Arabic month names while forcing Latin numerals.
const NUMBER_LOCALE = "en-US";
const DATE_LOCALE = "ar-SY-u-nu-latn";

export function formatNumber(value: number | string | null | undefined, decimals = 0) {
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(Number(value ?? 0));
}

export function money(value: number | string | null | undefined, currency = "USD") {
  return `${formatNumber(value, 2)} ${currency}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(DATE_LOCALE, { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
