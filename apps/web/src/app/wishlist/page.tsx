import type { Metadata } from "next";
import { WishlistWorkspace } from "@/components/account-workspace";

export const metadata: Metadata = { title: "Wishlist" };

export default function WishlistPage() {
  return <main className="account-area page-shell"><WishlistWorkspace /></main>;
}
