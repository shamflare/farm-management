"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  title: string;
  /** What is about to happen, in one plain sentence. */
  message: string;
  /** Everything else that goes with it. Shown before the button, never after. */
  consequences?: string[];
  /** Sensitive actions ask for the password again; ordinary ones do not. */
  requirePassword?: boolean;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (password: string) => void;
};

/**
 * The last thing between a click and something irreversible.
 *
 * It states what will be lost before it offers the button, and for anything
 * sensitive it asks for the password again — a browser left open on a desk is
 * not proof of who is standing in front of it.
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
        <div className="modal-title">{title}</div>
        <p className="modal-message">{message}</p>

        {consequences.length > 0 && (
          <div className="alert alert-error" style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>سيُحذف معه أيضًا:</div>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {consequences.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
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

        {error && <div className="alert alert-error">{error}</div>}

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
            {busy ? "جارٍ التنفيذ…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
