"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Add01Icon, Delete02Icon, Search01Icon, UserGroupIcon, UserIcon } from "@hugeicons/core-free-icons";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { formatGhs } from "@/lib/sample-catalog";
import { client } from "@/utils/orpc";

const customerKey = ["admin-customers"] as const;
const segmentKey = ["admin-customer-segments"] as const;
type SegmentRule = "all" | "repeat" | "new" | "high_spend";
type SegmentDraft = { name: string; rule: SegmentRule; thresholdGhs: number; description: string };
const blankSegment: SegmentDraft = { name: "", rule: "repeat", thresholdGhs: 500, description: "" };
const rules: { value: SegmentRule; label: string }[] = [
  { value: "all", label: "All customers" }, { value: "repeat", label: "Repeat customers (2+ paid orders)" },
  { value: "new", label: "New customers (0–1 paid orders)" }, { value: "high_spend", label: "High spend (lifetime paid spend)" },
];
function Icon({ icon }: { icon: IconSvgElement }) { return <HugeiconsIcon icon={icon} aria-hidden="true" />; }
function Heading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) { return <header className="ops-heading"><div><p className="admin-eyebrow">CUSTOMERS · RELATIONSHIPS</p><h1>{title}</h1><p>{description}</p></div>{action}</header>; }
function dateTime(value: string | Date | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(new Date(value)); }
function dateOnly(value: string | Date | null | undefined) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeZone: "Africa/Accra" }).format(new Date(value)); }
function LoadState({ label = "Loading customer records" }: { label?: string }) { return <div className="customer-skeleton" aria-label={label} aria-busy="true">{[0, 1, 2, 3, 4].map((item) => <i key={item} />)}</div>; }
function ErrorState({ retry }: { retry: () => void }) { return <div className="ops-empty"><strong>Customer data could not be loaded.</strong><p>Check your connection and staff access, then try again.</p><button type="button" className="admin-secondary-button" onClick={retry}>Try again</button></div>; }

export function CustomersWorkspace({ path }: { path: string }) {
  return path.endsWith("/segments") ? <SegmentsWorkspace /> : <CustomerListWorkspace />;
}

