"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Icon, { IconName } from "@/components/Icon";

type Animal = { id: string; tag: string; name: string; branch_name: string; status_name: string };
type Page<T> = { count: number; results: T[] };

export type Destination = { href: string; label: string; icon: IconName; permission?: string };

/**
 * الانتقال بالكتابة.
 *
 * القائمة الجانبية جيدة حين تعرف أين تذهب وتراه أمامك؛ لكن الوصول إلى حيوان
 * برقمه كان يعني: القطيع، ثم بحث، ثم نقر على الصف. هنا تكتب الرقم من أي مكان
 * فتفتحه مباشرة — وكذلك أسماء الأقسام لمن يفضّل الكتابة على البحث بالعين.
 *
 * Ctrl+K هو المفتاح المتعارف عليه لهذا في كل أداة يعرفها المستخدم.
 */
export default function CommandPalette({
  destinations,
  onClose,
}: {
  destinations: Destination[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement>(null);

  const needle = query.trim();
  const screens = destinations.filter((item) => !needle || item.label.includes(needle));
  const results = [
    ...screens.map((item) => ({ kind: "screen" as const, item })),
    ...animals.map((item) => ({ kind: "animal" as const, item })),
  ];

  useEffect(() => {
    field.current?.focus();
  }, []);

  useEffect(() => {
    if (needle.length < 2) {
      setAnimals([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<Page<Animal>>(`/animals/?search=${encodeURIComponent(needle)}&page_size=6`)
        .then((data) => setAnimals(data.results))
        .catch(() => setAnimals([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [needle]);

  useEffect(() => setActive(0), [query]);

  function go(index: number) {
    const row = results[index];
    if (!row) return;
    onClose();
    router.push(row.kind === "screen" ? row.item.href : `/animals/${row.item.id}`);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, results.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      go(active);
    }
    if (event.key === "Escape") onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="الانتقال السريع">
        <div className="palette-field">
          <Icon name="search" size={18} className="muted" />
          <input
            ref={field}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="اكتب رقم حيوان أو اسم قسم…"
            aria-label="ابحث"
          />
          <kbd>Esc</kbd>
        </div>

        <div className="palette-list">
          {results.length === 0 && (
            <div className="empty" style={{ padding: "var(--s5)" }}>
              {needle.length < 2 ? "اكتب حرفين على الأقل" : "لا نتائج"}
            </div>
          )}

          {results.map((row, index) => (
            <button
              key={row.kind === "screen" ? row.item.href : row.item.id}
              type="button"
              className={`palette-row ${index === active ? "active" : ""}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(index)}
            >
              {row.kind === "screen" ? (
                <>
                  <Icon name={row.item.icon} size={17} className="muted" />
                  <span style={{ flex: 1 }}>{row.item.label}</span>
                  <span className="stat-hint">قسم</span>
                </>
              ) : (
                <>
                  <Icon name="sheep" size={17} className="muted" />
                  <span className="num strong">{row.item.tag}</span>
                  <span className="muted" style={{ flex: 1 }}>
                    {row.item.name || row.item.branch_name}
                  </span>
                  <span className="stat-hint">{row.item.status_name}</span>
                </>
              )}
            </button>
          ))}
        </div>

        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> للتنقّل
          </span>
          <span>
            <kbd>Enter</kbd> للفتح
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>K</kbd> لفتح هذه النافذة
          </span>
        </div>
      </div>
    </div>
  );
}
