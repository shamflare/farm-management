"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, getCached, money } from "@/lib/api";
import { recall, recallFrom, remember } from "@/lib/recall";
import { useApp } from "@/components/AppShell";
import Icon, { IconName } from "@/components/Icon";

type Catalog = { id: string; code: string; display_name: string; type: string };
type Account = { id: string; display_name: string; is_cash: boolean };
type Party = { id: string; name: string; kind: string };
type Animal = { id: string; tag: string; name: string; branch_name: string };
type Page<T> = { count: number; results: T[] };

type Kind = "expense" | "income" | "milk" | "weight";

const TABS: { key: Kind; label: string; icon: IconName; permission: string }[] = [
  { key: "expense", label: "مصروف", icon: "arrowStart", permission: "finance.create" },
  { key: "income", label: "إيراد", icon: "arrowEnd", permission: "finance.create" },
  { key: "milk", label: "حليب اليوم", icon: "droplet", permission: "milk.create" },
  { key: "weight", label: "وزن", icon: "scale", permission: "animals.edit" },
];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * التسجيل السريع — من أي شاشة.
 *
 * أكثر ما يُكتب في اليوم أربعة أشياء: مصروف، إيراد، حليب، وزن. وكان كل واحد
 * منها يحتاج أن تذهب أولًا إلى شاشته: نقرة على القائمة، نقرة على القسم، ثم
 * تبدأ. هذه اللوحة تفتح فوق ما أنت فيه وتغلق بعد الحفظ، فيبقى العمل حيث هو.
 *
 * وكل قائمة فيها تُفتح على آخر ما اخترته: نفس الصندوق، نفس الفرع، نفس البند —
 * لأن المزرعة تكرّر نفسها، والنموذج الذي لا يتعلّم يسأل السؤال ذاته كل يوم.
 */