function CustomerListWorkspace() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [joinedFrom, setJoinedFrom] = useState("");
  const [joinedTo, setJoinedTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const customersQuery = useQuery({
    queryKey: [...customerKey, deferredQuery, joinedFrom, joinedTo, page],
    queryFn: () => client.listAdminCustomers({ query: deferredQuery, ...(joinedFrom ? { joinedFrom } : {}), ...(joinedTo ? { joinedTo } : {}), page, pageSize: 25 }),
    staleTime: 15_000, refetchInterval: 30_000, refetchOnWindowFocus: true,
  });
  const result = customersQuery.data;
  useEffect(() => {
    if (result && result.total > 0 && page > Math.ceil(result.total / 25)) setPage(Math.max(1, Math.ceil(result.total / 25)));
  }, [page, result]);
  return <div className="ops-workspace">
    <Heading title="All customers" description="Account holders and shoppers who have placed an order. Guest records are grouped by email address." />
    {result && <div className="ops-stats"><div><span>Customer records</span><strong>{result.stats.total}</strong><small>Accounts and order contacts</small></div><div><span>Repeat customers</span><strong>{result.stats.repeat}</strong><small>More than one paid order</small></div><div><span>New customers</span><strong>{result.stats.new}</strong><small>Zero or one paid order</small></div></div>}
    <div className="ops-toolbar customer-toolbar"><label className="ops-search"><Icon icon={Search01Icon} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search name, email, phone" aria-label="Search customers" /></label>
      <label className="ops-date-filter">Joined from<input type="date" value={joinedFrom} max={joinedTo || undefined} onChange={(event) => { setJoinedFrom(event.target.value); setPage(1); }} /></label>
      <label className="ops-date-filter">Joined to<input type="date" value={joinedTo} min={joinedFrom || undefined} onChange={(event) => { setJoinedTo(event.target.value); setPage(1); }} /></label>
      {(joinedFrom || joinedTo) && <button className="ops-text-button" type="button" onClick={() => { setJoinedFrom(""); setJoinedTo(""); setPage(1); }}>Clear dates</button>}
      <span className="ops-result-count">{result?.total ?? "—"} customers</span>
    </div>
    {customersQuery.isError && result && <p className="ops-error" role="status">Showing the last loaded customer list. Refresh failed; trying again when the connection returns.</p>}
    {customersQuery.isLoading ? <LoadState /> : customersQuery.isError && !result ? <ErrorState retry={() => void customersQuery.refetch()} /> : result?.customers.length ? <>
      <div className="ops-table-wrap customer-table"><table className="ops-table"><thead><tr><th>Customer</th><th>Contact</th><th>Customer since</th><th>Last order</th><th>Paid orders</th><th>Lifetime spend</th><th>Marketing consent</th></tr></thead><tbody>{result.customers.map((customer) => <tr key={customer.emailKey}><td><button className="ops-table-link" onClick={() => setSelectedEmail(customer.emailKey)} type="button">{customer.name}</button><small>{customer.account ? "Account" : "Guest checkout"}</small></td><td>{customer.phone || "No phone recorded"}<small>{customer.email}</small></td><td>{dateOnly(customer.joinedAt)}</td><td>{dateTime(customer.latestOrderAt)}</td><td>{customer.paidOrderCount} <small>{customer.totalOrderCount} total</small></td><td>{formatGhs(customer.lifetimeSpendGhs)}</td><td><span className="ops-status">Not recorded</span></td></tr>)}</tbody></table></div>
      <div className="ops-mobile-list customer-mobile-list">{result.customers.map((customer) => <button key={customer.emailKey} className="ops-mobile-card" type="button" onClick={() => setSelectedEmail(customer.emailKey)}><span className="ops-mobile-card__top"><strong>{customer.name}</strong><span className="ops-status">{customer.account ? "Account" : "Guest"}</span></span><span>{customer.email} · {customer.phone || "No phone"}</span><span>{customer.paidOrderCount} paid orders · {formatGhs(customer.lifetimeSpendGhs)}</span><span>Last order · {dateTime(customer.latestOrderAt)}</span></button>)}</div>
      <AdminPagination total={result.total} page={page} pageSize={25} onPageChange={setPage} label="customers" />
    </> : <div className="ops-empty customer-empty"><span className="ops-icon-tile"><Icon icon={UserGroupIcon} /></span><strong>{deferredQuery || joinedFrom || joinedTo ? "No customers match these filters" : "No customer records yet"}</strong><p>Customer profiles appear here when someone registers or completes an order.</p>{(deferredQuery || joinedFrom || joinedTo) && <button className="ops-text-button" type="button" onClick={() => { setQuery(""); setJoinedFrom(""); setJoinedTo(""); setPage(1); }}>Clear filters</button>}</div>}
    <p className="ops-note ops-note--warning">Marketing consent is not recorded in BASNY yet. Treat customers as not opted in until a customer-controlled consent flow is implemented.</p>
    {selectedEmail && <CustomerDetail email={selectedEmail} onClose={() => setSelectedEmail(null)} />}
  </div>;
}

