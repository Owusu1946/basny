"use client";

import Link from "next/link";
import type { Route } from "next";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";

export default function SiteFooter() {
  const pages = useQuery({ queryKey: ["public-store-pages"], queryFn: () => client.getPublicStorePages(), staleTime: 60_000, retry: 1 });
  const seo = useQuery({ queryKey: ["public-store-seo"], queryFn: () => client.getPublicStoreSeoSettings(), staleTime: 5 * 60_000, retry: 1 });
  const profile = useQuery({ queryKey: ["public-store-profile"], queryFn: () => client.getPublicStoreProfile(), staleTime: 5 * 60_000, retry: 1 });
  const links = pages.data ?? [{ slug: "delivery", title: "Delivery" }, { slug: "faqs", title: "FAQs" }];
  const socials = [
    ["Instagram", seo.data?.instagram],
    ["Facebook", seo.data?.facebook],
    ["TikTok", seo.data?.tiktok],
  ].flatMap(([name, value]) => {
    if (typeof value !== "string" || !value) return [];
    try { const url = new URL(value); return url.protocol === "https:" ? [{ name, href: url.toString() }] : []; }
    catch { return []; }
  });
  const store = profile.data;
  return <footer className="site-footer"><div className="page-shell site-footer__inner"><Link className="footer-brand" href="/">{store?.name ?? "BASNY"}</Link><p>Thoughtful shoes, bags and accessories. Accra, Ghana.</p>{(store?.phone || store?.whatsappUrl || store?.email || store?.address) && <address className="site-footer__contact">{store.phone && <a href={`tel:${store.phone.replace(/[^\d+]/g, "")}`}>{store.phone}</a>}{store.whatsappUrl && <a href={store.whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a>}{store.email && <a href={`mailto:${store.email}`}>{store.email}</a>}{store.address && <span>{store.address}</span>}</address>}<nav aria-label="Customer information">{links.map((page) => <Link key={page.slug} href={`/pages/${page.slug}` as Route}>{page.title}</Link>)}</nav>{socials.length > 0 && <nav aria-label="BASNY social profiles">{socials.map((social) => <a key={social.name} href={social.href} target="_blank" rel="noopener noreferrer">{social.name}</a>)}</nav>}<span>© {new Date().getFullYear()} {store?.name ?? "BASNY Enterprise"}</span></div></footer>;
}
