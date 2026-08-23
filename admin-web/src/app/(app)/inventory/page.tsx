"use client";

import { useEffect, useMemo, useState } from "react";
import { api, download, formatDate, formatNumber, money } from "@/lib/api";
import { useApp } from "@/components/AppShell";
import Icon from "@/components/Icon";
import {
  Button,
  ErrorNote,
  ExportButton,
  PageHeader,
  Stat,
  TableCard,
  TableMessage,
  Tabs,
} from "@/components/ui";

type Store = {
  id: string;
  display_name: string;
  branch: string | null;
  branch_name: string;
  branch_code: string;
  account_code: string;
  is_active: boolean;
};
type Item = {
  id: string;
  display_name: string;
  unit: string | null;
  unit_name: string;
  category: string | null;
  reorder_level: string;
};
type BalanceItem = {
  item_id: string;
  name: string;
  unit: string;
  quantity: string;
  value: string;
  average_cost: string;
  reorder_level: string;
  is_low: boolean;
};
type StoreBalance = { store: Store; total_value: string; items: BalanceItem[] };
type Movement = {
  id: string;
  store_name: string;
  branch_name: string;
  item_name: string;
  unit_name: string;
  kind: string;
  happened_on: string;
  quantity: string;
  unit_cost: string;
  total_cost: string;
  supplier_name: string;
  memo: string;
};
type Page<T> = { count: number; results: T[] };
type Account = { id: string; display_name: string; is_cash: boolean; type: string };
type Party = { id: string; name: string; kind: string };
type Catalog = { id: string; code: string; display_name: string; type: string };

const KIND_LABEL: Record<string, string> = {
  receipt: "استلام",
  issue: "صرف للحيوانات",
  transfer_in: "وارد تحويل",
  transfer_out: "صادر تحويل",
  waste: "هدر",
  count: "جرد",
};

/** لون الحركة يقول أثرها: الصرف مصروف، والاستلام أصل، والهدر خسارة. */
const MOVEMENT_TONE: Record<string, string> = {
  receipt: "badge-success",
  issue: "badge-info",
  transfer_in: "badge-muted",
  transfer_out: "badge-muted",
  waste: "badge-danger",
  count: "badge-warning",
};

const FORMS = [
  { key: "receive", label: "استلام علف", icon: "download", permission: "inventory.create" },
  { key: "issue", label: "صرف للحيوانات", icon: "sheep", permission: "inventory.create" },
  { key: "transfer", label: "تحويل بين المستودعين", icon: "swap", permission: "inventory.create" },
  { key: "count", label: "جرد", icon: "scale", permission: "inventory.edit" },
  { key: "waste", label: "هدر أو تلف", icon: "trash", permission: "inventory.edit" },
  { key: "setup", label: "الأصناف والمستودعات", icon: "settings", permission: "inventory.create" },
] as const;

const today = () => new Date().toISOString().slice(0, 10);

