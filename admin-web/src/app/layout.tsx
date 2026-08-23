import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "إدارة المزرعة",
  description: "نظام إدارة مزرعة: الحيوانات، المالية، الشركاء والتقارير",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* الخط الافتراضي وحده يُحمَّل هنا ليُرسم أول إطار بلا انتظار. أي خط
            آخر تختاره المزرعة يُحقَن وقت تطبيق السمة — انظر lib/fonts.ts */}
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
