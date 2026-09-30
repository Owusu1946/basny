"use client";

import { FavouriteIcon, HeartIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useWishlist } from "@/lib/wishlist-context";

export default function WishlistButton({ slug, name, variant = "card" }: { slug: string; name: string; variant?: "card" | "detail" }) {
  const { slugs, toggle } = useWishlist();
  const saved = slugs.includes(slug);

  return (
    <button
      className={`wishlist-button wishlist-button--${variant}${saved ? " is-saved" : ""}`}
      type="button"
      aria-label={`${saved ? "Remove" : "Save"} ${name} ${saved ? "from" : "to"} your wishlist`}
      aria-pressed={saved}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); void toggle(slug, name); }}
      onKeyDown={(event) => event.stopPropagation()}
      title={saved ? "Remove from wishlist" : "Save to wishlist"}
    >
      <HugeiconsIcon icon={saved ? HeartIcon : FavouriteIcon} aria-hidden="true" />
      <span className="visually-hidden">{saved ? "Saved" : "Save"}</span>
    </button>
  );
}
