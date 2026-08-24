"use client";

import { useEffect, useState } from "react";

/**
 * وضع الورقة على شاشة الجوال.
 *
 * المتصفحات لا تسمح لصفحة أن تُثبّت نفسها على جهاز أحد بلا موافقته — وهذا
 * حاجز مقصود لا نقص. أقصى ما تملكه الصفحة أن تطلب، فيظهر سؤال النظام بضغطة
 * واحدة. لذلك:
 *
 * - أندرويد: زر واحد يفتح سؤال النظام «إضافة إلى الشاشة الرئيسية».
 * - آيفون: لا يسمح Safari بالطلب أصلًا، فتُعرض الخطوتان بالكلمات.
 * - إن كانت مثبّتة أصلًا: لا يُعرض شيء — زر يطلب ما هو حاصل ضجيج.
 */

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function AddToPhone() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setInstalled(!!standalone);

    const ua = window.navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!prompt && !isIos) return null;

  return (
    <div className="liza-install no-print">
      {prompt ? (
        <button
          type="button"
          className="liza-btn"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M12 8v6" />
            <path d="m9 11 3 3 3-3" />
          </svg>
          أضف الورقة إلى شاشة جوالك
        </button>
      ) : (
        <>
          <button
            type="button"
            className="liza-btn liza-btn-ghost"
            onClick={() => setShowIosSteps((open) => !open)}
          >
            أضف الورقة إلى شاشة جوالك
          </button>
          {showIosSteps && (
            <p className="liza-install-steps">
              في آيفون: اضغط زر المشاركة <strong>⬆︎</strong> في أسفل Safari، ثم اختر{" "}
              <strong>«إضافة إلى الشاشة الرئيسية»</strong>.
            </p>
          )}
        </>
      )}
    </div>
  );
}
