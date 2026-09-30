"use client";

import DirectionalIcon from "@/components/directional-icon";
import { CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useCart } from "@/lib/cart-context";
import { formatGhs } from "@/lib/sample-catalog";
import { readCheckoutOrder, saveCheckoutOrder, type CheckoutOrder } from "@/lib/checkout-order";
import { client } from "@/utils/orpc";
import { CheckoutLoadingState } from "@/components/checkout-loading-state";

export default function CheckoutPaymentView() {
  const { clearCart, cartToken } = useCart();
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setOrder(readCheckoutOrder());
    setLoaded(true);
  }, []);

  async function placeOrder() {
    if (!order || placing) return;
    if (!order.trackingToken) {
      setError("Your secure tracking details are missing. Return to delivery details and start checkout again.");
      return;
    }
    setPlacing(true);
    setError("");
    try {
      const created = await client.createCheckoutOrder({
        reference: order.reference,
        trackingToken: order.trackingToken,
        cartToken,
        name: order.name,
        email: order.email,
        phone: order.phone,
        deliveryArea: order.deliveryArea,
        region: order.region,
        town: order.town,
        address: order.address,
        note: order.note,
        couponCode: order.couponCode,
        lines: order.lines.map(({ productSlug, size, colour, quantity }) => ({ productSlug, size, colour, quantity })),
      });
      saveCheckoutOrder({ ...order, reference: created.reference, trackingToken: created.trackingToken, status: created.status, subtotalGhs: created.subtotalGhs, promotionDiscountGhs: created.promotionDiscountGhs, discountGhs: created.discountGhs, couponCode: created.discountCode ?? undefined, deliveryGhs: created.deliveryGhs, totalGhs: created.totalGhs, paymentMethod: null, paymentStatus: "pending" });
      const initialized = await client.initializeOrderPayment({ reference: created.reference, trackingToken: created.trackingToken });
      clearCart();
      window.location.assign(initialized.authorizationUrl);
    } catch {
      setError("We couldn’t start payment. Your order details are saved and your bag is still here—check your connection and try again.");
      setPlacing(false);
    }
  }

  if (!loaded) return <CheckoutLoadingState variant="payment" />;
  if (!order) return <main className="checkout-page page-shell"><div className="checkout-empty"><p className="eyebrow">Place order</p><h1>Your order is waiting.</h1><p>Review your delivery details and items before placing your order.</p><Link className="button-primary" href="/checkout/review">Review your order <DirectionalIcon direction="right" /></Link></div></main>;

  const itemCount = order.lines.reduce((total, line) => total + line.quantity, 0);

  return (
    <main className="checkout-page page-shell">
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/cart">Shopping bag</Link><span aria-hidden="true">/</span><Link href="/checkout">Delivery</Link><span aria-hidden="true">/</span><Link href="/checkout/review">Review</Link><span aria-hidden="true">/</span><span>Place order</span></nav>
      <div className="checkout-heading"><p className="eyebrow">Final step</p><h1>Pay securely</h1><p>Complete your purchase through Paystack. BASNY only receives confirmation after the payment is verified.</p></div>
      <div className="checkout-steps" aria-label="Checkout steps"><span className="checkout-steps__done"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" /> Bag</span><span className="checkout-steps__done"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" /> Delivery</span><span className="checkout-steps__done"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" /> Review</span><span className="checkout-steps__active">Payment</span></div>

      <div className="checkout-layout">
        <section className="checkout-panel checkout-order-submit" aria-labelledby="order-submit-title">
          <div className="checkout-panel__heading"><span>04</span><div><h2 id="order-submit-title">Pay with Paystack</h2><p>Cards and supported mobile money options.</p></div></div>
          <div className="checkout-payment-pending"><HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" /><p><strong>Your payment is protected by Paystack.</strong><span>Your order total is fixed in Ghana cedis. BASNY will begin preparing your order after Paystack confirms payment.</span></p></div>
          <dl className="checkout-contact-review"><div><dt>Contact</dt><dd>{order.name}<br />{order.phone}<br />{order.email}</dd></div><div><dt>Deliver to</dt><dd>{order.address}<br />{order.town}, {order.region}</dd></div><div><dt>Order reference</dt><dd>{order.reference}</dd></div></dl>
          <p className="checkout-order-consent">By placing this order, you confirm these items and delivery details are correct.</p>
        </section>

        <aside className="checkout-summary" aria-labelledby="payment-summary-title">
          <div className="checkout-summary__head"><div><p className="eyebrow">Your order</p><h2 id="payment-summary-title">Order summary</h2></div><Link href="/checkout/review">Edit</Link></div>
          <div className="checkout-summary__items">{order.lines.map((line) => <div className="checkout-summary__item" key={`${line.name}-${line.colour}-${line.size}`}>
            <div className="checkout-summary__image"><Image src={line.image} alt="" fill unoptimized={line.image.startsWith("http")} sizes="72px" /></div>
            <div className="checkout-summary__item-copy"><strong>{line.name}</strong><span>{line.colour}{line.size ? ` · EU ${line.size}` : " · One size"}</span><span>Qty {line.quantity}</span></div>
            <strong>{formatGhs(line.unitPriceGhs * line.quantity)}</strong>
          </div>)}</div>
          <div className="checkout-summary__row"><span>Items ({itemCount})</span><span>{formatGhs(order.subtotalGhs)}</span></div>
          {(order.promotionDiscountGhs ?? 0) > 0 && <div className="checkout-summary__row"><span>Sale savings</span><span>−{formatGhs(order.promotionDiscountGhs ?? 0)}</span></div>}
          {(order.discountGhs ?? 0) > 0 && <div className="checkout-summary__row"><span>Discount{order.couponCode ? ` · ${order.couponCode}` : ""}</span><span>−{formatGhs(order.discountGhs ?? 0)}</span></div>}
          <div className="checkout-summary__row"><span>Delivery</span><span>{formatGhs(order.deliveryGhs)}</span></div>
          <div className="checkout-summary__total"><span>Total</span><strong>{formatGhs(order.totalGhs)}</strong></div>
          {error && <p className="checkout-error" role="alert">{error}</p>}
          <button className="checkout-place-order" type="button" onClick={() => void placeOrder()} disabled={placing}>{placing ? <><i className="checkout-progress-spinner" aria-hidden="true" /> Preparing secure payment</> : <>Pay {formatGhs(order.totalGhs)} <DirectionalIcon direction="right" /></>}</button>
          <Link className="checkout-back" href="/checkout/review">Back to order review</Link>
        </aside>
      </div>
    </main>
  );
}
