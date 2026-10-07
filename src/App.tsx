import { useMemo, useState } from "react";
import {
  categories,
  initialItems,
  initialTransactions,
  InventoryItem,
  InventoryTransaction,
  statusFor,
} from "./services/inventory";

type Page = "dashboard" | "inventory" | "stock-in" | "stock-out" | "transactions" | "trail" | "reports";
type Modal = null | "add" | "edit" | "view" | "stock-in" | "stock-out" | "transaction" | "transaction-detail" | "confirm";
type Role = "Administrator" | "Inventory Staff" | "Viewer";

const nav: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "grid" },
  { id: "inventory", label: "Inventory List", icon: "box" },
  { id: "stock-in", label: "Stock In", icon: "in" },
  { id: "stock-out", label: "Stock Out", icon: "out" },
  { id: "transactions", label: "Transactions", icon: "swap" },
  { id: "trail", label: "Stock Trail", icon: "trail" },
  { id: "reports", label: "Reports", icon: "chart" },
];

const iconPaths: Record<string, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  box: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></>,
  in: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
  out: <><path d="M12 17V5"/><path d="m7 10 5-5 5 5"/><path d="M5 21h14"/></>,
  swap: <><path d="M7 7h13l-3-3"/><path d="M17 17H4l3 3"/><path d="m20 7-3 3M4 17l3-3"/></>,
  trail: <><circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="8" cy="19" r="2"/><path d="M8 6h3c4 0 2 6 5 6M16 14c-2 0-3 5-6 5"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  dots: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
  edit: <><path d="m4 20 4-1 11-11-3-3L5 16l-1 4Z"/><path d="m14 7 3 3"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-5"/></>,
  alert: <><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>;
}

function Button({ children, variant = "primary", icon, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; icon?: string }) {
  return <button className={`btn btn-${variant}`} {...props}>{icon && <Icon name={icon} size={16}/>} {children}</button>;
}
function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) { return <input className={`field ${className}`} {...props}/>; }
function Select({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className={`field ${className}`} {...props}/>; }
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className="field textarea" {...props}/>; }
function Field({ label, required, error, children, hint }: { label: string; required?: boolean; error?: string; children: React.ReactNode; hint?: string }) {
  return <label className="form-field"><span>{label}{required && <b> *</b>}</span>{children}{error && <small className="error">{error}</small>}{hint && <small>{hint}</small>}</label>;
}
function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase().replaceAll(" ", "-");
  return <span className={`badge badge-${key}`}><i/>{status}</span>;
}
function TypeBadge({ type }: { type: string }) {
  return <span className={`type type-${type.toLowerCase().replaceAll(" ", "-")}`}>{type}</span>;
}

