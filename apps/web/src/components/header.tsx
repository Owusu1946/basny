"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  FavouriteIcon,
  Menu01Icon,
  Cancel01Icon,
  Search01Icon,
  ShoppingBag01Icon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/lib/cart-context";
import UserMenu from "@/components/user-menu";
import { client } from "@/utils/orpc";

const defaultNavLinks = [
  { href: "/shop", label: "Shop all" },
  { href: "/shop/shoes", label: "Shoes" },
  { href: "/shop/bags", label: "Bags" },
  { href: "/shop/accessories", label: "Accessories" },
] as const;

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { itemCount, hydrated } = useCart();
  const navigation = useQuery({ queryKey: ["public-store-navigation"], queryFn: () => client.getPublicStoreNavigation(), staleTime: 60_000, retry: 1 });
  const navLinks = (navigation.data?.length ? navigation.data : defaultNavLinks).filter((link) => link.href !== "/shop/new-arrivals" && link.label.trim().toLowerCase() !== "new arrivals");

  return (
    <header className="site-header" id="top">
      <div className="announcement-bar">
        <span>Accra, Ghana</span>
        <span className="announcement-divider" aria-hidden="true">·</span>
        <span>Delivery across Ghana</span>
      </div>

      <div className="header-main page-shell">
        <button
          className="icon-button mobile-menu-button"
          type="button"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <HugeiconsIcon icon={menuOpen ? Cancel01Icon : Menu01Icon} aria-hidden="true" />
        </button>

        <Link className="brand-mark" href="/" aria-label="BASNY Enterprise home">
          <span className="brand-mark__name">BASNY</span>
          <span className="brand-mark__descriptor">ENTERPRISE</span>
        </Link>

        <form className="header-search" action="/search" role="search">
          <HugeiconsIcon icon={Search01Icon} aria-hidden="true" />
          <input type="search" name="q" placeholder="Search shoes, bags and more" aria-label="Search products" />
          <button type="submit">Search</button>
        </form>

        <div className="header-actions">
          <UserMenu />
          <Link className="header-action header-action--optional" href="/wishlist" aria-label="Wishlist">
            <HugeiconsIcon icon={FavouriteIcon} aria-hidden="true" />
            <span>Wishlist</span>
          </Link>
          <Link className="header-action header-action--cart" href="/cart" aria-label={`Shopping bag, ${hydrated ? itemCount : 0} ${itemCount === 1 ? "item" : "items"}`}>
            <span className="cart-icon-wrap">
              <HugeiconsIcon icon={ShoppingBag01Icon} aria-hidden="true" />
              <span className="cart-count" aria-hidden="true">{hydrated ? itemCount : 0}</span>
            </span>
            <span>Bag</span>
          </Link>
        </div>
      </div>

      <form className="mobile-search page-shell" action="/search" role="search">
        <HugeiconsIcon icon={Search01Icon} aria-hidden="true" />
        <input type="search" name="q" placeholder="Search shoes, bags and more" aria-label="Search products" />
        <button type="submit" aria-label="Submit search">Search</button>
      </form>

      <nav
        className={`primary-navigation ${menuOpen ? "primary-navigation--open" : ""}`}
        id="primary-navigation"
        aria-label="Main navigation"
      >
        <div className="primary-navigation__inner page-shell">
          {navLinks.map((link) => (
            <Link href={link.href as Route} key={link.label} onClick={() => setMenuOpen(false)}>
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
