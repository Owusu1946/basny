"use client";

import DirectionalIcon from "@/components/directional-icon";
import { CheckmarkCircle02Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { formatGhs } from "@/lib/sample-catalog";
import { readCheckoutOrder, type CheckoutOrder } from "@/lib/checkout-order";
import { client } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";
import { CheckoutLoadingState } from "@/components/checkout-loading-state";

type ConfirmationOrder = CheckoutOrder & { status?: string };

const statusLabels: Record<string, string> = { pending_payment: "Awaiting payment", confirmed: "Confirmed", processing: "Preparing your order", ready_for_delivery: "Ready for delivery", out_for_delivery: "On its way", delivered: "Delivered", cancelled: "Cancelled" };
const orderProgress = [
  ["pending_payment", "Order received"], ["confirmed", "Confirmed"], ["processing", "Preparing"],
  ["ready_for_delivery", "Ready"], ["out_for_delivery", "On its way"], ["delivered", "Delivered"],
] as const;

export default function OrderConfirmationView({ reference }: { reference: string }) {
  const [order, setOrder] = useState<ConfirmationOrder | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const { data: session } = authClient.useSession();

  async function retryPayment() {
    const local = readCheckoutOrder(reference);
    if (!local?.trackingToken) return;
    setRetrying(true); setRetryError("");
    try {
      const checkout = await client.initializeOrderPayment({ reference, trackingToken: local.trackingToken });
      window.location.assign(checkout.authorizationUrl);
    } catch {
      setRetryError("We couldn’t start payment. Please try again in a moment or contact BASNY.");
      setRetrying(false);
    }
  }

  useEffect(() => {
    let active = true;
    const load = async () => {
      const local = readCheckoutOrder(reference);
      const emailedToken = typeof window !== "undefined"
        ? new URLSearchParams(window.location.hash.replace(/^#/, "")).get("tracking")
        : null;
      const trackingToken = local?.trackingToken ?? emailedToken;
      if (session?.user?.emailVerified) {
        try {
          await client.listAccountOrders();
          const saved = await client.getAccountOrder({ reference });
          if (!active) return;
          setOrder({
            reference: saved.reference, createdAt: new Date(saved.createdAt).toISOString(), name: saved.customerName,
            email: saved.customerEmail, phone: saved.customerPhone, deliveryArea: saved.deliveryArea,
            region: saved.region, town: saved.town, address: saved.address, note: saved.deliveryNote,
            paymentMethod: saved.paymentStatus === "paid" ? (saved.paymentMethod === "mobile-money" ? "mobile-money" : "card") : null,
            paymentStatus: saved.paymentStatus === "paid" ? "paid" : "pending", lines: saved.lines, subtotalGhs: saved.subtotalGhs,
            deliveryGhs: saved.deliveryGhs, totalGhs: saved.totalGhs, status: saved.status,
          });
          setLoaded(true);
          return;
        } catch { /* Guest order may still be visible in the placing browser. */ }
      }
      if (trackingToken) {
        try {
          const saved = await client.trackGuestOrder({ reference, trackingToken });
          if (!active) return;
          if (emailedToken) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          setOrder({
            ...local,
            reference: saved.reference,
            createdAt: new Date(saved.createdAt).toISOString(),
            name: saved.customerName,
            email: saved.customerEmail,
            phone: saved.customerPhone,
            deliveryArea: saved.deliveryArea,
            region: saved.region,
            town: saved.town,
            address: saved.address,
            note: saved.deliveryNote,
            lines: saved.lines,
            subtotalGhs: saved.subtotalGhs,
            deliveryGhs: saved.deliveryGhs,
            totalGhs: saved.totalGhs,
            paymentMethod: null,
            paymentStatus: saved.paymentStatus === "paid" ? "paid" : "pending",
            status: saved.status,
          });
          setLoaded(true);
          return;
        } catch { /* Keep the order summary available offline; refresh will retry live status. */ }
      }
      if (active) { setOrder(local); setLoaded(true); }
    };
    setLoaded(false);
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("basny:realtime", refresh);
    return () => { active = false; window.removeEventListener("basny:realtime", refresh); };
  }, [reference, session?.user?.emailVerified, session?.user?.id]);

  if (!loaded) return <CheckoutLoadingState variant="confirmation" />;

  if (!order) return <main className="confirmation-page page-shell">
    <div className="confirmation-card confirmation-card--missing">
      <p className="eyebrow">Order details</p>
      <h1>We couldn’t find this order.</h1>
      <p className="confirmation-intro">Check the link you opened, or return to the collection to place an order.</p>
      <Link className="button-primary" href="/shop">Continue shopping <DirectionalIcon /></Link>
    </div>
  </main>;

  const addressLines = [order.address, [order.town, order.region].filter(Boolean).join(", ")].filter(Boolean);

  return <main className="confirmation-page page-shell">
    <div className="confirmation-card">
      <div className="confirmation-mark"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" /></div>
      <p className="eyebrow">Order received</p>
      <h1>Thank you, {order.name.split(" ")[0]}.</h1>
      <p className="confirmation-intro">{order.paymentStatus === "paid" ? `Your payment is confirmed. BASNY will contact you at ${order.phone} with delivery updates.` : `Your order is saved, but payment has not been confirmed. Complete payment within 30 minutes to keep these items reserved.`}</p>
      {order.status && <div className="confirmation-live-status"><span className={`account-status account-status--${order.status}`}>{statusLabels[order.status] ?? order.status}</span><small>Order status updates appear here automatically.</small>
        {order.status === "cancelled" ? <p className="confirmation-cancelled-note">This order was cancelled. Contact BASNY if you need help.</p> : <ol className="order-progress" aria-label="Order progress">{orderProgress.map(([status, label], index) => {
          const currentIndex = orderProgress.findIndex(([step]) => step === order.status);
          const complete = index < currentIndex;
          const current = index === currentIndex;
          return <li key={status} className={`${complete ? "is-complete" : ""}${current ? " is-current" : ""}`} aria-current={current ? "step" : undefined}><span className="order-progress__mark">{complete ? "✓" : index + 1}</span><span>{label}</span></li>;
        })}</ol>}
      </div>}
      <div className="confirmation-reference"><span>Order number</span><strong>{reference}</strong></div>

      {order && <div className="confirmation-details">
        <section className="confirmation-section" aria-labelledby="confirmation-items-title">
          <div className="confirmation-section__heading"><h2 id="confirmation-items-title">Your items</h2><span>{order.lines.reduce((total, line) => total + line.quantity, 0)} items</span></div>
          {order.lines.map((line) => <div className="confirmation-item" key={`${line.name}-${line.colour}-${line.size}`}>
            <div className="confirmation-item__image"><Image src={line.image} alt="" fill unoptimized={line.image.startsWith("http")} sizes="64px" /></div>
            <div><strong>{line.name}</strong><span>{line.colour}{line.size ? ` · EU ${line.size}` : " · One size"} · Qty {line.quantity}</span></div>
            <strong>{formatGhs(line.unitPriceGhs * line.quantity)}</strong>
          </div>)}
        </section>
        <section className="confirmation-section" aria-labelledby="confirmation-delivery-title">
          <div className="confirmation-section__heading"><h2 id="confirmation-delivery-title">Delivery to</h2><HugeiconsIcon icon={Location01Icon} aria-hidden="true" /></div>
          <p>{addressLines.map((line, index) => <span key={`${line}-${index}`}>{index > 0 && <br />}{line}</span>)}</p>
          <p className="confirmation-delivery-contact">{order.name}<br />{order.phone}<br />{order.email}</p>
        </section>
        <section className="confirmation-total" aria-label="Order total">
          <div><span>Items</span><strong>{formatGhs(order.subtotalGhs)}</strong></div>
          <div><span>Delivery</span><strong>{formatGhs(order.deliveryGhs)}</strong></div>
          <div><span>Payment status</span><strong>{order.paymentStatus === "paid" ? "Paid" : "Pending confirmation"}</strong></div>
          <div className="confirmation-total__grand"><span>Total</span><strong>{formatGhs(order.totalGhs)}</strong></div>
        </section>
      </div>}
      {retryError && <p className="checkout-error" role="alert">{retryError}</p>}
      <div className="confirmation-actions">{order.paymentStatus !== "paid" && order.status !== "cancelled" && <button className="button-primary" type="button" disabled={retrying} onClick={() => void retryPayment()}>{retrying ? <><i className="checkout-progress-spinner" aria-hidden="true" /> Connecting securely</> : <>Continue to payment <DirectionalIcon direction="right" /></>}</button>}<Link className="button-primary" href="/shop">Continue browsing <DirectionalIcon /></Link>{session?.user?.emailVerified && <Link className="text-link" href="/account/orders">View all orders</Link>}<Link className="text-link" href="/">Back to BASNY home</Link></div>
    </div>
  </main>;
}
