"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

type WishlistValue = {
  slugs: string[];
  loading: boolean;
  toggle: (slug: string, name: string) => Promise<void>;
};

const WishlistContext = createContext<WishlistValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    if (!user?.emailVerified) {
      setSlugs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await client.listAccountWishlist();
      setSlugs(items.map((item) => item.productSlug));
    } catch {
      // Wishlist controls remain usable when the account API is temporarily unavailable.
    } finally {
      setLoading(false);
    }
  }, [user?.emailVerified, user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!user?.emailVerified) return;
    const onRealtime = (event: WindowEventMap["basny:realtime"]) => {
      if (event.detail.name !== "wishlist.updated") return;
      const { productSlug, saved } = event.detail.data;
      if (typeof productSlug !== "string" || typeof saved !== "boolean") return;
      setSlugs((current) => saved
        ? current.includes(productSlug) ? current : [...current, productSlug]
        : current.filter((slug) => slug !== productSlug));
    };
    window.addEventListener("basny:realtime", onRealtime);
    return () => window.removeEventListener("basny:realtime", onRealtime);
  }, [user?.emailVerified]);

  const toggle = useCallback(async (slug: string, name: string) => {
    if (!user) {
      toast("Sign in to save pieces", { description: "Your wishlist is kept with your account.", action: { label: "Sign in", onClick: () => { window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`); } } });
      return;
    }
    if (!user.emailVerified) {
      toast("Verify your email to save pieces", { description: "Open the verification link we sent, then try again.", action: { label: "Verify email", onClick: () => { window.location.assign("/verify-email"); } } });
      return;
    }
    if (pending.has(slug)) return;

    const wasSaved = slugs.includes(slug);
    setPending((current) => new Set(current).add(slug));
    setSlugs((current) => wasSaved ? current.filter((item) => item !== slug) : [...current, slug]);
    try {
      if (wasSaved) await client.removeAccountWishlistItem({ productSlug: slug });
      else await client.addAccountWishlistItem({ productSlug: slug });
      toast.success(wasSaved ? "Removed from saved pieces" : "Saved to your wishlist", { description: name });
    } catch {
      setSlugs((current) => wasSaved ? [...new Set([...current, slug])] : current.filter((item) => item !== slug));
      toast.error("Couldn’t update your wishlist", { description: "Check your connection and try again." });
    } finally {
      setPending((current) => { const next = new Set(current); next.delete(slug); return next; });
    }
  }, [pending, slugs, user]);

  const value = useMemo(() => ({ slugs, loading, toggle }), [slugs, loading, toggle]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used inside WishlistProvider");
  return context;
}
