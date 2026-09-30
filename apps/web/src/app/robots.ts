import type { MetadataRoute } from "next";
import { getPublicStoreSeoSettings } from "@/lib/public-catalogue.server";
import { getPublicSiteOrigin } from "@/lib/public-site.server";

export const revalidate = 300;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const seo = await getPublicStoreSeoSettings();
  const origin = getPublicSiteOrigin(seo);
  if (!seo.indexingEnabled) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/account", "/dashboard", "/cart", "/checkout", "/order-confirmation"] },
    ...(origin ? { sitemap: new URL("/sitemap.xml", origin).toString() } : {}),
  };
}
