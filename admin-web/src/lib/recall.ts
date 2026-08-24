"use client";

/**
 * ما اخترته آخر مرة.
 *
 * المزرعة تكرّر نفسها: العلف يُشترى من نفس المورد، ويُدفع من نفس الصندوق،
 * ويُحمَّل على نفس الفرع، كل أسبوع. ومع ذلك كان كل نموذج يبدأ فارغًا، فيُعاد
 * اختيار الشيء نفسه من ثلاث قوائم في كل مرة.
 *
 * هنا تُحفظ آخر قيمة اختيرت لكل حقل، ويُفتح النموذج عليها. تغييرها تغيير
 * لمرة واحدة إن شذّت العملية، ولا يُسأل عنها أصلًا إن لم تشذّ.
 *
 * ما لا يُحفظ: المبالغ والتواريخ والملاحظات. تكرار مبلغ بالخطأ خطأ محاسبي،
 * وتكرار اختيار فرع ليس خطأ.
 */

const PREFIX = "farm.recall:";

function key(field: string) {
  const farm = typeof window === "undefined" ? "-" : localStorage.getItem("farm.slug") ?? "-";
  return `${PREFIX}${farm}:${field}`;
}

/** آخر قيمة اختيرت لهذا الحقل، أو البديل إن لم يُختر شيء بعد. */
export function recall(field: string, fallback = ""): string {
  if (typeof window === "undefined") return fallback;
  try {
    return localStorage.getItem(key(field)) ?? fallback;
  } catch {
    return fallback;
  }
}

/** يحفظ الاختيار ليُفتح عليه النموذج في المرة القادمة. */
export function remember(field: string, value: string) {
  if (typeof window === "undefined" || !value) return;
  try {
    localStorage.setItem(key(field), value);
  } catch {
    // مخزن ممتلئ أو محظور: النماذج تعمل بلا ذاكرة، وهذا أسوأ ما يحدث.
  }
}

/**
 * يتذكّر القيمة إن كانت لا تزال موجودة في الخيارات المتاحة.
 *
 * القوائم تتغيّر: بند يُحذف، صندوق يُقفل. استعادة معرّف لم يعد موجودًا تعني
 * قائمة تبدو مختارة وهي فارغة، فيُرفض الحفظ بلا سبب ظاهر.
 */
export function recallFrom(field: string, options: { id: string }[], fallback = ""): string {
  const saved = recall(field);
  if (saved && options.some((option) => option.id === saved)) return saved;
  return fallback;
}
