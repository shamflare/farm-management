import type { Metadata, Viewport } from "next";
import Link from "next/link";
import AddToPhone from "./AddToPhone";
import PrintActions from "./PrintActions";
import { PAGE_URL, QrCode } from "./qr";
import "./liza.css";

/** لون شريط النظام حين تُفتح كتطبيق على الجوال. */
export const viewport: Viewport = { themeColor: "#15803d" };

export const metadata: Metadata = {
  title: "النظام الغذائي — د. ليزا حسن عبدالله",
  description: "نظام غذائي لمرضى السكري: الممنوعات، النشويات، البروتينات، الفواكه والألبان",
  // يجعل الصفحة قابلة للوضع على شاشة الجوال كتطبيق مستقل
  manifest: "/liza.webmanifest",
  appleWebApp: { capable: true, title: "النظام الغذائي", statusBarStyle: "default" },
  icons: { apple: "/liza-192.png" },
};

/**
 * ورقة النظام الغذائي.
 *
 * صفحة عامة خارج لوحة المزرعة: لا دخول ولا قائمة جانبية — تُفتح من رابط
 * يُرسل للمريض فيقرؤها أو يطبعها.
 *
 * التقسيم على الشاشة بالألوان: أحمر لما يُمنع، أخضر لما يُسمح، وكهرماني لما
 * يُسمح بمقدار. وعند الطباعة تذهب الألوان كلها ويبقى إطار أسود على أبيض —
 * ورقة تُعطى لمريض تُطبع على طابعة بيت، والحبر الملوّن يُستهلك في يوم.
 */

type Item = { name: string; amount?: string };

type Section = {
  key: string;
  title: string;
  icon: string;
  tone: "no" | "yes" | "limit";
  lead?: string;
  items: Item[];
  note?: string;
};

const SECTIONS: Section[] = [
  {
    key: "forbidden",
    title: "ممنوعات",
    icon: "⛔",
    tone: "no",
    lead: "تُمنع تمامًا",
    items: [
      { name: "السكر" },
      { name: "الشوكولا" },
      { name: "العسل" },
      { name: "العصائر الطبيعية والصناعية" },
      { name: "السكاكر" },
      { name: "البسكويت" },
      { name: "المعلّبات" },
      { name: "الكولا" },
      { name: "الحلويات" },
    ],
  },
  {
    key: "starch",
    title: "النشويات",
    icon: "🍚",
    tone: "limit",
    lead: "نوع واحد فقط في اليوم",
    items: [
      { name: "الرز", amount: "٦ ملاعق بالوجبة" },
      { name: "البرغل", amount: "٨ ملاعق بالوجبة" },
      { name: "المعكرونة", amount: "٦ ملاعق بالوجبة" },
    ],
    note: "يُختار صنف واحد منها في اليوم، لا أكثر.",
  },
  {
    key: "bread",
    title: "الخبز",
    icon: "🍞",
    tone: "limit",
    items: [
      { name: "الخبز الأسمر — وهو المفضّل", amount: "نصف رغيف صغير بالوجبة" },
      { name: "الخبز الأبيض", amount: "نصف رغيف بالوجبة" },
    ],
  },
  {
    key: "dates",
    title: "التمر",
    icon: "🌴",
    tone: "limit",
    items: [{ name: "التمر", amount: "ثلاث حبّات في اليوم" }],
  },
  {
    key: "protein",
    title: "اللحوم والبروتينات",
    icon: "🥩",
    tone: "yes",
    lead: "مسموحة",
    items: [
      { name: "اللحوم بأنواعها", amount: "مسموحة" },
      { name: "السمك والتونة والسردين", amount: "مسموحة — مع التخفيف من الزيت" },
      { name: "البقوليات", amount: "مسموحة" },
    ],
  },
  {
    key: "veg",
    title: "الخضار",
    icon: "🥬",
    tone: "yes",
    items: [{ name: "الخضار بأنواعها", amount: "مسموحة" }],
  },
  {
    key: "nuts",
    title: "المكسّرات",
    icon: "🥜",
    tone: "yes",
    items: [{ name: "المكسّرات بأنواعها", amount: "مسموحة" }],
    note: "يُفضَّل البقان (البيكان).",
  },
  {
    key: "fruit",
    title: "الفواكه",
    icon: "🍎",
    tone: "limit",
    lead: "حبّتان في اليوم",
    items: [{ name: "الفواكه الطازجة", amount: "حبّتان في اليوم — بين الوجبات" }],
    note: "يُقلَّل قدر الإمكان من: الفواكه المجفّفة، التين، العنب، البطيخ.",
  },
  {
    key: "dairy",
    title: "الألبان والأجبان",
    icon: "🥛",
    tone: "limit",
    lead: "مسموحة قليلة الدسم",
    items: [{ name: "اللبن والجبنة قليلة الدسم", amount: "نصف شبع في اليوم" }],
  },
  {
    key: "cooking",
    title: "طريقة الطهي",
    icon: "🔥",
    tone: "yes",
    items: [
      { name: "المشوي", amount: "مفضّل" },
      { name: "المطبوخ", amount: "مفضّل" },
      { name: "المقالي", amount: "تُتجنَّب" },
    ],
  },
];