export default function InventoryPage() {
  const { can, currency, me } = useApp();
  const [balances, setBalances] = useState<StoreBalance[]>([]);
  const [totalValue, setTotalValue] = useState("0");
  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [storeFilter, setStoreFilter] = useState("");
  const [openForm, setOpenForm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      const [balance, storeRows, itemRows] = await Promise.all([
        api.get<{ data: { stores: StoreBalance[]; total_value: string } }>("/stock-balance/"),
        api.get<Page<Store>>("/stores/?page_size=100"),
        api.get<Page<Item>>("/inventory-items/?page_size=200"),
      ]);
      setBalances(balance.data.stores);
      setTotalValue(balance.data.total_value);
      setStores(storeRows.results);
      setItems(itemRows.results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMovements() {
    const params = new URLSearchParams({ page_size: "40", ordering: "-happened_on" });
    if (storeFilter) params.set("store", storeFilter);
    const data = await api.get<Page<Movement>>(`/stock-movements/?${params}`);
    setMovements(data.results);
  }

  useEffect(() => {
    loadAll();
    api
      .get<{ data: Account[] }>("/accounts/pickable/")
      .then((res) => setAccounts(res.data.filter((a) => a.is_cash)))
      .catch(() => {});
    api
      .get<Page<Party>>("/parties/?page_size=200")
      .then((res) => setParties(res.results))
      .catch(() => {});
    api
      .get<Page<Catalog>>("/catalog/?page_size=300")
      .then((res) => setCatalog(res.results))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMovements().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeFilter]);

  function refresh() {
    setOpenForm("");
    loadAll();
    loadMovements().catch(() => {});
  }

  const lowStock = useMemo(
    () => balances.flatMap((s) => s.items.filter((i) => i.is_low).map((i) => ({ ...i, store: s.store.display_name }))),
    [balances]
  );

  return (
    <>
      <PageHeader
        title="مستودعات الأعلاف"
        subtitle="مستودع لكل فرع · العلف أصل حتى يُصرف، وعندها يصير تكلفة على فرعه"
        farm={me?.farm?.name}
      >
        {can("reports.export") && (
          <ExportButton
            onClick={() => download("/export/stock/").catch((err) => setError(err.message))}
          />
        )}
      </PageHeader>

      <ErrorNote message={error} />

      <div className="grid grid-4 mb-4">
        <Stat
          label="قيمة المخزون كاملًا"
          value={money(totalValue, currency)}
          hint="أصل في الميزانية، لا مصروف"
          icon="wheat"
          tone="accent"
        />
        <Stat label="عدد المستودعات" value={balances.length} icon="box" />
        <Stat label="الأصناف المعرّفة" value={items.length} icon="list" />
        <Stat
          label="أصناف أوشكت على النفاد"
          value={lowStock.length}
          valueTone={lowStock.length ? "negative" : undefined}
          icon="warning"
          tone={lowStock.length ? "danger" : "success"}
          hint={lowStock.length ? "دون حد إعادة الطلب" : "كل الأصناف فوق حد الطلب"}
        />
      </div>

      <Tabs
        value={openForm}
        onChange={(key) => setOpenForm(openForm === key ? "" : key)}
        options={FORMS.filter((form) => can(form.permission))}
      />

      {openForm === "receive" && (
        <ReceiveForm
          stores={stores}
          items={items}
          accounts={accounts}
          suppliers={parties.filter((p) => p.kind === "supplier" || p.kind === "other")}
          onDone={refresh}
        />
      )}
      {openForm === "issue" && <IssueForm stores={stores} items={items} onDone={refresh} />}
      {openForm === "transfer" && <TransferForm stores={stores} items={items} onDone={refresh} />}
      {openForm === "count" && <CountForm stores={stores} items={items} onDone={refresh} />}
      {openForm === "waste" && <WasteForm stores={stores} items={items} onDone={refresh} />}
      {openForm === "setup" && (
        <SetupForms
          stores={stores}
          items={items}
          branches={catalog.filter((row) => row.type === "branch")}
          categories={catalog.filter((row) => row.type === "inventory_category")}
          units={catalog.filter((row) => row.type === "unit")}
          onDone={refresh}
        />
      )}

      {lowStock.length > 0 && (
        <div className="alert alert-warning">
          <Icon name="warning" />
          <span>
            <strong>أوشك على النفاد:</strong>{" "}
            {lowStock
              .map(
                (row) =>
                  `${row.name} في ${row.store} (${formatNumber(row.quantity, 2)} ${row.unit})`
              )
              .join("  ·  ")}
          </span>
        </div>
      )}

      <div className="grid grid-2">
        {balances.map((row) => (
          <TableCard
            key={row.store.id}
            title={
              <span className="inline">
                <Icon name="box" size={17} className="muted" />
                {row.store.display_name}
                {row.store.branch_name && (
                  <span className="badge badge-muted">{row.store.branch_name}</span>
                )}
              </span>
            }
            action={<span className="badge">{money(row.total_value, currency)}</span>}
          >
            <table>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الكمية</th>
                  <th>متوسط التكلفة</th>
                  <th>القيمة</th>
                </tr>
              </thead>
              <tbody>
                <TableMessage
                  colSpan={4}
                  loading={loading}
                  empty={row.items.length === 0}
                  emptyTitle="المستودع فارغ"
                  emptyText="سجّل استلام علف ليدخل المخزون كأصل."
                />
                {!loading &&
                  row.items.map((item) => (
                    <tr key={item.item_id}>
                      <td>
                        <span className="inline" style={{ gap: "var(--s2)" }}>
                          {item.name}
                          {item.is_low && <span className="badge badge-warning">منخفض</span>}
                        </span>
                      </td>
                      <td className="num">
                        {formatNumber(item.quantity, 2)} {item.unit}
                      </td>
                      <td className="num muted">{money(item.average_cost, currency)}</td>
                      <td className="num strong">{money(item.value, currency)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableCard>
        ))}
      </div>

      <div className="between mt-5 mb-4">
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          <Icon name="history" size={18} className="muted" />
          حركات المستودع
        </h2>
        <div className="field no-print" style={{ marginBottom: 0, width: 220 }}>
          <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
            <option value="">كل المستودعات</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الحركة</th>
              <th>المستودع</th>
              <th>الفرع</th>
              <th>الصنف</th>
              <th>الكمية</th>
              <th>سعر الوحدة</th>
              <th>القيمة</th>
              <th>البيان</th>
            </tr>
          </thead>
          <tbody>
            <TableMessage
              colSpan={9}
              empty={movements.length === 0}
              emptyTitle="لا توجد حركات"
              emptyText="الاستلام والصرف والتحويل والجرد — كل ما يدخل المستودع أو يخرج منه يظهر هنا."
            />
            {movements.map((row) => (
              <tr key={row.id}>
                <td className="num">{formatDate(row.happened_on)}</td>
                <td>
                  <span className={`badge ${MOVEMENT_TONE[row.kind] ?? "badge-muted"}`}>
                    {KIND_LABEL[row.kind] ?? row.kind}
                  </span>
                </td>
                <td>{row.store_name}</td>
                <td className="muted">{row.branch_name || "—"}</td>
                <td>{row.item_name}</td>
                <td className="num">
                  {formatNumber(row.quantity, 2)} {row.unit_name}
                </td>
                <td className="num muted">{money(row.unit_cost, currency)}</td>
                <td className="num strong">{money(row.total_cost, currency)}</td>
                <td className="muted truncate" style={{ maxWidth: 220 }}>
                  {row.memo || row.supplier_name || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function useSubmit(path: string, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(body: any) {
    setBusy(true);
    setError("");
    try {
      await api.post(path, body);
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, submit };
}

function ReceiveForm({
  stores,
  items,
  accounts,
  suppliers,
  onDone,
}: {
  stores: Store[];
  items: Item[];
  accounts: Account[];
  suppliers: Party[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    store: "",
    item: "",
    date: today(),
    quantity: "",
    total_cost: "",
    from_account: "",
    supplier: "",
    memo: "",
  });
  const { busy, error, submit } = useSubmit("/ops/stock-receive/", onDone);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      store: prev.store || stores[0]?.id || "",
      item: prev.item || items[0]?.id || "",
      from_account: prev.from_account || accounts[0]?.id || "",
    }));
  }, [stores, items, accounts]);

  return (
    <form
      className="card mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit({
          ...form,
          supplier: form.supplier || null,
          from_account: form.supplier ? null : form.from_account || null,
        });
      }}
    >
      <div className="card-title">استلام علف في المستودع</div>
      <p className="page-sub mb-4">
        لا يُسجَّل مصروفًا الآن — يدخل المخزون كأصل، ويصير تكلفة يوم يُصرف.
      </p>
      <ErrorNote message={error} />
      <div className="row">
        <div className="field">
          <label>المستودع</label>
          <select value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} required>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الصنف</label>
          <select value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} required>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>الكمية</label>
          <input type="number" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        </div>
        <div className="field">
          <label>التكلفة الإجمالية</label>
          <input type="number" step="0.01" value={form.total_cost} onChange={(e) => setForm({ ...form, total_cost: e.target.value })} required />
        </div>
        <div className="field">
          <label>مدفوع من</label>
          <select value={form.from_account} onChange={(e) => setForm({ ...form, from_account: e.target.value })}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>أو على حساب المورد</label>
          <select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}>
            <option value="">—</option>
            {suppliers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>ملاحظة</label>
          <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
      </div>
      <div className="form-actions">
        <Button icon="check" busy={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ الاستلام"}
        </Button>
      </div>
    </form>
  );
}

function IssueForm({ stores, items, onDone }: { stores: Store[]; items: Item[]; onDone: () => void }) {
  const [form, setForm] = useState({ store: "", item: "", date: today(), quantity: "", memo: "" });
  const { busy, error, submit } = useSubmit("/ops/stock-issue/", onDone);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      store: prev.store || stores[0]?.id || "",
      item: prev.item || items[0]?.id || "",
    }));
  }, [stores, items]);

  const store = stores.find((s) => s.id === form.store);

  return (
    <form
      className="card mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <div className="card-title">صرف علف للحيوانات</div>
      <p className="page-sub mb-4">
        التكلفة تُحمَّل على فرع {store?.branch_name || "المستودع"} بمتوسط التكلفة المرجح.
      </p>
      <ErrorNote message={error} />
      <div className="row">
        <div className="field">
          <label>المستودع</label>
          <select value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} required>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الصنف</label>
          <select value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} required>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>الكمية</label>
          <input type="number" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        </div>
        <div className="field">
          <label>ملاحظة</label>
          <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
      </div>
      <div className="form-actions">
        <Button icon="check" busy={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ الصرف"}
        </Button>
      </div>
    </form>
  );
}

