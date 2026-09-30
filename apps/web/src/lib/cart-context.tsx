"use client";

import type { StoreProduct } from "@/lib/catalogue";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { mapStoreCatalogue } from "@/lib/catalogue";

const STORAGE_KEY = "basny-cart-v1";
const TOKEN_KEY = "basny-cart-token-v1";

export type CartItem = {
  key: string;
  slug: string;
  size: string | null;
  colour: string;
  quantity: number;
};

export type CartLine = CartItem & { product: StoreProduct; unitPriceGhs: number };

type CartContextValue = {
  lines: CartLine[];
  itemCount: number;
  subtotalGhs: number;
  hydrated: boolean;
  catalogueReady: boolean;
  cartToken: string;
  syncCart: (contact?: { name: string; email: string; phone: string }) => Promise<void>;
  addItem: (product: StoreProduct, colour: string, size: string | null, quantity?: number) => number;
  quantityForVariant: (slug: string, colour: string, size: string | null) => number;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function getItemKey(slug: string, colour: string, size: string | null) {
  return `${slug}:${colour}:${size ?? "one-size"}`;
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CartItem>;
  return typeof item.slug === "string" && /^[a-z0-9-]{2,100}$/.test(item.slug) && typeof item.colour === "string" && (item.size === null || typeof item.size === "string") && item.key === getItemKey(item.slug, item.colour, item.size ?? null) && Number.isInteger(item.quantity) && (item.quantity ?? 0) > 0 && (item.quantity ?? 100) <= 99;
}

function readCart(): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isCartItem) : [];
  } catch {
    return [];
  }
}

function newCartToken() {
  return Array.from(window.crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCartToken() {
  try {
    const current = window.localStorage.getItem(TOKEN_KEY);
    if (current && /^[a-f0-9]{64}$/.test(current)) return current;
    const token = newCartToken();
    window.localStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    return newCartToken();
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const catalogueQuery = useQuery({ queryKey: ["catalogue", "public"], queryFn: async () => mapStoreCatalogue(await client.listPublicCatalogue()), staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: true });
  const [items, setItems] = useState<CartItem[]>([]);
  const itemsRef = useRef<CartItem[]>([]);
  const [cartToken, setCartToken] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const savedItems = readCart();
    itemsRef.current = savedItems;
    setItems(savedItems);
    setCartToken(readCartToken());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* Cart stays usable for this visit. */ }
    }
  }, [items, hydrated]);

  const syncCart = useCallback(async (contact?: { name: string; email: string; phone: string }) => {
    if (!cartToken) throw new Error("Your cart is still loading. Please try again.");
    await client.saveCustomerCart({ token: cartToken, lines: items.map(({ slug, size, colour, quantity }) => ({ productSlug: slug, size, colour, quantity })), ...(contact ? { contact } : {}) });
  }, [cartToken, items]);

  useEffect(() => {
    if (!hydrated || !cartToken) return;
    const timer = window.setTimeout(() => { void syncCart().catch(() => undefined); }, 650);
    return () => window.clearTimeout(timer);
  }, [items, hydrated, cartToken, syncCart]);

  const quantityForVariant = useCallback((slug: string, colour: string, size: string | null) => {
    const key = getItemKey(slug, colour, size);
    return itemsRef.current.find((item) => item.key === key)?.quantity ?? 0;
  }, []);

  const addItem = useCallback((product: StoreProduct, colour: string, size: string | null, quantity = 1) => {
    const key = getItemKey(product.slug, colour, size);
    const currentProduct = catalogueQuery.data?.products.find((item) => item.slug === product.slug);
    if (catalogueQuery.data && !currentProduct) return 0;
    const resolvedProduct = currentProduct ?? product;
    const variant = resolvedProduct.variants.find((item) => item.colour === colour && item.size === size && item.active);
    if (resolvedProduct.status !== "published" || !variant || variant.stock <= 0 || !Number.isInteger(quantity) || quantity < 1) return 0;
    const current = itemsRef.current;
    const existing = current.find((item) => item.key === key);
    const currentQuantity = existing?.quantity ?? 0;
    const added = Math.min(quantity, Math.max(0, variant.stock - currentQuantity));
    if (added <= 0) return 0;
    const next = existing
      ? current.map((item) => item.key === key ? { ...item, quantity: currentQuantity + added } : item)
      : [...current, { key, slug: product.slug, size, colour, quantity: added }];
    itemsRef.current = next;
    setItems(next);
    return added;
  }, [catalogueQuery.data]);

  const setQuantity = useCallback((key: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1) return;
    const current = itemsRef.current;
    const item = current.find((entry) => entry.key === key);
    if (!item) return;
    const product = catalogueQuery.data?.products.find((entry) => entry.slug === item.slug);
    const variant = product?.variants.find((entry) => entry.colour === item.colour && entry.size === item.size && entry.active);
    if (!variant || variant.stock < 1) return;
    const next = current.map((entry) => entry.key === key ? { ...entry, quantity: Math.min(variant.stock, 99, quantity) } : entry);
    itemsRef.current = next;
    setItems(next);
  }, [catalogueQuery.data]);

  const removeItem = useCallback((key: string) => {
    const next = itemsRef.current.filter((item) => item.key !== key);
    itemsRef.current = next;
    setItems(next);
  }, []);
  const clearCart = useCallback(() => {
    const token = newCartToken();
    try { window.localStorage.setItem(TOKEN_KEY, token); } catch { /* The in-memory cart remains usable. */ }
    setCartToken(token);
    itemsRef.current = [];
    setItems([]);
  }, []);

  useEffect(() => {
    if (!catalogueQuery.data) return;
    const next = itemsRef.current.flatMap((item) => {
      const product = catalogueQuery.data.products.find((entry) => entry.slug === item.slug);
      const variant = product?.variants.find((entry) => entry.colour === item.colour && entry.size === item.size && entry.active);
      return product?.status === "published" && variant && variant.stock > 0
        ? [{ ...item, quantity: Math.min(item.quantity, variant.stock, 99) }]
        : [];
    });
    if (JSON.stringify(next) !== JSON.stringify(itemsRef.current)) {
      itemsRef.current = next;
      setItems(next);
    }
  }, [catalogueQuery.data]);

  const lines = useMemo(() => items.flatMap((item) => {
    const product = catalogueQuery.data?.products.find((entry) => entry.slug === item.slug);
    const variant = product?.variants.find((entry) => entry.colour === item.colour && entry.size === item.size && entry.active);
    return product && variant ? [{ ...item, product, unitPriceGhs: variant.priceGhs }] : [];
  }), [items, catalogueQuery.data]);
  const value = useMemo<CartContextValue>(() => ({
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalGhs: lines.reduce((total, line) => total + line.unitPriceGhs * line.quantity, 0),
    hydrated,
    catalogueReady: !catalogueQuery.isLoading && !catalogueQuery.isError,
    cartToken,
    syncCart,
    addItem,
    quantityForVariant,
    setQuantity,
    removeItem,
    clearCart,
  }), [lines, hydrated, catalogueQuery.isLoading, catalogueQuery.isError, cartToken, syncCart, addItem, quantityForVariant, setQuantity, removeItem, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
