// فحص عقد الـ API الذي يعتمد عليه التطبيق، بنفس المسارات والترويسات.
const BASE = "https://zadfarm.net/api/v1";
const say = (label, ok, extra = "") =>
  console.log(`${ok ? "✔" : "✘"} ${label}${extra ? " — " + extra : ""}`);

const login = await fetch(`${BASE}/auth/login/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "owner", password: process.argv[2] }),
});
const session = await login.json();
say("الدخول", login.ok, session?.user?.full_name);

const h = { Authorization: `Bearer ${session.access}`, "X-Farm": session.farms[0].slug };

for (const [label, path] of [
  ["الجلسة والسمة", "/auth/me/"],
  ["الرئيسية", "/reports/dashboard/?period=month"],
  ["القطيع", "/animals/?page_size=60&is_on_farm=true"],
  ["القوائم", "/catalog/?page_size=300"],
  ["التنبيهات", "/alerts/"],
  ["الصناديق", "/accounts/pickable/"],
]) {
  const response = await fetch(BASE + path, { headers: h });
  const body = await response.json();
  const size = body?.count ?? body?.data?.alerts?.length ?? body?.data?.length ?? "—";
  say(label, response.ok, `${response.status} · ${size}`);
}

const me = await (await fetch(`${BASE}/auth/me/`, { headers: h })).json();
console.log("   السمة:", me.theme.colors.primary, "·", me.theme.typography.font_family);