const TONE_LABEL: Record<Section["tone"], string> = {
  no: "ممنوع",
  yes: "مسموح",
  limit: "بمقدار",
};

export default function LizaPage() {
  return (
    <div className="liza" dir="rtl">
      <header className="liza-head">
        <div className="liza-head-text">
          <p className="liza-eyebrow">عيادة الغدد الصمّاء والسكري</p>
          <h1>النظام الغذائي</h1>
          <p className="liza-sub">
            إرشادات غذائية لمرضى السكري — تُتبع يوميًا، ويُراجَع الطبيب عند أي تغيّر.
          </p>
        </div>
        <div className="liza-head-actions">
          <PrintActions />
          <AddToPhone />
        </div>
      </header>

      <main className="liza-grid">
        {SECTIONS.map((section) => (
          <section key={section.key} className={`liza-card tone-${section.tone}`}>
            <div className="liza-card-head">
              <span className="liza-icon" aria-hidden>
                {section.icon}
              </span>
              <h2>{section.title}</h2>
              <span className="liza-tag">{TONE_LABEL[section.tone]}</span>
            </div>

            {section.lead && <p className="liza-lead">{section.lead}</p>}

            <ul className="liza-items">
              {section.items.map((item) => (
                <li key={item.name}>
                  <span className="liza-item-name">{item.name}</span>
                  {item.amount && <span className="liza-item-amount">{item.amount}</span>}
                </li>
              ))}
            </ul>

            {section.note && <p className="liza-note">{section.note}</p>}
          </section>
        ))}
      </main>

      {/* الرمز في الورقة نفسها: من يطبعها يجد فيها طريق العودة إليها، ومن
          يقرؤها على الشاشة يشاركها بتصوير مربّع واحد. */}
      <section className="liza-qr-card">
        <div className="liza-qr-text">
          <h2>احملها معك</h2>
          <p>
            وجّه كاميرا جوالك إلى الرمز لتفتح هذه الورقة في جوالك، أو
            <Link href="/liza/qr"> اطبع ملصق الرمز</Link> لتعليقه في العيادة.
          </p>
          <p className="liza-qr-url" dir="ltr">
            {PAGE_URL}
          </p>
        </div>
        <QrCode size={150} />
      </section>

      <footer className="liza-foot">
        <div className="liza-signature">
          <p className="liza-doctor">الدكتورة ليزا حسن عبدالله</p>
          <p className="liza-title">أخصائية الغدد الصمّاء والسكري والاستقلاب</p>
          {/* الرقم رابط يُتصل به من الجوال، ونصّ عادي حين يُطبع على ورق */}
          <p className="liza-phone">
            <a href="tel:+963998362652" dir="ltr">
              +963 998 362 652
            </a>
          </p>
        </div>
        <p className="liza-foot-note">
          هذه الورقة إرشادية وتُكمّل تعليمات الطبيب ولا تحلّ محلّها. أي دواء أو جرعة
          تبقى بوصفة.
        </p>
      </footer>
    </div>
  );
}
