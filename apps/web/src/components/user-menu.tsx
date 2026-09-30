"use client";

import { ArrowRight01Icon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

export default function UserMenu() {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    if (!session?.user?.emailVerified) {
      setIsStaff(false);
      return () => { active = false; };
    }
    client.accountAccess().then((access) => { if (active) setIsStaff(access.isStaff); }).catch(() => { if (active) setIsStaff(false); });
    return () => { active = false; };
  }, [session?.user?.id, session?.user?.emailVerified]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (isPending) return <span className="user-menu__loading" aria-label="Loading account" />;
  if (!session?.user) return <Link className="header-action" href="/login" aria-label="Sign in to your account"><HugeiconsIcon icon={UserCircleIcon} aria-hidden="true" /><span>Sign in</span></Link>;

  const initials = session.user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "B";

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await authClient.signOut({ fetchOptions: { onSuccess: () => { setOpen(false); router.replace("/"); router.refresh(); } } });
    setSigningOut(false);
  }

  return <div className="user-menu" ref={ref}>
    <button className="header-action user-menu__trigger" type="button" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="user-menu__avatar">{initials}</span><span>Account</span>
    </button>
    {open && <div className="user-menu__popover" role="menu" aria-label="Account menu">
      <div className="user-menu__identity"><span className="user-menu__avatar user-menu__avatar--large">{initials}</span><span><strong>{session.user.name}</strong><small>{session.user.email}</small></span></div>
      {!session.user.emailVerified && <Link className="user-menu__notice" role="menuitem" href="/verify-email" onClick={() => setOpen(false)}>Verify your email to unlock your account <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" /></Link>}
      <div className="user-menu__links">
        <Link role="menuitem" href="/dashboard" onClick={() => setOpen(false)}>Account overview</Link>
        <Link role="menuitem" href="/account/profile" onClick={() => setOpen(false)}>Profile & contact</Link>
        <Link role="menuitem" href="/account/addresses" onClick={() => setOpen(false)}>Delivery addresses</Link>
        <Link role="menuitem" href="/account/orders" onClick={() => setOpen(false)}>Orders</Link>
        <Link role="menuitem" href="/account/returns" onClick={() => setOpen(false)}>Returns</Link>
        <Link role="menuitem" href="/wishlist" onClick={() => setOpen(false)}>Saved pieces</Link>
      </div>
      {isStaff && <div className="user-menu__staff"><Link role="menuitem" href={"/admin" as Route} onClick={() => setOpen(false)}>BASNY admin <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" /></Link></div>}
      <button className="user-menu__signout" role="menuitem" type="button" disabled={signingOut} onClick={signOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
    </div>}
  </div>;
}
