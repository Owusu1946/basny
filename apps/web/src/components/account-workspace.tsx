"use client";

import { ArrowRight01Icon, CheckmarkCircle02Icon, Delete02Icon, Edit01Icon, Location01Icon, Package01Icon, PlusSignIcon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { client } from "@/utils/orpc";
import { formatGhs } from "@/lib/sample-catalog";
import { mapStoreCatalogue } from "@/lib/catalogue";

type AccountAddress = { id: string; label: string; fullName: string; phone: string; region: string; town: string; neighbourhood: string; streetAddress: string; deliveryNote: string; isDefault: boolean };
type AccountOrder = { id: string; reference: string; customerName: string; customerEmail: string; customerPhone: string; region: string; town: string; address: string; deliveryNote: string; lines: { productSlug: string; name: string; image: string; size: string | null; colour: string; quantity: number; unitPriceGhs: number }[]; subtotalGhs: number; deliveryGhs: number; totalGhs: number; paymentStatus: string; status: string; createdAt: Date | string; deliveredAt: Date | string | null };
type AccountReturn = { id: string; reference: string; orderId: string; reason: string; details: string; status: string; createdAt: Date | string };
type EligibleReview = { orderId: string; reference: string; productSlug: string; productName: string; image: string };

const initialAddress = { label: "Home", fullName: "", phone: "", region: "Greater Accra", town: "Accra", neighbourhood: "", streetAddress: "", deliveryNote: "", isDefault: false };
const orderStatusLabel: Record<string, string> = { pending_payment: "Awaiting payment", confirmed: "Confirmed", processing: "Preparing your order", ready_for_delivery: "Ready for delivery", out_for_delivery: "On its way", delivered: "Delivered", cancelled: "Cancelled" };
const returnStatusLabel: Record<string, string> = { requested: "Received", approved: "Approved", rejected: "Not approved", received: "Item received", refunded: "Refunded", exchanged: "Exchanged" };

function StatusPill({ value, kind = "order" }: { value: string; kind?: "order" | "return" }) {
  const label = kind === "order" ? orderStatusLabel[value] ?? value : returnStatusLabel[value] ?? value;
  return <span className={`account-status account-status--${value}`}>{label}</span>;
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return <div className="account-loading-list" aria-label="Loading your account" aria-busy="true">{Array.from({ length: count }, (_, index) => <div className="account-loading-row" key={index}><span /><div><i /><i /></div><b /></div>)}</div>;
}

function WorkspaceHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <header className="account-workspace__heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{detail}</p></header>;
}

