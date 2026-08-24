"use client";

/**
 * التنبيه الذي قُرئ يختفي.
 *
 * تنبيهات هذا النظام ليست رسائل تُرسل مرة، بل حالات تُحسب من البيانات في كل
 * مرة: «ثلاثة رؤوس تحتاج لقاحًا»، «قيد بانتظار الاعتماد». لذلك لا يوجد شيء
 * يُعلَّم «مقروءًا» في الخادم — الحالة قائمة ما دام سببها قائمًا.
 *
 * فالإخفاء يجري هنا، وبقاعدة واحدة تحفظ معناه: يُحفظ **توقيع** التنبيه (نوعه
 * وعدده)، لا نوعه وحده. فإن تغيّر العدد — رأس رابع احتاج لقاحًا — عاد
 * التنبيه، لأنه خبر جديد لا تكرار لخبر قديم.
 *
 * الحفظ محلي وبلا خادم: هذا قرار شخصي («رأيته، لا تُرِني إياه») لا واقعة
 * تخصّ المزرعة، ولا مكان لها في دفترها.
 */

export type AlertLike = { kind: string; title: string; count?: number; detail?: string };

const KEY = "farm.alerts.dismissed";

/** ما يميّز حالة التنبيه: نوعه وحجمه. */
export function signature(alert: AlertLike) {
  return `${alert.kind}:${alert.count ?? 0}:${alert.title}`;
}

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    // لا تتراكم بلا حدّ: آخر خمسين توقيعًا تكفي، وما قبلها حالات انتهت.
    localStorage.setItem(KEY, JSON.stringify(list.slice(-50)));
  } catch {
    // مخزن ممتلئ: يبقى التنبيه ظاهرًا، وهذا أسوأ ما يحدث.
  }
}

export function dismissAlert(alert: AlertLike) {
  const list = read();
  const mark = signature(alert);
  if (!list.includes(mark)) write([...list, mark]);
}

export function dismissAll(alerts: AlertLike[]) {
  const list = read();
  const marks = alerts.map(signature).filter((mark) => !list.includes(mark));
  if (marks.length) write([...list, ...marks]);
}

/** يُعيد ما لم يُقرأ بعد. */
export function visibleAlerts<T extends AlertLike>(alerts: T[]): T[] {
  const list = read();
  return alerts.filter((alert) => !list.includes(signature(alert)));
}