const formatDate = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(value));

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [sidebar, setSidebar] = useState(false);
  const [role, setRole] = useState<Role>("Inventory Staff");
  const [items, setItems] = useState(initialItems);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [selectedTx, setSelectedTx] = useState<InventoryTransaction | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: "success" | "error" } | null>(null);

  const title = nav.find(n => n.id === page)?.label ?? "Inventory";
  const canEdit = role !== "Viewer";
  const notify = (text: string, kind: "success" | "error" = "success") => {
    setToast({ text, kind });
    window.setTimeout(() => setToast(null), 3500);
  };
  const requirePermission = (action: () => void) => canEdit ? action() : notify("You do not have permission to perform this action.", "error");
  const openItem = (item: InventoryItem, next: Modal) => { setSelected(item); requirePermission(() => setModal(next)); };
  const showItem = (item: InventoryItem) => { setSelected(item); setModal("view"); };

  const applyTransaction = (payload: { itemId: string; type: string; quantity: number; reference: string; remarks: string; person: string; date?: string }) => {
    const item = items.find(i => i.id === payload.itemId);
    if (!item) return;
    const decrease = ["Stock Out", "Damaged", "Lost"].includes(payload.type);
    const signed = decrease ? -Math.abs(payload.quantity) : payload.quantity;
    if (item.quantity + signed < 0) return notify(`Insufficient stock. Available quantity: ${item.quantity}.`, "error");
    const nextQty = item.quantity + signed;
    const tx: InventoryTransaction = {
      id: `TX-${Date.now()}`, date: payload.date ? `${payload.date}T12:00:00` : new Date().toISOString(), reference: payload.reference || `INV-${String(transactions.length + 101).padStart(5, "0")}`,
      itemId: item.id, itemName: item.name, type: payload.type, quantity: signed, previous: item.quantity,
      next: nextQty, performedBy: payload.person || "Juan Dela Cruz", remarks: payload.remarks || "Inventory transaction",
    };
    setItems(current => current.map(i => i.id === item.id ? { ...i, quantity: nextQty } : i));
    setTransactions(current => [tx, ...current]);
    setModal(null);
    setSelected(null);
    notify(`${payload.type} recorded successfully. New stock: ${nextQty} ${item.unit}.`);
  };

  return <div className="app-shell">
    <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brandmark">W</div><div><strong>WDS</strong><span>Inventory</span></div></div>
      <nav className="nav">
        <span className="nav-label">WORKSPACE</span>
        {nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => { setPage(item.id); setSidebar(false); }}>
          <Icon name={item.icon}/><span>{item.label}</span>{page === item.id && <i/>}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-item"><Icon name="edit"/><span>Settings</span></button>
        <div className="side-user"><div className="avatar">JD</div><div><strong>Juan Dela Cruz</strong><span>{role}</span></div><Icon name="dots"/></div>
        <button className="nav-item logout"><Icon name="out"/><span>Log out</span></button>
      </div>
    </aside>
    {sidebar && <button className="scrim" aria-label="Close navigation" onClick={() => setSidebar(false)}/>}
    <main className="main">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setSidebar(true)}><Icon name="menu"/></button>
        <div className="head-title"><strong>{title}</strong><span>WDS <Icon name="chevron" size={12}/> Inventory <Icon name="chevron" size={12}/> {title}</span></div>
        <div className="top-actions">
          <button className="icon-button notification"><Icon name="bell"/><i/></button>
          <div className="role-select"><span>Demo role</span><select value={role} onChange={e => setRole(e.target.value as Role)}><option>Administrator</option><option>Inventory Staff</option><option>Viewer</option></select></div>
          <div className="avatar">JD</div><div className="top-user"><strong>Juan Dela Cruz</strong><span>{role}</span></div>
        </div>
      </header>
      <div className="content">
        {page === "dashboard" && <Dashboard items={items} transactions={transactions} onNavigate={setPage} onView={showItem}/>}
        {page === "inventory" && <Inventory items={items} canEdit={canEdit} onAdd={() => requirePermission(() => setModal("add"))} onView={showItem} onAction={openItem}/>}
        {(page === "stock-in" || page === "stock-out") && <TransactionPage key={page} type={page === "stock-in" ? "Stock In" : "Stock Out"} items={items} canEdit={canEdit} onSubmit={applyTransaction} onDenied={() => notify("You do not have permission to perform this action.", "error")}/>}
        {page === "transactions" && <Transactions transactions={transactions} items={items} onOpen={tx => { setSelectedTx(tx); setModal("transaction-detail"); }} onNew={() => requirePermission(() => setModal("transaction"))}/>}
        {page === "trail" && <StockTrail transactions={transactions}/>}
        {page === "reports" && <Reports items={items} transactions={transactions} notify={notify}/>}
      </div>
    </main>
    {modal === "add" && <ItemForm onClose={() => setModal(null)} onSave={item => { setItems(current => [{ ...item, id: `item-${Date.now()}`, quantity: item.quantity || 0, active: true }, ...current]); setModal(null); notify("Inventory item added successfully."); }}/>}
    {modal === "edit" && selected && <ItemForm item={selected} onClose={() => setModal(null)} onSave={updated => { setItems(current => current.map(i => i.id === selected.id ? { ...i, ...updated, quantity: i.quantity } : i)); setModal(null); notify("Inventory item updated successfully."); }}/>}
    {modal === "view" && selected && <ItemDetails item={items.find(i => i.id === selected.id) ?? selected} transactions={transactions} canEdit={canEdit} onClose={() => setModal(null)} onAction={next => requirePermission(() => setModal(next))}/>}
    {(modal === "stock-in" || modal === "stock-out") && selected && <TransactionModal type={modal === "stock-in" ? "Stock In" : "Stock Out"} item={items.find(i => i.id === selected.id) ?? selected} onClose={() => setModal(null)} onSubmit={applyTransaction}/>}
    {modal === "transaction" && <OtherTransactionModal items={items} onClose={() => setModal(null)} onSubmit={applyTransaction}/>}
    {modal === "transaction-detail" && selectedTx && <TransactionDetail tx={selectedTx} onClose={() => setModal(null)}/>}
    {toast && <div className={`toast toast-${toast.kind}`}><span><Icon name={toast.kind === "success" ? "check" : "alert"}/></span><div><strong>{toast.kind === "success" ? "Success" : "Action required"}</strong><p>{toast.text}</p></div><button onClick={() => setToast(null)}><Icon name="close" size={16}/></button></div>}
  </div>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