export function AccountWorkspace({ view }: { view: "profile" | "addresses" | "orders" | "returns" | "reviews" }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState({ name: "", phone: "", email: "" });
  const [addresses, setAddresses] = useState<AccountAddress[]>([]);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [returns, setReturns] = useState<AccountReturn[]>([]);
  const [eligibleReviews, setEligibleReviews] = useState<EligibleReview[]>([]);
  const [addressDraft, setAddressDraft] = useState<AccountAddress | (typeof initialAddress & { id?: string }) | null>(null);
  const [returnOrderId, setReturnOrderId] = useState("");
  const [returnReason, setReturnReason] = useState("size_fit");
  const [returnDetails, setReturnDetails] = useState("");
  const [reviewDraft, setReviewDraft] = useState({ orderId: "", productSlug: "", rating: 5, title: "", body: "" });

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      if (view === "profile") {
        const result = await client.accountProfile();
        setProfile({ name: result.name, phone: result.phone, email: result.email });
      } else if (view === "addresses") {
        setAddresses(await client.listAccountAddresses() as AccountAddress[]);
      } else if (view === "orders") {
        setOrders(await client.listAccountOrders() as AccountOrder[]);
      } else if (view === "returns") {
        const [returnList, orderList] = await Promise.all([client.listAccountReturns(), client.listAccountOrders()]);
        setReturns(returnList as AccountReturn[]);
        setOrders(orderList as AccountOrder[]);
      } else {
        setEligibleReviews(await client.listEligibleReviews() as EligibleReview[]);
      }
    } catch {
      setError("We couldn’t load this part of your account. Check your connection and try again.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [view]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (view !== "orders" && view !== "returns") return;
    const refresh = () => { void load(true); };
    window.addEventListener("basny:realtime", refresh);
    return () => window.removeEventListener("basny:realtime", refresh);
  }, [load, view]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try { await client.updateAccountProfile({ name: profile.name, phone: profile.phone }); setNotice("Your details are up to date."); }
    catch { setError("Your details weren’t saved. Please try again."); }
    finally { setSaving(false); }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!addressDraft) return;
    setSaving(true); setError("");
    try {
      await client.saveAccountAddress(addressDraft);
      setAddressDraft(null); setNotice("Delivery address saved."); await load(true);
    } catch { setError("We couldn’t save this address. Check the details and try again."); }
    finally { setSaving(false); }
  }

  async function deleteAddress(id: string) {
    setError("");
    try { await client.deleteAccountAddress({ id }); await load(true); setNotice("Address removed."); }
    catch { setError("We couldn’t remove this address. Please try again."); }
  }

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try { await client.requestAccountReturn({ orderId: returnOrderId, reason: returnReason as "wrong_item" | "damaged" | "size_fit" | "changed_mind" | "other", details: returnDetails }); setReturnDetails(""); setNotice("Your return request is with the BASNY team."); await load(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn’t submit this request. Please try again."); }
    finally { setSaving(false); }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try { await client.submitAccountReview(reviewDraft); setReviewDraft({ orderId: "", productSlug: "", rating: 5, title: "", body: "" }); setNotice("Thanks. Your review has been sent for a quick check."); await load(true); }
    catch { setError("We couldn’t submit this review. Check that the order was delivered and try again."); }
    finally { setSaving(false); }
  }

  const selectedReviewOrder = useMemo(() => eligibleReviews.filter((item) => item.orderId === reviewDraft.orderId), [eligibleReviews, reviewDraft.orderId]);
  const pageCopy = {
    profile: ["ACCOUNT · YOUR DETAILS", "Profile & contact", "Keep your name and phone number current for order updates."],
    addresses: ["ACCOUNT · DELIVERY", "Delivery addresses", "Save the places BASNY should deliver your orders."],
    orders: ["ACCOUNT · PURCHASES", "Your orders", "Follow each order from confirmation through delivery."],
    returns: ["ACCOUNT · AFTERCARE", "Returns & exchanges", "Start a return within 14 days after delivery. Return delivery for change-of-mind or fit requests is paid by the customer."],
    reviews: ["ACCOUNT · YOUR FEEDBACK", "Product reviews", "Share a review for items from orders BASNY has delivered."],
  }[view];

  return <div className="account-workspace">
    <WorkspaceHeading eyebrow={pageCopy[0]} title={pageCopy[1]} detail={pageCopy[2]} />
    {notice && <p className="account-message account-message--success" role="status"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" />{notice}</p>}
    {error && <p className="account-message account-message--error" role="alert">{error}</p>}
    {loading ? <LoadingRows count={view === "profile" ? 2 : 4} /> : <>
      {view === "profile" && <form className="account-form-card" onSubmit={saveProfile}>
        <label className="account-input"><span>Full name</span><input autoComplete="name" required minLength={2} maxLength={100} value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="account-input"><span>Email address</span><input type="email" value={profile.email} disabled /><small>To change this email, contact BASNY support.</small></label>
        <label className="account-input"><span>Phone number</span><input type="tel" autoComplete="tel" maxLength={25} value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} placeholder="024 000 0000" /></label>
        <button className="account-primary" type="submit" disabled={saving}>{saving ? <><span className="auth-spinner" /> Saving changes…</> : <>Save changes <HugeiconsIcon icon={ArrowRight01Icon} /></>}</button>
      </form>}
      {view === "addresses" && <div className="account-section-stack">
        <div className="account-section-heading"><div><h2>Saved places</h2><p>Your address details stay private to your account.</p></div><button className="account-primary account-primary--small" type="button" onClick={() => setAddressDraft({ ...initialAddress, fullName: profile.name, phone: profile.phone })}><HugeiconsIcon icon={PlusSignIcon} /> Add address</button></div>
        {addresses.length === 0 ? <div className="account-empty"><HugeiconsIcon icon={Location01Icon} /><h2>No addresses saved yet.</h2><p>Add a delivery address and it will be ready at checkout.</p><button type="button" className="account-text-action" onClick={() => setAddressDraft({ ...initialAddress })}>Add your first address <HugeiconsIcon icon={ArrowRight01Icon} /></button></div> : <div className="account-address-grid">{addresses.map((address) => <article className="account-address-card" key={address.id}><div className="account-address-card__top"><span className="account-address-label">{address.label}</span>{address.isDefault && <span className="account-default-label">Default</span>}</div><strong>{address.fullName}</strong><span>{address.phone}</span><p>{[address.streetAddress, address.neighbourhood, address.town, address.region].filter(Boolean).join(", ")}</p>{address.deliveryNote && <small>{address.deliveryNote}</small>}<div className="account-card-actions"><button type="button" onClick={() => setAddressDraft(address)}><HugeiconsIcon icon={Edit01Icon} /> Edit</button><button type="button" onClick={() => void deleteAddress(address.id)}><HugeiconsIcon icon={Delete02Icon} /> Remove</button></div></article>)}</div>}
      </div>}
      {view === "orders" && <div className="account-section-stack">
        {orders.length === 0 ? <div className="account-empty"><HugeiconsIcon icon={Package01Icon} /><h2>Your next favourite is out there.</h2><p>Orders placed with the email on your account will show here, with live delivery updates.</p><Link className="account-text-action" href="/shop">Explore the collection <HugeiconsIcon icon={ArrowRight01Icon} /></Link></div> : <div className="account-order-list">{orders.map((order) => <article className="account-order-card" key={order.id}><div className="account-order-card__head"><div><span>ORDER · {order.reference}</span><small>{new Date(order.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })}</small></div><StatusPill value={order.status} /></div><div className="account-order-card__body"><div className="account-order-thumbs">{order.lines.slice(0, 3).map((line) => <span key={`${order.id}-${line.productSlug}-${line.size}`}><Image src={line.image} alt="" fill unoptimized={line.image.startsWith("http")} sizes="72px" /></span>)}</div><div><strong>{order.lines.reduce((total, line) => total + line.quantity, 0)} {order.lines.reduce((total, line) => total + line.quantity, 0) === 1 ? "item" : "items"}</strong><small>{order.lines.slice(0, 2).map((line) => line.name).join(" · ")}</small></div><strong className="account-order-card__total">{formatGhs(order.totalGhs)}</strong></div><div className="account-order-card__foot"><span>{order.status === "delivered" ? "Delivered" : order.status === "out_for_delivery" ? "On the way to" : "Delivering to"} · {order.town}, {order.region}</span><Link href={`/order-confirmation/${order.reference}`}>Order details <HugeiconsIcon icon={ArrowRight01Icon} /></Link></div></article>)}</div>}
      </div>}
      {view === "returns" && <div className="account-section-stack">
        {returns.length > 0 && <div className="account-return-list">{returns.map((item) => <article className="account-return-card" key={item.id}><div><span>RETURN · {item.reference}</span><small>Order {orders.find((order) => order.id === item.orderId)?.reference ?? "BASNY order"}</small></div><strong>{item.reason.replaceAll("_", " ")}</strong><StatusPill value={item.status} kind="return" /><small>Updated {new Date(item.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</small></article>)}</div>}
        <form className="account-form-card account-form-card--wide" onSubmit={submitReturn}><div className="account-section-heading"><div><h2>Request a return</h2><p>Choose a delivered order from the last 14 days.</p></div></div>
          <label className="account-input"><span>Delivered order</span><select required value={returnOrderId} onChange={(event) => setReturnOrderId(event.target.value)}><option value="">Choose an order</option>{orders.filter((order) => order.status === "delivered" && order.deliveredAt && Date.now() - new Date(order.deliveredAt).getTime() <= 14 * 86400000).map((order) => <option key={order.id} value={order.id}>{order.reference} · {new Date(order.deliveredAt!).toLocaleDateString("en-GH")}</option>)}</select></label>
          {returnOrderId && <div className="account-return-items">{orders.find((order) => order.id === returnOrderId)?.lines.map((line) => <div key={`${returnOrderId}-${line.productSlug}`}><span>{line.name} · {line.colour}{line.size ? ` · EU ${line.size}` : ""}</span><small>Qty {line.quantity}</small></div>)}</div>}
          <label className="account-input"><span>Reason for return</span><select value={returnReason} onChange={(event) => setReturnReason(event.target.value)}><option value="size_fit">Size or fit</option><option value="wrong_item">Wrong item received</option><option value="damaged">Damaged or defective</option><option value="changed_mind">Changed my mind</option><option value="other">Other</option></select></label>
          <label className="account-input"><span>More details <small>(optional)</small></span><textarea rows={3} maxLength={500} value={returnDetails} onChange={(event) => setReturnDetails(event.target.value)} placeholder="Tell us a little more so we can help." /></label>
          <p className="account-policy-note">For change-of-mind or fit returns, customers cover return delivery. BASNY handles return delivery for wrong, damaged, or defective items.</p>
          <button className="account-primary" type="submit" disabled={saving || !returnOrderId}>{saving ? <><span className="auth-spinner" /> Sending request…</> : <>Send return request <HugeiconsIcon icon={ArrowRight01Icon} /></>}</button>
        </form>
      </div>}
      {view === "reviews" && <div className="account-section-stack">
        {eligibleReviews.length === 0 ? <div className="account-empty"><HugeiconsIcon icon={StarIcon} /><h2>No reviews to write just yet.</h2><p>After an order is delivered, its products will appear here for review.</p><Link className="account-text-action" href="/account/orders">View your orders <HugeiconsIcon icon={ArrowRight01Icon} /></Link></div> : <form className="account-form-card account-form-card--wide" onSubmit={submitReview}><div className="account-section-heading"><div><h2>Write a review</h2><p>Reviews are checked by BASNY before they appear on the shop.</p></div></div>
          <label className="account-input"><span>Product from a delivered order</span><select required value={`${reviewDraft.orderId}:${reviewDraft.productSlug}`} onChange={(event) => { const [orderId, productSlug] = event.target.value.split(":"); setReviewDraft((current) => ({ ...current, orderId, productSlug })); }}><option value=":">Choose a product</option>{eligibleReviews.map((item) => <option key={`${item.orderId}:${item.productSlug}`} value={`${item.orderId}:${item.productSlug}`}>{item.productName} · {item.reference}</option>)}</select></label>
          <label className="account-input"><span>Rating</span><select value={reviewDraft.rating} onChange={(event) => setReviewDraft((current) => ({ ...current, rating: Number(event.target.value) }))}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} {rating === 1 ? "star" : "stars"}</option>)}</select></label>
          <label className="account-input"><span>Review title</span><input required minLength={3} maxLength={80} value={reviewDraft.title} onChange={(event) => setReviewDraft((current) => ({ ...current, title: event.target.value }))} placeholder="What should other shoppers know?" /></label>
          <label className="account-input"><span>Your review</span><textarea rows={4} required minLength={10} maxLength={1500} value={reviewDraft.body} onChange={(event) => setReviewDraft((current) => ({ ...current, body: event.target.value }))} placeholder="Share how the piece looks, feels or fits." /></label>
          <button className="account-primary" type="submit" disabled={saving || !reviewDraft.orderId || !reviewDraft.productSlug}>{saving ? "Sending review…" : "Submit for review"}<HugeiconsIcon icon={ArrowRight01Icon} /></button>
        </form>}
      </div>}
    </>}

    {addressDraft && <div className="account-modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddressDraft(null); }}><form className="account-modal" role="dialog" aria-modal="true" aria-labelledby="address-dialog-title" onSubmit={saveAddress}><div className="account-modal__head"><div><p className="eyebrow">YOUR BASNY ACCOUNT</p><h2 id="address-dialog-title">{addressDraft.id ? "Edit address" : "Add delivery address"}</h2></div><button type="button" aria-label="Close" onClick={() => setAddressDraft(null)}>×</button></div><div className="account-modal__grid">
      {([ ["label", "Address label"], ["fullName", "Full name"], ["phone", "Phone number"], ["region", "Region"], ["town", "Town"], ["neighbourhood", "Area or neighbourhood"], ["streetAddress", "Street and house number"] ] as const).map(([key, label]) => <label className="account-input" key={key}><span>{label}</span><input required maxLength={key === "streetAddress" ? 180 : 100} value={addressDraft[key]} onChange={(event) => setAddressDraft((current) => current ? { ...current, [key]: event.target.value } : current)} /></label>)}
      <label className="account-input account-input--wide"><span>Delivery note <small>(optional)</small></span><textarea rows={2} maxLength={300} value={addressDraft.deliveryNote} onChange={(event) => setAddressDraft((current) => current ? { ...current, deliveryNote: event.target.value } : current)} /></label>
      <label className="account-default-toggle account-input--wide"><input type="checkbox" checked={addressDraft.isDefault} onChange={(event) => setAddressDraft((current) => current ? { ...current, isDefault: event.target.checked } : current)} /><span>Use as my default delivery address</span></label>
    </div><div className="account-modal__actions"><button type="button" className="account-secondary" onClick={() => setAddressDraft(null)}>Cancel</button><button className="account-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save address"}<HugeiconsIcon icon={CheckmarkCircle02Icon} /></button></div></form></div>}
  </div>;
}

