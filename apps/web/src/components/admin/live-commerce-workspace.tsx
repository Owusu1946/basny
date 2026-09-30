"use client";

import { ArrowRight01Icon, CheckmarkCircle02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

import { client } from "@/utils/orpc";
import { formatGhs } from "@/lib/sample-catalog";

type Order = Awaited<ReturnType<typeof client.listStaffOrders>>[number];
type ReturnEntry = Awaited<ReturnType<typeof client.listStaffReturns>>[number];
const orderStatuses = ["confirmed", "processing", "ready_for_delivery", "out_for_delivery", "delivered", "cancelled"] as const;
const nextOrderStatuses: Record<string, readonly string[]> = { pending_payment: ["cancelled"], confirmed: ["processing", "cancelled"], processing: ["ready_for_delivery", "cancelled"], ready_for_delivery: ["out_for_delivery", "cancelled"], out_for_delivery: ["delivered"], delivered: [], cancelled: [] };
const returnStatuses = ["approved", "rejected", "received", "refunded", "exchanged"] as const;
const orderLabel: Record<string, string> = { pending_payment: "Awaiting payment", confirmed: "Confirmed", processing: "Preparing", ready_for_delivery: "Ready for delivery", out_for_delivery: "On its way", delivered: "Delivered", cancelled: "Cancelled" };
const returnLabel: Record<string, string> = { requested: "Needs review", approved: "Approved", rejected: "Not approved", received: "Received", refunded: "Refunded", exchanged: "Exchanged" };

function LiveBadge({ label, value }: { label: string; value: string }) {
  return <span className={`admin-live-status admin-live-status--${value}`}>{label}</span>;
}

export default function LiveCommerceWorkspace({ view }: { view: "orders" | "returns" }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [returns, setReturns] = useState<ReturnEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<ReturnEntry | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [orderRows, returnRows] = await Promise.all([client.listStaffOrders(), client.listStaffReturns()]);
      setOrders(orderRows); setReturns(returnRows); setError("");
      setSelectedOrder((current) => current ? orderRows.find((item) => item.id === current.id) ?? null : null);
      setSelectedReturn((current) => current ? returnRows.find((item) => item.request.id === current.request.id) ?? null : null);
    } catch {
      setError("These records need a staff role with sales and order access. Ask the BASNY owner if you believe you should have access.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const refresh = () => { void load(true); };
    void load();
    window.addEventListener("basny:realtime", refresh);
    return () => window.removeEventListener("basny:realtime", refresh);
  }, [load]);

  const filteredOrders = useMemo(() => orders.filter((order) => `${order.reference} ${order.customerName} ${order.customerEmail} ${order.customerPhone} ${order.town} ${order.region}`.toLowerCase().includes(query.toLowerCase())), [orders, query]);
  const filteredReturns = useMemo(() => returns.filter((item) => `${item.request.reference} ${item.order.reference} ${item.customerName} ${item.customerEmail} ${item.request.reason}`.toLowerCase().includes(query.toLowerCase())), [returns, query]);

  async function changeOrderStatus(order: Order, status: (typeof orderStatuses)[number]) {
    setBusy(order.id); setError("");
    try {
      const updated = await client.updateOrderStatus({ orderId: order.id, status });
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, ...updated } : item));
      setSelectedOrder((current) => current?.id === order.id ? { ...current, ...updated } : current);
    } catch { setError("The order status was not changed. Refresh and check your access before trying again."); }
    finally { setBusy(""); }
  }

  async function changeReturnStatus(entry: ReturnEntry, status: (typeof returnStatuses)[number]) {
    setBusy(entry.request.id); setError("");
    try {
      const updated = await client.updateReturnStatus({ returnId: entry.request.id, status });
      setReturns((current) => current.map((item) => item.request.id === entry.request.id ? { ...item, request: { ...item.request, ...updated } } : item));
      setSelectedReturn((current) => current?.request.id === entry.request.id ? { ...current, request: { ...current.request, ...updated } } : current);
    } catch { setError("The return status was not changed. Refresh and check your access before trying again."); }
    finally { setBusy(""); }
  }

  const isOrders = view === "orders";
  return <section className="live-commerce-workspace">
    <header className="live-commerce-heading"><div><p className="admin-eyebrow">SALES · {isOrders ? "ORDER MANAGEMENT" : "AFTERCARE"}</p><h1>{isOrders ? "Orders" : "Returns & exchanges"}</h1><p>{isOrders ? "Update customer order progress. Customers see status changes as they happen." : "Review customer return requests and keep their account status in sync."}</p></div><span className="live-commerce-count">{isOrders ? orders.length : returns.length} records</span></header>
    <label className="live-commerce-search"><HugeiconsIcon icon={Search01Icon} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isOrders ? "Search order, customer or delivery area" : "Search return, order or customer"} /></label>
    {error && <p className="account-message account-message--error" role="alert">{error}</p>}
    {loading ? <div className="account-loading-list" aria-busy="true"><span className="account-loading-hero" /><span className="account-loading-hero" /></div> : isOrders ? <div className="live-commerce-list">{filteredOrders.map((order) => <article className="live-commerce-card" key={order.id}>
      <button className="live-commerce-card__summary" type="button" onClick={() => setSelectedOrder(order)}><span><strong>{order.reference}</strong><small>{order.customerName} · {order.town}, {order.region}</small></span><span><LiveBadge label={orderLabel[order.status] ?? order.status} value={order.status} /><small>{new Date(order.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</small></span><strong>{formatGhs(order.totalGhs)}</strong><HugeiconsIcon icon={ArrowRight01Icon} /></button>
      <div className="live-commerce-card__quick"><span>{order.lines.length} {order.lines.length === 1 ? "product" : "products"} · {order.paymentStatus === "paid" ? "Paid" : "Payment to be confirmed"}</span><label>Status<select value={order.status} disabled={busy === order.id} onChange={(event) => void changeOrderStatus(order, event.target.value as (typeof orderStatuses)[number])}><option value={order.status}>{orderLabel[order.status] ?? order.status}</option>{(nextOrderStatuses[order.status] ?? []).map((status) => <option value={status} key={status}>{orderLabel[status]}</option>)}</select></label></div>
    </article>)}{!filteredOrders.length && <p className="account-empty">{orders.length ? "No orders match this search." : "No online orders have been placed yet."}</p>}</div> : <div className="live-commerce-list">{filteredReturns.map((entry) => <article className="live-commerce-card" key={entry.request.id}>
      <button className="live-commerce-card__summary" type="button" onClick={() => setSelectedReturn(entry)}><span><strong>{entry.request.reference}</strong><small>Order {entry.order.reference} · {entry.customerName}</small></span><span><LiveBadge label={returnLabel[entry.request.status] ?? entry.request.status} value={entry.request.status} /><small>{entry.request.reason.replaceAll("_", " ")}</small></span><strong>{new Date(entry.request.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</strong><HugeiconsIcon icon={ArrowRight01Icon} /></button>
      <div className="live-commerce-card__quick"><span>{entry.customerEmail} · {entry.order.customerPhone}</span><label>Status<select value={entry.request.status} disabled={busy === entry.request.id} onChange={(event) => void changeReturnStatus(entry, event.target.value as (typeof returnStatuses)[number])}>{returnStatuses.map((status) => <option value={status} key={status}>{returnLabel[status]}</option>)}</select></label></div>
    </article>)}{!filteredReturns.length && <p className="account-empty">{returns.length ? "No returns match this search." : "No return requests have been submitted yet."}</p>}</div>}
    {selectedOrder && <div className="account-modal-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedOrder(null)}><section className="account-modal live-commerce-detail" role="dialog" aria-modal="true" aria-labelledby="live-order-title"><div className="account-modal__head"><div><p className="eyebrow">ORDER · {selectedOrder.reference}</p><h2 id="live-order-title">{selectedOrder.customerName}</h2><small>{selectedOrder.customerEmail} · {selectedOrder.customerPhone}</small></div><button type="button" aria-label="Close" onClick={() => setSelectedOrder(null)}>×</button></div><div className="live-commerce-detail__meta"><span><small>STATUS</small><LiveBadge label={orderLabel[selectedOrder.status] ?? selectedOrder.status} value={selectedOrder.status} /></span><span><small>TOTAL</small><strong>{formatGhs(selectedOrder.totalGhs)}</strong></span><span><small>DELIVER TO</small><strong>{selectedOrder.address}, {selectedOrder.town}, {selectedOrder.region}</strong></span><span><small>PAYMENT</small><strong>{selectedOrder.paymentStatus === "paid" ? "Paid · Paystack" : "Awaiting Paystack confirmation"}{selectedOrder.paymentProviderReference && <small>{selectedOrder.paymentProviderReference}</small>}</strong></span></div><h3>Items</h3><div className="live-commerce-items">{selectedOrder.lines.map((line) => <div key={`${selectedOrder.reference}-${line.productSlug}-${line.size}`}><span><Image src={line.image} alt="" fill sizes="50px" /></span><div><strong>{line.name}</strong><small>{line.colour}{line.size ? ` · EU ${line.size}` : ""} · Qty {line.quantity}</small></div><strong>{formatGhs(line.unitPriceGhs * line.quantity)}</strong></div>)}</div><label className="account-input">Update order status<select value={selectedOrder.status} disabled={busy === selectedOrder.id} onChange={(event) => void changeOrderStatus(selectedOrder, event.target.value as (typeof orderStatuses)[number])}><option value={selectedOrder.status}>{orderLabel[selectedOrder.status] ?? selectedOrder.status}</option>{(nextOrderStatuses[selectedOrder.status] ?? []).map((status) => <option value={status} key={status}>{orderLabel[status]}</option>)}</select></label>{busy === selectedOrder.id && <p className="account-message" role="status">Updating order…</p>}</section></div>}
    {selectedReturn && <div className="account-modal-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedReturn(null)}><section className="account-modal live-commerce-detail" role="dialog" aria-modal="true" aria-labelledby="live-return-title"><div className="account-modal__head"><div><p className="eyebrow">RETURN · {selectedReturn.request.reference}</p><h2 id="live-return-title">{selectedReturn.customerName}</h2><small>Order {selectedReturn.order.reference} · {selectedReturn.customerEmail}</small></div><button type="button" aria-label="Close" onClick={() => setSelectedReturn(null)}>×</button></div><div className="live-commerce-detail__meta"><span><small>REASON</small><strong>{selectedReturn.request.reason.replaceAll("_", " ")}</strong></span><span><small>ORDER TOTAL</small><strong>{formatGhs(selectedReturn.order.totalGhs)}</strong></span><span><small>RETURN DELIVERY</small><strong>{/wrong_item|damaged/.test(selectedReturn.request.reason) ? "BASNY arranges or pays" : "Customer pays"}</strong></span><span><small>REQUESTED</small><strong>{new Date(selectedReturn.request.createdAt).toLocaleDateString("en-GH")}</strong></span></div>{selectedReturn.request.details && <p className="live-commerce-return-note">{selectedReturn.request.details}</p>}<label className="account-input">Update return status<select value={selectedReturn.request.status} onChange={(event) => void changeReturnStatus(selectedReturn, event.target.value as (typeof returnStatuses)[number])}>{returnStatuses.map((status) => <option value={status} key={status}>{returnLabel[status]}</option>)}</select></label>{busy === selectedReturn.request.id && <p className="account-message" role="status">Updating return…</p>}<p className="live-commerce-return-note">Status changes publish to the customer’s account immediately. Confirm the refund or exchange with the customer before marking it complete.</p><button className="account-primary" type="button" onClick={() => setSelectedReturn(null)}>Done <HugeiconsIcon icon={CheckmarkCircle02Icon} /></button></section></div>}
  </section>;
}
