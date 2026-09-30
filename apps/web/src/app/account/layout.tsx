import DirectionalIcon from "@/components/directional-icon";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth-client";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await authClient.getSession({ fetchOptions: { headers: await headers(), throw: true } });
  if (!session?.user) redirect("/login");
  if (!session.user.emailVerified) redirect("/verify-email");
  return <main className="account-area page-shell">
    <header className="account-area__top"><p className="eyebrow">BASNY · YOUR ACCOUNT</p><Link href="/dashboard">Overview <DirectionalIcon /></Link></header>
    <nav className="account-nav" aria-label="Account pages"><Link href="/account/profile">Profile</Link><Link href="/account/addresses">Addresses</Link><Link href="/account/orders">Orders</Link><Link href="/account/returns">Returns</Link><Link href="/account/reviews">Reviews</Link><Link href="/wishlist">Saved pieces</Link></nav>
    {children}
  </main>;
}
