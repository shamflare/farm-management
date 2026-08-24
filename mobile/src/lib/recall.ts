import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * ما اخترته آخر مرة — نفس فكرة اللوحة، بأدوات الجوال.
 *
 * المزرعة تكرّر نفسها: نفس الفرع، نفس الصندوق، نفس البند كل أسبوع. وعلى
 * الجوال يكلّف السؤالُ أكثر: إصبع واحد، وشمس على الشاشة، ويد مشغولة.
 *
 * القراءة من ذاكرة حيّة لا من القرص: النموذج يُرسم في اللحظة، ولا يصحّ أن
 * ينتظر قراءة قرص لملء قائمة. القرص يُقرأ مرة عند الإقلاع ويُكتب بهدوء بعده.
 *
 * ما لا يُحفظ: المبالغ والتواريخ والملاحظات. تكرار فرع راحة، وتكرار مبلغ خطأ.
 */

const PREFIX = "zad.recall:";

const memory = new Map<string, string>();

/** يُنادى مرة عند الإقلاع، فتصير القراءة بعده فورية. */
export async function loadRecall() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
    if (!keys.length) return;
    const rows = await AsyncStorage.multiGet(keys);
    rows.forEach(([key, value]) => {
      if (value !== null) memory.set(key.slice(PREFIX.length), value);
    });
  } catch {
    // بلا ذاكرة تعمل النماذج كما كانت: تبدأ فارغة.
  }
}

export function recall(field: string, fallback = ""): string {
  return memory.get(field) ?? fallback;
}

export function remember(field: string, value: string) {
  if (!value) return;
  memory.set(field, value);
  AsyncStorage.setItem(PREFIX + field, value).catch(() => {});
}

/**
 * يستعيد الاختيار إن كان لا يزال موجودًا بين الخيارات.
 *
 * القوائم تتغيّر: بند يُحذف، مستودع يُقفل. استعادة معرّف اختفى تعني قائمة
 * تبدو مختارة وهي فارغة، فيُرفض الحفظ بلا سبب ظاهر على الشاشة.
 */
export function recallFrom(field: string, options: { id: string }[], fallback = ""): string {
  const saved = memory.get(field);
  if (saved && options.some((option) => option.id === saved)) return saved;
  return fallback;
}
