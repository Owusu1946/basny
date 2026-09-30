import type { MetadataRoute } from "next";
import { getPublicCatalogue, getPublicStoreSeoSettings } from "@/lib/public-catalogue.server";
import { getPublicSiteOrigin } from "@/lib/public-site.server";
import { client } from "@/utils/orpc";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await getPublicStoreSeoSettings();
  const origin = getPublicSiteOrigin(seo);
  if (!seo.indexingEnabled || !origin) return [];

  const [catalogue, pages] = await Promise.all([
    seo.sitemapProducts || seo.sitemapCategories ? getPublicCatalogue() : Promise.resolve(null),
    seo.sitemapPages ? client.getPublicStorePages() : Promise.resolve([]),
  ]);
  const entries: MetadataRoute.Sitemap = [{ url: new URL("/", origin).toString() }];
  if (seo.sitemapCategories && catalogue) {
    entries.push(...catalogue.categories.map((category) => ({ url: new URL(`/shop/${category.slug}`, origin).toString() })));
  }
  if (seo.sitemapProducts && catalogue) {
    entries.push(...catalogue.products.filter((product) => product.status === "published").map((product) => ({ url: new URL(`/products/${product.slug}`, origin).toString() })));
  }
  entries.push(...pages.map((page) => ({ url: new URL(`/pages/${page.slug}`, origin).toString() })));
  return entries;
}
