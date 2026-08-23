"use client";

/**
 * تحميل خط الواجهة عند الحاجة إليه.
 *
 * المشكلة التي يحلّها: اختيار الخط كان يكتب اسمه في متغيّر CSS فقط. إن لم يكن
 * المتصفح قد حمّل ذلك الخط، لا يحدث شيء ظاهر — تسقط الواجهة بصمت إلى خط النظام
 * ويبدو الاختيار معطّلًا. هنا يُحقن رابط الخط في الصفحة قبل استعماله.
 *
 * ولماذا عند الحاجة لا كلها دفعة واحدة: أربعة عشر خطًا في كل فتح للوحة نصف
 * ميغابايت تُحمَّل ليُستعمل واحد منها. الخط المختار وحده هو ما يُطلب.
 */

/** الأوزان التي تستعملها الواجهة فعلًا — لا داعي لتحميل ما لا يُرسم. */
const WEIGHTS = "400;500;600;700";

/** خطوط لا تملك كل الأوزان في Google Fonts، فتُطلب بما تملكه. */
const WEIGHTS_BY_FAMILY: Record<string, string> = {
  Almarai: "400;700",
  Amiri: "400;700",
};

/** ما بعد الخط المختار: عربي مضمون على ويندوز، ثم خط النظام. */
export const FALLBACK_STACK = '"Segoe UI", "Noto Sans Arabic", system-ui, sans-serif';

const loaded = new Set<string>();

/** يبني رابط Google Fonts لعائلة واحدة. */
function fontUrl(family: string) {
  const weights = WEIGHTS_BY_FAMILY[family] ?? WEIGHTS;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family
  )}:wght@${weights}&display=swap`;
}

/**
 * يضمن وجود الخط في الصفحة. آمن للنداء المتكرر: يُحقن مرة واحدة لكل عائلة.
 * `System` لا يُحمَّل شيئًا — هو خط الجهاز نفسه.
 */
export function ensureFontLoaded(family: string | undefined | null) {
  if (typeof document === "undefined") return;
  const name = (family ?? "").trim();
  if (!name || name === "System" || loaded.has(name)) return;
  loaded.add(name);

  const id = `font-${name.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = fontUrl(name);
  document.head.appendChild(link);
}

/** تحميل عدة خطوط معًا — لشاشة الاختيار وحدها، حيث تُعرض كلها للمعاينة. */
export function preloadFonts(families: string[]) {
  families.forEach(ensureFontLoaded);
}

/** قيمة `font-family` كاملة كما تُكتب في CSS. */
export function fontStack(family: string | undefined | null) {
  const name = (family ?? "").trim();
  if (!name || name === "System") return FALLBACK_STACK;
  return `"${name}", ${FALLBACK_STACK}`;
}
