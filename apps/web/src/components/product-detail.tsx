"use client";

import { useState } from "react";
import Image from "next/image";
import { Message01Icon, MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { StoreProduct } from "@/lib/catalogue";
import { formatGhs } from "@/lib/sample-catalog";
import { buildWhatsAppPurchaseUrl } from "@/lib/whatsapp-purchase";
import { toast } from "sonner";
import { useCart } from "@/lib/cart-context";
import { useRouter } from "next/navigation";
import WishlistButton from "@/components/wishlist-button";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { mapStoreProduct } from "@/lib/catalogue";
import RestockAlertForm from "@/components/restock-alert-form";

export default function ProductDetail({ product }: { product: StoreProduct }) {
  const productQuery = useQuery({
    queryKey: ["catalogue", "product", product.slug],
    queryFn: async () => {
      const record = await client.getPublicProduct({ slug: product.slug });
      return record ? mapStoreProduct(record) : null;
    },
    initialData: product,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const current = productQuery.data;
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColour, setSelectedColour] = useState(product.colours[0]?.name ?? "");
  const [quantity, setQuantity] = useState(1);
  const { addItem, quantityForVariant } = useCart();
  const router = useRouter();
  const needsSize = current?.sizes.length ? current.sizes.length > 0 : false;
  const selectedVariant = current?.variants.find((variant) => variant.colour === selectedColour && variant.size === selectedSize && variant.active);
  const currentPrice = selectedVariant?.priceGhs ?? current?.priceGhs ?? 0;
  const regularCurrentPrice = selectedVariant?.regularPriceGhs ?? current?.regularPriceGhs ?? currentPrice;
  const quantityAvailable = selectedVariant?.stock ?? 0;
  const cartQuantity = selectedVariant ? quantityForVariant(current?.slug ?? product.slug, selectedColour, selectedSize) : 0;
  const availableToAdd = Math.max(0, quantityAvailable - cartQuantity);

  if (!current) return <div className="product-detail-unavailable"><h1>This piece is no longer available.</h1><p>It may have sold out or been removed from the collection.</p><a href="/shop">Continue shopping</a></div>;
  const selectedProduct = current;

  function addToBag() {
    if (needsSize && !selectedSize) {
      toast.error("Choose a size first", { description: "Select a size to continue." });
      return;
    }
    const added = addItem(selectedProduct, selectedColour, selectedSize, quantity);
    if (!added) {
      toast.error("No more units available", { description: "The available stock for this option is already in your bag." });
      return;
    }
    if (added < quantity) toast.info(`Added ${added} of ${quantity} requested`, { description: "The remaining stock for this option has been added to your bag." });
    toast.success("Added to your bag", {
      description: `${product.name}${selectedSize ? ` · EU ${selectedSize}` : ""} · Qty ${quantity}`,
      action: { label: "View bag", onClick: () => router.push("/cart") },
    });
  }

  function askOnWhatsApp() {
    if (needsSize && !selectedSize) {
      toast.error("Choose a size first", { description: "Select a size so BASNY knows which one you want." });
      return;
    }

    const productUrl = window.location.href;
    const imageUrl = new URL(selectedProduct.detailImage ?? selectedProduct.image, window.location.origin).href;
    const whatsappUrl = buildWhatsAppPurchaseUrl({
      productName: selectedProduct.name,
      colour: selectedColour,
      size: selectedSize,
      quantity,
      unitPriceGhs: currentPrice,
      productUrl,
      imageUrl,
    });

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="product-detail">
    <div className="product-detail__image">
        <Image src={current.detailImage ?? current.image} alt={current.imageAlt} fill priority unoptimized={Boolean(current.detailImage?.startsWith("http"))} sizes="(max-width: 800px) 100vw, 55vw" />
        {current.badge && <span className="product-card__badge">{current.badge}</span>}
      </div>
      <div className="product-detail__info">
        <p className="eyebrow">{current.type}</p>
        <h1>{current.name}</h1>
        <p className="product-detail__price">{formatGhs(currentPrice)}{regularCurrentPrice > currentPrice ? <del>{formatGhs(regularCurrentPrice)}</del> : null}</p>
        <p className={`product-detail__availability${selectedVariant && selectedVariant.stock < 1 ? " product-detail__availability--sold-out" : ""}`} role="status">{selectedVariant ? selectedVariant.stock > 0 ? `${selectedVariant.stock} available` : "Out of stock" : current.stock < 1 ? "Out of stock" : needsSize ? "Choose a size to check availability" : "Choose an available option"}</p>
        <WishlistButton slug={current.slug} name={current.name} variant="detail" />
        <p className="product-detail__description">{current.description}</p>

        <fieldset className="product-options">
          <legend>Colour <span>{selectedColour}</span></legend>
          <div className="colour-options">
            {current.colours.map((colour) => (
              <button type="button" key={colour.name} className={`colour-option${selectedColour === colour.name ? " colour-option--selected" : ""}`} style={{ backgroundColor: colour.hex }} aria-label={colour.name} aria-pressed={selectedColour === colour.name} onClick={() => setSelectedColour(colour.name)} />
            ))}
          </div>
        </fieldset>

        {current.sizes.length > 0 && (
          <fieldset className="product-options">
            <legend>Size <span>{selectedSize ? `EU ${selectedSize}` : "Select a size"}</span></legend>
            <div className="size-options">
              {current.sizes.map((size) => {
                const option = current.variants.find((variant) => variant.colour === selectedColour && variant.size === size && variant.active);
                return <button type="button" key={size} disabled={!option} className={`${selectedSize === size ? "size-option size-option--selected" : "size-option"}${option && option.stock < 1 ? " size-option--sold-out" : ""}`} aria-label={`EU ${size}${option?.stock ? "" : ", out of stock"}`} aria-pressed={selectedSize === size} onClick={() => setSelectedSize(size)}>{size}{option && option.stock < 1 ? <small>Sold out</small> : null}</button>;
              })}
            </div>
          </fieldset>
        )}

        <div className="product-quantity" role="group" aria-label="Quantity">
          <span>Quantity</span>
          <div className="quantity-control">
            <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}><HugeiconsIcon icon={MinusSignIcon} aria-hidden="true" /></button>
            <span aria-live="polite">{quantity}</span>
            <button type="button" aria-label="Increase quantity" disabled={quantity >= quantityAvailable} onClick={() => setQuantity((value) => Math.min(quantityAvailable, 99, value + 1))}><HugeiconsIcon icon={PlusSignIcon} aria-hidden="true" /></button>
          </div>
        </div>
        <button className="product-whatsapp-button" type="button" onClick={askOnWhatsApp} disabled={!selectedVariant || quantityAvailable < 1 || quantity > quantityAvailable}>
          <HugeiconsIcon icon={Message01Icon} aria-hidden="true" />
          {!selectedVariant ? "Choose an available option" : quantity > quantityAvailable ? "Not enough stock" : "Purchase via WhatsApp"}
        </button>
        <button className="product-bag-button" type="button" onClick={addToBag} disabled={!selectedVariant || availableToAdd < 1 || quantity > availableToAdd}>
          {!selectedVariant ? "Choose an available option" : availableToAdd < 1 ? "All available units are in your bag" : quantity > availableToAdd ? `Only ${availableToAdd} left to add` : "Add to bag"}
        </button>
        <p className="product-detail__contact-note">Your message includes this item, your selected options, and a direct link to the product.</p>
        {selectedVariant && quantityAvailable < 1 ? <RestockAlertForm key={`${current.slug}:${selectedColour}:${selectedSize ?? ""}`} productSlug={current.slug} colour={selectedColour} size={selectedVariant.size} /> : null}

        <div className="product-detail__facts">
          <div><strong>Details</strong><span>{current.material}</span></div>
          <div><strong>Delivery</strong><span>Accra GHS 60 · Elsewhere in Ghana GHS 100</span></div>
          <div><strong>Returns</strong><span>Returns can be requested within 14 days. Customers cover return delivery for change-of-mind returns.</span></div>
        </div>
      </div>
    </div>
  );
}
