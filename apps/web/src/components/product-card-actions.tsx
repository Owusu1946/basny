"use client";

import { useState } from "react";
import { WhatsappIcon, ShoppingBag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import type { StoreProduct } from "@/lib/catalogue";
import { useCart } from "@/lib/cart-context";
import { buildWhatsAppPurchaseUrl } from "@/lib/whatsapp-purchase";
import DirectionalIcon from "@/components/directional-icon";

export default function ProductCardActions({ product }: { product: StoreProduct }) {
  const [intent, setIntent] = useState<"bag" | "whatsapp" | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [colour, setColour] = useState(product.colours[0]?.name ?? "");
  const needsSize = product.sizes.length > 0;
  const soldOut = product.stock <= 0;
  const selectedVariant = product.variants.find((variant) => variant.colour === colour && variant.size === size && variant.active);
  const selectedUnavailable = !selectedVariant || selectedVariant.stock <= 0;
  const { addItem, quantityForVariant } = useCart();
  const selectedInBag = selectedVariant ? quantityForVariant(product.slug, colour, size) : 0;
  const router = useRouter();

  function addToBag() {
    if (soldOut || (needsSize && size && selectedUnavailable) || (!needsSize && selectedUnavailable)) return;
    if (needsSize && !size) { setIntent("bag"); return; }
    const added = addItem(product, colour, size, 1);
    if (!added) {
      toast.error("No more units available", { description: "The available stock for this option is already in your bag." });
      return;
    }
    setIntent(null);
    toast.success("Added to your bag", {
      description: `${product.name}${size ? ` · EU ${size}` : ""}`,
      action: { label: "View bag", onClick: () => router.push("/cart") },
    });
  }

  function purchaseOnWhatsApp() {
    if (soldOut || (needsSize && size && selectedUnavailable) || (!needsSize && selectedUnavailable)) return;
    if (needsSize && !size) { setIntent("whatsapp"); return; }
    const productUrl = new URL(`/products/${product.slug}`, window.location.origin).href;
    const imageUrl = new URL(product.image, window.location.origin).href;
    const selectedVariant = product.variants.find((variant) => variant.colour === colour && variant.size === size);
    const href = buildWhatsAppPurchaseUrl({
      productName: product.name,
      colour,
      size,
      quantity: 1,
      unitPriceGhs: selectedVariant?.priceGhs ?? product.priceGhs,
      productUrl,
      imageUrl,
    });
    window.open(href, "_blank", "noopener,noreferrer");
    setIntent(null);
  }

  if (soldOut) {
    return <div className="product-card__actions"><Link className="product-card__restock-link" href={`/products/${product.slug}`}>Get restock alert <DirectionalIcon direction="right" /></Link></div>;
  }

  return (
    <div className="product-card__actions" aria-label={`Actions for ${product.name}`}>
      <button type="button" className="product-card__action product-card__action--bag" onClick={addToBag} disabled={soldOut || Boolean(selectedVariant && selectedInBag >= selectedVariant.stock)}>
        <HugeiconsIcon icon={ShoppingBag01Icon} aria-hidden="true" />
        <span>Add to bag</span>
      </button>
      <button type="button" className="product-card__action product-card__action--whatsapp" aria-label={`Buy ${product.name} via WhatsApp`} title="Buy via WhatsApp" onClick={purchaseOnWhatsApp} disabled={soldOut}>
        <HugeiconsIcon icon={WhatsappIcon} aria-hidden="true" />
        <span>Buy via WhatsApp</span>
      </button>
      {intent && needsSize && (
        <div className="product-card__quick-pick" role="group" aria-label={`Choose options for ${product.name}`}>
          <div className="product-card__quick-pick-heading">
            <span>Choose your options</span>
            <button type="button" aria-label="Close size selection" onClick={() => setIntent(null)}>×</button>
          </div>
          {product.colours.length > 1 && <div className="product-card__quick-colours" aria-label="Choose a colour">{product.colours.map((option) => <button key={option.name} type="button" aria-pressed={colour === option.name} className={colour === option.name ? "is-selected" : ""} onClick={() => setColour(option.name)}><i style={{ backgroundColor: option.hex }} />{option.name}</button>)}</div>}
          <span className="product-card__quick-label">Size</span>
          <div className="product-card__quick-sizes">
          {product.sizes.map((option) => (
              <button key={option} type="button" disabled={!product.variants.some((variant) => variant.colour === colour && variant.size === option && variant.active && variant.stock > 0)} aria-pressed={size === option} className={size === option ? "is-selected" : ""} onClick={() => setSize(option)}>EU {option}</button>
            ))}
          </div>
          <button type="button" className="product-card__quick-confirm" disabled={!size || selectedUnavailable || (intent === "bag" && quantityForVariant(product.slug, colour, size) >= (selectedVariant?.stock ?? 0))} onClick={intent === "bag" ? addToBag : purchaseOnWhatsApp}>
            {intent === "bag" ? "Add selected size" : "Continue to WhatsApp"}
          </button>
        </div>
      )}
    </div>
  );
}
