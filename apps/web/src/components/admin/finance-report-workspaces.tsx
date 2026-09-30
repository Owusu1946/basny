"use client";

import { useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { ArrowRight01Icon, CheckmarkCircle02Icon, Download01Icon, PlusSignIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { useCatalogueState } from "@/components/admin/catalogue-workspaces";
import { AdminPagination, paginateItems } from "@/components/admin/admin-pagination";
import { initialCustomers, initialExpenses, initialPayouts, financeTransactions, reportPeriodOptions, type AdminCustomer, type Expense } from "@/lib/admin-operations-data";
import { initialCatalogueProducts, type CatalogueProduct } from "@/lib/admin-catalogue-data";
import { initialAdjustments, makeInventoryVariants, type InventoryVariant, type StockAdjustment } from "@/lib/admin-inventory-data";
import { salesOrders, salesReturns } from "@/lib/admin-sales-data";
import { normalizeCustomerPhone } from "@/lib/customer-identifiers";
import { formatGhs } from "@/lib/sample-catalog";
import { client } from "@/utils/orpc";

function Icon({ icon }: { icon: IconSvgElement }) { return <HugeiconsIcon icon={icon} aria-hidden="true" />; }
function Heading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <header className="ops-heading"><div><p className="admin-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</header>; }
function Status({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "warm" | "bad" | "neutral" }) { return <span className={`ops-status ops-status--${tone}`}><i />{children}</span>; }
function Stats({ items }: { items: { label: string; value: string | number; detail: string }[] }) { return <div className="ops-stats">{items.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div>; }
function TableSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="ops-search"><Icon icon={Search01Icon} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>; }

function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (value: string | number) => {
    const raw = typeof value === "string" && /^[\s]*[=+\-@]/.test(value) ? `'${value}` : String(value);
    return `"${raw.replaceAll('"', '""')}"`;
  };
  const contents = [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function accraDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Accra", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function reportDateKey(value: string) {
  if (/^today\b/i.test(value)) return accraDateKey();
  if (/^yesterday\b/i.test(value)) return addDays(accraDateKey(), -1);
  const match = value.match(/\b(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\b/);
  if (!match) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months.findIndex((name) => name.toLowerCase() === match[2].toLowerCase());
  if (month < 0) return "";
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
}

type FinanceTransaction = (typeof financeTransactions)[number];
const transactionByOrder = new Map(financeTransactions.map((item) => [item.order, item]));
const transactionCsvHeaders = ["Transaction", "Order", "Customer", "Method", "Status", "Amount GHS", "Fee GHS", "Reference", "Date"];
function transactionCsvRows(rows: FinanceTransaction[]) { return rows.map((item) => [item.id, item.order, item.customer, item.method, item.status, item.amountGhs, item.feeGhs, item.reference, item.date]); }
function FinanceTable({ rows, query, setQuery, title = "Transactions" }: { rows: FinanceTransaction[]; query: string; setQuery: (value: string) => void; title?: string }) {
  const [page, setPage] = useState(1);
  const filtered = rows.filter((item) => `${item.id} ${item.order} ${item.customer} ${item.method} ${item.reference} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  const pageRows = paginateItems(filtered, page, 25);
  return <><div className="ops-toolbar"><TableSearch value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Search order, customer, method, or reference" /><span className="ops-result-count">{filtered.length} records</span></div><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Transaction</th><th>Order & customer</th><th>Method</th><th>Amount</th><th>Provider fee</th><th>Status</th><th>Date</th></tr></thead><tbody>{pageRows.map((item) => <tr key={item.id}><td><strong>{item.id}</strong><small>{item.reference}</small></td><td>{item.order}<small>{item.customer}</small></td><td>{item.method}</td><td>{formatGhs(item.amountGhs)}</td><td>{formatGhs(item.feeGhs)}</td><td><Status tone={item.status === "Paid" ? "good" : item.status === "Refunded" || item.status === "Failed" ? "bad" : "warm"}>{item.status}</Status></td><td>{item.date}</td></tr>)}</tbody></table></div><div className="ops-mobile-list">{pageRows.map((item) => <article className="ops-mobile-card" key={item.id}><div className="ops-mobile-card__top"><strong>{item.order}</strong><Status tone={item.status === "Paid" ? "good" : item.status === "Refunded" || item.status === "Failed" ? "bad" : "warm"}>{item.status}</Status></div><span>{item.customer} · {item.method}</span><span>{formatGhs(item.amountGhs)} · {item.date}</span><small>{item.reference}</small></article>)}</div><AdminPagination total={filtered.length} page={page} pageSize={25} onPageChange={setPage} label="transactions" />{!filtered.length && <p className="ops-empty">No transactions match this search.</p>}</>;
}

function LivePaymentTransactions({ overview = false }: { overview?: boolean }) {
  const [rows, setRows] = useState<FinanceTransaction[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; const load = async () => { try { const result = await client.listStaffPayments(); if (!active) return; setRows(result.map(({ payment, orderReference, customerName }) => ({ id: payment.id, order: orderReference, customer: customerName, method: "Paystack", status: payment.status === "success" ? "Paid" : payment.status === "failed" ? "Failed" : "Pending", amountGhs: payment.amountSubunits / 100, feeGhs: 0, reference: payment.reference, date: new Date(payment.createdAt).toLocaleString("en-GH", { timeZone: "Africa/Accra" }) }))); setError(""); } catch { if (active) setError("Payment records could not be loaded. Confirm your staff access and database migration."); } finally { if (active) setBusy(false); } }; const onRealtime = (event: Event) => { const name = (event as CustomEvent<{ name?: string }>).detail?.name; if (name?.startsWith("payment.")) void load(); }; void load(); window.addEventListener("basny:realtime", onRealtime); const timer = window.setInterval(() => void load(), 15000); return () => { active = false; window.removeEventListener("basny:realtime", onRealtime); window.clearInterval(timer); }; }, []);
  const settled = rows.filter((row) => row.status === "Paid");
  const visible = rows.filter((row) => `${row.id} ${row.order} ${row.customer} ${row.reference} ${row.status}`.toLowerCase().includes(query.toLowerCase()));
  const shown = overview ? visible.slice(0, 4) : visible;
  return <div className="ops-workspace"><Heading eyebrow={`FINANCES · ${overview ? "OVERVIEW" : "PAYMENT RECORDS"}`} title={overview ? "Finance overview" : "Transactions"} description={overview ? "Verified Paystack receipts from persisted BASNY orders." : "Payment attempts, provider references, and verified outcomes."} />{error && <p className="ops-error" role="alert">{error}</p>}<Stats items={[{ label: "Verified paid", value: settled.length, detail: formatGhs(settled.reduce((sum, row) => sum + row.amountGhs, 0)) }, { label: "Pending", value: rows.filter((row) => row.status === "Pending").length, detail: "Awaiting provider verification" }, { label: "Failed", value: rows.filter((row) => row.status === "Failed").length, detail: "Payment can be retried" }, { label: "Total attempts", value: rows.length, detail: "Persisted Paystack transactions" }]} />{busy ? <section className="ops-settings-card" aria-busy="true"><p>Loading payments from the order ledger…</p></section> : <><div className="ops-toolbar"><TableSearch value={query} onChange={setQuery} placeholder="Search order, customer, or provider reference" /><span className="ops-result-count">{visible.length} transactions</span></div>{shown.length ? <FinanceTable rows={shown} query="" setQuery={() => undefined} /> : <p className="ops-empty">No Paystack transactions have been recorded yet.</p>}</>}{overview && <p className="ops-note">Paystack fees and payouts are not included because the gateway transaction verify response is not a settlement statement.</p>}</div>;
}

type ExpenseDraft = Omit<Expense, "id">;
const emptyExpense: ExpenseDraft = { date: accraDateKey(), category: "Supplies", description: "", amountGhs: 0, method: "Cash", reference: "" };
const categories = ["Packaging", "Delivery", "Utilities", "Rent", "Supplies", "Marketing", "Other"];
const emptyInventoryVariants: InventoryVariant[] = [];
const emptyIds: string[] = [];

function LegacyFinanceWorkspace({ path }: { path: string }) {
  const [expenses, setExpenses] = useCatalogueState<Expense[]>("expenses", initialExpenses);
  const [reconciled, setReconciled] = useCatalogueState<string[]>("reconciled-transactions", emptyIds);
  const [reconciledBatches, setReconciledBatches] = useCatalogueState<string[]>("reconciled-batches", emptyIds);
  const [selectedPayoutId, setSelectedPayoutId] = useState(initialPayouts[0]?.id ?? "");
  const [query, setQuery] = useState(""); const [expenseOpen, setExpenseOpen] = useState(false); const [confirmExpenseId, setConfirmExpenseId] = useState<string | null>(null); const [draft, setDraft] = useState<ExpenseDraft>(emptyExpense); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [listPage, setListPage] = useState(1);
  const page = path.split("/").at(-1) ?? "finances";
  if (page === "transactions") return <LivePaymentTransactions />;
  if (page === "finances") return <LivePaymentTransactions overview />;
  const settled = financeTransactions.filter((item) => item.status === "Paid");
  const payoutRows = paginateItems(initialPayouts, listPage, 25);
  const overviewTransactions = financeTransactions.slice(0, 4).filter((item) => `${item.id} ${item.order} ${item.customer} ${item.method} ${item.reference} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  const visibleTransactions = financeTransactions.filter((item) => `${item.id} ${item.order} ${item.customer} ${item.method} ${item.reference} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  const revenue = settled.reduce((sum, item) => sum + item.amountGhs, 0);
  const fees = settled.reduce((sum, item) => sum + item.feeGhs, 0);
  if (page === "transactions") return <div className="ops-workspace"><Heading eyebrow="FINANCES · PAYMENT RECORDS" title="Transactions" description="Review payment outcomes against their orders and gateway references." action={<button className="admin-primary-button" type="button" onClick={() => exportCsv("basny-transactions.csv", transactionCsvHeaders, transactionCsvRows(visibleTransactions))}><Icon icon={Download01Icon} /> Export filtered CSV</button>} /><Stats items={[{ label: "Successful", value: settled.length, detail: formatGhs(revenue) }, { label: "Pending", value: financeTransactions.filter((item) => item.status === "Pending").length, detail: "Awaiting confirmation" }, { label: "Failed or refunded", value: financeTransactions.filter((item) => item.status === "Failed" || item.status === "Refunded").length, detail: "Review before action" }]} /><FinanceTable rows={financeTransactions} query={query} setQuery={setQuery} /><p className="ops-note">These are illustrative records. A payment is marked successful only after server verification or a verified provider webhook; never store card credentials here.</p></div>;
  if (page === "payouts") return <div className="ops-workspace"><Heading eyebrow="FINANCES · SETTLEMENTS" title="Payouts" description="Compare provider settlements with their transaction batches." /><Stats items={[{ label: "Settled", value: initialPayouts.filter((item) => item.status === "Settled").length, detail: "Sample provider payouts" }, { label: "In transit", value: initialPayouts.filter((item) => item.status === "Processing").length, detail: "Not yet in bank" }, { label: "Net settlements", value: formatGhs(initialPayouts.reduce((sum, item) => sum + item.amountGhs, 0)), detail: "After listed fees" }]} /><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Payout</th><th>Provider reference</th><th>Orders</th><th>Gross settlement</th><th>Fees</th><th>Expected</th><th>Status</th></tr></thead><tbody>{payoutRows.map((item) => <tr key={item.id}><td>{item.id}<small>{item.provider}</small></td><td>{item.reference}</td><td>{item.orderCount}</td><td>{formatGhs(item.amountGhs + item.feeGhs)}</td><td>{formatGhs(item.feeGhs)}</td><td>{item.expected}</td><td><Status tone={item.status === "Settled" ? "good" : "warm"}>{item.status}</Status></td></tr>)}</tbody></table></div><div className="ops-mobile-list">{payoutRows.map((item) => <article className="ops-mobile-card" key={`${item.id}-mobile`}><div className="ops-mobile-card__top"><strong>{item.id}</strong><Status tone={item.status === "Settled" ? "good" : "warm"}>{item.status}</Status></div><span>{item.provider} · {item.reference}</span><span>{item.orderCount} orders · net {formatGhs(item.amountGhs)} · fees {formatGhs(item.feeGhs)}</span><small>Expected {item.expected}</small></article>)}</div><AdminPagination total={initialPayouts.length} page={listPage} pageSize={25} onPageChange={setListPage} label="payouts" /><p className="ops-note">Payout confirmations will be imported from the payment provider. These example batches are not live settlement data.</p></div>;
  if (page === "expenses") {
      const visible = expenses.filter((item) => `${item.id} ${item.description} ${item.category} ${item.reference}`.toLowerCase().includes(query.toLowerCase()));
    const pageRows = paginateItems(visible, listPage, 25);
    const save = () => { if (!draft.description.trim() || !Number.isFinite(draft.amountGhs) || draft.amountGhs <= 0) { setError("Enter a description and a positive amount."); return; } setExpenses((current) => [{ ...draft, id: `EXP-${Date.now().toString().slice(-5)}`, description: draft.description.trim() }, ...current]); setExpenseOpen(false); setError(""); };
    return <div className="ops-workspace"><Heading eyebrow="FINANCES · OPERATING COSTS" title="Expenses" description="Record store costs so operating spend can be reviewed beside sales." action={<button className="admin-primary-button" type="button" onClick={() => { setDraft(emptyExpense); setError(""); setExpenseOpen(true); }}><Icon icon={PlusSignIcon} /> Add expense</button>} /><Stats items={[{ label: "Recorded expenses", value: expenses.length, detail: "Current browser records" }, { label: "Total expenses", value: formatGhs(expenses.reduce((sum, item) => sum + item.amountGhs, 0)), detail: "Across all dates" }, { label: "This month", value: formatGhs(expenses.filter((item) => item.date.startsWith(accraDateKey().slice(0, 7))).reduce((sum, item) => sum + item.amountGhs, 0)), detail: `GHS · ${new Intl.DateTimeFormat("en-GH", { month: "long", year: "numeric", timeZone: "Africa/Accra" }).format(new Date())}` }]} /><div className="ops-toolbar"><TableSearch value={query} onChange={(value) => { setQuery(value); setListPage(1); }} placeholder="Search expense, category, or reference" /></div><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Method</th><th>Reference</th><th>Amount</th><th></th></tr></thead><tbody>{pageRows.map((item) => <tr key={item.id}><td>{item.date}</td><td><strong>{item.description}</strong><small>{item.id}</small></td><td>{item.category}</td><td>{item.method}</td><td>{item.reference || "—"}</td><td>{formatGhs(item.amountGhs)}</td><td><button className="ops-danger-text" type="button" onClick={() => setConfirmExpenseId(item.id)}>Remove</button></td></tr>)}</tbody></table></div><div className="ops-mobile-list">{pageRows.map((item) => <article className="ops-mobile-card" key={item.id}><div className="ops-mobile-card__top"><strong>{item.description}</strong><b>{formatGhs(item.amountGhs)}</b></div><span>{item.category} · {item.date} · {item.method}</span><button className="ops-danger-text" type="button" onClick={() => setConfirmExpenseId(item.id)}>Remove expense</button></article>)}</div><AdminPagination total={visible.length} page={listPage} pageSize={25} onPageChange={setListPage} label="expenses" /><p className="ops-note">Expense records are stored in this browser. Keep source receipts in the business accounting system when connecting live finance records.</p>{confirmExpenseId && <div className="ops-modal-scrim" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setConfirmExpenseId(null)}><section className="ops-modal" role="alertdialog" aria-modal="true" aria-labelledby="remove-expense-title"><div className="ops-modal__head"><div><p className="admin-eyebrow">FINANCE RECORD</p><h2 id="remove-expense-title">Remove this expense?</h2></div></div><p>This deletes the sample record from this browser. Use your accounting system to retain source receipts and correction history.</p><div className="ops-modal__actions"><button className="admin-secondary-button" type="button" onClick={() => setConfirmExpenseId(null)}>Keep record</button><button className="ops-danger-button" type="button" onClick={() => { setExpenses((current) => current.filter((expense) => expense.id !== confirmExpenseId)); setConfirmExpenseId(null); }}>Remove expense</button></div></section></div>}{expenseOpen && <div className="ops-modal-scrim" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setExpenseOpen(false)}><section className="ops-modal" role="dialog" aria-modal="true" aria-labelledby="expense-title"><div className="ops-modal__head"><div><p className="admin-eyebrow">FINANCE RECORD</p><h2 id="expense-title">Add expense</h2></div><button className="ops-quiet-button" type="button" aria-label="Close" onClick={() => setExpenseOpen(false)}>×</button></div><label className="ops-field">Description<input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label><div className="ops-form-grid"><label className="ops-field">Date<input type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} /></label><label className="ops-field">Category<select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="ops-field">Amount (GHS)<input type="number" min="0.01" step="0.01" value={draft.amountGhs || ""} onChange={(event) => setDraft((current) => ({ ...current, amountGhs: Number(event.target.value) }))} /></label><label className="ops-field">Payment method<select value={draft.method} onChange={(event) => setDraft((current) => ({ ...current, method: event.target.value }))}><option>Cash</option><option>Mobile Money</option><option>Bank transfer</option><option>Card</option></select></label><label className="ops-field ops-field--wide">Reference<input value={draft.reference} onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))} placeholder="Receipt or transfer reference" /></label></div>{error && <p className="ops-error" role="alert">{error}</p>}<div className="ops-modal__actions"><button className="admin-secondary-button" type="button" onClick={() => setExpenseOpen(false)}>Cancel</button><button className="admin-primary-button" type="button" onClick={save}>Save expense</button></div></section></div>}</div>;
  }
  if (page === "reconciliation") {
    const payout = initialPayouts.find((item) => item.id === selectedPayoutId) ?? initialPayouts[0];
    const batchRows = payout ? payout.transactionIds.map((id) => financeTransactions.find((transaction) => transaction.id === id)).filter((item): item is FinanceTransaction => Boolean(item)) : [];
    const rows = batchRows.filter((item) => `${item.id} ${item.order} ${item.reference}`.toLowerCase().includes(query.toLowerCase()));
    const pageRows = paginateItems(rows, listPage, 25);
    const expectedNet = batchRows.reduce((sum, item) => sum + item.amountGhs - item.feeGhs, 0);
    const variance = payout ? payout.amountGhs - expectedNet : 0;
    const allMatched = batchRows.length > 0 && batchRows.every((item) => reconciled.includes(item.id));
    const confirmBatch = () => { if (!payout || payout.status !== "Settled" || Math.abs(variance) > 0.01 || !allMatched) return; setReconciledBatches((current) => current.includes(payout.id) ? current : [...current, payout.id]); setNotice(`Payout ${payout.id} marked reconciled.`); };
    const mark = (id: string) => { const wasReviewed = reconciled.includes(id); setReconciled((current) => wasReviewed ? current.filter((entry) => entry !== id) : [...current, id]); if (wasReviewed && payout) setReconciledBatches((current) => current.filter((batchId) => batchId !== payout.id)); };
    return <div className="ops-workspace"><Heading eyebrow="FINANCES · CLOSE THE BOOKS" title="Reconciliation" description="Compare a provider payout with the successful orders and fees assigned to its settlement batch." /><label className="ops-field ops-reconcile-batch">Settlement batch<select value={selectedPayoutId} onChange={(event) => { setSelectedPayoutId(event.target.value); setListPage(1); }}>{initialPayouts.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.provider} · {item.expected}</option>)}</select></label>{payout && <Stats items={[{ label: "Provider payout", value: formatGhs(payout.amountGhs), detail: `${payout.status} · ${payout.reference}` }, { label: "Calculated from orders", value: formatGhs(expectedNet), detail: `${batchRows.length} linked successful transactions` }, { label: "Difference", value: formatGhs(variance), detail: Math.abs(variance) <= 0.01 ? "Amounts agree" : "Investigate before reconciling" }]} />}<div className="ops-toolbar"><TableSearch value={query} onChange={(value) => { setQuery(value); setListPage(1); }} placeholder="Search transaction or reference" /><span className="ops-result-count">{rows.length} batch transactions</span></div><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Reviewed</th><th>Transaction</th><th>Order & customer</th><th>Provider reference</th><th>Method</th><th>Gross</th><th>Fee</th><th>Net</th></tr></thead><tbody>{pageRows.map((item) => <tr key={item.id}><td><input type="checkbox" checked={reconciled.includes(item.id)} onChange={() => mark(item.id)} aria-label={`Confirm review of ${item.id}`} /></td><td>{item.id}<small>{item.date}</small></td><td>{item.order}<small>{item.customer}</small></td><td>{item.reference}</td><td>{item.method}</td><td>{formatGhs(item.amountGhs)}</td><td>{formatGhs(item.feeGhs)}</td><td>{formatGhs(item.amountGhs - item.feeGhs)}</td></tr>)}</tbody></table></div><div className="ops-mobile-list">{pageRows.map((item) => <article className="ops-mobile-card" key={`${item.id}-mobile`}><div className="ops-mobile-card__top"><label className="ops-check-row"><input type="checkbox" checked={reconciled.includes(item.id)} onChange={() => mark(item.id)} />{item.id}</label><b>Net {formatGhs(item.amountGhs - item.feeGhs)}</b></div><span>{item.order} · {item.customer}</span><span>{item.method} · gross {formatGhs(item.amountGhs)} · fee {formatGhs(item.feeGhs)}</span><small>Provider reference {item.reference}</small></article>)}</div><AdminPagination total={rows.length} page={listPage} pageSize={25} onPageChange={setListPage} label="reconciliation transactions" /><div className="ops-reconcile-footer"><p className="ops-note">Review each linked transaction against the provider statement. A batch can be marked reconciled only when all linked rows are reviewed, the calculated net agrees, and the provider has settled the funds.</p>{payout?.status !== "Settled" && <p className="ops-note ops-note--warning">This payout is still processing. Reconcile it after the provider confirms settlement.</p>}<button className="admin-primary-button" type="button" onClick={confirmBatch} disabled={!allMatched || payout?.status !== "Settled" || Math.abs(variance) > 0.01 || Boolean(payout && reconciledBatches.includes(payout.id))}>{payout && reconciledBatches.includes(payout.id) ? "Payout reconciled" : "Confirm payout match"}</button></div>{notice && <p className="ops-success" role="status">{notice}</p>}<p className="ops-note ops-note--warning">Batch membership and settlement amounts are illustrative. The live system must import or verify provider settlement data; a local confirmation is not proof that funds reached BASNY.</p></div>;
  }
  return <div className="ops-workspace"><Heading eyebrow="FINANCES · OVERVIEW" title="Finance overview" description="Keep verified sales, payment fees and recorded expenses in view." /><Stats items={[{ label: "Paid sales", value: formatGhs(revenue), detail: `${settled.length} successful sample transactions` }, { label: "Provider fees", value: formatGhs(fees), detail: "Listed against paid transactions" }, { label: "Recorded expenses", value: formatGhs(expenses.reduce((sum, item) => sum + item.amountGhs, 0)), detail: "Browser-recorded operating costs" }, { label: "Net after recorded fees & expenses", value: formatGhs(revenue - fees - expenses.reduce((sum, item) => sum + item.amountGhs, 0)), detail: "Illustrative, before other costs" }]} /><section className="ops-report-panel"><div className="ops-panel-heading"><div><p className="admin-eyebrow">RECENT ACTIVITY</p><h2>Payment transactions</h2></div><button type="button" className="admin-secondary-button" onClick={() => exportCsv("basny-transactions.csv", transactionCsvHeaders, transactionCsvRows(overviewTransactions))}><Icon icon={Download01Icon} /> Export visible CSV</button></div><FinanceTable rows={financeTransactions.slice(0, 4)} query={query} setQuery={setQuery} title="Recent transactions" /></section><p className="ops-note">Values are sample data, not a ledger or accounting statement. This screen excludes unverified and pending payments from paid sales.</p></div>;
}

type ReportRow = { date: string; group: string; metric: string; value: string | number; orderCount?: number };
const reportNames: Record<string, string> = { sales: "Sales", products: "Products", inventory: "Inventory", customers: "Customers", orders: "Orders", payments: "Payments" };

export function ReportsWorkspace({ path }: { path: string }) {
  const key = path.split("/").at(-1) ?? "sales"; const title = reportNames[key] ?? "Sales";
  const [period, setPeriod] = useState<(typeof reportPeriodOptions)[number]>("30 days"); const [start, setStart] = useState(() => `${accraDateKey().slice(0, 7)}-01`); const [end, setEnd] = useState(() => accraDateKey()); const [query, setQuery] = useState(""); const [reportPage, setReportPage] = useState(1);
  const [grain, setGrain] = useState<"Daily" | "Weekly" | "Monthly">("Daily");
  const [reportFilter, setReportFilter] = useState("All");
  const [products] = useCatalogueState<CatalogueProduct[]>("products", initialCatalogueProducts);
  const [customers] = useCatalogueState<AdminCustomer[]>("customers", initialCustomers);
  const [inventory] = useCatalogueState<InventoryVariant[]>("inventory-variants", emptyInventoryVariants);
  const [adjustments] = useCatalogueState<StockAdjustment[]>("inventory-adjustments", initialAdjustments);
  const today = accraDateKey();
  const allVariants = useMemo(() => inventory.length ? inventory : makeInventoryVariants(products), [inventory, products]);
  const stockStatusByProduct = useMemo(() => {
    const totals = new Map<string, number>();
    const lowStock = new Set<string>();
    for (const variant of allVariants) {
      const available = Math.max(0, variant.onHand - variant.reserved);
      totals.set(variant.productSlug, (totals.get(variant.productSlug) ?? 0) + available);
      if (available > 0 && available <= variant.lowStockThreshold) lowStock.add(variant.productSlug);
    }
    return new Map(products.map((product) => {
      const available = totals.get(product.slug) ?? 0;
      return [product.slug, available <= 0 ? "out of stock" : lowStock.has(product.slug) ? "low stock" : "in stock"] as const;
    }));
  }, [allVariants, products]);
  const periodStart = period === "Today" ? today : period === "7 days" ? addDays(today, -6) : period === "30 days" ? addDays(today, -29) : period === "This month" ? `${today.slice(0, 7)}-01` : start;
  const periodEnd = period === "Custom range" ? end : today;
  const allPaidOrders = useMemo(() => salesOrders.flatMap((order) => {
    const date = order.dateKey ?? reportDateKey(order.date); const transaction = transactionByOrder.get(order.id);
    return transaction?.status === "Paid" && date ? [{ order, date, transaction }] : [];
  }), [today]);
  const paidOrdersInPeriod = useMemo(() => allPaidOrders.filter((item) => item.date >= periodStart && item.date <= periodEnd), [allPaidOrders, periodStart, periodEnd]);
  const productUnitsBySlug = useMemo(() => {
    const units = new Map<string, number>();
    for (const { order } of paidOrdersInPeriod) for (const line of order.lines) units.set(line.product.slug, (units.get(line.product.slug) ?? 0) + line.quantity);
    return units;
  }, [paidOrdersInPeriod]);
  const paidOrdersByPhone = useMemo(() => {
    const ordersByPhone = new Map<string, typeof allPaidOrders>();
    for (const item of allPaidOrders) {
      const phone = normalizeCustomerPhone(item.order.contact);
      if (phone) {
        const customerOrders = ordersByPhone.get(phone);
        if (customerOrders) customerOrders.push(item);
        else ordersByPhone.set(phone, [item]);
      }
    }
    return ordersByPhone;
  }, [allPaidOrders]);
  const categorySales = useMemo(() => {
    const productBySlug = new Map(products.map((product) => [product.slug, product]));
    const totals = new Map<string, { revenue: number; units: number }>();
    for (const { order } of paidOrdersInPeriod) for (const line of order.lines) {
      const category = productBySlug.get(line.product.slug)?.category ?? line.product.category;
      const current = totals.get(category) ?? { revenue: 0, units: 0 };
      current.revenue += line.product.priceGhs * line.quantity;
      current.units += line.quantity;
      totals.set(category, current);
    }
    return [...totals.entries()].map(([category, value]) => ({ category, ...value })).sort((a, b) => b.revenue - a.revenue);
  }, [paidOrdersInPeriod, products]);
  const productUnits = (slug: string) => productUnitsBySlug.get(slug) ?? 0;
  const startOk = period !== "Custom range" || start <= end;
  const reportRows: ReportRow[] = useMemo(() => {
    if (key === "products") return products.map((product) => { const units = productUnits(product.slug); const availability = stockStatusByProduct.get(product.slug) ?? "out of stock"; return { date: "", group: product.name, metric: units ? `${units} units in period · ${availability}` : `No sales in period · ${availability}`, value: units }; }).sort((a, b) => Number(b.value) - Number(a.value));
    if (key === "inventory") return allVariants.map((item) => ({ date: "", group: `${item.productName} · ${item.colour} · ${item.size}`, metric: `On hand ${item.onHand} · reserved ${item.reserved} · available ${item.onHand - item.reserved}`, value: item.onHand - item.reserved }));
    if (key === "customers") return customers.flatMap((customer) => {
      const matchingOrders = paidOrdersByPhone.get(normalizeCustomerPhone(customer.phone)) ?? [];
      const periodOrders = matchingOrders.filter((item) => item.date >= periodStart && item.date <= periodEnd);
      if (!periodOrders.length) return [];
      const firstPurchase = matchingOrders.map((item) => item.date).sort()[0];
      const orderClass = firstPurchase >= periodStart && firstPurchase <= periodEnd ? "New customer" : "Repeat customer";
      const lastPurchase = periodOrders.map((item) => item.date).sort().at(-1) ?? "";
      return [{ date: lastPurchase, group: customer.name, metric: `${orderClass} · ${periodOrders.length} paid ${periodOrders.length === 1 ? "order" : "orders"} · ${customer.marketingConsent ? "Consented" : "Not opted in"}`, value: periodOrders.reduce((sum, item) => sum + item.transaction.amountGhs, 0) }];
    }).sort((a, b) => Number(b.value) - Number(a.value));
    if (key === "orders") return [...salesOrders.map((order) => { const paymentStatus = transactionByOrder.get(order.id)?.status; return { date: order.dateKey ?? reportDateKey(order.date), group: order.id, metric: `${order.status === "Complete" ? "Completed" : order.status}${paymentStatus === "Refunded" ? " · Refunded" : ""} · ${order.channel} · ${order.customer}`, value: order.total }; }), ...salesReturns.map((item) => ({ date: reportDateKey(item.requested), group: item.order, metric: `Returned · ${item.resolution === "Refund" ? "Refunded · " : ""}${item.customer} · ${item.status}`, value: item.product.priceGhs }))];
    if (key === "payments") return financeTransactions.map((item) => ({ date: reportDateKey(item.date), group: item.id, metric: `${item.status === "Paid" ? "Successful" : item.status} · ${item.method} · ${item.order}`, value: item.amountGhs }));
    const byDate = new Map<string, { revenue: number; orderCount: number }>();
    paidOrdersInPeriod.forEach(({ date, transaction }) => {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const bucket = grain === "Monthly" ? `${date.slice(0, 7)}-01` : grain === "Weekly" ? addDays(date, -((weekday + 6) % 7)) : date;
      const previous = byDate.get(bucket) ?? { revenue: 0, orderCount: 0 };
      byDate.set(bucket, { revenue: previous.revenue + transaction.amountGhs, orderCount: previous.orderCount + 1 });
    });
    return [...byDate.entries()].map(([date, values]) => ({ date, group: date, metric: `${values.orderCount} verified sample orders`, value: values.revenue, orderCount: values.orderCount }));
  }, [key, products, allVariants, stockStatusByProduct, customers, periodStart, periodEnd, productUnitsBySlug, paidOrdersByPhone, paidOrdersInPeriod, grain]);
  const reportFilters = key === "products" ? ["All", "Best sellers", "Low performers", "No sales", "Low stock", "Out of stock"] : key === "orders" ? ["All", "Completed", "Cancelled", "Returned", "Refunded"] : key === "payments" ? ["All", "Successful", "Failed", "Pending", "Refunded"] : [];
  const effectiveFilter = reportFilters.includes(reportFilter) ? reportFilter : "All";
  const filtered = reportRows.filter((row) => {
    const inPeriod = key === "sales" || !row.date || row.date >= periodStart && row.date <= periodEnd;
    const matchesFilter = effectiveFilter === "All" || (key === "products" && (effectiveFilter === "Best sellers" ? Number(row.value) > 0 : effectiveFilter === "Low performers" ? Number(row.value) > 0 && Number(row.value) <= 1 : effectiveFilter === "No sales" ? Number(row.value) === 0 : effectiveFilter === "Low stock" ? /low stock/i.test(row.metric) : /out of stock/i.test(row.metric))) || (key !== "products" && row.metric.toLowerCase().includes(effectiveFilter.toLowerCase()));
    return inPeriod && matchesFilter && `${row.group} ${row.metric} ${row.date}`.toLowerCase().includes(query.toLowerCase());
  });
  const pageRows = paginateItems(filtered, reportPage, 25);
  const total = filtered.reduce((sum, row) => sum + Number(row.value), 0);
  const orderPeriodCount = key === "sales" ? filtered.reduce((sum, row) => sum + (row.orderCount ?? 0), 0) : 0;
  const exportRows = filtered.map((row) => [row.date, row.group, row.metric, row.value]);
  function exportReport() {
    const valueHeader = key === "products" ? "Units sold" : key === "inventory" ? "Available units" : key === "customers" || key === "sales" ? "Amount GHS" : "Amount GHS";
    exportCsv(`basny-${key}-report.csv`, ["Date", "Record", "Status or detail", valueHeader], exportRows);
  }
  const reportValue = key === "sales" ? formatGhs(total) : key === "products" ? filtered.reduce((sum, row) => sum + Number(row.value), 0) : filtered.length;
  const repeatCustomers = filtered.filter((row) => row.metric.startsWith("Repeat customer")).length;
  const newCustomers = filtered.filter((row) => row.metric.startsWith("New customer")).length;
  const cancelledOrRefundedInPeriod = filtered.filter((row) => /cancel|refund|returned/i.test(row.metric)).length;
  const attentionPaymentsInPeriod = filtered.filter((row) => /pending|failed/i.test(row.metric)).length;
  const chartRows = key === "sales" ? filtered.slice().sort((a, b) => a.date.localeCompare(b.date)) : [];
  const chartMax = chartRows.reduce((max, entry) => Math.max(max, Number(entry.value)), 1);
  return <div className="ops-workspace"><Heading eyebrow={`REPORTS · ${title.toUpperCase()}`} title={`${title} report`} description="Review a filtered business view and export the same rows shown here." action={<button className="admin-primary-button" type="button" onClick={exportReport} disabled={!startOk}><Icon icon={Download01Icon} /> Export CSV</button>} /><div className="ops-report-filters">{key === "inventory" ? <span className="ops-result-count">Current stock snapshot</span> : <><label className="ops-field">Reporting period<select value={period} onChange={(event) => { setPeriod(event.target.value as (typeof reportPeriodOptions)[number]); setReportPage(1); }}>{reportPeriodOptions.map((item) => <option key={item}>{item}</option>)}</select></label>{period === "Custom range" && <><label className="ops-field">From<input type="date" value={start} onChange={(event) => { setStart(event.target.value); setReportPage(1); }} /></label><label className="ops-field">To<input type="date" value={end} onChange={(event) => { setEnd(event.target.value); setReportPage(1); }} /></label></>}</>}{key === "sales" && <label className="ops-field">Group by<select value={grain} onChange={(event) => { setGrain(event.target.value as typeof grain); setReportPage(1); }}><option>Daily</option><option>Weekly</option><option>Monthly</option></select></label>}<TableSearch value={query} onChange={(value) => { setQuery(value); setReportPage(1); }} placeholder={`Search ${title.toLowerCase()} report`} /></div>{!startOk && <p className="ops-error" role="alert">The end date must be on or after the start date.</p>}{reportFilters.length > 0 && <div className="ops-filter-row" role="group" aria-label={`${title} report filter`}>{reportFilters.map((item) => <button key={item} type="button" className={`ops-filter-pill${effectiveFilter === item ? " is-active" : ""}`} aria-pressed={effectiveFilter === item} onClick={() => { setReportFilter(item); setReportPage(1); }}>{item}</button>)}{key === "products" && effectiveFilter === "Low performers" && <span className="ops-note">Low performers are products with 1 paid unit or fewer in the selected period.</span>}</div>}<Stats items={[{ label: key === "sales" ? "Verified sample revenue" : key === "customers" ? "Customers in view" : key === "products" ? "Units sold" : "Records in view", value: reportValue, detail: `${key === "inventory" ? "Current stock snapshot" : period} · ${filtered.length} report rows` }, ...(key === "sales" ? [{ label: "Average order value", value: formatGhs(orderPeriodCount ? total / orderPeriodCount : 0), detail: `${orderPeriodCount} successful orders` }] : []), ...(key === "inventory" ? [{ label: "Low or out", value: allVariants.filter((item) => item.onHand - item.reserved <= item.lowStockThreshold).length, detail: "Variants at or below threshold" }] : []), ...(key === "customers" ? [{ label: "New / repeat", value: `${newCustomers} / ${repeatCustomers}`, detail: "First purchase in period / previous customers" }] : []), ...(key === "orders" ? [{ label: "Cancelled / refunded", value: cancelledOrRefundedInPeriod, detail: "In the selected period" }] : []), ...(key === "payments" ? [{ label: "Needs attention", value: attentionPaymentsInPeriod, detail: "Pending or failed in period" }] : [])]} /><div className="ops-toolbar"><span className="ops-result-count">{filtered.length} rows</span></div>{key === "sales" && <section className="ops-report-panel"><div className="ops-panel-heading"><div><p className="admin-eyebrow">REVENUE BY {grain.toUpperCase()}</p><h2>{grain} sales trend</h2></div><span>GHS · verified sample payments only</span></div><div className="ops-chart" role="img" aria-label={`${grain} verified sample revenue chart`}>{chartRows.map((row) => <div className="ops-chart__column" key={row.date}><strong>{formatGhs(Number(row.value))}</strong><span style={{ height: `${Math.max(8, Number(row.value) / chartMax * 100)}%` }} /><small>{grain === "Monthly" ? row.date.slice(0, 7) : row.date.slice(5)}</small></div>)}</div></section>}{key === "sales" && <section className="ops-report-panel"><div className="ops-panel-heading"><div><p className="admin-eyebrow">PRODUCT MIX</p><h2>Sales by category</h2></div><span>Product subtotal · excludes delivery fees</span></div>{categorySales.length ? <div className="ops-category-sales">{categorySales.map((item) => <div key={item.category}><span>{item.category}<small>{item.units} units</small></span><strong>{formatGhs(item.revenue)}</strong></div>)}</div> : <p className="ops-empty">No verified sample sales in this period.</p>}</section>}{filtered.length === 0 ? <div className="ops-empty">No {title.toLowerCase()} records match these filters.</div> : <><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Date</th><th>{key === "sales" ? grain : key === "inventory" ? "Product variant" : key === "customers" ? "Customer" : key === "products" ? "Product" : key === "payments" ? "Transaction" : "Order"}</th><th>State and detail</th><th>{key === "products" ? "Units sold" : key === "inventory" ? "Available" : key === "customers" || key === "sales" ? "GHS" : "Amount"}</th></tr></thead><tbody>{pageRows.map((row, index) => <tr key={`${row.group}-${index}`}><td>{row.date || "—"}</td><td>{row.group}</td><td>{row.metric}</td><td>{key === "products" || key === "inventory" ? row.value : formatGhs(Number(row.value))}</td></tr>)}</tbody></table></div><div className="ops-mobile-list">{pageRows.map((row, index) => <article className="ops-mobile-card" key={`${row.group}-mobile-${index}`}><div className="ops-mobile-card__top"><strong>{row.group}</strong><b>{key === "products" || key === "inventory" ? row.value : formatGhs(Number(row.value))}</b></div><span>{row.date || "Current"} · {row.metric}</span></article>)}</div><AdminPagination total={filtered.length} page={reportPage} pageSize={25} onPageChange={setReportPage} label={title + " report rows"} /></>}{key === "inventory" && <p className="ops-note">Stock balances reflect browser inventory records. Stock reserved for orders and server-side movement history will come from the inventory service.</p>}{key === "customers" && <p className="ops-note">Customer exports contain private data and must be role-restricted by the server. Marketing consent is shown as recorded; exports must not imply consent where none exists.</p>}{key === "payments" && <p className="ops-note">Never export payment credentials or card data. Only transaction status, method, amount, and provider reference belong in this report.</p>}</div>;
}
