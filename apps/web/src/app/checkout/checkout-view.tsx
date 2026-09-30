"use client";

import DirectionalIcon from "@/components/directional-icon";
import { ArrowLeft01Icon, CheckmarkCircle02Icon, Location01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";

import { useCart } from "@/lib/cart-context";
import { accraAreaOtherValue } from "@/lib/ghana-delivery-locations";
import { formatGhs } from "@/lib/sample-catalog";
import { readCheckoutOrder, saveCheckoutOrder, type CheckoutOrder } from "@/lib/checkout-order";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";
import { CheckoutLoadingState } from "@/components/checkout-loading-state";

type SavedAddress = { id: string; label: string; fullName: string; phone: string; region: string; town: string; neighbourhood: string; streetAddress: string; deliveryNote: string; isDefault: boolean };

export default function CheckoutView() {
  const router = useRouter();
  const { lines, itemCount, subtotalGhs, hydrated, syncCart } = useCart();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const deliverySettings = useQuery({ queryKey: ["public-delivery-settings"], queryFn: () => client.getPublicDeliverySettings(), staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const [existingOrder, setExistingOrder] = useState<CheckoutOrder | null | undefined>(undefined);
  const [deliveryArea, setDeliveryArea] = useState<CheckoutOrder["deliveryArea"]>("accra");
  const [accraArea, setAccraArea] = useState("");
  const [outsideRegion, setOutsideRegion] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesError, setAddressesError] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [contact, setContact] = useState({ name: "", phone: "", email: "", streetAddress: "", note: "", outsideTown: "", accraOther: "" });
  const zones = deliverySettings.data?.deliveryZones ?? [];
  const accraZones = zones.filter((zone) => zone.group === "Accra");
  const outsideZones = zones.filter((zone) => zone.group === "Outside Accra");
  const outsideRegions = [...new Set(outsideZones.map((zone) => zone.area).filter(Boolean))];
  const selectedZone = deliveryArea === "accra"
    ? accraZones.find((zone) => zone.name.toLowerCase() === accraArea.toLowerCase()) ?? accraZones[0]
    : outsideZones.find((zone) => zone.area.toLowerCase() === outsideRegion.toLowerCase());
  const configuredDeliveryGhs = selectedZone?.feeGhs ?? (deliveryArea === "accra" ? 60 : 100);
  const threshold = deliverySettings.data?.store.freeDeliveryThresholdGhs ?? 0;
  const deliveryGhs = threshold > 0 && subtotalGhs >= threshold ? 0 : configuredDeliveryGhs;
  const totalGhs = subtotalGhs + deliveryGhs;

  useEffect(() => {
    const order = readCheckoutOrder();
    setExistingOrder(order);
    if (order) {
      setContact({ name: order.name, phone: order.phone, email: order.email, streetAddress: order.address, note: order.note, outsideTown: order.deliveryArea === "outside-accra" ? order.town : "", accraOther: "" });
      setDeliveryArea(order.deliveryArea);
      if (order.deliveryArea === "accra") {
        const knownArea = accraZones.some((zone) => zone.name.toLowerCase() === order.town.toLowerCase());
        setAccraArea(knownArea ? order.town : accraAreaOtherValue);
        if (!knownArea) setContact((current) => ({ ...current, accraOther: order.town }));
      }
      else setOutsideRegion(order.region);
    }
  }, []);

  useEffect(() => {
    if (!deliverySettings.data || !existingOrder || existingOrder.deliveryArea !== "accra") return;
    const zone = accraZones.find((item) => item.name.toLowerCase() === existingOrder.town.toLowerCase());
    if (zone) { setAccraArea(zone.name); setContact((current) => ({ ...current, accraOther: "" })); }
  }, [deliverySettings.data, existingOrder]);

  useEffect(() => {
    if (sessionPending || !session?.user.emailVerified) return;
    let active = true;
    setAddressesLoading(true);
    setAddressesError(false);
    client.listAccountAddresses().then((addresses) => {
      if (active) setSavedAddresses(addresses as SavedAddress[]);
    }).catch(() => {
      if (active) setAddressesError(true);
    }).finally(() => {
      if (active) setAddressesLoading(false);
    });
    return () => { active = false; };
  }, [sessionPending, session?.user.emailVerified]);

  function selectSavedAddress(address: SavedAddress) {
    const withinAccra = address.region.toLowerCase().includes("greater accra");
    setSelectedAddressId(address.id);
    setContact((current) => ({ ...current, name: address.fullName, phone: address.phone, streetAddress: address.streetAddress, note: address.deliveryNote, outsideTown: address.town, accraOther: "" }));
    if (withinAccra) {
      setDeliveryArea("accra");
      setOutsideRegion("");
      const area = address.neighbourhood || address.town;
      const matchingZone = accraZones.find((zone) => zone.name.toLowerCase() === area.toLowerCase());
      setAccraArea(matchingZone?.name ?? accraAreaOtherValue);
      if (!matchingZone) setContact((current) => ({ ...current, name: address.fullName, phone: address.phone, streetAddress: address.streetAddress, note: address.deliveryNote, outsideTown: address.town, accraOther: area }));
    } else {
      setDeliveryArea("outside-accra");
      setOutsideRegion(outsideRegions.find((region) => region.toLowerCase() === address.region.toLowerCase()) ?? "");
      setAccraArea("");
    }
  }

  function enterNewAddress() {
    setSelectedAddressId("");
    setContact((current) => ({ ...current, streetAddress: "", note: "", outsideTown: "", accraOther: "" }));
    setAccraArea("");
    setOutsideRegion("");
    setDeliveryArea("accra");
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deliverySettings.isPending || deliverySettings.isError) { setError("Delivery options are unavailable right now. Refresh them before placing your order."); return; }
    if (!event.currentTarget.reportValidity() || lines.length === 0) return;
    const form = new FormData(event.currentTarget);
    const reference = `BNY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const trackingToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const order: CheckoutOrder = {
      reference,
      trackingToken,
      createdAt: new Date().toISOString(),
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      deliveryArea,
      region: deliveryArea === "accra" ? "Greater Accra" : String(form.get("region") ?? ""),
      town: deliveryArea === "accra"
        ? String(form.get(accraArea === accraAreaOtherValue ? "accraAreaOther" : "accraArea") ?? "").trim()
        : String(form.get("town") ?? "").trim(),
      address: String(form.get("address") ?? "").trim(),
      note: String(form.get("note") ?? "").trim(),
      paymentMethod: null,
      paymentStatus: "pending",
      lines: lines.map(({ product, size, colour, quantity, unitPriceGhs }) => ({ productSlug: product.slug, name: product.name, image: product.image, size, colour, quantity, unitPriceGhs })),
      subtotalGhs,
      deliveryGhs,
      totalGhs,
    };
    setPlacing(true);
    setError("");
    try {
      await syncCart({ name: order.name, email: order.email, phone: order.phone });
      saveCheckoutOrder(order);
      router.push("/checkout/review");
    } catch (saveError) {
      setError(saveError instanceof Error ? `We couldn’t save your bag for follow-up: ${saveError.message}` : "We couldn’t save your bag for follow-up. Check your connection and try again.");
      setPlacing(false);
    }
  }

  if (!hydrated || existingOrder === undefined || deliverySettings.isPending) return <CheckoutLoadingState variant="delivery" />;
  if (deliverySettings.isError) return <main className="checkout-page page-shell"><section className="checkout-panel" role="alert"><h1>Delivery options couldn’t load</h1><p>Your order details are safe. Refresh the delivery options to continue.</p><button className="admin-secondary-button" type="button" onClick={() => void deliverySettings.refetch()}>Try again</button></section></main>;
  if (lines.length === 0) return <main className="checkout-page page-shell">
    <div className="checkout-empty"><p className="eyebrow">Checkout</p><h1>Your bag is empty.</h1><p>Find something you love and it will be waiting here.</p><Link className="button-primary" href="/shop">Explore the collection <DirectionalIcon /></Link></div>
  </main>;

  return <main className="checkout-page page-shell">
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/cart">Shopping bag</Link><span aria-hidden="true">/</span><span>Checkout</span></nav>
    <div className="checkout-heading"><p className="eyebrow">Step 1 of 3</p><h1>Delivery details</h1><p>Tell us where to bring your BASNY finds.</p></div>
    <div className="checkout-steps" aria-label="Checkout steps"><span className="checkout-steps__done"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" /> Bag</span><span className="checkout-steps__active"><HugeiconsIcon icon={Location01Icon} aria-hidden="true" /> Delivery</span><span>Review</span><span>Place order</span></div>
    <form className="checkout-layout" onSubmit={placeOrder}>
      <div className="checkout-form">
        {session?.user.emailVerified && <section className="checkout-panel checkout-saved-addresses" aria-labelledby="saved-address-title">
          <div className="checkout-panel__heading"><span><HugeiconsIcon icon={Location01Icon} aria-hidden="true" /></span><div><h2 id="saved-address-title">Saved addresses</h2><p>Choose a saved delivery address or enter a different one below.</p></div></div>
          {addressesLoading ? <div className="checkout-address-loading" aria-busy="true"><span /><span /></div> : addressesError ? <p className="checkout-address-message" role="status">We couldn’t load your saved addresses. You can still enter your delivery details below.</p> : savedAddresses.length > 0 ? <div className="checkout-address-list" role="group" aria-label="Choose a saved delivery address">
            {savedAddresses.map((address) => <button className={`checkout-address-choice${selectedAddressId === address.id ? " checkout-address-choice--selected" : ""}`} key={address.id} type="button" aria-pressed={selectedAddressId === address.id} onClick={() => selectSavedAddress(address)}>
              <span className="checkout-address-choice__marker">{selectedAddressId === address.id && <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" />}</span>
              <span className="checkout-address-choice__copy"><strong>{address.label}{address.isDefault && <small>Default</small>}</strong><span>{address.fullName} · {address.phone}</span><span>{[address.streetAddress, address.neighbourhood, address.town, address.region].filter(Boolean).join(", ")}</span></span>
            </button>)}
            <button className="checkout-address-new" type="button" onClick={enterNewAddress}>＋ Enter a different address</button>
          </div> : <p className="checkout-address-message">No saved addresses yet. Enter your delivery details below.</p>}
        </section>}
        <section className="checkout-panel" aria-labelledby="contact-title">
          <div className="checkout-panel__heading"><span>01</span><div><h2 id="contact-title">Contact information</h2><p>We’ll use these details for delivery updates.</p></div></div>
          <div className="checkout-fields checkout-fields--two">
            <label className="checkout-field checkout-field--wide"><span>Full name</span><input autoComplete="name" name="name" required maxLength={100} value={contact.name} onChange={(event) => { setSelectedAddressId(""); setContact((current) => ({ ...current, name: event.target.value })); }} placeholder="Name for the delivery" /></label>
            <label className="checkout-field"><span>Phone number</span><input type="tel" name="phone" autoComplete="tel" inputMode="tel" required minLength={9} maxLength={20} value={contact.phone} onChange={(event) => { setSelectedAddressId(""); setContact((current) => ({ ...current, phone: event.target.value })); }} placeholder="024 000 0000" /></label>
            <label className="checkout-field"><span>Email address</span><input type="email" name="email" autoComplete="email" required maxLength={254} value={contact.email || session?.user.email || ""} onChange={(event) => { setSelectedAddressId(""); setContact((current) => ({ ...current, email: event.target.value })); }} placeholder="you@example.com" /></label>
          </div>
        </section>

        <section className="checkout-panel" aria-labelledby="delivery-title">
          <div className="checkout-panel__heading"><span>02</span><div><h2 id="delivery-title">Delivery address</h2><p>We deliver across Ghana from Accra.</p></div></div>
          <fieldset className="checkout-zone"><legend>Where are we delivering?</legend>
            <label className={deliveryArea === "accra" ? "checkout-zone__option checkout-zone__option--selected" : "checkout-zone__option"}><input type="radio" name="deliveryArea" value="accra" checked={deliveryArea === "accra"} onChange={() => { setSelectedAddressId(""); setDeliveryArea("accra"); }} /><span><strong>Within Accra</strong><small>{formatGhs(accraZones[0]?.feeGhs ?? 60)} delivery</small></span></label>
            <label className={deliveryArea === "outside-accra" ? "checkout-zone__option checkout-zone__option--selected" : "checkout-zone__option"}><input type="radio" name="deliveryArea" value="outside-accra" checked={deliveryArea === "outside-accra"} onChange={() => { setSelectedAddressId(""); setDeliveryArea("outside-accra"); }} /><span><strong>Outside Accra</strong><small>Within Ghana · from {formatGhs(outsideZones[0]?.feeGhs ?? 100)}</small></span></label>
          </fieldset>
          <div className="checkout-fields checkout-fields--two">
            {deliveryArea === "accra" ? <>
              <label className="checkout-field checkout-field--wide"><span>Area in Accra <small>Choose the closest area, or select Other if you don’t see it.</small></span>
                <select name="accraArea" value={accraArea} onChange={(event) => { setSelectedAddressId(""); setAccraArea(event.target.value); }} required>
                  <option value="">Choose your area</option>
                  {accraZones.map((zone) => <option key={zone.id} value={zone.name}>{zone.name}{zone.area && zone.area !== "Greater Accra" ? ` · ${zone.area}` : ""}</option>)}
                  <option value={accraAreaOtherValue}>Other area in Accra</option>
                </select>
              </label>
              {accraArea === accraAreaOtherValue && <label className="checkout-field checkout-field--wide"><span>Enter your area in Accra</span><input autoComplete="address-level2" name="accraAreaOther" required maxLength={100} value={contact.accraOther} onChange={(event) => { setSelectedAddressId(""); setContact((current) => ({ ...current, accraOther: event.target.value })); }} placeholder="Type your area or neighbourhood" /></label>}
            </> : <>
              <label className="checkout-field"><span>Region</span><select name="region" value={outsideRegion} onChange={(event) => { setSelectedAddressId(""); setOutsideRegion(event.target.value); }} required><option value="">Select a region</option>{outsideRegions.map((region) => <option key={region}>{region}</option>)}</select></label>
              <label className="checkout-field"><span>Town or neighbourhood</span><input name="town" autoComplete="address-level2" required maxLength={100} value={contact.outsideTown} onChange={(event) => { setSelectedAddressId(""); setContact((current) => ({ ...current, outsideTown: event.target.value })); }} placeholder="e.g. Kumasi, Cape Coast" /></label>
            </>}
            <label className="checkout-field checkout-field--wide"><span>Street address and house number</span><input name="address" autoComplete="street-address" required maxLength={180} value={contact.streetAddress} onChange={(event) => { setSelectedAddressId(""); setContact((current) => ({ ...current, streetAddress: event.target.value })); }} placeholder="House number, street name or landmark" /></label>
            <label className="checkout-field checkout-field--wide"><span>Delivery note <small>(optional)</small></span><textarea name="note" rows={3} maxLength={300} value={contact.note} onChange={(event) => { setSelectedAddressId(""); setContact((current) => ({ ...current, note: event.target.value })); }} placeholder="Gate colour, nearby landmark, or other useful detail" /></label>
          </div>
        </section>

        {error && <p className="checkout-error" role="alert">{error}</p>}
      </div>

      <aside className="checkout-summary" aria-labelledby="checkout-summary-title">
        <div className="checkout-summary__head"><div><p className="eyebrow">Your picks</p><h2 id="checkout-summary-title">Order summary</h2></div><Link href="/cart">Edit bag</Link></div>
        <div className="checkout-summary__items">{lines.map(({ key, product, colour, size, quantity }) => <div className="checkout-summary__item" key={key}>
          <div className="checkout-summary__image"><Image src={product.image} alt="" fill unoptimized={product.image.startsWith("http")} sizes="72px" /></div>
          <div className="checkout-summary__item-copy"><strong>{product.name}</strong><span>{colour}{size ? ` · EU ${size}` : " · One size"}</span><span>Qty {quantity}</span></div>
          <strong>{formatGhs(product.priceGhs * quantity)}</strong>
        </div>)}</div>
        <div className="checkout-summary__row"><span>Items ({itemCount})</span><span>{formatGhs(subtotalGhs)}</span></div>
        <div className="checkout-summary__row"><span>Delivery</span><span>{formatGhs(deliveryGhs)}</span></div>
        <div className="checkout-summary__total"><span>Total</span><strong>{formatGhs(totalGhs)}</strong></div>
        <button className="checkout-place-order" type="submit" disabled={placing}>{placing ? <><i className="checkout-progress-spinner" aria-hidden="true" /> Saving your delivery details</> : <>Review order <DirectionalIcon direction="right" /></>}</button>
        <Link className="checkout-back" href="/cart"><HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" /> Back to your bag</Link>
      </aside>
    </form>
  </main>;
}
