import QRCode from "qrcode";

/**
 * رمز الاستجابة السريعة، يُولَّد وقت البناء.
 *
 * الصفحة ثابتة والرابط لا يتغيّر، فالرمز يُرسم مرة واحدة ويُخبز في الصفحة
 * نفسها: لا نداء لخدمة خارجية ترسم الرموز (تعرف حينها من فتح ورقة طبيبك،
 * وتتوقّف يومًا فيتحوّل الرمز إلى مربّع فارغ على حائط عيادة)، ولا شيفرة
 * تُنزَّل إلى جهاز المريض ليرسمها بنفسه.
 *
 * `H` أعلى مستويات تصحيح الخطأ: الورقة تُلصق على حائط، فتُخدش وتنثني ويسقط
 * عليها ظلّ — والرمز يبقى مقروءًا وربعه تالف.
 */
export const PAGE_URL = "https://zadfarm.net/liza";

export async function qrSvg(url: string = PAGE_URL, size = 320) {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 1,
    width: size,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/** يرسم الرمز مباشرةً في الصفحة — بلا صورة تُحمَّل ولا شيفرة تُنفَّذ. */
export async function QrCode({ url = PAGE_URL, size = 320 }: { url?: string; size?: number }) {
  const svg = await qrSvg(url, size);
  return <span className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
