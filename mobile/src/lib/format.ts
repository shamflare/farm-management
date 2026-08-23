/**
 * الأرقام والتواريخ كما تُكتب في اللوحة تمامًا.
 *
 * الأرقام لاتينية (0-9) لا هندية، والأشهر عربية: هذا ما اعتاده صاحب المزرعة
 * على الشاشة الكبيرة، واختلاف الشكل بين جهازين يجعل الرقم نفسه يبدو رقمين.
 */

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

/** مبلغ مختصر للبطاقات: 12.4k بدل 12,400 حين تضيق المساحة. */
export function shortMoney(value: number | string | null | undefined, currency = "USD") {
  const number = Number(value ?? 0);
  if (Math.abs(number) >= 100000) return `${formatNumber(number / 1000, 1)}k ${currency}`;
  return `${formatNumber(number, 0)} ${currency}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(DATE_LOCALE, { dateStyle: "medium" }).format(new Date(value));
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** «سنتان» أفضل من «تاريخ الميلاد 2024-03-01» على بطاقة تُقرأ بلمحة. */
export function age(birthDate: string | null | undefined) {
  if (!birthDate) return "";
  const days = Math.floor((Date.now() - new Date(birthDate).getTime()) / 86400000);
  if (days < 0) return "";
  if (days < 60) return `${days} يوم`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} شهر`;
  const years = Math.floor(days / 365);
  return years === 2 ? "سنتان" : `${years} سنوات`;
}

export const SEX_LABEL: Record<string, string> = {
  female: "أنثى",
  male: "ذكر",
  unknown: "غير محدد",
};

export const SEX_ICON: Record<string, string> = {
  female: "♀",
  male: "♂",
  unknown: "•",
};

/** لون الحالة يقول القصة قبل قراءة الكلمة. */
export function statusTone(code: string): "success" | "danger" | "neutral" | "warning" {
  if (code === "dead") return "danger";
  if (code === "sold") return "neutral";
  if (code === "active") return "success";
  return "warning";
}