function TransferForm({ stores, items, onDone }: { stores: Store[]; items: Item[]; onDone: () => void }) {
  const [form, setForm] = useState({ from_store: "", to_store: "", item: "", date: today(), quantity: "", memo: "" });
  const { busy, error, submit } = useSubmit("/ops/stock-transfer/", onDone);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      from_store: prev.from_store || stores[0]?.id || "",
      to_store: prev.to_store || stores[1]?.id || "",
      item: prev.item || items[0]?.id || "",
    }));
  }, [stores, items]);

  return (
    <form
      className="card mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <div className="card-title">تحويل بين المستودعين</div>
      <p className="page-sub mb-4">
        القيمة تنتقل مع الكمية، ولا يظهر أي مصروف.
      </p>
      <ErrorNote message={error} />
      <div className="row">
        <div className="field">
          <label>من مستودع</label>
          <select value={form.from_store} onChange={(e) => setForm({ ...form, from_store: e.target.value })} required>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>إلى مستودع</label>
          <select value={form.to_store} onChange={(e) => setForm({ ...form, to_store: e.target.value })} required>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الصنف</label>
          <select value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} required>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>الكمية</label>
          <input type="number" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        </div>
        <div className="field">
          <label>ملاحظة</label>
          <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
      </div>
      <div className="form-actions">
        <Button icon="check" busy={busy}>
          {busy ? "جارٍ الحفظ…" : "تنفيذ التحويل"}
        </Button>
      </div>
    </form>
  );
}

