"use client";

import { ArrowRight01Icon, Package01Icon, StarIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { client } from "@/utils/orpc";
import { formatGhs } from "@/lib/sample-catalog";

type Summary = { name: string; phone: string; email: string; orders: { reference: string; totalGhs: number; status: string; createdAt: Date | string }[]; returns: { reference: string; status: string }[] };
const labels: Record<string, string> = { pending_payment: "Awaiting payment", confirmed: "Confirmed", processing: "Preparing", ready_for_delivery: "Ready for delivery", out_for_delivery: "On its way", delivered: "Delivered", cancelled: "Cancelled" };

export default function AccountDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [profile, orders, returns] = await Promise.all([client.accountProfile(), client.listAccountOrders(), client.listAccountReturns()]);
      setSummary({ name: profile.name, phone: profile.phone, email: profile.email, orders: orders as Summary["orders"], returns: returns as Summary["returns"] });
      setError("");
    } catch { setError("We couldn’t refresh your account. Check your connection and try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const refresh = () => { void load(true); };
    void load();
    window.addEventListener("basny:realtime", refresh);
    return () => window.removeEventListener("basny:realtime", refresh);
  }, [load]);

  if (loading && !summary) return <main className="account-home page-shell" aria-busy="true"><div className="account-loading-hero" /><div className="account-loading-tiles"><span /><span /><span /></div><span className="account-loading-line" /></main>;
  return <main className="account-home page-shell">
    <header className="account-home__hero"><div><p className="eyebrow">YOUR BASNY ACCOUNT</p><h1>Good to see you, {summary?.name.split(" ")[0] ?? "there"}.</h1><p>Your orders, saved pieces and delivery details, all in one place.</p></div><Link href="/shop" className="account-home__shop">Explore the collection <HugeiconsIcon icon={ArrowRight01Icon} /></Link></header>
    {error && <p className="account-message account-message--error" role="status">{error}</p>}
    <section className="account-home__cards" aria-label="Account shortcuts">
      <Link className="account-home-card" href="/account/orders"><span className="account-home-card__icon"><HugeiconsIcon icon={Package01Icon} /></span><span><small>ORDERS</small><strong>{summary?.orders.length ?? 0}</strong><em>See every order</em></span><HugeiconsIcon className="account-home-card__arrow" icon={ArrowRight01Icon} /></Link>
      <Link className="account-home-card" href="/wishlist"><span className="account-home-card__icon"><HugeiconsIcon icon={StarIcon} /></span><span><small>SAVED PIECES</small><strong>Keep your favourites close</strong><em>Open your shortlist</em></span><HugeiconsIcon className="account-home-card__arrow" icon={ArrowRight01Icon} /></Link>
      <Link className="account-home-card" href="/account/profile"><span className="account-home-card__icon"><HugeiconsIcon icon={UserCircleIcon} /></span><span><small>YOUR DETAILS</small><strong>{summary?.phone || "Add a phone number"}</strong><em>Update profile and contact</em></span><HugeiconsIcon className="account-home-card__arrow" icon={ArrowRight01Icon} /></Link>
    </section>
    <section className="account-home__recent"><div className="account-section-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Orders at a glance</h2></div><Link href="/account/orders">All orders <HugeiconsIcon icon={ArrowRight01Icon} /></Link></div>
      {summary?.orders.length ? <div className="account-home-order-list">{summary.orders.slice(0, 3).map((order) => <Link href={`/order-confirmation/${order.reference}`} key={order.reference}><span><strong>{order.reference}</strong><small>{new Date(order.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</small></span><span className={`account-status account-status--${order.status}`}>{labels[order.status] ?? order.status}</span><strong>{formatGhs(order.totalGhs)}</strong></Link>)}</div> : <div className="account-home-empty"><p>Your orders will appear here once you place one with this email address.</p><Link href="/shop">Find your next favourite <HugeiconsIcon icon={ArrowRight01Icon} /></Link></div>}
    </section>
    {summary?.returns.length ? <section className="account-home__returns"><div className="account-section-heading"><div><p className="eyebrow">AFTERCARE</p><h2>Return updates</h2></div><Link href="/account/returns">Return centre <HugeiconsIcon icon={ArrowRight01Icon} /></Link></div><div className="account-return-list">{summary.returns.slice(0, 2).map((item) => <div className="account-return-card" key={item.reference}><strong>{item.reference}</strong><span>{item.status}</span></div>)}</div></section> : null}
  </main>;
}
