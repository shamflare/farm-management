"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

type Props = {
  title: string;
  /** ما الذي سيحدث، بجملة واحدة واضحة. */
  message: string;
  /** كل ما يذهب معه. يُعرض قبل الزر لا بعده. */
  consequences?: string[];
  /** العمليات الحساسة تسأل كلمة المرور من جديد؛ العادية لا. */
  requirePassword?: boolean;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (password: string) => void;
};

/**
 * آخر ما يفصل بين الضغطة وشيء لا يُسترجع.
 *
 * يذكر ما سيُفقد قبل أن يعرض الزر، وفي كل ما هو حساس يطلب كلمة المرور من
 * جديد — فمتصفّح تُرك مفتوحًا على مكتب ليس دليلًا على من يقف أمامه.
 */
export default function ConfirmDialog({
  title,
  message,
  consequences = [],
  requirePassword = false,
  confirmLabel = "تأكيد",
  busy = false,
  error = "",
  onCancel,
  onConfirm,
}: Props) {
  const [password, setPassword] = useState("");
  const firstField = useRef<HTMLInputElement | HTMLButtonElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (requirePassword && !password) return;
    onConfirm(password);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={title}>
        <div className="inline" style={{ alignItems: "flex-start", gap: "var(--s3)" }}>
          <div className="stat-icon tone-danger" style={{ width: 34, height: 34 }}>
            <Icon name="warning" size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title">{title}</div>
            <p className="modal-message">{message}</p>
          </div>
        </div>

        {consequences.length > 0 && (
          <div className="alert alert-error">
            <Icon name="trash" />
            <span>
              <div className="strong" style={{ marginBottom: 4 }}>
                سيُحذف معه أيضًا:
              </div>
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {consequences.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </span>
          </div>
        )}

        {requirePassword && (
          <div className="field">
            <label>اكتب كلمة مرورك للتأكيد</label>
            <input
              ref={firstField as React.RefObject<HTMLInputElement>}
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <Icon name="warning" />
            <span>{error}</span>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            تراجع
          </button>
          <button
            ref={!requirePassword ? (firstField as React.RefObject<HTMLButtonElement>) : undefined}
            type="submit"
            className="btn btn-danger"
            disabled={busy || (requirePassword && !password)}
          >
            {busy ? <span className="spinner" /> : <Icon name="trash" />}
            {busy ? "جارٍ التنفيذ…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
