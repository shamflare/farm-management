"use client";

import { useState } from "react";

/**
 * الطباعة وحفظ PDF.
 *
 * الاثنان يفتحان نافذة الطباعة نفسها، والفرق في وجهتها: ورق أو ملف. وهذا
 * مقصود — المتصفح يكتب PDF فيه نصّ عربي حقيقي يُبحث فيه ويُنسخ، بحجم عشرات
 * الكيلوبايتات. أما توليد PDF داخل الصفحة بمكتبة فيصوّر الورقة صورةً: ملف
 * أثقل بعشرة أضعاف، ونصّ لا يُحدَّد ولا يُبحث فيه، وحروف عربية قد تنفصل.
 */
export default function PrintActions() {
  const [hint, setHint] = useState("");

  function print() {
    setHint("");
    window.print();
  }

  function savePdf() {
    setHint("في نافذة الطباعة اختر الوجهة: «حفظ بصيغة PDF»");
    // تُترك لحظة ليُقرأ السطر قبل أن تفتح النافذة فوقه.
    setTimeout(() => window.print(), 900);
  }

  return (
    <div className="liza-actions no-print">
      <button type="button" className="liza-btn" onClick={print}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9V2h12v7" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <path d="M6 14h12v8H6z" />
        </svg>
        طباعة
      </button>

      <button type="button" className="liza-btn liza-btn-ghost" onClick={savePdf}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12" />
          <path d="m7 11 5 5 5-5" />
          <path d="M4 20h16" />
        </svg>
        حفظ PDF
      </button>

      {hint && <span className="liza-hint">{hint}</span>}
    </div>
  );
}