function Dashboard({ items, transactions, onNavigate, onView }: { items: InventoryItem[]; transactions: InventoryTransaction[]; onNavigate: (p: Page) => void; onView: (i: InventoryItem) => void }) {
  const total = items.reduce((sum, i) => sum + i.quantity, 0);
  const low = items.filter(i => statusFor(i) === "Low Stock");
  const out = items.filter(i => statusFor(i) === "Out of Stock");
  const available = items.filter(i => statusFor(i) === "Available").length;
  const recentTransactions = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);
  const cards = [
    { label: "Total Items", value: items.length, desc: "Active inventory records", icon: "box", tone: "blue" },
    { label: "Total Stock", value: total.toLocaleString(), desc: "Units currently on hand", icon: "chart", tone: "cyan" },
    { label: "Low Stock", value: low.length, desc: `${low.length} items require attention`, icon: "alert", tone: "amber" },
    { label: "Out of Stock", value: out.length, desc: "Immediate replenishment needed", icon: "out", tone: "red" },
  ];
  return <>
    <PageHeader eyebrow="INVENTORY OVERVIEW" title="Good morning, Juan" description="Here’s what’s happening with WDS inventory today."/>
    <div className="stat-grid">{cards.map(card => <div className="stat-card" key={card.label}><div className={`stat-icon ${card.tone}`}><Icon name={card.icon}/></div><div className="stat-meta"><span>{card.label}</span><strong>{card.value}</strong><small>{card.desc}</small></div><div className="stat-spark"><i/><i/><i/><i/><i/></div></div>)}</div>
    <div className="dashboard-grid">
      <section className="panel span-2"><PanelHead title="Recent Transactions" subtitle="Latest stock movements across inventory" action={<Button variant="ghost" onClick={() => onNavigate("transactions")}>View all <Icon name="chevron" size={14}/></Button>}/>
        <TransactionTable transactions={recentTransactions} compact/>
      </section>
      <section className="panel status-panel"><PanelHead title="Stock Status" subtitle="Items by availability"/>
        <div className="donut-wrap"><div className="donut" style={{ "--available": `${(available / items.length) * 100}%`, "--low": `${((available + low.length) / items.length) * 100}%` } as React.CSSProperties}><div><strong>{items.length}</strong><span>Total items</span></div></div></div>
        <div className="legend"><Legend color="green" label="Available" value={available}/><Legend color="amber" label="Low Stock" value={low.length}/><Legend color="red" label="Out of Stock" value={out.length}/></div>
      </section>
      <section className="panel span-3"><PanelHead title="Critical Stock Items" subtitle="Out-of-stock items are shown first, followed by low-stock items" action={<Button variant="ghost" onClick={() => onNavigate("inventory")}>View all <Icon name="chevron" size={14}/></Button>}/>
        <div className="table-wrap"><table><thead><tr><th>ITEM</th><th>CATEGORY</th><th>CURRENT STOCK</th><th>MINIMUM STOCK</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
          {[...out, ...low].slice(0, 5).map(item => <tr key={item.id}><td><ItemCell item={item}/></td><td>{item.category}</td><td><strong>{item.quantity} {item.unit}</strong></td><td>{item.minimum} {item.unit}</td><td><StatusBadge status={statusFor(item)}/></td><td><Button variant="ghost" onClick={() => onView(item)}>View item</Button></td></tr>)}
        </tbody></table></div>
      </section>
    </div>
  </>;
}
function PanelHead({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>; }
function Legend({ color, label, value }: { color: string; label: string; value: number }) { return <div><span><i className={color}/>{label}</span><strong>{value}</strong></div>; }
function ItemCell({ item }: { item: InventoryItem }) { return <div className="item-cell"><span>{item.name.slice(0, 2).toUpperCase()}</span><div><strong>{item.name}</strong><small>{item.code}</small></div></div>; }

function Inventory({ items, canEdit, onAdd, onView, onAction }: { items: InventoryItem[]; canEdit: boolean; onAdd: () => void; onView: (i: InventoryItem) => void; onAction: (i: InventoryItem, m: Modal) => void }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("name");
  const filtered = useMemo(() => items.filter(item => {
    const haystack = `${item.code} ${item.name} ${item.category} ${item.brand} ${item.model}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (!category || item.category === category) && (!status || statusFor(item) === status);
  }).sort((a,b) => sort === "stock" ? a.quantity - b.quantity : sort === "code" ? a.code.localeCompare(b.code) : a.name.localeCompare(b.name)), [items, search, category, status, sort]);
  return <>
    <PageHeader title="Inventory" description="Manage materials, equipment, tools, and meters." actions={<Button icon="plus" onClick={onAdd}>Add Item</Button>}/>
    <section className="panel inventory-panel">
      <div className="filters"><div className="search-field"><Icon name="search"/><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by item, code, brand..."/></div>
        <Select value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</Select>
        <Select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option>Available</option><option>Low Stock</option><option>Out of Stock</option><option>Inactive</option></Select>
        <Select value={sort} onChange={e => setSort(e.target.value)}><option value="name">Sort: Item name</option><option value="code">Sort: Item code</option><option value="stock">Sort: Lowest stock</option></Select>
        {(search || category || status) && <Button variant="ghost" onClick={() => { setSearch(""); setCategory(""); setStatus(""); }}>Clear filters</Button>}
      </div>
      <div className="table-caption"><strong>{filtered.length} items</strong><span>Inventory records and live stock levels</span></div>
      {filtered.length ? <div className="table-wrap inventory-table"><table><thead><tr><th>ITEM</th><th>CATEGORY</th><th>BRAND / MODEL</th><th>UNIT</th><th>STOCK</th><th>MINIMUM</th><th>LOCATION</th><th>STATUS</th><th/></tr></thead><tbody>
        {filtered.slice(0, 12).map(item => <tr key={item.id}><td><ItemCell item={item}/></td><td>{item.category}</td><td>{item.brand}<small className="cell-sub">{item.model || "—"}</small></td><td>{item.unit}</td><td><strong className="stock-num">{item.quantity}</strong></td><td>{item.minimum}</td><td>{item.location}<small className="cell-sub">{item.bin}</small></td><td><StatusBadge status={statusFor(item)}/></td><td><div className="row-actions"><button title="View item" onClick={() => onView(item)}><Icon name="eye"/></button><button title="Edit item" disabled={!canEdit} onClick={() => onAction(item, "edit")}><Icon name="edit"/></button><button title="Stock in" disabled={!canEdit} onClick={() => onAction(item, "stock-in")}><Icon name="in"/></button><button title="Stock out" disabled={!canEdit || item.quantity === 0} onClick={() => onAction(item, "stock-out")}><Icon name="out"/></button></div></td></tr>)}
      </tbody></table></div> : <Empty title={search ? "No items match your search." : "No inventory items found."} action={<Button variant="secondary" onClick={() => { setSearch(""); setCategory(""); setStatus(""); }}>Clear filters</Button>}/>}
      <Pagination count={filtered.length}/>
    </section>
  </>;
}

function Pagination({ count }: { count: number }) { return <div className="pagination"><span>Showing 1–{Math.min(count, 12)} of {count}</span><div><Button variant="secondary" disabled>Previous</Button><button className="page-active">1</button><Button variant="secondary" disabled={count <= 12}>Next</Button></div></div>; }
function Empty({ title, action }: { title: string; action?: React.ReactNode }) { return <div className="empty"><span><Icon name="box" size={28}/></span><h3>{title}</h3><p>Try adjusting your search or filter criteria.</p>{action}</div>; }

function TransactionPage({ type, items, canEdit, onSubmit, onDenied }: { type: "Stock In" | "Stock Out"; items: InventoryItem[]; canEdit: boolean; onSubmit: (p: any) => void; onDenied: () => void }) {
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [lastCompletedItem, setLastCompletedItem] = useState("");
  const [form, setForm] = useState({ party: "", reference: "", date: "", person: "Juan Dela Cruz", remarks: "", purpose: "" });
  const item = items.find(i => i.id === itemId);
  const qty = Number(quantity) || 0;
  const isOut = type === "Stock Out";
  const invalid = !!item && isOut && qty > item.quantity;
  const submit = () => { if (!canEdit) return onDenied(); if (!item || !form.date || !qty || invalid) return; setConfirm(true); };
  return <>
    <PageHeader title={type} description={isOut ? "Record released inventory and reduce available stock." : "Record incoming inventory and increase available stock."}/>
    <div className="transaction-layout">
      <section className="panel form-panel"><PanelHead title={`${type} Details`} subtitle="Complete the transaction information below."/>
        <div className="form-grid">
          <Field label="Item" required><Select className={itemId ? "field-selected" : ""} value={itemId} onChange={e => { setItemId(e.target.value); setQuantity(""); }}><option value="" disabled>Select an inventory item</option>{items.filter(i => i.active && (!isOut || i.quantity > 0)).map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}</Select></Field>
          <Field label="Quantity" required error={invalid && item ? `Insufficient stock. Available quantity: ${item.quantity}.` : undefined}><Input type="number" min="1" disabled={!item} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder={item ? "Enter quantity" : "Choose an item first"}/></Field>
          <Field label={isOut ? "Released To" : "Supplier"} required><Input value={form.party} onChange={e => setForm({...form, party:e.target.value})} placeholder={isOut ? "Department or personnel" : "Supplier name"}/></Field>
          {isOut && <Field label="Purpose"><Input value={form.purpose} onChange={e => setForm({...form, purpose:e.target.value})} placeholder="Maintenance, installation, repair..."/></Field>}
          <Field label="Reference Number"><Input value={form.reference} onChange={e => setForm({...form, reference:e.target.value})} placeholder="Auto-generated if blank"/></Field>
          <Field label="Transaction Date" required><Input className={form.date ? "field-selected" : ""} type="date" value={form.date} onChange={e => setForm({...form, date:e.target.value})}/></Field>
          <Field label={isOut ? "Released By" : "Received By"} required><Input value={form.person} onChange={e => setForm({...form, person:e.target.value})}/></Field>
          <Field label="Remarks"><Textarea value={form.remarks} onChange={e => setForm({...form, remarks:e.target.value})} placeholder="Add transaction notes..."/></Field>
        </div>
        <div className="form-actions"><Button variant="secondary">Cancel</Button><Button disabled={!item || !form.date || !qty || invalid} onClick={submit}>{`Continue to Confirm ${type}`}</Button></div>
      </section>
      <aside className="panel summary-card"><div className="summary-icon"><Icon name={isOut ? "out" : "in"} size={24}/></div><h2>Stock Summary</h2><p>Review the resulting stock before confirming.</p>
        {item ? <><div className="selected-item selected-item-active"><ItemCell item={item}/><StatusBadge status={statusFor(item)}/></div>
        <div className="stock-calc"><div><span>{lastCompletedItem === item.id && !qty ? "Latest Stock" : "Current Stock"}</span><strong>{item.quantity}</strong></div><div><span>{isOut ? "Quantity to Release" : "Quantity to Add"}</span><strong className={isOut ? "negative" : "positive"}>{isOut ? "−" : "+"}{qty}</strong></div><i/><div className="result"><span>{lastCompletedItem === item.id && !qty ? "Updated Stock" : isOut ? "Remaining Stock" : "New Stock"}</span><strong>{isOut ? Math.max(0,item.quantity-qty) : item.quantity+qty} <small>{item.unit}</small></strong></div></div></> : <div className="summary-placeholder"><span><Icon name="box" size={24}/></span><strong>No item selected</strong><p>Choose an inventory item to view its current and resulting stock.</p></div>}
        <div className="info-note"><Icon name="shield"/><span>Stock changes are recorded permanently in the Stock Trail.</span></div>
      </aside>
    </div>
    {confirm && item && <ConfirmDialog title={`Confirm ${type}`} text={`Are you sure you want to ${isOut ? "release" : "add"} ${qty} ${item.unit} of ${item.name}?`} details={[["Previous stock", `${item.quantity} ${item.unit}`], [isOut ? "Quantity released" : "Quantity added", `${isOut ? "−" : "+"}${qty} ${item.unit}`], ["New stock", `${isOut ? item.quantity - qty : item.quantity + qty} ${item.unit}`]]} onCancel={() => setConfirm(false)} onConfirm={() => {
      setConfirm(false);
      setLastCompletedItem(itemId);
      setQuantity("");
      onSubmit({ itemId, type, quantity: qty, reference: form.reference, remarks: form.remarks || `${isOut ? "Released to" : "Received from"} ${form.party}`, person: form.person, date: form.date });
    }}/>}
  </>;
}

function TransactionTable({ transactions, compact = false, onOpen }: { transactions: InventoryTransaction[]; compact?: boolean; onOpen?: (t: InventoryTransaction) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>DATE</th>{!compact && <th>REFERENCE NO.</th>}<th>ITEM</th><th>TYPE</th><th>QUANTITY</th><th>PREVIOUS</th><th>NEW STOCK</th><th>PERFORMED BY</th>{!compact && <th>REMARKS</th>}{onOpen && <th/>}</tr></thead><tbody>
    {transactions.map(tx => <tr key={tx.id} onClick={() => onOpen?.(tx)} className={onOpen ? "clickable" : ""}><td>{formatDate(tx.date)}</td>{!compact && <td><span className="reference">{tx.reference}</span></td>}<td><strong>{tx.itemName}</strong></td><td><TypeBadge type={tx.type}/></td><td><strong className={tx.quantity > 0 ? "positive" : "negative"}>{tx.quantity > 0 ? "+" : ""}{tx.quantity}</strong></td><td>{tx.previous}</td><td><strong>{tx.next}</strong></td><td>{tx.performedBy}</td>{!compact && <td className="remarks">{tx.remarks}</td>}{onOpen && <td><Icon name="chevron" size={16}/></td>}</tr>)}
  </tbody></table></div>;
}

function Transactions({ transactions, items, onOpen, onNew }: { transactions: InventoryTransaction[]; items: InventoryItem[]; onOpen: (t: InventoryTransaction) => void; onNew: () => void }) {
  const [search, setSearch] = useState(""); const [type, setType] = useState(""); const [itemId, setItemId] = useState("");
  const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState("");
  const rangeStart = dateFrom && dateTo ? (dateFrom < dateTo ? dateFrom : dateTo) : dateFrom;
  const rangeEnd = dateFrom && dateTo ? (dateFrom > dateTo ? dateFrom : dateTo) : dateTo;
  const filtered = transactions.filter(t => {
    const transactionDate = t.date.slice(0, 10);
    return (!search || `${t.itemName} ${t.reference} ${t.performedBy}`.toLowerCase().includes(search.toLowerCase()))
      && (!type || t.type === type)
      && (!itemId || t.itemId === itemId)
      && (!rangeStart || transactionDate >= rangeStart)
      && (!rangeEnd || transactionDate <= rangeEnd);
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return <><PageHeader title="Transactions" description="View all inventory stock movements." actions={<Button icon="plus" onClick={onNew}>Other Transaction</Button>}/>
    <section className="panel inventory-panel"><div className="filters"><div className="search-field"><Icon name="search"/><Input placeholder="Search reference, item, person..." value={search} onChange={e => setSearch(e.target.value)}/></div><Select value={itemId} onChange={e => setItemId(e.target.value)}><option value="">All items</option>{items.map(i => <option value={i.id} key={i.id}>{i.name}</option>)}</Select><Select value={type} onChange={e => setType(e.target.value)}><option value="">All transaction types</option>{["Stock In","Stock Out","Return","Adjustment","Damaged","Lost"].map(t => <option key={t}>{t}</option>)}</Select><div className="date-range"><span>Date range</span><label>Starting date <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/></label><label>Ending date <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}/></label></div>{(search || itemId || type || dateFrom || dateTo) && <Button variant="ghost" onClick={() => { setSearch(""); setItemId(""); setType(""); setDateFrom(""); setDateTo(""); }}>Clear filters</Button>}</div>
      <div className="table-caption"><strong>{filtered.length} transactions</strong><span>Click a row to view complete details</span></div>
      {filtered.length ? <TransactionTable transactions={filtered} onOpen={onOpen}/> : <Empty title="No transactions found for the selected filters."/>}<Pagination count={filtered.length}/></section></>;
}

function StockTrail({ transactions }: { transactions: InventoryTransaction[] }) {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const filteredTransactions = sortedTransactions.filter(tx => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const haystack = `${tx.itemName} ${tx.type} ${tx.reference} ${tx.performedBy} ${tx.remarks}`.toLowerCase();
    return haystack.includes(query);
  });
  return <><PageHeader title="Stock Trail" description="View the complete history of stock changes." actions={<span className="readonly"><Icon name="shield"/> Read Only</span>}/>
    <div className="immutable-note"><Icon name="shield"/><div><strong>Immutable audit record</strong><span>Stock trail records are permanent and cannot be edited or deleted.</span></div></div>
    <section className="panel inventory-panel">
      <div className="filters"><div className="search-field"><Icon name="search"/><Input value={searchDraft} onChange={e => setSearchDraft(e.target.value)} placeholder="Search by item, reference, person..." onKeyDown={e => { if (e.key === "Enter") setSearch(searchDraft); }}/></div>
        <Button variant="secondary" icon="search" onClick={() => setSearch(searchDraft)}>Search</Button>
        {search && <Button variant="ghost" onClick={() => { setSearch(""); setSearchDraft(""); }}>Clear search</Button>}
      </div>
      <div className="table-caption"><strong>{search ? `${filteredTransactions.length} of ${transactions.length} records` : `${transactions.length} trail records`}</strong><span>{search ? `Matching "${search}"` : "All stock movement history"}</span></div>
      <div className="trail-panel">{filteredTransactions.length ? <div className="trail-list">{filteredTransactions.map(tx => <div className="trail-item" key={tx.id}><div className={`trail-dot ${tx.quantity > 0 ? "increase" : "decrease"}`}><Icon name={tx.quantity > 0 ? "in" : "out"} size={16}/></div><div className="trail-main"><div><strong>{tx.itemName}</strong><TypeBadge type={tx.type}/></div><p>{tx.remarks}</p><div className="trail-meta"><span><Icon name="clock" size={14}/>{formatDate(tx.date)} · {new Date(tx.date).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</span><span>Ref: <b>{tx.reference}</b></span><span>By {tx.performedBy}</span></div></div><div className="trail-stock"><strong className={tx.quantity > 0 ? "positive" : "negative"}>{tx.quantity > 0 ? "+" : ""}{tx.quantity}</strong><span>{tx.previous} → <b>{tx.next}</b></span></div></div>)}</div> : <Empty title="No stock trail records match your search." action={<Button variant="secondary" onClick={() => { setSearch(""); setSearchDraft(""); }}>Clear search</Button>}/>}</div>
    </section></>;
}

function Reports({ items, transactions, notify }: { items: InventoryItem[]; transactions: InventoryTransaction[]; notify: (s:string)=>void }) {
  const total = items.reduce((s,i)=>s+i.quantity,0); const low = items.filter(i=>statusFor(i)==="Low Stock").length; const out = items.filter(i=>statusFor(i)==="Out of Stock").length;
  const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState("");
  const [itemId, setItemId] = useState(""); const [category, setCategory] = useState(""); const [type, setType] = useState("");
  const dateRangeIncomplete = Boolean(dateFrom) !== Boolean(dateTo);
  const rangeStart = dateFrom && dateTo ? (dateFrom < dateTo ? dateFrom : dateTo) : "";
  const rangeEnd = dateFrom && dateTo ? (dateFrom > dateTo ? dateFrom : dateTo) : "";
  const filtered = transactions.filter(transaction => {
    const transactionDate = transaction.date.slice(0, 10);
    const item = items.find(candidate => candidate.id === transaction.itemId);
    return (!rangeStart || transactionDate >= rangeStart)
      && (!rangeEnd || transactionDate <= rangeEnd)
      && (!itemId || transaction.itemId === itemId)
      && (!category || item?.category === category)
      && (!type || transaction.type === type);
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const reportEntries = dateRangeIncomplete ? [] : filtered;
  const hasFilters = dateFrom || dateTo || itemId || category || type;
  const exportExcel = () => {
    const escapeCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = reportEntries.map(transaction => [
      formatDate(transaction.date), transaction.reference, transaction.itemName, transaction.type,
      transaction.quantity, transaction.previous, transaction.next, transaction.performedBy, transaction.remarks,
    ]);
    const csv = [
      ["Date", "Reference No.", "Item", "Transaction Type", "Quantity", "Previous Stock", "New Stock", "Performed By", "Remarks"],
      ...rows,
    ].map(row => row.map(escapeCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `WDS-Stock-Movement-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify(`Excel-compatible report downloaded with ${reportEntries.length} matching transaction${reportEntries.length === 1 ? "" : "s"}.`);
  };
  const printPdf = () => {
    notify("Print dialog opened. Select “Save as PDF” as the destination.");
    window.setTimeout(() => window.print(), 150);
  };
  return <><PageHeader title="Reports" description="Review inventory health and stock movement data." actions={<><Button variant="secondary" disabled={dateRangeIncomplete} onClick={exportExcel}>Export Excel</Button><Button variant="secondary" disabled={dateRangeIncomplete} onClick={printPdf}>Save / Print PDF</Button><Button disabled={dateRangeIncomplete} onClick={() => notify(`Mock report generated with ${reportEntries.length} matching transaction${reportEntries.length === 1 ? "" : "s"}.`)}>Generate Report</Button></>}/>
    <div className="report-kpis"><div><span>Total Items</span><strong>{items.length}</strong><small>Inventory records</small></div><div><span>Total Stock</span><strong>{total.toLocaleString()}</strong><small>Units on hand</small></div><div><span>Low Stock Items</span><strong>{low}</strong><small>Require attention</small></div><div><span>Out of Stock</span><strong>{out}</strong><small>Require restocking</small></div></div>
    <section className="panel inventory-panel print-report"><PanelHead title="Stock Movement Report" subtitle="Filter and review inventory movements for a selected period."/><div className="filters report-filters no-print"><Field label="Starting date"><Input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)}/></Field><Field label="Ending date"><Input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)}/></Field><Field label="Item"><Select value={itemId} onChange={event => setItemId(event.target.value)}><option value="">All items</option>{items.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</Select></Field><Field label="Category"><Select value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</Select></Field><Field label="Transaction Type"><Select value={type} onChange={event => setType(event.target.value)}><option value="">All types</option>{["Stock In","Stock Out","Return","Adjustment","Damaged","Lost"].map(transactionType => <option key={transactionType}>{transactionType}</option>)}</Select></Field>{hasFilters && <Button variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); setItemId(""); setCategory(""); setType(""); }}>Clear filters</Button>}</div><div className="table-caption"><strong>{dateRangeIncomplete ? "Complete the date range" : `${reportEntries.length} report entries`}</strong><span>{dateRangeIncomplete ? "Select both the starting and ending dates to display results" : hasFilters ? `Filtered period: ${rangeStart || "Beginning"} to ${rangeEnd || "Present"}` : "All stock movements"}</span></div>{dateRangeIncomplete ? <Empty title="Select both dates to view report entries."/> : reportEntries.length ? <TransactionTable transactions={reportEntries}/> : <Empty title="No report entries match the selected filters." action={<Button variant="secondary" onClick={() => { setDateFrom(""); setDateTo(""); setItemId(""); setCategory(""); setType(""); }}>Clear filters</Button>}/>}</section></>;
}

