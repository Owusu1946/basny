"use client";

import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CashierIcon,
  CheckmarkCircle02Icon,
  CreditCardIcon,
  Delete02Icon,
  DiscountTag01Icon,
  MinusSignIcon,
  Money01Icon,
  PlusSignIcon,
  Search01Icon,
  ShoppingCart01Icon,
  SmartPhone01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AdminPagination, paginateItems } from "@/components/admin/admin-pagination";
import { useCatalogueState } from "@/components/admin/catalogue-workspaces";

import { salesOrders, salesReturns } from "@/lib/admin-sales-data";
import { formatGhs, sampleProducts, type SampleProduct } from "@/lib/sample-catalog";
import type { StoreProduct } from "@/lib/catalogue";
import { mapStoreProduct } from "@/lib/catalogue";
import { client, queryClient } from "@/utils/orpc";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";

type PosLine = { key: string; product: StoreProduct; colour: string; size: string; quantity: number; unitPriceGhs: number; regularUnitPriceGhs: number };
type PaymentMethod = "Cash" | "Mobile Money" | "Card" | "Bank transfer";
type SaleReceipt = { reference: string; createdAt: Date; payment: PaymentMethod; lines: PosLine[]; subtotal: number; promotionDiscount: number; couponDiscount: number; couponCode?: string | null; total: number; customer: string; customerType: string };
type ReturnRecord = { id: string; order: string; customer: string; contact?: string; product: SampleProduct; variant: string; quantity?: number; reason: string; status: string; requested: string; resolution: string; note: string; internalNote?: string; origin?: string; condition?: string; refundAmountGhs?: number };
const methods: { name: PaymentMethod; icon: IconSvgElement; note: string }[] = [
  { name: "Cash", icon: Money01Icon, note: "Cash received at the counter" },
  { name: "Mobile Money", icon: SmartPhone01Icon, note: "Record a MoMo payment" },
  { name: "Card", icon: CreditCardIcon, note: "Card payment at the counter" },
  { name: "Bank transfer", icon: ArrowRight01Icon, note: "Transfer confirmed by staff" },
];

function Icon({ icon }: { icon: IconSvgElement }) {
  return <HugeiconsIcon icon={icon} aria-hidden="true" />;
}

function ProductPhoto({ product, className = "" }: { product: Pick<SampleProduct, "image" | "imageAlt">; className?: string }) {
  return <div className={`sales-product-photo ${className}`}><Image src={product.image} alt={product.imageAlt} fill unoptimized={product.image.startsWith("http")} sizes="(max-width: 720px) 45vw, 220px" /></div>;
}

