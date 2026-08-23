import type { NextConfig } from "next";

// The browser is what calls the API, so its address has to be baked into the
// bundle at build time. Render can hand over the API service's hostname but not
// a full URL, so we assemble one here.
//
// The hostname it hands over is the internal one — a bare label like
// `farm-api-n9z9`, which resolves only inside Render's private network and not
// in a visitor's browser. The public address is that same label under
// onrender.com, so a hostname with no dot in it gets the domain appended.
const API_HOST = process.env.API_HOST;
const publicHost = API_HOST?.includes(".") ? API_HOST : API_HOST && `${API_HOST}.onrender.com`;

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  (publicHost ? `https://${publicHost}/api/v1` : "http://127.0.0.1:8000/api/v1");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
  // نشر بالحاويات: البناء يُخرج خادمًا مستقلًا مع ما يلزمه فقط، فتصير صورة
  // التشغيل عشرات الميغابايت بدل مئاتها، ولا تحتاج node_modules معها.
  //
  // ولا يُفعَّل إلا داخل البناء للحاوية: `next start` لا يعمل مع هذا الوضع،
  // وهو ما يشغّل به المستخدم لوحته على جهازه (`npm run serve`).
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