function ModalShell({ title, subtitle, onClose, wide, children }: { title: string; subtitle?: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className={`modal ${wide ? "modal-wide" : ""}`}><div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose}><Icon name="close"/></button></div>{children}</div></div>;
}

function ItemForm({ item, onClose, onSave }: { item?: InventoryItem; onClose: () => void; onSave: (i: InventoryItem) => void }) {
  const blank: InventoryItem = { id:"", code:"", name:"", category:"", description:"", brand:"", model:"", unit:"", quantity:0, minimum:0, supplier:"", supplierId:"", location:"", bin:"", active:true, serials:[] };
  const [form, setForm] = useState(item ?? blank); const [errors, setErrors] = useState<Record<string,string>>({}); const [track, setTrack] = useState(!!item?.serials?.length);
  const set = (key: keyof InventoryItem, value: any) => setForm({...form,[key]:value});
  const save = () => { const e: Record<string,string>={}; ["code","name","category","unit"].forEach(k => { if(!form[k as keyof InventoryItem]) e[k]="This field is required."; }); if(form.minimum === null || form.minimum < 0) e.minimum="Enter a valid minimum stock."; setErrors(e); if(Object.keys(e).length) return; onSave(form); };
  return <ModalShell title={item ? "Edit Inventory Item" : "Add Inventory Item"} subtitle={item ? `Update metadata for ${item.code}.` : "Create a new inventory record."} onClose={onClose} wide><div className="modal-body item-form">
    {item && <div className="current-stock"><div className="summary-icon"><Icon name="box"/></div><div><span>Current Stock</span><strong>{item.quantity} {item.unit}</strong><small>Stock quantity can only be changed through inventory transactions.</small></div></div>}
    <FormSection title="Basic Information"><Field label="Item Code" required error={errors.code}><Input disabled={!!item} value={form.code} onChange={e=>set("code",e.target.value)} placeholder="e.g. MAT-021"/></Field><Field label="Item Name" required error={errors.name}><Input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="Enter item name"/></Field><Field label="Category" required error={errors.category}><Select value={form.category} onChange={e=>set("category",e.target.value)}><option value="">Select category</option>{categories.map(c=><option key={c}>{c}</option>)}</Select></Field><Field label="Unit" required error={errors.unit}><Select value={form.unit} onChange={e=>set("unit",e.target.value)}><option value="">Select unit</option>{["pcs","rolls","boxes","sets","meters","liters"].map(u=><option key={u}>{u}</option>)}</Select></Field><Field label="Brand"><Input value={form.brand} onChange={e=>set("brand",e.target.value)}/></Field><Field label="Model"><Input value={form.model} onChange={e=>set("model",e.target.value)}/></Field><Field label="Description"><Textarea value={form.description} onChange={e=>set("description",e.target.value)} placeholder="Item description"/></Field></FormSection>
    <FormSection title="Stock & Storage">{!item && <Field label="Initial Quantity"><Input type="number" min="0" value={form.quantity} onChange={e=>set("quantity",Number(e.target.value))}/></Field>}<Field label="Minimum Stock" required error={errors.minimum}><Input type="number" min="0" value={form.minimum} onChange={e=>set("minimum",Number(e.target.value))}/></Field><Field label="Storage Location"><Input value={form.location} onChange={e=>set("location",e.target.value)} placeholder="e.g. Main Warehouse"/></Field><Field label="Shelf / Bin"><Input value={form.bin} onChange={e=>set("bin",e.target.value)} placeholder="e.g. Rack A-04"/></Field></FormSection>
    <FormSection title="Supplier"><Field label="Supplier"><Input value={form.supplier} onChange={e=>set("supplier",e.target.value)}/></Field><Field label="Supplier ID"><Input value={form.supplierId} onChange={e=>set("supplierId",e.target.value)}/></Field></FormSection>
    {!item && <FormSection title="Tracking"><label className="toggle-row"><button className={`toggle ${track?"on":""}`} onClick={()=>setTrack(!track)}><i/></button><span><strong>Track Serial Number / Asset Tag</strong><small>Use this for equipment, tools, and meters.</small></span></label>{track && <Field label="Serial Numbers / Asset Tags" hint="Separate multiple entries with commas."><Input onChange={e=>set("serials",e.target.value.split(",").map(s=>s.trim()))} placeholder="e.g. WM-2401, WM-2402"/></Field>}</FormSection>}
    {item && <FormSection title="Record Status"><label className="toggle-row"><button className={`toggle ${form.active?"on":""}`} onClick={()=>set("active",!form.active)}><i/></button><span><strong>Active item</strong><small>Inactive items remain visible but cannot be used in transactions.</small></span></label></FormSection>}
    <FormSection title="Other"><Field label="Remarks"><Textarea placeholder="Add notes about this item..."/></Field></FormSection>
  </div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>{item ? "Save Changes" : "Save Item"}</Button></div></ModalShell>;
}
function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="form-section"><h3>{title}</h3><div className="form-grid">{children}</div></section>; }

