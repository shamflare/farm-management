import type { Metadata } from "next";
import PrintActions from "../PrintActions";
import { PAGE_URL, QrCode } from "../qr";
import "../liza.css";
import "./poster.css";

export const metadata: Metadata = {
  title: "رمز النظام الغذائي — د. ليزا حسن عبدالله",
  description: "ملصق يُطبع ويُعلَّق: يوجّه المريض كاميرا جواله فتُفتح ورقة النظام الغذائي",
};

/**
 * الملصق الذي يُعلَّق على الحائط.
 *
 * ورقة واحدة تُطبع وتُلصق: رمز كبير في وسطها، وسطر يقول ما يُفعل به. المريض
 * يوجّه كاميرا جواله فتُفتح الورقة عنده كاملة، ويستطيع أن يضعها اختصارًا على
 * شاشته أو يطبعها لنفسه.
 *
 * ولماذا يقود الرمز إلى صفحة لا إلى ملف PDF: الملف يُنزَّل مرة ويتقادم في
 * جهاز المريض، والصفحة تُقرأ من مصدرها — فإن عدّلت الطبيبة نظامًا أو مقدارًا،
 * رأى المريض الجديد من الرمز نفسه المعلّق على الحائط منذ شهور.
 */
export default async function QrPosterPage() {
  return (
    <div className="liza poster" dir="rtl">
      <div className="poster-actions no-print">
        <PrintActions />
      </div>

      <div className="poster-sheet">
        <header className="poster-head">
          <p className="liza-eyebrow">عيادة الغدد الصمّاء والسكري</p>
          <h1>النظام الغذائي</h1>
          <p className="poster-lead">وجّه كاميرا جوالك إلى الرمز</p>
        </header>

        <div className="poster-qr">
          <QrCode size={340} />
        </div>

        <ol className="poster-steps">
          <li>افتح الكاميرا في جوالك ووجّهها إلى الرمز.</li>
          <li>اضغط الرابط الذي يظهر على الشاشة.</li>
          <li>تفتح ورقة النظام الغذائي كاملة — اقرأها أو اطبعها أو احفظها.</li>
        </ol>

        <p className="poster-url" dir="ltr">
          {PAGE_URL}
        </p>

        <footer className="poster-foot">
          <p className="liza-doctor">الدكتورة ليزا حسن عبدالله</p>
          <p className="liza-title">أخصائية الغدد الصمّاء والسكري والاستقلاب</p>
          <p className="poster-phone" dir="ltr">
            +963 998 362 652
          </p>
        </footer>
      </div>
    </div>
  );
}
