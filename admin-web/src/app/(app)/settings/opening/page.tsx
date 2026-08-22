"use client";

import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";

type Account = { id: string; code: string; display_name: string; type: string; is_cash: boolean };
type Party = { id: string; name: string; kind: string };
type Page<T> = { count: number; results: T[] };
type Row = { account: string; amount: string; memo: string };
type PartnerRow = { party: string; amount: string };

const today = () => new Date().toISOString().slice(0, 10);

/**
 * What the farm already owned and owed on the day it started using the system.
 *
 * Almost no farm starts from zero. Without this screen the first month reads as
 * if the flock appeared out of nowhere, and every balance after it is wrong by
 * the same amount. The difference between what is owned and what is owed
 * becomes the partners' capital, which is why the two sides never have to
 * match by hand.
 */
export default function OpeningBalancesPage() {
  const { can, currency } = useApp();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [partners, setPartners] = useState<Party[]>([]);
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("الرصيد الافتتاحي");
  const [assets, setAssets] = useState<Row[]>([{ account: "", amount: "", memo: "" }]);
  const [liabilities, setLiabilities] = useState<Row[]>([]);
  const [capital, setCapital] = useState<PartnerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    api
      .get<Page<Account>>("/accounts/?page_size=200&is_active=true")
      .then((res) => setAccounts(res.results))
      .catch((err) => setError(err.message));
    api
      .get<Page<Party>>("/parties/?kind=partner&page_size=100")
      .then((res) => setPartners(res.results))
      .catch(() => {});
  }, []);

  const assetAccounts = accounts.filter((a) => a.type === "asset");
  const liabilityAccounts = accounts.filter((a) => a.type === "liability");

  const totalAssets = assets.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalLiabilities = liabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalCapital = capital.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const equity = totalAssets - totalLiabilities;
  const unassigned = equity - totalCapital;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/ops/opening-balances/", {
        date,
        memo,
        assets: assets.filter((row) => row.account && Number(row.amount) > 0),
        liabilities: liabilities.filter((row) => row.account && Number(row.amount) > 0),
        partner_capital: capital.filter((row) => row.party && Number(row.amount) > 0),
      });
      setDone("تم تسجيل الرصيد الافتتاحي كقيد متوازن واحد");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!can("settings.edit")) {
    return <div className="alert alert-error">هذه الشاشة تحتاج صلاحية تعديل الإعدادات</div>;
  }

  return (
    <form onSubmit={submit}>
      <div className="page-head">
        <div>
          <h1 className="page-title">الرصيد الافتتاحي</h1>
          <p className="page-sub">
            ما تملكه المزرعة وما عليها يوم بدأت استخدام النظام · يُسجَّل قيدًا واحدًا متوازنًا
          </p>
        </div>
        <button className="btn" disabled={busy}>{busy ? "جارٍ الترحيل…" : "ترحيل الرصيد الافتتاحي"}</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {done && <div className="alert alert-ok">{done}</div>}

      <div className="alert alert-ok" style={{ marginBottom: 16 }}>
        يُرحَّل مرة واحدة عند بدء الاستخدام. الفرق بين الأصول والالتزامات
        ({money(equity, currency)}) هو حقوق الملكية، وما لا تنسبه لشريك
        ({money(unassigned, currency)}) يُسجَّل في حساب «رصيد افتتاحي».
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <div className="field">
            <label>تاريخ بدء الاستخدام</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ flex: "3 1 300px" }}>
            <label>البيان</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <RowEditor
          title="ما تملكه المزرعة"
          hint="نقد في الصندوق، قيمة الحيوانات، أعلاف موجودة، مباني ومعدات"
          accounts={assetAccounts}
          rows={assets}
          setRows={setAssets}
          total={totalAssets}
          currency={currency}
        />
        <RowEditor
          title="ما على المزرعة"
          hint="ديون للموردين، مستحقات العاملين، قروض"
          accounts={liabilityAccounts}
          rows={liabilities}
          setRows={setLiabilities}
          total={totalLiabilities}
          currency={currency}
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <span>رأس مال الشركاء</span>
          <span className="num">{money(totalCapital, currency)}</span>
        </div>
        {partners.length === 0 && (
          <div className="empty">لا يوجد شركاء مسجلون — أضفهم من شاشة الأشخاص والحسابات</div>
        )}
        {capital.map((row, index) => (
          <div className="row" key={index} style={{ marginBottom: 8 }}>
            <div className="field" style={{ margin: 0, flex: "2 1 240px" }}>
              <label>الشريك</label>
              <select
                value={row.party}
                onChange={(e) => {
                  const next = [...capital];
                  next[index] = { ...row, party: e.target.value };
                  setCapital(next);
                }}
              >
                <option value="">اختر…</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>{partner.name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>حصته من رأس المال</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={row.amount}
                onChange={(e) => {
                  const next = [...capital];
                  next[index] = { ...row, amount: e.target.value };
                  setCapital(next);
                }}
              />
            </div>
            <div style={{ alignSelf: "end" }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCapital(capital.filter((_, i) => i !== index))}
              >
                حذف
              </button>
            </div>
          </div>
        ))}
        {partners.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setCapital([...capital, { party: "", amount: "" }])}
          >
            + شريك
          </button>
        )}
      </div>
    </form>
  );
}

function RowEditor({
  title,
  hint,
  accounts,
  rows,
  setRows,
  total,
  currency,
}: {
  title: string;
  hint: string;
  accounts: Account[];
  rows: Row[];
  setRows: (rows: Row[]) => void;
  total: number;
  currency: string;
}) {
  function update(index: number, patch: Partial<Row>) {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    setRows(next);
  }

  return (
    <div className="card">
      <div className="card-title">
        <span>{title}</span>
        <span className="num">{money(total, currency)}</span>
      </div>
      <p className="page-sub" style={{ marginBottom: 12 }}>{hint}</p>

      {rows.map((row, index) => (
        <div className="row" key={index} style={{ marginBottom: 8 }}>
          <div className="field" style={{ margin: 0, flex: "2 1 200px" }}>
            <label>الحساب</label>
            <select value={row.account} onChange={(e) => update(index, { account: e.target.value })}>
              <option value="">اختر…</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} · {account.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>المبلغ</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={row.amount}
              onChange={(e) => update(index, { amount: e.target.value })}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>بيان</label>
            <input value={row.memo} onChange={(e) => update(index, { memo: e.target.value })} />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              حذف
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setRows([...rows, { account: "", amount: "", memo: "" }])}
      >
        + سطر
      </button>
    </div>
  );
}