function ItemDetails({ item, transactions, canEdit, onClose, onAction }: { item: InventoryItem; transactions: InventoryTransaction[]; canEdit:boolean; onClose:()=>void; onAction:(m:Modal)=>void }) {
  const history=transactions.filter(t=>t.itemId===item.id); return <ModalShell title="Item Details" subtitle={`${item.code} · Last updated today`} onClose={onClose} wide><div className="modal-body details-body">
    <div className="detail-hero"><div><span className="item-avatar">{item.name.slice(0,2).toUpperCase()}</span><div><h2>{item.name}</h2><p>{item.category} · {item.brand} {item.model}</p><StatusBadge status={statusFor(item)}/></div></div><div className="detail-actions"><Button variant="secondary" disabled={!canEdit} onClick={()=>onAction("edit")} icon="edit">Edit Item</Button><Button variant="secondary" disabled={!canEdit} onClick={()=>onAction("stock-out")} icon="out">Stock Out</Button><Button disabled={!canEdit} onClick={()=>onAction("stock-in")} icon="in">Stock In</Button></div></div>
    <div className="detail-grid"><section><h3>Item Information</h3><dl><Detail label="Item Code" value={item.code}/><Detail label="Category" value={item.category}/><Detail label="Description" value={item.description||"No description"}/><Detail label="Brand / Model" value={`${item.brand} ${item.model}`}/><Detail label="Unit" value={item.unit}/><Detail label="Supplier" value={item.supplier}/><Detail label="Storage Location" value={`${item.location}, ${item.bin}`}/></dl></section><section className="stock-summary"><span>Current Stock</span><strong>{item.quantity} <small>{item.unit}</small></strong><div><Detail label="Minimum Stock" value={`${item.minimum} ${item.unit}`}/><Detail label="Stock Status" value={statusFor(item)}/><Detail label="Last Stock In" value={history.find(t=>t.quantity>0)?formatDate(history.find(t=>t.quantity>0)!.date):"—"}/><Detail label="Last Stock Out" value={history.find(t=>t.quantity<0)?formatDate(history.find(t=>t.quantity<0)!.date):"—"}/></div></section></div>
    <section className="detail-history"><PanelHead title="Transaction History" subtitle={`All stock movements for ${item.name}`}/>{history.length?<TransactionTable transactions={history}/>:<Empty title="No transactions recorded for this item."/ >}</section>
  </div></ModalShell>;
}
function Detail({label,value}:{label:string;value:string}){return <div className="detail-row"><dt>{label}</dt><dd>{value||"—"}</dd></div>}

