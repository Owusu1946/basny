"use client";

import { ArrowLeft01Icon, CheckmarkCircle02Icon, Location01Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { formatGhs } from "@/lib/sample-catalog";
import { readCheckoutOrder, type CheckoutOrder } from "@/lib/checkout-order";
import { client } from "@/utils/orpc";
import { CheckoutLoadingState } from "@/components/checkout-loading-state";

export default function CheckoutReviewView() {
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");

  useEffect(() => {
    setOrder(readCheckoutOrder());
    setCoupon(readCheckoutOrder()?.couponCode ?? "");
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!order) return;
    const currentOrder = order;
    let active = true;
    const lines = currentOrder.lines.map(({ productSlug, size, colour, quantity }) => ({ productSlug, size, colour, quantity }));
    async function refreshPricing() {
      try {
        const priced = await client.priceCheckout({ lines, identity: currentOrder.email, couponCode: currentOrder.couponCode });
        if (!active) return;
        const next: CheckoutOrder = { ...currentOrder, lines: priced.lines.map((line) => ({ ...line, unitPriceGhs: line.salePriceGhs })), subtotalGhs: priced.subtotalGhs, promotionDiscountGhs: priced.promotionDiscountGhs, discountGhs: priced.discountGhs, couponCode: priced.discountCode ?? undefined, totalGhs: priced.totalGhs + currentOrder.deliveryGhs };
        setOrder(next); window.sessionStorage.setItem("basny-order-v1", JSON.stringify(next));
      } catch (error) {
        if (!active) return;
        if (currentOrder.couponCode) {
          try {
            const priced = await client.priceCheckout({ lines, identity: currentOrder.email });
            if (!active) return;
            const next: CheckoutOrder = { ...currentOrder, lines: priced.lines.map((line) => ({ productSlug: line.productSlug, name: line.name, image: line.image, size: line.size, colour: line.colour, quantity: line.quantity, unitPriceGhs: line.salePriceGhs })), subtotalGhs: priced.subtotalGhs, promotionDiscountGhs: priced.promotionDiscountGhs, discountGhs: 0, couponCode: undefined, totalGhs: priced.totalGhs + currentOrder.deliveryGhs };
            setOrder(next); window.sessionStorage.setItem("basny-order-v1", JSON.stringify(next)); setCouponMessage(error instanceof Error ? error.message : "Your saved coupon is no longer available.");
          } catch { setCouponMessage("We couldn’t refresh current prices. Please retry before placing your order."); }
        } else setCouponMessage("We couldn’t refresh current prices. Please retry before placing your order.");
      }
    }
    void refreshPricing();
    return () => { active = false; };
  }, [order?.reference]);

  if (!loaded) return <CheckoutLoadingState variant="review" />;
  if (!order) return <main className="checkout-page page-shell"><div className="checkout-empty"><p className="eyebrow">Checkout</p><h1>Let’s start with delivery.</h1><p>Add your delivery details before reviewing your order.</p><Link className="button-primary" href="/checkout">Enter delivery details <span aria-hidden="true">→</span></Link></div></main>;

  const address = [order.address, order.town, order.region].filter(Boolean).join(", ");
  const itemCount = order.lines.reduce((total, line) => total + line.quantity, 0);

  async function applyCoupon() {
    if (!order || !coupon.trim() || couponBusy) return;
    setCouponBusy(true); setCouponMessage("");
    try {
      const result = await client.priceCheckout({ couponCode: coupon, identity: order.email, lines: order.lines.map(({ productSlug, size, colour, quantity }) => ({ productSlug, size, colour, quantity })) });
      const next: CheckoutOrder = { ...order, lines: result.lines.map((line) => ({ productSlug: line.productSlug, name: line.name, image: line.image, size: line.size, colour: line.colour, quantity: line.quantity, unitPriceGhs: line.salePriceGhs })), couponCode: result.discountCode ?? undefined, discountGhs: result.discountGhs, promotionDiscountGhs: result.promotionDiscountGhs, subtotalGhs: result.subtotalGhs, totalGhs: Math.max(0, result.totalGhs + order.deliveryGhs) };
      setOrder(next); window.sessionStorage.setItem("basny-order-v1", JSON.stringify(next)); setCouponMessage(`Coupon applied · ${formatGhs(result.discountGhs)} off`);
    } catch (error) { setCouponMessage(error instanceof Error ? error.message : "This coupon could not be applied."); }
    finally { setCouponBusy(false); }
  }
  function removeCoupon() {
    if (!order) return;
    const next = { ...order, couponCode: undefined, discountGhs: 0, totalGhs: order.subtotalGhs - (order.promotionDiscountGhs ?? 0) + order.deliveryGhs };
    setOrder(next); window.sessionStorage.setItem("basny-order-v1", JSON.stringify(next)); setCoupon(""); setCouponMessage("Coupon removed.");
  }

  return <main className="checkout-page page-shell">
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/cart">Shopping bag</Link><span aria-hidden="true">/</span><Link href="/checkout">Delivery</Link><span aria-hidden="true">/</span><span>Review</span></nav>
    <div className="checkout-heading"><p className="eyebrow">Step 2 of 3</p><h1>Review your order</h1><p>Check your items and delivery details before sending your order to BASNY.</p></div>
    <div className="checkout-steps" aria-label="Checkout steps"><span className="checkout-steps__done"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" /> Bag</span><span className="checkout-steps__done"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" /> Delivery</span><span className="checkout-steps__active">Review</span><span>Place order</span></div>

    <div className="order-review-layout">
      <div className="order-review-panels">
        <section className="checkout-panel" aria-labelledby="review-items-title">
          <div className="checkout-panel__heading"><span>01</span><div><h2 id="review-items-title">Your items</h2><p>{itemCount} {itemCount === 1 ? "item" : "items"} in your order</p></div><Link className="order-review-edit" href="/cart" aria-label="Edit your bag"><HugeiconsIcon icon={PencilEdit01Icon} aria-hidden="true" /> Edit bag</Link></div>
          <div className="order-review-items">{order.lines.map((line) => <div className="order-review-item" key={`${line.name}-${line.colour}-${line.size}`}>
            <div className="order-review-item__image"><Image src={line.image} alt="" fill unoptimized={line.image.startsWith("http")} sizes="80px" /></div>
            <div className="order-review-item__copy"><strong>{line.name}</strong><span>{line.colour}{line.size ? ` · EU ${line.size}` : " · One size"}</span><span>Quantity: {line.quantity}</span></div>
            <strong>{formatGhs(line.unitPriceGhs * line.quantity)}</strong>
          </div>)}</div>
        </section>

        <section className="checkout-panel" aria-labelledby="review-delivery-title">
          <div className="checkout-panel__heading"><span>02</span><div><h2 id="review-delivery-title">Delivery details</h2><p>{order.deliveryArea === "accra" ? "Within Accra" : "Outside Accra · Ghana"}</p></div><Link className="order-review-edit" href="/checkout" aria-label="Edit delivery details"><HugeiconsIcon icon={PencilEdit01Icon} aria-hidden="true" /> Edit</Link></div>
          <div className="order-review-address"><HugeiconsIcon icon={Location01Icon} aria-hidden="true" /><div><strong>{order.name}</strong><span>{address}</span><span>{order.phone} · {order.email}</span>{order.note && <span>Delivery note: {order.note}</span>}</div></div>
        </section>
      </div>

      <aside className="checkout-summary order-review-summary" aria-labelledby="review-summary-title">
        <p className="eyebrow">Order total</p><h2 id="review-summary-title">Summary</h2>
        <div className="checkout-summary__row"><span>Items ({itemCount})</span><span>{formatGhs(order.subtotalGhs)}</span></div>
        {(order.promotionDiscountGhs ?? 0) > 0 && <div className="checkout-summary__row"><span>Sale savings</span><span>−{formatGhs(order.promotionDiscountGhs ?? 0)}</span></div>}
        <section className="checkout-coupon" aria-label="Discount code"><label htmlFor="checkout-coupon-code">Discount code</label><div><input id="checkout-coupon-code" value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} placeholder="Enter code" autoComplete="off" /><button type="button" disabled={couponBusy || !coupon.trim()} onClick={() => void applyCoupon()}>{couponBusy ? "Checking…" : order.couponCode ? "Update" : "Apply"}</button></div>{order.couponCode && <button className="checkout-coupon__remove" type="button" onClick={removeCoupon}>Remove {order.couponCode}</button>}{couponMessage && <p role="status">{couponMessage}</p>}</section>
        {(order.discountGhs ?? 0) > 0 && <div className="checkout-summary__row"><span>Discount{order.couponCode ? ` · ${order.couponCode}` : ""}</span><span>−{formatGhs(order.discountGhs ?? 0)}</span></div>}
        <div className="checkout-summary__row"><span>Delivery</span><span>{formatGhs(order.deliveryGhs)}</span></div>
        <div className="checkout-summary__total"><span>Total</span><strong>{formatGhs(order.totalGhs)}</strong></div>
        <Link className="checkout-place-order" href="/checkout/payment">Continue to place order <span aria-hidden="true">→</span></Link>
        <Link className="checkout-back" href="/checkout"><HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" /> Back to delivery details</Link>
      </aside>
    </div>
  </main>;
}
