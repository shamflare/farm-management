"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import Icon from "@/components/Icon";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err?.status === 401 ? "اسم المستخدم أو كلمة المرور غير صحيحة" : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div style={{ textAlign: "center", marginBottom: "var(--s6)" }}>
          <div
            className="brand-mark"
            style={{ margin: "0 auto var(--s4)", width: 56, height: 56 }}
          >
            <Icon name="sheep" size={30} />
          </div>
          <h1 style={{ fontSize: "1.3rem" }}>نظام إدارة المزرعة</h1>
          <p className="page-sub" style={{ margin: "4px auto 0" }}>
            سجّل الدخول للمتابعة
          </p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="warning" />
            <span>{error}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="username">اسم المستخدم</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">كلمة المرور</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button className="btn btn-block mt-4" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="lock" />}
          {busy ? "جارٍ الدخول…" : "دخول"}
        </button>
      </form>
    </div>
  );
}