function CustomerDetail({ email, onClose }: { email: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["admin-customer-detail", email], queryFn: () => client.getAdminCustomer({ email }), staleTime: 10_000, refetchInterval: 30_000, refetchOnWindowFocus: true });
  const [note, setNote] = useState<string | null>(null);
  const saveNote = useMutation({ mutationFn: (value: string) => client.saveAdminCustomerNote({ email, note: value }), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["admin-customer-detail", email] }), queryClient.invalidateQueries({ queryKey: customerKey })]); setNote(null); }, });
  const customer = detailQuery.data;
  return <div className="ops-modal-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="ops-modal ops-modal--wide customer-detail" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title"><div className="ops-modal__head"><div><p className="admin-eyebrow">CUSTOMER PROFILE · {customer?.account ? "ACCOUNT" : "GUEST"}</p><h2 id="customer-detail-title">{customer?.name ?? "Customer details"}</h2></div><button className="ops-quiet-button" type="button" aria-label="Close customer details" onClick={onClose}>×</button></div>
    {detailQuery.isLoading ? <LoadState label="Loading customer profile" /> : detailQuery.isError && !customer ? <ErrorState retry={() => void detailQuery.refetch()} /> : customer && <>
      {detailQuery.isError && <p className="ops-error" role="status">Showing saved profile data; the latest refresh failed.</p>}
      <div className="ops-profile-grid"><div><span>Email</span><strong>{customer.email}</strong></div><div><span>Phone</span><strong>{customer.phone || "Not recorded"}</strong></div><div><span>Customer since</span><strong>{dateOnly(customer.joinedAt)}</strong></div><div><span>Account status</span><strong>{customer.account ? customer.emailVerified ? "Verified" : "Unverified" : "Guest checkout"}</strong></div><div><span>Orders</span><strong>{customer.orders.length} shown · paid totals in list</strong></div><div><span>Marketing consent</span><strong>Not recorded</strong></div></div>
      <h3>Recent orders</h3>{customer.orders.length ? <div className="ops-history-list">{customer.orders.map((order) => <div className="customer-history-row" key={order.id}><strong>{order.reference}</strong><span>{dateTime(order.createdAt)} · {order.status.replaceAll("_", " ")} · {order.paymentStatus}</span><b>{formatGhs(order.totalGhs)}</b><small>{order.fulfillment === "pickup" ? "Pickup" : order.address || "Delivery details not recorded"}</small></div>)}</div> : <p className="ops-empty">No orders are linked to this email.</p>}
      <h3>Saved addresses</h3>{customer.addresses.length ? <div className="ops-history-list">{customer.addresses.map((address, index) => <div className="customer-history-row" key={`${address.label}-${index}`}><strong>{address.label}{address.isDefault ? " · Default" : ""}</strong><span>{address.fullName} · {address.phone}</span><small>{[address.streetAddress, address.neighbourhood, address.town, address.region].filter(Boolean).join(", ")}{address.note ? ` · ${address.note}` : ""}</small></div>)}</div> : <p className="ops-empty">No saved addresses on this account.</p>}
      <h3>Returns & reviews</h3>{customer.returns.length || customer.reviews.length ? <div className="ops-history-list">{customer.returns.map((item) => <div className="customer-history-row" key={item.id}><strong>Return {item.reference}</strong><span>{item.reason} · {item.status}</span><small>{dateTime(item.createdAt)}</small></div>)}{customer.reviews.map((item) => <div className="customer-history-row" key={item.id}><strong>{item.productSlug} · {item.rating}/5</strong><span>Review · {item.status}</span><small>{dateTime(item.createdAt)}</small></div>)}</div> : <p className="ops-empty">No returns or product reviews are linked to this customer.</p>}
      <label className="ops-field">Staff-only service note<textarea rows={4} maxLength={2000} value={note ?? customer.internalNote} onChange={(event) => setNote(event.target.value)} placeholder="Add useful context for customer service" /><small>Visible only to authorized staff. Maximum 2,000 characters.</small></label>
      {saveNote.isError && <p className="ops-error" role="alert">Note could not be saved. Please retry.</p>}{saveNote.isSuccess && note === null && <p className="ops-success" role="status">Note saved.</p>}
      <div className="ops-modal__actions"><button className="admin-secondary-button" type="button" onClick={onClose}>Close</button><button className="admin-primary-button" type="button" disabled={note === null || saveNote.isPending} onClick={() => note !== null && saveNote.mutate(note)}>{saveNote.isPending ? "Saving…" : "Save note"}</button></div>
    </>}
  </section></div>;
}