function PosWorkspace() {
  const [category, setCategory] = useState("All items");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 180); return () => window.clearTimeout(timer); }, [query]);
  const catalogueQuery = useInfiniteQuery({
    queryKey: ["pos-catalogue", category, debouncedQuery],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => client.searchPublicPosCatalogue({ query: debouncedQuery, category, page: pageParam, pageSize: 24 }),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: true,
  });
  const catalogueProducts = catalogueQuery.data?.pages.flatMap((page) => page.products.map((product) => mapStoreProduct(product as Parameters<typeof mapStoreProduct>[0])));
  const products = catalogueProducts ?? [];
  const categories = catalogueQuery.data?.pages[0]?.categories ?? [];
  const [lines, setLines] = useState<PosLine[]>([]);
  const [choice, setChoice] = useState<StoreProduct | null>(null);
  const [colour, setColour] = useState("");
  const [size, setSize] = useState("");
  const [customerType, setCustomerType] = useState("Walk-in customer");
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<{ code: string; discountGhs: number } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");
  const [saleBusy, setSaleBusy] = useState(false);
  const [step, setStep] = useState<"sale" | "payment" | "receipt">("sale");
  const [payment, setPayment] = useState<PaymentMethod>("Cash");
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const subtotal = lines.reduce((sum, line) => sum + line.regularUnitPriceGhs * line.quantity, 0);
  const saleSubtotal = lines.reduce((sum, line) => sum + line.unitPriceGhs * line.quantity, 0);
  const promotionDiscount = subtotal - saleSubtotal;
  const discount = couponApplied?.discountGhs ?? 0;
  const total = Math.max(0, saleSubtotal - discount);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  function openChoice(product: StoreProduct) {
    setChoice(product);
    const firstAvailable = product.variants.find((variant) => variant.active && variant.stock > 0);
    setColour(firstAvailable?.colour ?? product.colours[0]?.name ?? "");
    setSize(firstAvailable?.size ?? "");
  }

  function addChosenProduct() {
    if (!choice) return;
    const variant = choice.variants.find((item) => item.colour === colour && item.size === (size || null) && item.active && item.stock > 0);
    if (!variant) return;
    setCouponApplied(null); setCouponMessage("");
    const key = [choice.slug, colour, size].join("|");
    setLines((current) => {
      const existing = current.find((line) => line.key === key);
      return existing
        ? current.map((line) => line.key === key ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { key, product: choice, colour, size, quantity: 1, unitPriceGhs: variant.priceGhs, regularUnitPriceGhs: variant.regularPriceGhs ?? variant.priceGhs }];
    });
    setChoice(null);
  }

  function changeQuantity(key: string, delta: number) {
    setCouponApplied(null); setCouponMessage("");
    setLines((current) => current.flatMap((line) => {
      if (line.key !== key) return [line];
      const quantity = line.quantity + delta;
      return quantity > 0 ? [{ ...line, quantity }] : [];
    }));
  }

  async function applyPosCoupon() {
    if (!couponCode.trim() || !lines.length || couponBusy) return;
    setCouponBusy(true); setCouponMessage("");
    try {
      const result = await client.validateDiscountCode({ code: couponCode, identity: customerPhone, lines: lines.map((line) => ({ productSlug: line.product.slug, size: line.size || null, colour: line.colour, quantity: line.quantity })) });
      setCouponApplied({ code: result.code, discountGhs: result.discountGhs }); setCouponCode(result.code); setCouponMessage(`Applied · ${formatGhs(result.discountGhs)} off`);
    } catch (error) { setCouponApplied(null); setCouponMessage(error instanceof Error ? error.message : "Coupon could not be applied."); }
    finally { setCouponBusy(false); }
  }

  async function completeSale() {
    if (saleBusy || !lines.length) return;
    setSaleBusy(true);
    try {
      const reference = `POS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const saved = await client.createPosSale({ reference, customerName: customer.trim() || "Walk-in customer", customerPhone: customerPhone || undefined, paymentMethod: payment, couponCode: couponApplied?.code, lines: lines.map((line) => ({ productSlug: line.product.slug, size: line.size || null, colour: line.colour, quantity: line.quantity })) });
      void queryClient.invalidateQueries({ queryKey: ["pos-catalogue"] });
      void queryClient.invalidateQueries({ queryKey: ["catalogue", "public"] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      setReceipt({ reference: saved.reference, createdAt: new Date(saved.createdAt), payment, lines: structuredClone(lines), subtotal: saved.subtotalGhs, promotionDiscount: saved.promotionDiscountGhs, couponDiscount: saved.discountGhs, couponCode: saved.discountCode, total: saved.totalGhs, customer: customer.trim() || "Walk-in customer", customerType });
      setStep("receipt");
    } catch (error) {
      setCouponMessage(error instanceof Error ? error.message : "Sale could not be saved. Review stock and try again.");
    } finally { setSaleBusy(false); }
  }

  function newSale() {
    setLines([]); setCustomer(""); setCustomerPhone(""); setCustomerType("Walk-in customer"); setCouponCode(""); setCouponApplied(null); setCouponMessage("");
    setPayment("Cash"); setReceipt(null); setStep("sale"); setCartOpen(false);
  }

  if (step === "receipt" && receipt) return <PosReceipt receipt={receipt} onNewSale={newSale} />;

  if (catalogueQuery.isPending) return <div className="pos-workspace" aria-busy="true"><div className="pos-catalogue"><div className="pos-catalogue__top"><div><p className="admin-eyebrow">BASNY · ACCRA</p><h1>Ring up a sale</h1><p>Loading the live catalogue…</p></div></div><label className="pos-search"><Icon icon={Search01Icon} /><input disabled placeholder="Search products by name or type" /></label><div className="pos-product-grid">{Array.from({ length: 8 }, (_, index) => <div className="pos-product-card pos-product-card--skeleton" key={index}><span className="pos-product-card__photo" /><span className="pos-product-card__copy"><span><i /><i /></span><i /></span></div>)}</div></div></div>;
  if (catalogueQuery.isError && !catalogueQuery.data) return <div className="admin-empty-state"><strong>Catalogue unavailable</strong><p>We could not load products for the register.</p><button type="button" className="admin-secondary-button" onClick={() => void catalogueQuery.refetch()}>Retry</button></div>;

  const cartPanel = (
    <aside className={`pos-cart${cartOpen ? " pos-cart--mobile-open" : ""}`} aria-label="Current sale">
      <div className="pos-cart__heading"><div><p className="admin-eyebrow">CURRENT SALE</p><h2>{step === "payment" ? "Take payment" : "Sale details"}</h2></div><button className="pos-icon-button pos-cart__close" type="button" aria-label="Close sale panel" onClick={() => setCartOpen(false)}><Icon icon={Cancel01Icon} /></button></div>
      {step === "sale" ? <>
        <label className="pos-field">Customer type<select value={customerType} onChange={(event) => setCustomerType(event.target.value)}><option>Walk-in customer</option><option>Returning customer</option></select></label>
        {customerType === "Returning customer" && <label className="pos-field">Customer name<input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Customer name" /></label>}
        <label className="pos-field">Customer phone <span className="pos-optional">Required for coupons</span><input value={customerPhone} onChange={(event) => { setCustomerPhone(event.target.value); setCouponApplied(null); }} placeholder="0XX XXX XXXX" inputMode="tel" /></label>
        {customerType === "Walk-in customer" && <label className="pos-field">Customer name <span className="pos-optional">Optional</span><input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Add a name to this receipt" /></label>}
        <div className="pos-cart__items">
          {lines.length === 0 ? <div className="pos-empty-cart"><span className="pos-empty-cart__icon"><Icon icon={ShoppingCart01Icon} /></span><strong>Your sale is empty</strong><p>Choose an item from the catalogue to get started.</p></div> : lines.map((line) => (
            <div className="pos-cart-line" key={line.key}>
              <ProductPhoto product={line.product} className="pos-cart-line__photo" />
              <div className="pos-cart-line__copy"><strong>{line.product.name}</strong><span>{[line.colour, line.size && `EU ${line.size}`].filter(Boolean).join(" · ")}</span><div className="pos-quantity"><button type="button" aria-label={`Remove one ${line.product.name}`} onClick={() => changeQuantity(line.key, -1)}><Icon icon={MinusSignIcon} /></button><span>{line.quantity}</span><button type="button" aria-label={`Add one ${line.product.name}`} onClick={() => changeQuantity(line.key, 1)}><Icon icon={PlusSignIcon} /></button></div></div>
              <div className="pos-cart-line__end"><strong>{formatGhs(line.unitPriceGhs * line.quantity)}</strong><button type="button" aria-label={`Remove ${line.product.name}`} onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}><Icon icon={Delete02Icon} /></button></div>
            </div>
          ))}
        </div>
        <section className="pos-discount" aria-label="Coupon code"><div className="pos-discount__title"><strong><Icon icon={DiscountTag01Icon} /> Coupon code</strong><button type="button" onClick={() => { setCouponApplied(null); setCouponCode(""); setCouponMessage("Coupon removed."); }} disabled={!couponApplied}>Clear</button></div><div className="pos-discount__entry"><input aria-label="Coupon code" value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); setCouponApplied(null); }} placeholder="Enter coupon code" /><button type="button" onClick={() => void applyPosCoupon()} disabled={!couponCode.trim() || !lines.length || couponBusy}>{couponBusy ? "Checking…" : "Apply"}</button></div>{couponMessage && <small role="status">{couponMessage}</small>}</section>
        <div className="pos-totals"><div><span>Subtotal</span><strong>{formatGhs(subtotal)}</strong></div>{promotionDiscount > 0 && <div className="pos-totals__discount"><span>Sale savings</span><strong>−{formatGhs(promotionDiscount)}</strong></div>}{discount > 0 && <div className="pos-totals__discount"><span>Coupon{couponApplied?.code ? ` · ${couponApplied.code}` : ""}</span><strong>−{formatGhs(discount)}</strong></div>}<div className="pos-totals__grand"><span>Total due</span><strong>{formatGhs(total)}</strong></div></div>
        <button type="button" className="admin-primary-button pos-checkout-button" disabled={!lines.length} onClick={() => { setStep("payment"); setCartOpen(true); }}>Continue to payment <Icon icon={ArrowRight01Icon} /></button>
        <p className="pos-tax-note">Prices shown in Ghana cedis. Tax is not added in this screen.</p>
      </> : <>
        <button className="pos-back-link" type="button" onClick={() => setStep("sale")}><Icon icon={ArrowLeft01Icon} /> Back to sale</button>
        <p className="pos-payment-label">Choose how the customer paid</p>
        <div className="pos-payment-options" role="radiogroup" aria-label="Payment method">{methods.map((method) => <button key={method.name} type="button" role="radio" aria-checked={payment === method.name} className={`pos-payment-option${payment === method.name ? " is-selected" : ""}`} onClick={() => setPayment(method.name)}><span className="pos-payment-option__icon"><Icon icon={method.icon} /></span><span><strong>{method.name}</strong><small>{method.note}</small></span><span className="pos-radio" /></button>)}</div>
        <div className="pos-payment-total"><span>Amount to collect</span><strong>{formatGhs(total)}</strong></div>
        <p className="pos-payment-disclaimer">Record the payment after you have confirmed it at the counter. This screen does not process a payment.</p>
        {couponMessage && <p className="pos-error" role="alert">{couponMessage}</p>}<button type="button" className="admin-primary-button pos-checkout-button" disabled={!lines.length || saleBusy} onClick={() => void completeSale()}>{saleBusy ? "Saving sale…" : "Confirm payment & finish sale"} <Icon icon={CheckmarkCircle02Icon} /></button>
      </>}
    </aside>
  );

  return <div className="pos-workspace">
    <div className="pos-catalogue"><div className="pos-catalogue__top"><div><p className="admin-eyebrow">BASNY · ACCRA</p><h1>Ring up a sale</h1><p>Find an item, choose its options, and add it to the sale.</p></div><div className="pos-register-status"><span /> Register open</div></div>
      <label className="pos-search"><Icon icon={Search01Icon} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products by name or type" /><span>⌘ K</span></label>
      <div className="pos-category-tabs" role="tablist" aria-label="Product categories">{["All items", ...categories.map((item) => item.slug)].map((item) => <button key={item} type="button" role="tab" aria-selected={category === item} className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{item === "All items" ? item : categories.find((entry) => entry.slug === item)?.name}</button>)}</div>
      <div className="pos-product-grid" aria-busy={catalogueQuery.isFetchingNextPage}>{products.map((product) => <button className="pos-product-card" type="button" key={product.slug} onClick={() => openChoice(product)}><ProductPhoto product={product} className="pos-product-card__photo" /><span className="pos-product-card__copy"><span><strong>{product.name}</strong><small>{product.type}</small></span><strong>{formatGhs(product.priceGhs)}</strong></span><span className="pos-product-card__add"><Icon icon={PlusSignIcon} /> Add to sale</span></button>)}{catalogueQuery.isFetchingNextPage && Array.from({ length: 4 }, (_, index) => <div className="pos-product-card pos-product-card--skeleton" key={`more-${index}`} aria-hidden="true" />)}</div>
      {catalogueQuery.isError && <div className="admin-empty-state"><strong>Could not refresh catalogue</strong><p>Your current sale is still here. Retry when the connection is back.</p><button type="button" className="admin-secondary-button" onClick={() => void catalogueQuery.refetch()}>Retry</button></div>}
      {!catalogueQuery.isError && products.length === 0 && !catalogueQuery.isFetching && <div className="admin-empty-state"><Icon icon={Search01Icon} /><strong>No items match that search</strong><p>Try another product name or clear the search.</p><button type="button" className="admin-secondary-button" onClick={() => setQuery("")}>Clear search</button></div>}
      {catalogueQuery.hasNextPage && <div className="pos-load-more"><button type="button" className="admin-secondary-button" onClick={() => void catalogueQuery.fetchNextPage()} disabled={catalogueQuery.isFetchingNextPage}>{catalogueQuery.isFetchingNextPage ? "Loading more products…" : `Load more products · ${products.length} shown`}</button></div>}
    </div>
    {cartPanel}
    <button type="button" className="pos-mobile-cart-button" onClick={() => setCartOpen(true)}><Icon icon={ShoppingCart01Icon} /><span>View sale <small>{itemCount} {itemCount === 1 ? "item" : "items"}</small></span><strong>{formatGhs(total)}</strong></button>
    {choice && <div className="sales-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setChoice(null); }}><section className="sales-dialog pos-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="pos-choice-title"><button className="pos-icon-button sales-dialog__close" type="button" aria-label="Close" onClick={() => setChoice(null)}><Icon icon={Cancel01Icon} /></button><div className="pos-choice-product"><ProductPhoto product={choice} className="pos-choice-product__photo" /><div><p className="admin-eyebrow">{choice.type}</p><h2 id="pos-choice-title">{choice.name}</h2><p>{choice.description}</p><strong>{formatGhs(choice.priceGhs)}</strong></div></div>
      {choice.colours.length > 0 && <fieldset className="pos-choice-fieldset"><legend>Colour <span>{colour}</span></legend><div className="pos-colour-choices">{choice.colours.map((item) => <button key={item.name} type="button" aria-label={item.name} aria-pressed={colour === item.name} className={colour === item.name ? "is-selected" : ""} style={{ "--swatch": item.hex } as CSSProperties} onClick={() => { setColour(item.name); const first = choice.variants.find((variant) => variant.colour === item.name && variant.active && variant.stock > 0); setSize(first?.size ?? ""); }} />)}</div></fieldset>}
      {choice.sizes.length > 0 && <fieldset className="pos-choice-fieldset"><legend>Size <span>EU {size}</span></legend><div className="pos-size-choices">{choice.sizes.map((item) => { const available = choice.variants.some((variant) => variant.colour === colour && variant.size === item && variant.active && variant.stock > 0); return <button key={item} type="button" disabled={!available} aria-pressed={size === item} className={size === item ? "is-selected" : ""} onClick={() => setSize(item)}>{item}</button>; })}</div></fieldset>}
      <button className="admin-primary-button pos-checkout-button" type="button" disabled={!choice.variants.some((variant) => variant.colour === colour && variant.size === (size || null) && variant.active && variant.stock > 0)} onClick={addChosenProduct}>Add item · {formatGhs(choice.variants.find((variant) => variant.colour === colour && variant.size === (size || null))?.priceGhs ?? choice.priceGhs)} <Icon icon={PlusSignIcon} /></button></section></div>}
  </div>;
}

function PosReceipt({ receipt, onNewSale }: { receipt: SaleReceipt; onNewSale: () => void }) {
  const date = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(receipt.createdAt);
  return <div className="pos-receipt-page"><div className="pos-receipt-heading"><div><p className="admin-eyebrow">SALE COMPLETE</p><h1>Thank you.</h1><p>Payment marked as received. Your receipt is ready.</p></div><span className="pos-receipt-success"><Icon icon={CheckmarkCircle02Icon} /> Completed</span></div>
    <section className="pos-receipt-card" aria-label="Printable sale receipt"><header><div className="pos-receipt-brand"><strong>BASNY</strong><span>ENTERPRISE · ACCRA</span></div><p>IN-STORE SALES RECEIPT</p></header><div className="pos-receipt-meta"><div><span>Receipt</span><strong>{receipt.reference}</strong></div><div><span>Date</span><strong>{date}</strong></div><div><span>Customer</span><strong>{receipt.customer}</strong></div><div><span>Customer type</span><strong>{receipt.customerType}</strong></div></div><div className="pos-receipt-lines">{receipt.lines.map((line) => <div className="pos-receipt-line" key={line.key}><div><strong>{line.product.name}</strong><span>{[line.colour, line.size && `EU ${line.size}`].filter(Boolean).join(" · ")} · Qty {line.quantity}</span></div><strong>{formatGhs(line.unitPriceGhs * line.quantity)}</strong></div>)}</div><div className="pos-receipt-totals"><div><span>Subtotal</span><strong>{formatGhs(receipt.subtotal)}</strong></div>{receipt.promotionDiscount > 0 && <div><span>Sale savings</span><strong>−{formatGhs(receipt.promotionDiscount)}</strong></div>}{receipt.couponDiscount > 0 && <div><span>Coupon{receipt.couponCode ? ` · ${receipt.couponCode}` : ""}</span><strong>−{formatGhs(receipt.couponDiscount)}</strong></div>}<div><span>Paid by</span><strong>{receipt.payment}</strong></div><div className="pos-receipt-grand"><span>Total paid</span><strong>{formatGhs(receipt.total)}</strong></div></div><footer>Thank you for shopping with BASNY Enterprise.<br />Accra, Ghana</footer></section>
    <div className="pos-receipt-actions"><button type="button" className="admin-primary-button" onClick={() => window.print()}><Icon icon={CashierIcon} /> Print receipt</button><button type="button" className="admin-secondary-button" onClick={onNewSale}>Make another sale <Icon icon={PlusSignIcon} /></button></div>
  </div>;
}

export function PointOfSaleWorkspace() { return <PosWorkspace />; }

function StatusBadge({ status }: { status: string }) {
  const tone = /complete|resolved|recovered|received|paid/i.test(status) ? "success" : /cancel|reject/i.test(status) ? "danger" : /review|pending|contact|dispatch|processing|approved/i.test(status) ? "warm" : "neutral";
  return <span className={`sales-status sales-status--${tone}`}><i />{status}</span>;
}

function SalesScreenHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="sales-screen-heading"><div><p className="admin-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function DetailDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="sales-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="sales-dialog sales-detail-dialog" role="dialog" aria-modal="true" aria-label={title}><div className="sales-detail-dialog__heading"><div><p className="admin-eyebrow">RECORD DETAILS</p><h2>{title}</h2></div><button className="pos-icon-button" type="button" aria-label="Close details" onClick={onClose}><Icon icon={Cancel01Icon} /></button></div>{children}</section></div>;
}

export function OrdersWorkspace() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("All orders");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [records, setRecords] = useState(salesOrders);
  const [selected, setSelected] = useState<typeof salesOrders[number] | null>(null);
  const filtered = records.filter((order) => (status === "All orders" || order.status === status) && (!dateFrom || order.dateKey >= dateFrom) && (!dateTo || order.dateKey <= dateTo) && `${order.id} ${order.customer} ${order.contact} ${order.email} ${order.payment} ${order.paymentReference} ${order.fulfillment}`.toLowerCase().includes(query.toLowerCase()));
  const pageOrders = paginateItems(filtered, page, 25);
  function updateOrderStatus(value: string) {
    if (!selected) return;
    const next = { ...selected, status: value };
    setSelected(next);
    setRecords((current) => current.map((order) => order.id === next.id ? next : order));
  }
  return <div className="sales-records"><SalesScreenHeading eyebrow="SALES · ORDER MANAGEMENT" title="Orders" description="Review and move customer orders through the fulfilment journey." action={<div className="sales-kpi"><span>Gross sales shown</span><strong>{formatGhs(records.reduce((sum, item) => sum + item.total, 0))}</strong><small>Sample register data</small></div>} />
    <div className="sales-list-toolbar"><label className="sales-search"><Icon icon={Search01Icon} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search order, name, phone, email or payment ref" /></label><label className="sales-select"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option>All orders</option>{[...new Set(records.map((order) => order.status))].map((item) => <option key={item}>{item}</option>)}</select><Icon icon={ArrowDown01Icon} /></label><label className="sales-date-filter">From<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label><label className="sales-date-filter">To<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label>{(dateFrom || dateTo) && <button type="button" className="sales-date-clear" onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}>Clear dates</button>}<span className="sales-result-count">{filtered.length} orders</span></div>
    <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Order</th><th>Customer</th><th>Channel</th><th>Delivery method</th><th>Payment</th><th>Status</th><th>Total</th><th><span className="visually-hidden">Details</span></th></tr></thead><tbody>{pageOrders.map((order) => <tr key={order.id} onClick={() => setSelected(order)}><td><button className="sales-table__primary" type="button" onClick={(event) => { event.stopPropagation(); setSelected(order); }}>{order.id}</button><small>{order.date}</small></td><td><strong>{order.customer}</strong><small>{order.contact}</small></td><td>{order.channel}</td><td>{order.fulfillment}</td><td><span className="sales-payment-text">{order.payment}</span></td><td><StatusBadge status={order.status} /></td><td className="sales-table__money">{formatGhs(order.total)}</td><td><button className="pos-icon-button" type="button" aria-label={`View order ${order.id}`} onClick={(event) => { event.stopPropagation(); setSelected(order); }}><Icon icon={ArrowRight01Icon} /></button></td></tr>)}</tbody></table>{filtered.length === 0 && <p className="sales-no-results">No orders match. Adjust your search or status filter.</p>}</div>
    <div className="sales-mobile-list">{pageOrders.map((order) => <button type="button" className="sales-mobile-record" key={order.id} onClick={() => setSelected(order)}><span className="sales-mobile-record__top"><strong>{order.id}</strong><StatusBadge status={order.status} /></span><span>{order.customer} <small>· {order.channel} · {order.fulfillment}</small></span><span className="sales-mobile-record__bottom"><small>{order.date}</small><strong>{formatGhs(order.total)}</strong></span></button>)}</div>
    <AdminPagination total={filtered.length} page={page} pageSize={25} onPageChange={setPage} label="orders" />
    {selected && <DetailDialog title={selected.id} onClose={() => setSelected(null)}><div className="sales-order-detail"><div className="sales-order-detail__top"><div><p className="admin-eyebrow">ORDER STATUS</p><StatusBadge status={selected.status} /></div><div><p className="admin-eyebrow">ORDER TOTAL</p><strong>{formatGhs(selected.total)}</strong></div></div><div className="sales-detail-grid"><div><span>Customer</span><strong>{selected.customer}</strong><small>{selected.contact}</small><small>{selected.email}</small></div><div><span>Placed</span><strong>{selected.date}</strong></div><div><span>Channel</span><strong>{selected.channel}</strong></div><div><span>Delivery method</span><strong>{selected.fulfillment}</strong></div><div><span>Payment</span><strong>{selected.payment}</strong><small>{selected.paymentReference}</small></div><div className="sales-detail-grid__wide"><span>{selected.fulfillment === "Delivery" ? "Delivery address" : "Collection location"}</span><strong>{selected.address}</strong></div></div><h3>Items in this order</h3>{selected.lines.map((line) => <div className="sales-detail-item" key={`${line.product.slug}-${line.variant}`}><ProductPhoto product={line.product} /><div><strong>{line.product.name}</strong><span>{line.variant} · Qty {line.quantity}</span></div><strong>{formatGhs(line.product.priceGhs * line.quantity)}</strong></div>)}<div className="sales-order-costs"><div><span>Items subtotal</span><strong>{formatGhs(selected.total - selected.deliveryFeeGhs)}</strong></div><div><span>Delivery fee</span><strong>{formatGhs(selected.deliveryFeeGhs)}</strong></div><div><span>Order total</span><strong>{formatGhs(selected.total)}</strong></div></div><div className="sales-order-timeline"><strong>Order activity</strong><p><i /> {selected.date} · Order placed via {selected.channel.toLowerCase()}</p><p><i /> {selected.payment}</p></div><div className="sales-detail-actions"><select aria-label="Update order status" value={selected.status} onChange={(event) => updateOrderStatus(event.target.value)}>{["Awaiting payment", "Processing", "Ready for dispatch", "Complete", "Cancelled"].map((item) => <option key={item}>{item}</option>)}</select><button type="button" className="admin-primary-button" onClick={() => window.print()}>Print order summary</button></div></div></DetailDialog>}
    <p className="sales-data-note">Order records are sample data for this interface. Status changes stay in this screen.</p>
  </div>;
}

export function ReturnsWorkspace() {
  const [filter, setFilter] = useState("All requests");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [records, setRecords] = useCatalogueState<ReturnRecord[]>("sales-returns", salesReturns);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [saleSource, setSaleSource] = useState<"order" | "walk-in">("order");
  const [orderId, setOrderId] = useState("");
  const [lineIndex, setLineIndex] = useState("");
  const [manualProductSlug, setManualProductSlug] = useState(sampleProducts[0]?.slug ?? "");
  const [manualVariant, setManualVariant] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [walkInReference, setWalkInReference] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [reason, setReason] = useState("Changed my mind");
  const [resolution, setResolution] = useState("Exchange");
  const [quantity, setQuantity] = useState("1");
  const [receivedInStore, setReceivedInStore] = useState(true);
  const [condition, setCondition] = useState("Inspection pending");
  const [staffNote, setStaffNote] = useState("");
  const todayInAccra = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Accra", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const eligibleOrders = salesOrders.filter((order) => order.payment.startsWith("Paid") && order.status !== "Cancelled");
  const selectedOrder = eligibleOrders.find((order) => order.id === orderId);
  const selectedLine = selectedOrder && lineIndex !== "" ? selectedOrder.lines[Number(lineIndex)] : undefined;
  const manualProduct = sampleProducts.find((product) => product.slug === manualProductSlug) ?? sampleProducts[0];
  const manualVariants = manualProduct.colours.flatMap((colour) => manualProduct.sizes.length
    ? manualProduct.sizes.map((size) => `${colour.name} · EU ${size}`)
    : [colour.name]);
  const product = saleSource === "order" ? selectedLine?.product : manualProduct;
  const variant = saleSource === "order" ? selectedLine?.variant : manualVariant;
  const alreadyReturned = selectedOrder && selectedLine
    ? records.filter((record) => record.order === selectedOrder.id && record.product.slug === selectedLine.product.slug && record.variant === selectedLine.variant && record.status !== "Rejected").reduce((sum, record) => sum + (record.quantity ?? 1), 0)
    : 0;
  const maxReturnQuantity = selectedLine ? Math.max(0, selectedLine.quantity - alreadyReturned) : 99;
  const returnValue = (product?.priceGhs ?? 0) * (Number(quantity) || 0);
  const returnDeliveryOwner = /wrong|damaged|defective/i.test(reason) ? "BASNY arranges or pays" : "Customer pays";
  const filtered = records.filter((record) => filter === "All requests" || record.status === filter);
  const selected = records.find((record) => record.id === selectedId);
  function updateStatus(value: string) { setRecords((current) => current.map((record) => record.id === selectedId ? { ...record, status: value } : record)); }
  function resetCreateForm() {
    setSaleSource("order"); setOrderId(""); setLineIndex(""); setManualProductSlug(sampleProducts[0]?.slug ?? ""); setManualVariant("");
    setCustomerName(""); setCustomerContact(""); setWalkInReference(""); setPurchaseDate(""); setReason("Changed my mind");
    setResolution("Exchange"); setQuantity("1"); setReceivedInStore(true); setCondition("Inspection pending"); setStaffNote(""); setCreateError("");
  }
  function createReturn() {
    const units = Number(quantity);
    if (!product || !variant || !customerName.trim() || !reason || !resolution || !Number.isInteger(units) || units < 1 || (saleSource === "order" && (!selectedOrder || !selectedLine || units > maxReturnQuantity)) || (saleSource === "walk-in" && (!walkInReference.trim() || !purchaseDate))) {
      setCreateError(saleSource === "walk-in" ? "Add the customer, item, purchase date, proof-of-purchase reference, and a valid quantity." : "Choose an eligible paid order and item, then enter the customer and a valid return quantity.");
      return;
    }
    const returnId = `RET-${Date.now().toString().slice(-6)}`;
    const returnOrder = saleSource === "order" ? selectedOrder!.id : `Walk-in · ${walkInReference.trim()}`;
    const note = `${returnDeliveryOwner} for return delivery. ${receivedInStore ? "Item received in store; inspection is pending." : "Item has not yet been received."}${saleSource === "walk-in" ? ` Walk-in purchase dated ${purchaseDate}; proof: ${walkInReference.trim()}.` : ""}`;
    const created: ReturnRecord = {
      id: returnId, order: returnOrder, customer: customerName.trim(), contact: customerContact.trim(), product, variant,
      quantity: units, reason, status: receivedInStore ? "Received" : "Needs review", requested: new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(new Date()),
      resolution, note, internalNote: staffNote.trim(), origin: saleSource === "walk-in" ? "Walk-in · manually recorded" : "Admin-created from order",
      condition, refundAmountGhs: resolution === "Refund" ? returnValue : 0,
    };
    setRecords((current) => [created, ...current]); setFilter("All requests"); setCreateOpen(false); setCreateError(""); setSelectedId(returnId);
  }
  return <div className="sales-records"><SalesScreenHeading eyebrow="SALES · AFTERCARE" title="Returns & exchanges" description="Review requests, agree a resolution, and keep the customer informed." action={<div className="sales-policy-chip"><Icon icon={UserGroupIcon} /><span><strong>Return delivery</strong><small>Paid by the customer</small></span></div>} />
    <div className="sales-return-toolbar"><p>Create a return for an order or record an in-store walk-in return.</p><button type="button" className="admin-primary-button" onClick={() => { resetCreateForm(); setCreateOpen(true); }}><Icon icon={PlusSignIcon} /> Create return</button></div>
    <div className="sales-filter-tabs" role="tablist" aria-label="Filter return requests">{["All requests", "Needs review", "Approved", "Received", "Resolved", "Rejected"].map((item) => <button type="button" role="tab" aria-selected={filter === item} className={filter === item ? "is-active" : ""} key={item} onClick={() => setFilter(item)}>{item}<span>{item === "All requests" ? records.length : records.filter((record) => record.status === item).length}</span></button>)}</div>
    <div className="sales-return-list">{filtered.map((record) => <button className="sales-return-card" type="button" key={record.id} onClick={() => setSelectedId(record.id)}><div className="sales-return-card__product"><ProductPhoto product={record.product} /><span><strong>{record.product.name}</strong><small>{record.variant}</small></span></div><div><span className="sales-record-label">REQUEST</span><strong>{record.id}</strong><small>{record.requested}</small></div><div><span className="sales-record-label">REASON</span><strong>{record.reason}</strong><small>Order {record.order}</small></div><div><StatusBadge status={record.status} /><small>{record.resolution}</small></div><Icon icon={ArrowRight01Icon} /></button>)}</div>
    {filtered.length === 0 && <p className="sales-no-results">There are no requests in this status.</p>}
    {selected && <DetailDialog title={selected.id} onClose={() => setSelectedId(null)}><div className="sales-return-detail"><div className="sales-detail-item"><ProductPhoto product={selected.product} /><div><strong>{selected.product.name}</strong><span>{selected.variant} · Order {selected.order}</span></div><StatusBadge status={selected.status} /></div><div className="sales-detail-grid"><div><span>Customer</span><strong>{selected.customer}</strong>{selected.contact && <small>{selected.contact}</small>}</div><div><span>Requested</span><strong>{selected.requested}</strong></div><div><span>Reason</span><strong>{selected.reason}</strong></div><div><span>Preferred resolution</span><strong>{selected.resolution}</strong></div><div><span>Quantity</span><strong>{selected.quantity ?? 1}</strong></div><div><span>Condition</span><strong>{selected.condition ?? "Not recorded"}</strong></div>{selected.refundAmountGhs ? <div><span>Proposed refund</span><strong>{formatGhs(selected.refundAmountGhs)}</strong></div> : null}{selected.origin && <div><span>Created by</span><strong>{selected.origin}</strong></div>}</div><div className="sales-return-policy"><strong>Return delivery</strong><p>{selected.note}</p></div><label className="pos-field">Update request status<select value={selected.status} onChange={(event) => updateStatus(event.target.value)}>{["Needs review", "Approved", "Received", "Resolved", "Rejected"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="pos-field">Inspection condition<select value={selected.condition ?? "Inspection pending"} onChange={(event) => setRecords((current) => current.map((record) => record.id === selected.id ? { ...record, condition: event.target.value } : record))}>{["Inspection pending", "Resaleable", "Packaging damaged", "Worn or damaged", "Wrong item", "Other"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="pos-field">Internal note<textarea value={selected.internalNote ?? ""} onChange={(event) => setRecords((current) => current.map((record) => record.id === selected.id ? { ...record, internalNote: event.target.value } : record))} placeholder="Add an inspection note or resolution details" rows={3} /></label><button type="button" className="admin-primary-button sales-full-button" onClick={() => setSelectedId(null)}>Done <Icon icon={CheckmarkCircle02Icon} /></button></div></DetailDialog>}
    {createOpen && <div className="sales-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCreateOpen(false)}><section className="sales-dialog sales-detail-dialog sales-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="create-return-title"><div className="sales-detail-dialog__heading"><div><p className="admin-eyebrow">SALES · AFTERCARE</p><h2 id="create-return-title">Create a return</h2><p>Record a return started by staff, including a customer who walks into the store.</p></div><button className="pos-icon-button" type="button" aria-label="Close create return" onClick={() => setCreateOpen(false)}><Icon icon={Cancel01Icon} /></button></div><div className="sales-return-form"><fieldset className="sales-return-source"><legend>Find the original sale</legend><label><input type="radio" checked={saleSource === "order"} onChange={() => { setSaleSource("order"); setOrderId(""); setLineIndex(""); }} /> Select a paid order</label><label><input type="radio" checked={saleSource === "walk-in"} onChange={() => { setSaleSource("walk-in"); setOrderId(""); setLineIndex(""); setCustomerName(""); setCustomerContact(""); }} /> Walk-in · sale not in the order list</label></fieldset>{saleSource === "order" ? <><label className="pos-field">Order<select value={orderId} onChange={(event) => { const order = eligibleOrders.find((item) => item.id === event.target.value); setOrderId(event.target.value); setLineIndex(""); setCustomerName(order?.customer ?? ""); setCustomerContact(order?.contact ?? ""); }}><option value="">Choose an eligible paid order</option>{eligibleOrders.map((order) => <option key={order.id} value={order.id}>{order.id} · {order.customer} · {order.dateKey}</option>)}</select></label>{selectedOrder && <label className="pos-field">Item from order<select value={lineIndex} onChange={(event) => setLineIndex(event.target.value)}><option value="">Choose purchased item</option>{selectedOrder.lines.map((line, index) => { const returned = records.filter((record) => record.order === selectedOrder.id && record.product.slug === line.product.slug && record.variant === line.variant && record.status !== "Rejected").reduce((sum, record) => sum + (record.quantity ?? 1), 0); const remaining = Math.max(0, line.quantity - returned); return <option key={`${line.product.slug}-${line.variant}-${index}`} value={index} disabled={remaining === 0}>{line.product.name} · {line.variant} · {remaining} eligible</option>; })}</select></label>}</> : <><label className="pos-field">Product<select value={manualProductSlug} onChange={(event) => { setManualProductSlug(event.target.value); setManualVariant(""); }}>{sampleProducts.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label><label className="pos-field">Variant<select value={manualVariant} onChange={(event) => setManualVariant(event.target.value)}><option value="">Choose colour and size</option>{manualVariants.map((item) => <option key={item}>{item}</option>)}</select></label><label className="pos-field">Walk-in proof of purchase reference<input value={walkInReference} onChange={(event) => setWalkInReference(event.target.value)} placeholder="Receipt, POS reference, or manager note" /></label><label className="pos-field">Original purchase date<input type="date" value={purchaseDate} max={todayInAccra} onChange={(event) => setPurchaseDate(event.target.value)} /></label></>}<div className="sales-return-form__grid"><label className="pos-field">Customer name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" /></label><label className="pos-field">Phone number <span className="pos-optional">Optional</span><input value={customerContact} onChange={(event) => setCustomerContact(event.target.value)} placeholder="0XX XXX XXXX" inputMode="tel" /></label><label className="pos-field">Reason<select value={reason} onChange={(event) => setReason(event.target.value)}>{["Changed my mind", "Size does not fit", "Wrong item received", "Damaged item", "Defective item", "Different from expected", "Other"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="pos-field">Resolution<select value={resolution} onChange={(event) => setResolution(event.target.value)}><option>Exchange</option><option>Refund</option></select></label><label className="pos-field">Quantity<input type="number" min="1" max={saleSource === "order" ? maxReturnQuantity : 99} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="pos-field">Item condition<select value={condition} onChange={(event) => setCondition(event.target.value)}>{["Inspection pending", "Resaleable", "Packaging damaged", "Worn or damaged", "Wrong item", "Other"].map((item) => <option key={item}>{item}</option>)}</select></label></div>{product && variant && <div className="sales-return-value"><span>{product.name} · {variant} · Qty {Number(quantity) || 0}</span><strong>Estimated item value {formatGhs(returnValue)}</strong></div>}<label className="sales-return-received"><input type="checkbox" checked={receivedInStore} onChange={(event) => setReceivedInStore(event.target.checked)} /><span><strong>Item received at the store today</strong><small>Leave unchecked when the customer will send or bring it back later. Received items remain out of sellable stock until inspection.</small></span></label><div className="sales-return-policy"><strong>Return delivery · {returnDeliveryOwner}</strong><p>Change-of-mind and fit-related returns are paid by the customer. BASNY arranges or pays return delivery for a wrong, damaged, or defective item.</p></div><label className="pos-field">Staff note<textarea rows={3} value={staffNote} onChange={(event) => setStaffNote(event.target.value)} placeholder="Inspection details, customer preference, or manager approval" /></label>{createError && <p className="pos-error" role="alert">{createError}</p>}<div className="sales-detail-actions"><button type="button" className="admin-secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button><button type="button" className="admin-primary-button" onClick={createReturn}><Icon icon={CheckmarkCircle02Icon} /> Create return record</button></div><p className="sales-data-note">This screen records the return only. Refund payment, exchange fulfilment, customer notifications, and inventory changes require the connected backend.</p></div></section></div>}
    <p className="sales-data-note">Requests shown are sample records. Refunds, stock changes, and customer notifications are not connected.</p>
  </div>;
}

export function AbandonedCartsWorkspace() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cartsQuery = useQuery({ queryKey: ["admin-abandoned-carts"], queryFn: () => client.listAbandonedCarts(), staleTime: 15_000, refetchInterval: 30_000, refetchOnWindowFocus: true });
  const records = cartsQuery.data ?? [];
  const filtered = records.filter((cart) => `${cart.id} ${cart.customer} ${cart.contact} ${cart.email}`.toLowerCase().includes(query.toLowerCase()));
  const selected = records.find((cart) => cart.id === selectedId);
  const statusMutation = useMutation({
    mutationFn: (input: { cartId: string; status: "contacted" | "recovered" }) => client.updateAbandonedCartStatus(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-abandoned-carts"] }),
  });
  useEffect(() => {
    const onRealtime = (event: Event) => {
      const name = (event as CustomEvent<{ name?: string }>).detail?.name;
      if (name === "cart.changed") void queryClient.invalidateQueries({ queryKey: ["admin-abandoned-carts"] });
    };
    window.addEventListener("basny:realtime", onRealtime);
    return () => window.removeEventListener("basny:realtime", onRealtime);
  }, []);
  const potentialSales = records.filter((cart) => cart.status !== "Recovered").reduce((sum, cart) => sum + cart.subtotalGhs, 0);
  function lastActive(value: string) {
    return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(new Date(value));
  }
  function mark(status: "contacted" | "recovered") {
    if (selected) statusMutation.mutate({ cartId: selected.id, status });
  }
  return <div className="sales-records"><SalesScreenHeading eyebrow="SALES · CUSTOMER FOLLOW-UP" title="Abandoned carts" description="Carts appear here after an hour without activity. Contact details are shown only when a shopper enters them at checkout." action={<div className="sales-kpi"><span>Potential sales</span><strong>{formatGhs(potentialSales)}</strong><small>{records.length} carts inactive for over an hour</small></div>} />
    <div className="sales-list-toolbar"><label className="sales-search"><Icon icon={Search01Icon} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cart, customer or phone" /></label><span className="sales-result-count">{filtered.length} carts</span></div>
    {cartsQuery.isError && <div className="admin-empty-state"><strong>Abandoned carts unavailable</strong><p>We could not load current cart activity.</p><button type="button" className="admin-secondary-button" onClick={() => void cartsQuery.refetch()}>Retry</button></div>}
    {cartsQuery.isLoading ? <div className="sales-table-wrap" aria-busy="true"><div className="sales-table-skeleton">{Array.from({ length: 5 }, (_, index) => <div className="sales-table-skeleton__row" key={index}><span /><span /><span /><span /></div>)}</div></div> : !cartsQuery.isError && <>
      <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Customer</th><th>Last active</th><th>Items</th><th>Cart value</th><th>Follow-up</th><th><span className="visually-hidden">Details</span></th></tr></thead><tbody>{filtered.map((cart) => <tr key={cart.id} onClick={() => setSelectedId(cart.id)}><td><button className="sales-table__primary" type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(cart.id); }}>{cart.customer}</button><small>{cart.contact}</small></td><td>{lastActive(cart.lastActiveAt)}</td><td>{cart.itemCount} items</td><td className="sales-table__money">{formatGhs(cart.subtotalGhs)}</td><td><StatusBadge status={cart.status} /></td><td><button className="pos-icon-button" type="button" aria-label={`View cart ${cart.id}`} onClick={(event) => { event.stopPropagation(); setSelectedId(cart.id); }}><Icon icon={ArrowRight01Icon} /></button></td></tr>)}</tbody></table>{filtered.length === 0 && <p className="sales-no-results">{records.length === 0 ? "No abandoned carts yet. Carts will appear after a shopper leaves a filled bag inactive for an hour." : "No carts match that search."}</p>}</div>
      <div className="sales-mobile-list">{filtered.map((cart) => <button type="button" className="sales-mobile-record" key={cart.id} onClick={() => setSelectedId(cart.id)}><span className="sales-mobile-record__top"><strong>{cart.customer}</strong><StatusBadge status={cart.status} /></span><span>{cart.itemCount} items · Last active {lastActive(cart.lastActiveAt)}</span><span className="sales-mobile-record__bottom"><small>{cart.contact}</small><strong>{formatGhs(cart.subtotalGhs)}</strong></span></button>)}</div>
    </>}
    {selected && <DetailDialog title={selected.customer} onClose={() => setSelectedId(null)}><div className="sales-cart-detail"><div className="sales-order-detail__top"><div><p className="admin-eyebrow">CUSTOMER</p><strong>{selected.customer}</strong><small>{selected.contact}{selected.email ? ` · ${selected.email}` : " · No email added"}</small></div><div><p className="admin-eyebrow">LAST ACTIVE</p><strong>{lastActive(selected.lastActiveAt)}</strong></div></div><h3>Items left in cart</h3>{selected.items.map((line) => <div className="sales-detail-item" key={`${line.productSlug}-${line.variant}`}><div className="sales-product-photo"><Image src={line.image} alt={line.name} fill unoptimized={line.image.startsWith("http")} sizes="64px" /></div><div><strong>{line.name}</strong><span>{line.variant} · Qty {line.quantity}</span></div><strong>{formatGhs(line.unitPriceGhs * line.quantity)}</strong></div>)}<div className="pos-payment-total"><span>Cart value</span><strong>{formatGhs(selected.subtotalGhs)}</strong></div><div className="sales-followup-note">Only contact a shopper through details they provided. BASNY does not send recovery messages automatically.</div>{statusMutation.isError && <p className="pos-error" role="alert">The follow-up status could not be saved. Try again.</p>}<div className="sales-detail-actions"><button type="button" className="admin-secondary-button" disabled={statusMutation.isPending || selected.status === "Contacted"} onClick={() => mark("contacted")}>{statusMutation.isPending ? "Saving…" : "Mark as contacted"}</button><button type="button" className="admin-primary-button" disabled={statusMutation.isPending} onClick={() => mark("recovered")}>Mark as recovered</button></div></div></DetailDialog>}
    <p className="sales-data-note">Cart contents and values come from the saved shopper cart. Value uses the last server-validated GHS product prices.</p>
  </div>;
}