export function WishlistWorkspace() {
  const publicCatalogue = useQuery({ queryKey: ["catalogue", "public"], queryFn: async () => mapStoreCatalogue(await client.listPublicCatalogue()), staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: true });
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingSlug, setPendingSlug] = useState("");
  const items = useMemo(() => slugs.map((slug) => publicCatalogue.data?.products.find((item) => item.slug === slug)).filter((item) => item !== undefined), [publicCatalogue.data, slugs]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setSlugs((await client.listAccountWishlist()).map((item) => item.productSlug)); }
    catch { setError("Sign in to see and manage your saved pieces."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function remove(slug: string) {
    setPendingSlug(slug);
    try { await client.removeAccountWishlistItem({ productSlug: slug }); setSlugs((current) => current.filter((item) => item !== slug)); }
    catch { setError("We couldn’t remove that piece. Please try again."); }
    finally { setPendingSlug(""); }
  }

  return <div className="account-workspace"><WorkspaceHeading eyebrow="ACCOUNT · YOUR EDIT" title="Saved pieces" detail="A little shortlist for the things you love." />
    {error && <p className="account-message account-message--error" role="alert">{error} <Link href="/login">Sign in</Link></p>}
    {loading || publicCatalogue.isLoading ? <LoadingRows /> : publicCatalogue.isError ? <div className="account-empty"><h2>Saved pieces could not load.</h2><p>Your wishlist is still saved. Try again when your connection is back.</p><button className="account-text-action" type="button" onClick={() => void publicCatalogue.refetch()}>Try again <HugeiconsIcon icon={ArrowRight01Icon} /></button></div> : items.length === 0 ? <div className="account-empty"><h2>Nothing saved just yet.</h2><p>Browse the collection and save something that catches your eye.</p><Link className="account-text-action" href="/shop">Explore the collection <HugeiconsIcon icon={ArrowRight01Icon} /></Link></div> : <div className="account-wishlist-grid">{items.map((product) => <article className="account-wishlist-card" key={product.slug}><Link className="account-wishlist-card__image" href={`/products/${product.slug}`}><Image src={product.thumbnailImage ?? product.image} alt={product.imageAlt} fill unoptimized={Boolean(product.thumbnailImage?.startsWith("http"))} sizes="(max-width: 650px) 50vw, 260px" /></Link><div className="account-wishlist-card__copy"><div><Link href={`/products/${product.slug}`}>{product.name}</Link><span>{formatGhs(product.priceGhs)}</span></div><button type="button" disabled={pendingSlug === product.slug} onClick={() => void remove(product.slug)} aria-label={`Remove ${product.name} from saved pieces`}>{pendingSlug === product.slug ? "Removing…" : "Remove"}</button></div></article>)}</div>}
  </div>;
}