function TransactionModal({ type, item, onClose, onSubmit }: { type:"Stock In"|"Stock Out"; item:InventoryItem; onClose:()=>void; onSubmit:(p:any)=>void }) {
  const [qty,setQty]=useState(""); const [reference,setReference]=useState(""); const [remarks,setRemarks]=useState(""); const n=Number(qty)||0; const invalid=type==="Stock Out"&&n>item.quantity;
  return <ModalShell title={type} subtitle={`${item.code} · ${item.name}`} onClose={onClose}><div className="modal-body"><div className="mini-stock"><span>Current Stock</span><strong>{item.quantity} {item.unit}</strong></div><div className="form-grid single"><Field label="Quantity" required error={invalid?`Insufficient stock. Available quantity: ${item.quantity}.`:undefined}><Input autoFocus type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)}/></Field><Field label="Reference Number"><Input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Auto-generated if blank"/></Field><Field label="Remarks"><Textarea value={remarks} onChange={e=>setRemarks(e.target.value)}/></Field></div><div className="inline-result"><span>{type==="Stock Out"?"Remaining":"New"} Stock</span><strong>{type==="Stock Out"?Math.max(0,item.quantity-n):item.quantity+n} {item.unit}</strong></div></div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!n||invalid} onClick={()=>onSubmit({itemId:item.id,type,quantity:n,reference,remarks,person:"Juan Dela Cruz"})}>Confirm {type}</Button></div></ModalShell>
}

