"use client";

import { ArrowLeft01Icon, Delete02Icon, MinusSignIcon, PlusSignIcon, ShoppingBag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { formatGhs } from "@/lib/sample-catalog";

export default function CartView() {
  const { lines, itemCount, subtotalGhs, hydrated, catalogueReady, setQuantity, removeItem } = useCart();

  if (!hydrated) return <main className="cart-page page-shell" aria-busy="true"><p>Loading your bag…</p></main>;

  if (!catalogueReady) return <main className="cart-page page-shell" aria-busy="true"><p>Refreshing your bag…</p></main>;
  if (lines.length === 0) return <main className="cart-page page-shell">
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>Shopping bag</span></nav>
    <div className="cart-empty">
      <div className="empty-state__icon"><HugeiconsIcon icon={ShoppingBag01Icon} aria-hidden="true" /></div>
      <p className="eyebrow">Your BASNY bag</p>
      <h1>Your bag is waiting.</h1>
      <p>Take a look through shoes, bags and accessories chosen for everyday life.</p>
      <Link className="button-primary" href="/shop">Explore the collection <span aria-hidden="true">↗</span></Link>
    </div>
  </main>;

  return <main className="cart-page page-shell">
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>Shopping bag</span></nav>
    <div className="cart-heading"><div><p className="eyebrow">A good choice</p><h1>Your bag</h1></div><span>{itemCount} {itemCount === 1 ? "item" : "items"}</span></div>
    <div className="cart-layout">
      <section className="cart-items" aria-label="Items in your bag">
        {lines.map(({ key, product, colour, size, quantity, unitPriceGhs }) => { const available = product.variants.find((variant) => variant.colour === colour && variant.size === size)?.stock ?? 0; return <article className="cart-line" key={key}>
          <Link href={`/products/${product.slug}`} className="cart-line__image" aria-label={`View ${product.name}`}>
            <Image src={product.thumbnailImage ?? product.image} alt={product.imageAlt} fill unoptimized={Boolean(product.thumbnailImage?.startsWith("http"))} sizes="(max-width: 700px) 32vw, 180px" />
          </Link>
          <div className="cart-line__details">
            <p className="eyebrow">{product.type}</p>
            <h2><Link href={`/products/${product.slug}`}>{product.name}</Link></h2>
            <p>Colour: {colour}{size ? ` · EU ${size}` : " · One size"}</p>
            <div className="cart-line__actions">
              <div className="quantity-control" role="group" aria-label={`Quantity for ${product.name}`}>
                <button type="button" aria-label={`Decrease ${product.name} quantity`} disabled={quantity <= 1} onClick={() => setQuantity(key, quantity - 1)}><HugeiconsIcon icon={MinusSignIcon} aria-hidden="true" /></button>
                <span aria-live="polite">{quantity}</span>
                <button type="button" aria-label={`Increase ${product.name} quantity`} disabled={quantity >= Math.min(99, available)} onClick={() => setQuantity(key, quantity + 1)}><HugeiconsIcon icon={PlusSignIcon} aria-hidden="true" /></button>
              </div>
              <span className="cart-line__stock-note" role="status">{available} {available === 1 ? "unit" : "units"} available</span>
              <button className="cart-line__remove" type="button" onClick={() => removeItem(key)}><HugeiconsIcon icon={Delete02Icon} aria-hidden="true" /><span>Remove</span></button>
            </div>
          </div>
          <strong className="cart-line__price">{formatGhs(unitPriceGhs * quantity)}</strong>
        </article>; })}
        <Link className="cart-back-link" href="/shop"><HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" /> Continue shopping</Link>
      </section>
      <aside className="cart-summary" aria-labelledby="cart-summary-title">
        <p className="eyebrow">The numbers</p>
        <h2 id="cart-summary-title">Order summary</h2>
        <div className="cart-summary__row"><span>Subtotal</span><strong>{formatGhs(subtotalGhs)}</strong></div>
        <div className="cart-summary__row"><span>Delivery</span><span>Calculated at checkout</span></div>
        <p className="cart-summary__hint">GHS 60 in Accra · GHS 100 elsewhere in Ghana</p>
        <div className="cart-summary__total"><span>Estimated total</span><strong>{formatGhs(subtotalGhs)}<small> + delivery</small></strong></div>
        <Link className="button-primary cart-summary__button" href="/checkout">Continue to delivery <span aria-hidden="true">→</span></Link>
      </aside>
    </div>
  </main>;
}