export default function QuickRecord({ onClose }: { onClose: () => void }) {
  const { can, currency } = useApp();
  const allowed = TABS.filter((tab) => can(tab.permission));
  const [kind, setKind] = useState<Kind>(allowed[0]?.key ?? "expense");

  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [parties, setParties] = useState<Party[]>([]);

  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [category, setCategory] = useState("");
  const [branch, setBranch] = useState("");
  const [payer, setPayer] = useState("");
  const [animalQuery, setAnimalQuery] = useState("");
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [animal, setAnimal] = useState<Animal | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const amountField = useRef<HTMLInputElement>(null);

  const branches = useMemo(
    () => catalog.filter((item) => item.type === "branch" && item.code !== "shared"),
    [catalog]
  );
  const categories = useMemo(
    () => catalog.filter((item) => item.type === (kind === "income" ? "revenue_category" : "expense_category")),
    [catalog, kind]
  );
  const cashAccounts = useMemo(() => accounts.filter((account) => account.is_cash), [accounts]);

  const payerOptions = useMemo(
    () => [
      ...cashAccounts.map((account) => ({
        value: `account:${account.id}`,
        label: kind === "income" ? `إلى ${account.display_name}` : `من ${account.display_name}`,
      })),
      ...(kind === "expense"
        ? parties
            .filter((party) => party.kind === "worker" || party.kind === "partner")
            .map((party) => ({ value: `party:${party.id}`, label: `${party.name} دفع من ماله` }))
        : []),
      ...(kind === "expense"
        ? parties
            .filter((party) => party.kind === "supplier")
            .map((party) => ({ value: `supplier:${party.id}`, label: `على حساب ${party.name} (آجل)` }))
        : []),
    ],
    [cashAccounts, parties, kind]
  );

  useEffect(() => {
    getCached<Page<Catalog>>("/catalog/?page_size=300", (data) => setCatalog(data.results)).catch(
      () => {}
    );
    getCached<{ data: Account[] }>("/accounts/pickable/", (data) => setAccounts(data.data)).catch(
      () => {}
    );
    getCached<Page<Party>>("/parties/?page_size=200", (data) => setParties(data.results)).catch(
      () => {}
    );
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    setTimeout(() => amountField.current?.focus(), 60);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // الاختيارات تُفتح على آخر ما استُعمل، ما دام لا يزال موجودًا في القوائم.
  useEffect(() => {
    setBranch((prev) => prev || recallFrom("branch", branches, branches[0]?.id ?? ""));
  }, [branches]);

  useEffect(() => {
    const options = payerOptions.map((option) => ({ id: option.value }));
    const field = kind === "income" ? "into" : "payer";
    setPayer(recallFrom(field, options, payerOptions[0]?.value ?? ""));
  }, [payerOptions, kind]);

  useEffect(() => {
    const field = kind === "income" ? "revenue_category" : "expense_category";
    setCategory(recallFrom(field, categories, ""));
  }, [categories, kind]);

  // البحث عن الحيوان يبدأ بعد حرفين: نداء لكل ضغطة زر ضجيج على الشبكة.
  useEffect(() => {
    if (kind !== "weight" || animalQuery.trim().length < 2) return;
    const timer = setTimeout(() => {
      api
        .get<Page<Animal>>(`/animals/?search=${encodeURIComponent(animalQuery)}&is_on_farm=true&page_size=8`)
        .then((data) => setAnimals(data.results))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [animalQuery, kind]);

  function reset() {
    setAmount("");
    setMemo("");
    setAnimal(null);
    setAnimalQuery("");
    setAnimals([]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setDone("");
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("اكتب رقمًا أكبر من صفر");
      return;
    }

    setBusy(true);
    try {
      if (kind === "milk") {
        await api.post("/ops/milk-production/", {
          date: today(),
          liters: value,
          branch: branch || null,
          notes: memo,
        });
        remember("branch", branch);
        setDone(`سُجّل ${value} لتر لليوم`);
      } else if (kind === "weight") {
        if (!animal) throw new Error("اختر الحيوان أولًا");
        await api.post("/weights/", {
          animal: animal.id,
          weight_kg: value,
          measured_on: today(),
          note: memo,
        });
        setDone(`سُجّل وزن ${value} كغ لـ ${animal.tag}`);
      } else {
        const [mode, id] = payer.split(":");
        const payload: any = {
          date: today(),
          amount: value,
          category: category || null,
          branch: branch || null,
          memo,
        };
        if (kind === "expense") {
          if (mode === "account") payload.from_account = id;
          if (mode === "party") payload.paid_by_party = id;
          if (mode === "supplier") payload.supplier = id;
        } else {
          if (mode === "account") payload.into_account = id;
        }
        const response = await api.post<{ needs_approval: boolean }>(
          kind === "expense" ? "/ops/expense/" : "/ops/income/",
          payload
        );
        remember("branch", branch);
        remember(kind === "income" ? "into" : "payer", payer);
        remember(kind === "income" ? "revenue_category" : "expense_category", category);
        setDone(
          response.needs_approval
            ? `سُجّل ${money(value, currency)} — بانتظار الموافقة`
            : `سُجّل ${money(value, currency)}`
        );
      }
      reset();
      setTimeout(() => amountField.current?.focus(), 40);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!allowed.length) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal quick" onSubmit={submit} role="dialog" aria-modal="true" aria-label="تسجيل سريع">
        <div className="inline" style={{ marginBottom: "var(--s4)" }}>
          <Icon name="plus" />
          <span className="strong" style={{ flex: 1 }}>
            تسجيل سريع
          </span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="tabs" role="tablist">
          {allowed.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={kind === tab.key}
              className={`tab ${kind === tab.key ? "active" : ""}`}
              onClick={() => {
                setKind(tab.key);
                setError("");
                setDone("");
              }}
            >
              <Icon name={tab.icon} size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        {kind === "weight" && (
          <div className="field">
            <label>الحيوان</label>
            {animal ? (
              <div className="inline">
                <span className="badge badge-success num">{animal.tag}</span>
                <span className="muted">{animal.name || animal.branch_name}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setAnimal(null);
                    setAnimalQuery("");
                  }}
                >
                  تغيير
                </button>
              </div>
            ) : (
              <>
                <input
                  value={animalQuery}
                  onChange={(e) => setAnimalQuery(e.target.value)}
                  placeholder="اكتب رقم الحيوان أو اسمه"
                  autoComplete="off"
                />
                {animals.length > 0 && (
                  <div className="quick-results">
                    {animals.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className="quick-result"
                        onClick={() => setAnimal(row)}
                      >
                        <span className="num strong">{row.tag}</span>
                        <span className="muted">{row.name || row.branch_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* المبلغ أولًا وأكبر: هو ما جاء المستخدم ليكتبه */}
        <div className="field">
          <label>
            {kind === "milk" ? "الكمية باللتر" : kind === "weight" ? "الوزن بالكيلوغرام" : `المبلغ (${currency})`}
          </label>
          <input
            ref={amountField}
            className="num quick-amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            required
          />
        </div>

        {(kind === "expense" || kind === "income") && (
          <div className="row">
            <div className="field">
              <label>البند</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">بلا بند</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{kind === "income" ? "إلى أين دخل؟" : "من دفع؟"}</label>
              <select value={payer} onChange={(e) => setPayer(e.target.value)} required>
                {payerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {kind !== "weight" && branches.length > 0 && (
          <div className="field">
            <label>الفرع</label>
            <select value={branch} onChange={(e) => setBranch(e.target.value)}>
              {kind !== "milk" && <option value="">المزرعة كلها</option>}
              {branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>ملاحظة</label>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="اختيارية" />
        </div>

        {!!error && (
          <div className="alert alert-error">
            <Icon name="warning" />
            <span>{error}</span>
          </div>
        )}
        {!!done && (
          <div className="alert alert-success">
            <Icon name="check" />
            <span>{done}</span>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إغلاق
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="check" />}
            {busy ? "جارٍ الحفظ…" : "حفظ ومتابعة"}
          </button>
        </div>
        <span className="stat-hint" style={{ textAlign: "center", display: "block" }}>
          يبقى مفتوحًا بعد الحفظ لتسجيل التالي · Esc للإغلاق
        </span>
      </form>
    </div>
  );
}
