"use client";

/**
 * قطع الواجهة المشتركة.
 *
 * كل شاشة كانت تكتب ترويستها وحالة الفراغ وشريط الفلاتر بيدها، فاختلفت
 * المسافات والألوان من صفحة لأخرى. هذه القطع تكتبها مرة واحدة: الترويسة
 * ترويسة واحدة، والجدول الفارغ يقول الشيء نفسه في كل مكان، وتغيير أي
 * تفصيل فيها يسري على النظام كله.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Icon, { IconName } from "@/components/Icon";

/* --- ترويسة الصفحة ---------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  farm,
  children,
}: {
  title: string;
  subtitle?: string;
  /** يظهر بجانب العنوان في الورقة المطبوعة وحدها. */
  farm?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title" data-farm={farm}>
          {title}
        </h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

/* --- بطاقة رقم -------------------------------------------------------- */

export type Tone = "success" | "danger" | "warning" | "info" | "accent";

export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
  valueTone,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: IconName;
  /** لون الأيقونة. */
  tone?: Tone;
  /** لون الرقم نفسه — للربح والخسارة. */
  valueTone?: "positive" | "negative";
  /**
   * الشاشة التي يأتي منها هذا الرقم.
   *
   * الرقم على لوحة المعلومات نهاية سؤال وبداية آخر: «النقد ٩٠٤٥» يُتبع دائمًا
   * بـ «من أين؟». الوصلة تختصر الطريق إلى الجواب بدل البحث عنه في القائمة.
   */
  href?: string;
}) {
  const body = (
    <>
      <div className="stat-head">
        <div className="stat-label">{label}</div>
        {icon && (
          <div className={`stat-icon${tone ? ` tone-${tone}` : ""}`}>
            <Icon name={icon} />
          </div>
        )}
      </div>
      <div className={`stat-value num ${valueTone ?? ""}`}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="stat stat-link">
        {body}
      </Link>
    );
  }
  return <div className="stat">{body}</div>;
}

/* --- الرسائل ---------------------------------------------------------- */

export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      <Icon name="warning" />
      <span>{message}</span>
    </div>
  );
}

/**
 * تأكيد الحفظ.
 *
 * كان يُرسم في أعلى الصفحة، والنموذج غالبًا في أسفلها: تحفظ، فتظهر الرسالة
 * حيث لا تنظر، فتحفظ مرة ثانية ظنًّا أن شيئًا لم يحدث. صار يطفو فوق الشاشة
 * قرب اليد ويختفي وحده بعد أربع ثوانٍ — ما يُقال بعد الفعل لا يحتاج أن يبقى.
 *
 * كل الشاشات تستعمله أصلًا، فتغييره هنا غيّرها كلها بلا لمسها.
 */
export function SuccessNote({ message }: { message?: string }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!message) return;
    setShown(true);
    const timer = setTimeout(() => setShown(false), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message || !shown) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon name="check" />
      <span>{message}</span>
    </div>
  );
}

export function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="alert alert-info">
      <Icon name="info" />
      <span>{children}</span>
    </div>
  );
}

/* --- الفراغ والانتظار -------------------------------------------------- */

export function EmptyState({
  icon = "inbox",
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} />
      <div className="empty-state-title">{title}</div>
      {text && <div className="empty-state-text">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** صف واحد داخل جدول يحمل حالة فراغ أو تحميل بدل شبكة فارغة. */
export function TableMessage({
  colSpan,
  loading,
  empty,
  emptyTitle = "لا توجد نتائج",
  emptyText,
}: {
  colSpan: number;
  loading?: boolean;
  empty?: boolean;
  emptyTitle?: string;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <tr>
        <td colSpan={colSpan} style={{ padding: 0 }}>
          <TableSkeleton rows={4} />
        </td>
      </tr>
    );
  }
  if (!empty) return null;
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <EmptyState title={emptyTitle} text={emptyText} />
      </td>
    </tr>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" style={{ padding: "var(--s4)" }}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="skeleton"
          style={{ width: `${92 - index * 7}%` }}
        />
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-4">
      {Array.from({ length: count }).map((_, index) => (
        <div className="stat" key={index}>
          <div className="skeleton" style={{ width: "55%", height: 11 }} />
          <div className="skeleton mt-4" style={{ width: "75%", height: 24 }} />
        </div>
      ))}
    </div>
  );
}

