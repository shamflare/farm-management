// يفحص كل مسار يعتمد عليه التطبيق، بنفس الترويسات التي يرسلها.
//
//   node scripts/smoke.mjs <كلمة مرور owner>
//
// الغرض: أن ينكشف مسار خاطئ هنا، لا بعد بناء APK وتثبيته على الجوال.
const BASE = process.env.ZAD_API ?? "https://zadfarm.net/api/v1";
const password = process.argv[2];

if (!password) {
  console.error("مطلوب: node scripts/smoke.mjs <كلمة المرور>");
  process.exit(1);
}

let failures = 0;
const say = (ok, label, extra = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "✔" : "✘"} ${label}${extra ? " — " + extra : ""}`);
};

const login = await fetch(`${BASE}/auth/login/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "owner", password }),
});
const session = await login.json();
say(login.ok, "الدخول", session?.user?.full_name);
if (!login.ok) process.exit(1);

const headers = {
  Authorization: `Bearer ${session.access}`,
  "X-Farm": session.farms[0].slug,
};

/** كل شاشة والمسارات التي تناديها. */
const SCREENS = [
  ["الجذر · الجلسة", "/auth/me/"],
  ["الرئيسية · الأرقام", "/reports/dashboard/?period=month"],
  ["الرئيسية · التنبيهات", "/alerts/"],
  ["القطيع · القائمة", "/animals/?page_size=60&is_on_farm=true"],
  ["القطيع · القوائم", "/catalog/?page_size=400"],
  ["حيوان جديد · الرقم المقترح", "/animals/next-tag/"],
  ["التسجيل · الصناديق", "/accounts/pickable/"],
  ["المال · القيود", "/entries/?page_size=40"],
  ["الأشخاص", "/parties/?page_size=100"],
  ["الحليب · التسجيلات", "/milk/?page_size=40&ordering=-happened_on"],
  ["الحليب · التقرير", "/reports/milk/?period=month"],
  ["الأعلاف · الأرصدة", "/stock-balance/"],
  ["الأعلاف · المستودعات", "/stores/?page_size=50"],
  ["الأعلاف · الحركات", "/stock-movements/?page_size=40&ordering=-happened_on"],
  ["المشتريات", "/purchases/?page_size=40&ordering=-happened_on"],
  ["المبيعات", "/sales/?page_size=40&ordering=-happened_on"],
  ["التأسيسية · البنود", "/founding-costs/?page_size=60&ordering=-happened_on"],
  ["التأسيسية · الملخص", "/reports/founding-costs/"],
  ["التقارير · الفروع", "/reports/branches/?period=month"],
  ["التقارير · الأرباح", "/reports/profit-loss/?period=month"],
  ["التقارير · الميزان", "/reports/trial-balance/"],
  ["التقارير · النقد", "/reports/cash-flow/?period=month"],
  ["التقارير · القطيع", "/reports/animals/"],
  ["سجل التدقيق", "/audit/?page_size=50"],
  ["الإعدادات · المستخدمون", "/members/?page_size=60"],
  ["الإعدادات · أنواع القوائم", "/catalog-types/?page_size=60"],
];

for (const [label, path] of SCREENS) {
  try {
    const response = await fetch(BASE + path, { headers });
    const body = await response.json().catch(() => null);
    const size =
      body?.count ?? body?.data?.alerts?.length ?? body?.data?.stores?.length ?? "—";
    say(response.ok, label, `${response.status} · ${size}`);
  } catch (error) {
    say(false, label, String(error));
  }
}

console.log(
  failures ? `\n✘ ${failures} مسار يحتاج مراجعة` : "\n✔ كل مسارات التطبيق تعمل"
);
process.exit(failures ? 1 : 0);