function CountForm({ stores, items, onDone }: { stores: Store[]; items: Item[]; onDone: () => void }) {
  const [form, setForm] = useState({ store: "", item: "", date: today(), counted_quantity: "", memo: "" });
  const { busy, error, submit } = useSubmit("/ops/stock-count/", onDone);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      store: prev.store || stores[0]?.id || "",
      item: prev.item || items[0]?.id || "",
    }));
  }, [stores, items]);

  return (
    <form
      className="card mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <div className="card-title">جرد فعلي</div>
      <p className="page-sub mb-4">
        اكتب الكمية الموجودة فعلًا؛ الفرق يُسجَّل تلقائيًا كفروقات جرد.
      </p>
      <ErrorNote message={error} />
      <div className="row">
        <div className="field">
          <label>المستودع</label>
          <select value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} required>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الصنف</label>
          <select value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} required>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>الكمية الموجودة فعلًا</label>
          <input type="number" step="0.001" value={form.counted_quantity} onChange={(e) => setForm({ ...form, counted_quantity: e.target.value })} required />
        </div>
        <div className="field">
          <label>ملاحظة</label>
          <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
      </div>
      <div className="form-actions">
        <Button icon="check" busy={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ الجرد"}
        </Button>
      </div>
    </form>
  );
}


function WasteForm({ stores, items, onDone }: { stores: Store[]; items: Item[]; onDone: () => void }) {
  const [form, setForm] = useState({ store: "", item: "", date: today(), quantity: "", memo: "" });
  const { busy, error, submit } = useSubmit("/ops/stock-write-off/", onDone);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      store: prev.store || stores[0]?.id || "",
      item: prev.item || items[0]?.id || "",
    }));
  }, [stores, items]);

  return (
    <form
      className="card mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(form);
      }}
    >
      <div className="card-title">تسجيل هدر أو تلف</div>
      <p className="page-sub mb-4">
        علف فسد أو انسكب أو ضاع. يُقيَّد خسارة على فرع المستودع، لا تكلفة تعليف — فلا
        يبدو أن الحيوانات أكلت أكثر مما أكلت.
      </p>
      <ErrorNote message={error} />
      <div className="row">
        <div className="field">
          <label>المستودع</label>
          <select value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} required>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>الصنف</label>
          <select value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} required>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </div>
        <div className="field">
          <label>الكمية</label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            required
          />
        </div>
        <div className="field row-wide">
          <label>السبب</label>
          <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
      </div>
      <div className="form-actions">
        <Button icon="check" busy={busy}>
          {busy ? "جارٍ الحفظ…" : "تسجيل الهدر"}
        </Button>
      </div>
    </form>
  );
}