export function Loading({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="empty inline" style={{ justifyContent: "center" }}>
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

/* --- الأزرار المتكرّرة ------------------------------------------------- */

export function Button({
  icon,
  children,
  variant = "primary",
  size,
  busy,
  className = "",
  ...rest
}: {
  icon?: IconName;
  variant?: "primary" | "ghost" | "subtle" | "danger" | "danger-ghost";
  size?: "sm";
  busy?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variantClass = variant === "primary" ? "" : ` btn-${variant}`;
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`btn${variantClass}${size === "sm" ? " btn-sm" : ""} ${className}`.trim()}
    >
      {busy ? <span className="spinner" /> : icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/** زر التصدير — يتكرّر في كل جدول ولا يستحق أن يُكتب في كل صفحة. */
export function ExportButton({
  onClick,
  label = "تصدير CSV",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      icon="download"
      onClick={onClick}
      className="no-print"
    >
      {label}
    </Button>
  );
}

export function PrintButton({ label = "طباعة" }: { label?: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      icon="printer"
      onClick={() => window.print()}
      className="no-print"
    >
      {label}
    </Button>
  );
}

/* --- الفلاتر ---------------------------------------------------------- */

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="toolbar no-print">{children}</div>;
}

export function SearchField({
  value,
  onChange,
  label = "بحث",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <div className="field field-search">
      <label>{label}</label>
      <div className="search">
        <Icon name="search" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

/* --- التبويبات -------------------------------------------------------- */

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { key: T; label: string; icon?: IconName }[];
}) {
  return (
    <div className="tabs no-print" role="tablist">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={value === option.key}
          className={`tab ${value === option.key ? "active" : ""}`}
          onClick={() => onChange(option.key)}
        >
          {option.icon && <Icon name={option.icon} size={15} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* --- الشارات ---------------------------------------------------------- */

export function Badge({
  children,
  tone,
  dot,
}: {
  children: React.ReactNode;
  tone?: Tone | "muted";
  dot?: boolean;
}) {
  return (
    <span
      className={`badge${tone ? ` badge-${tone}` : ""}${dot ? " badge-dot" : ""}`}
    >
      {children}
    </span>
  );
}

/* --- قائمة إجراءات الصف ------------------------------------------------ */

export type RowAction = {
  label: string;
  icon?: IconName;
  danger?: boolean;
  hidden?: boolean;
  title?: string;
  onClick: () => void;
};

/**
 * الإجراءات الثانوية للصف خلف زر واحد.
 *
 * صف فيه سبعة أزرار ظاهرة يجعل الجدول يُقرأ كأزرار لا كأرقام، ويدفع الأعمدة
 * المهمة خارج الشاشة. الإجراء الأول يبقى ظاهرًا لأنه الأكثر استعمالًا،
 * والبقية تُفتح عند الطلب.
 */
/**
 * قائمة إجراءات الصف.
 *
 * تُرسم خارج الجدول عمدًا. الجدول صندوق يتمرّر، وما يُرسم داخله يُقصّ عند
 * حافته: كانت القائمة تظهر ثلاثة خيارات من ستة، والبقية خلف الحدّ لا تُرى ولا
 * يُوصل إليها. فتُعلّق الآن على الصفحة نفسها بموضع محسوب من زرّها، وتنقلب إلى
 * أعلى إن لم يبقَ تحتها مكان.
 */
export function RowMenu({
  actions,
  label = "إجراءات",
}: {
  actions: RowAction[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{
    top: number;
    right: number;
    flip: boolean;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = actions.filter((action) => !action.hidden);

  const place = () => {
    const button = ref.current?.querySelector("button");
    if (!button) return;
    const box = button.getBoundingClientRect();
    const height = Math.min(visible.length * 42 + 16, 320);
    const below = window.innerHeight - box.bottom;
    const flip = below < height + 12;
    setSpot({
      top: flip ? box.top - height - 6 : box.bottom + 6,
      right: window.innerWidth - box.right,
      flip,
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target))
        return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    // التمرير يُبعد الزرّ عن قائمته المعلّقة، فتُغلق بدل أن تطفو في مكان خطأ.
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!visible.length) return null;

  const menu = spot && (
    <div
      ref={menuRef}
      className="menu row-menu"
      style={{
        position: "fixed",
        top: spot.top,
        right: spot.right,
        minWidth: 210,
      }}
    >
      {visible.map((action) => (
        <button
          key={action.label}
          className={`menu-item${action.danger ? " danger" : ""}`}
          title={action.title}
          onClick={() => {
            setOpen(false);
            action.onClick();
          }}
        >
          {action.icon && <Icon name={action.icon} size={16} />}
          {action.label}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="menu-anchor no-print"
      ref={ref}
      style={{ display: "inline-block" }}
    >
      <button
        className="icon-btn bordered"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        title={label}
      >
        <Icon name="settings" size={16} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(menu, document.body)}
    </div>
  );
}

/* --- بطاقة تحوي جدولًا ------------------------------------------------- */

export function TableCard({
  title,
  action,
  children,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card card-flush">
      <div className="card-title">
        <span>{title}</span>
        {action}
      </div>
      <div className="table-wrap">{children}</div>
    </div>
  );
}