function OtherTransactionModal({items,onClose,onSubmit}:{items:InventoryItem[];onClose:()=>void;onSubmit:(p:any)=>void}){
  const [type,setType]=useState(""); const [itemId,setItemId]=useState(""); const [qty,setQty]=useState(""); const [reason,setReason]=useState(""); const item=items.find(i=>i.id===itemId); const n=Number(qty)||0; const decreases=["Damaged","Lost"].includes(type); const resultingStock=item?(type==="Adjustment"?item.quantity+n:item.quantity+(decreases?-Math.abs(n):Math.abs(n))):0; const invalid=!!item&&resultingStock<0;
  return <ModalShell title="Other Stock Transaction" subtitle="Record returns, adjustments, damaged, or lost items." onClose={onClose}><div className="modal-body"><div className="form-grid single"><Field label="Transaction Type" required><Select className={type?"field-selected":""} value={type} onChange={e=>{setType(e.target.value);setQty("");}}><option value="" disabled>Select transaction type</option><option>Return</option><option>Adjustment</option><option>Damaged</option><option>Lost</option></Select></Field><Field label="Item" required><Select className={itemId?"field-selected":""} value={itemId} onChange={e=>{setItemId(e.target.value);setQty("");}}><option value="" disabled>Select an inventory item</option>{items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit})</option>)}</Select></Field><Field label={type==="Adjustment"?"Adjustment (+/−)":"Quantity"} required error={invalid?"Insufficient stock for this transaction.":undefined}><Input disabled={!type||!item} type="number" value={qty} onChange={e=>setQty(e.target.value)} placeholder={!type||!item?"Choose a transaction type and item first":type==="Adjustment"?"Use a negative number to decrease":"Enter quantity"}/></Field><Field label={type?`${type} Reason`:"Reason"} required><Textarea disabled={!type||!item} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason is required for the audit trail"/></Field></div>{type&&item?<div className="inline-result"><span>Resulting Stock</span><strong>{Math.max(0,resultingStock)} {item.unit}</strong></div>:<div className="summary-placeholder"><span><Icon name="swap" size={24}/></span><strong>Waiting for your selection</strong><p>Choose a transaction type and inventory item to view the resulting stock.</p></div>}</div><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!type||!item||!n||!reason||invalid} onClick={()=>onSubmit({itemId,type,quantity:type==="Adjustment"?n:Math.abs(n),reference:"",remarks:reason,person:"Juan Dela Cruz"})}>Confirm Transaction</Button></div></ModalShell>
}
function ConfirmDialog({title,text,details,onCancel,onConfirm}:{title:string;text:string;details:string[][];onCancel:()=>void;onConfirm:()=>void}){return <div className="modal-backdrop priority"><div className="modal confirm-modal"><div className="confirm-icon"><Icon name="alert" size={24}/></div><h2>{title}</h2><p>{text}</p><div className="confirm-details">{details.map(([a,b])=><div key={a}><span>{a}</span><strong>{b}</strong></div>)}</div><div className="modal-actions"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button onClick={onConfirm}>{title}</Button></div></div></div>}
function TransactionDetail({tx,onClose}:{tx:InventoryTransaction;onClose:()=>void}){return <ModalShell title="Transaction Details" subtitle={tx.reference} onClose={onClose}><div className="modal-body"><div className="transaction-hero"><TypeBadge type={tx.type}/><strong className={tx.quantity>0?"positive":"negative"}>{tx.quantity>0?"+":""}{tx.quantity}</strong><span>{tx.itemName}</span></div><dl><Detail label="Date" value={formatDate(tx.date)}/><Detail label="Previous Stock" value={String(tx.previous)}/><Detail label="New Stock" value={String(tx.next)}/><Detail label="Performed By" value={tx.performedBy}/><Detail label="Reference Number" value={tx.reference}/><Detail label="Remarks" value={tx.remarks}/></dl></div><div className="modal-actions"><Button onClick={onClose}>Done</Button></div></ModalShell>}