function SetupForms({
  stores,
  items,
  branches,
  categories,
  units,
  onDone,
}: {
  stores: Store[];
  items: Item[];
  branches: Catalog[];
  categories: Catalog[];
  units: Catalog[];
  onDone: () => void;
}) {
  const [item, setItem] = useState({ name: "", name_ar: "", category: "", unit: "", reorder_level: "" });
  const [store, setStore] = useState({ name: "", name_ar: "", branch: "", location: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setItem((prev) => ({
      ...prev,
      category: prev.category || categories.find((c) => c.code === "feed_stock")?.id || "",
      unit: prev.unit || units.find((u) => u.code === "kg")?.id || "",
    }));
  }, [categories, units]);

  async function save(path: string, body: unknown, reset: () => void) {
    setBusy(true);
    setError("");
    try {
      await api.post(path, body);
      reset();
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-2 mb-4">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          save(
            "/inventory-items/",
            {
              ...item,
              name_ar: item.name_ar || item.name,
              category: item.category || null,
              unit: item.unit || null,
              reorder_level: item.reorder_level || 0,
            },
            () => setItem({ ...item, name: "", name_ar: "", reorder_level: "" })
          );
        }}
      >
        <div className="card-title">
          <span>صنف جديد</span>
          <span className="badge badge-muted">{items.length} صنف</span>
        </div>
        <ErrorNote message={error} />
        <div className="row">
          <div className="field">
            <label>الاسم بالعربية</label>
            <input
              value={item.name_ar}
              onChange={(e) => setItem({ ...item, name_ar: e.target.value })}
              placeholder="مثال: ذرة صفراء"
              required
            />
          </div>
          <div className="field">
            <label>الاسم بالإنجليزية</label>
            <input
              value={item.name}
              onChange={(e) => setItem({ ...item, name: e.target.value })}
              placeholder="Yellow corn"
              required
            />
          </div>
          <div className="field">
            <label>التصنيف</label>
            <select value={item.category} onChange={(e) => setItem({ ...item, category: e.target.value })}>
              <option value="">—</option>
              {categories.map((row) => (
                <option key={row.id} value={row.id}>{row.display_name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>وحدة القياس</label>
            <select value={item.unit} onChange={(e) => setItem({ ...item, unit: e.target.value })}>
              <option value="">—</option>
              {units.map((row) => (
                <option key={row.id} value={row.id}>{row.display_name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>حد التنبيه</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={item.reorder_level}
              onChange={(e) => setItem({ ...item, reorder_level: e.target.value })}
              placeholder="ينبّهك حين تنزل الكمية إليه"
            />
          </div>
        </div>
        <div className="form-actions">
          <Button icon="plus" busy={busy}>
            {busy ? "جارٍ الحفظ…" : "إضافة الصنف"}
          </Button>
        </div>
      </form>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          save(
            "/stores/",
            { ...store, name_ar: store.name_ar || store.name, branch: store.branch || null },
            () => setStore({ ...store, name: "", name_ar: "", location: "" })
          );
        }}
      >
        <div className="card-title">
          <span>مستودع جديد</span>
          <span className="badge badge-muted">{stores.length} مستودع</span>
        </div>
        <p className="page-sub mb-4">
          كل مستودع يأخذ حسابه الخاص تحت المخزون، وكل ما يُصرف منه يُحمَّل على فرعه.
        </p>
        <div className="row">
          <div className="field">
            <label>الاسم بالعربية</label>
            <input
              value={store.name_ar}
              onChange={(e) => setStore({ ...store, name_ar: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>الاسم بالإنجليزية</label>
            <input
              value={store.name}
              onChange={(e) => setStore({ ...store, name: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>الفرع</label>
            <select value={store.branch} onChange={(e) => setStore({ ...store, branch: e.target.value })}>
              <option value="">غير محدد</option>
              {branches.map((row) => (
                <option key={row.id} value={row.id}>{row.display_name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>الموقع</label>
            <input value={store.location} onChange={(e) => setStore({ ...store, location: e.target.value })} />
          </div>
        </div>
        <div className="form-actions">
          <Button icon="plus" busy={busy}>
            {busy ? "جارٍ الحفظ…" : "إضافة المستودع"}
          </Button>
        </div>
      </form>
    </div>
  );
}