function SegmentsWorkspace() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState<SegmentDraft>(blankSegment);
  const segmentsQuery = useQuery({ queryKey: segmentKey, queryFn: () => client.listAdminCustomerSegments(), staleTime: 15_000, refetchInterval: 30_000, refetchOnWindowFocus: true });
  const saveMutation = useMutation({ mutationFn: (values: SegmentDraft & { id?: string }) => client.saveAdminCustomerSegment(values), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: segmentKey }); setOpen(false); setEditingId(null); }, });
  const deleteMutation = useMutation({ mutationFn: (id: string) => client.deleteAdminCustomerSegment({ id }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: segmentKey }); setPendingDelete(null); }, });
  function edit(segment?: NonNullable<typeof segmentsQuery.data>[number]) { setEditingId(segment?.id ?? null); setDraft(segment ? { name: segment.name, rule: segment.rule, thresholdGhs: segment.thresholdGhs, description: segment.description } : blankSegment); saveMutation.reset(); setOpen(true); }
  return <div className="ops-workspace"><Heading title="Customer segments" description="Saved audiences update from real paid order activity. Use them for service and analysis; marketing still requires recorded customer consent." action={<button className="admin-primary-button" type="button" onClick={() => edit()}><Icon icon={Add01Icon} /> New segment</button>} />
    {segmentsQuery.isLoading ? <div className="ops-card-grid"><LoadState /><LoadState /></div> : segmentsQuery.isError ? <ErrorState retry={() => void segmentsQuery.refetch()} /> : segmentsQuery.data?.length ? <div className="ops-card-grid">{segmentsQuery.data.map((segment) => <article className="ops-card ops-segment-card" key={segment.id}><div className="ops-card__top"><span className="ops-icon-tile"><Icon icon={UserGroupIcon} /></span><button className="ops-quiet-button" type="button" aria-label={`Delete ${segment.name}`} onClick={() => setPendingDelete({ id: segment.id, name: segment.name })}><Icon icon={Delete02Icon} /></button></div><h2>{segment.name}</h2><p>{segment.description || `Customers matching ${rules.find((rule) => rule.value === segment.rule)?.label.toLowerCase()}.`}</p><div className="ops-segment-count"><strong>{segment.matchingCustomers}</strong><span>matching customer records</span></div><div className="ops-rule-chip">{rules.find((rule) => rule.value === segment.rule)?.label}{segment.rule === "high_spend" ? ` · ${formatGhs(segment.thresholdGhs)}+` : ""}</div><div className="ops-card__actions"><button className="ops-text-button" type="button" onClick={() => edit(segment)}>Edit segment</button><small>Updated {dateOnly(segment.updatedAt)}</small></div></article>)}</div> : <div className="ops-empty customer-empty"><span className="ops-icon-tile"><Icon icon={UserIcon} /></span><strong>No segments created yet</strong><p>Build a saved audience from order activity, such as repeat shoppers or customers above a spend threshold.</p><button className="admin-primary-button" type="button" onClick={() => edit()}><Icon icon={Add01Icon} /> Create first segment</button></div>}
    <p className="ops-note ops-note--warning">Segment membership is derived from paid orders. Before sending a campaign, verify customer consent in a consent system; BASNY currently does not store that signal.</p>
    {saveMutation.isError && !open && <p className="ops-error" role="alert">The segment could not be saved. Try again.</p>}
    {open && <div className="ops-modal-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}><section className="ops-modal" role="dialog" aria-modal="true" aria-labelledby="segment-heading"><div className="ops-modal__head"><div><p className="admin-eyebrow">SAVED AUDIENCE</p><h2 id="segment-heading">{editingId ? "Edit segment" : "Create segment"}</h2></div><button className="ops-quiet-button" type="button" aria-label="Close" onClick={() => setOpen(false)}>×</button></div><label className="ops-field">Segment name<input maxLength={80} value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></label><label className="ops-field">Membership rule<select value={draft.rule} onChange={(event) => setDraft((value) => ({ ...value, rule: event.target.value as SegmentRule }))}>{rules.map((rule) => <option key={rule.value} value={rule.value}>{rule.label}</option>)}</select></label>{draft.rule === "high_spend" && <label className="ops-field">Lifetime spend minimum (GHS)<input type="number" min={0} step={1} value={draft.thresholdGhs} onChange={(event) => setDraft((value) => ({ ...value, thresholdGhs: Number(event.target.value) || 0 }))} /></label>}<label className="ops-field">Description<textarea rows={3} maxLength={500} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} /></label>{saveMutation.isError && <p className="ops-error" role="alert">Unable to save. Check for a duplicate segment name and try again.</p>}<div className="ops-modal__actions"><button className="admin-secondary-button" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="admin-primary-button" type="button" disabled={draft.name.trim().length < 2 || saveMutation.isPending || (draft.rule === "high_spend" && (!Number.isInteger(draft.thresholdGhs) || draft.thresholdGhs < 0))} onClick={() => saveMutation.mutate({ ...draft, ...(editingId ? { id: editingId } : {}) })}>{saveMutation.isPending ? "Saving…" : editingId ? "Save changes" : "Create segment"}</button></div></section></div>}
    {pendingDelete && <ConfirmActionDialog eyebrow="CUSTOMER AUDIENCE" title={`Delete ${pendingDelete.name}?`} description="The saved rule will be removed. Customer, order, and consent records are not affected." confirmLabel={deleteMutation.isPending ? "Deleting…" : "Delete segment"} onCancel={() => setPendingDelete(null)} onConfirm={() => deleteMutation.mutate(pendingDelete.id)} />}
    {deleteMutation.isError && <p className="ops-error" role="alert">Could not delete this segment. Try again.</p>}
  </div>;
}
