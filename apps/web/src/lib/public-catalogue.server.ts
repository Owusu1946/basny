import "server-only";

import { unstable_cache } from "next/cache";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AppRouterClient } from "@basny-web/api/routers/index";
import { mapStoreCatalogue } from "@/lib/catalogue";

const publicClient: AppRouterClient = createORPCClient(new RPCLink({
  url: `${process.env.NEXT_PUBLIC_SERVER_URL!.replace(/\/$/, "")}/rpc`,
  fetch(url, options) {
    return fetch(url, { ...options, cache: "no-store" });
  },
}));

const readCachedCatalogue = unstable_cache(
  async () => mapStoreCatalogue(await publicClient.listPublicCatalogue()),
  ["basny-public-catalogue-v1"],
  { revalidate: 60, tags: ["public-catalogue"] },
);

const readCachedStoreSeo = unstable_cache(
  async () => publicClient.getPublicStoreSeoSettings(),
  ["basny-public-store-seo-v1"],
  { revalidate: 300, tags: ["public-store-seo"] },
);

export function getPublicCatalogue() {
  return readCachedCatalogue();
}

export function getPublicStoreSeoSettings() {
  return readCachedStoreSeo().catch(() => ({
    siteTitle: "BASNY Enterprise | Shoes, Bags & Accessories",
    siteDescription: "Thoughtful shoes, bags and accessories. Based in Accra, Ghana. Delivery across Ghana.",
    canonicalBaseUrl: "", indexingEnabled: false, sitemapProducts: true, sitemapCategories: true, sitemapPages: true,
    productStructuredData: true, localBusinessStructuredData: false, instagram: "", facebook: "", tiktok: "",
  }));
}

export async function getPublicStoreRedirect(from: string) {
  try {
    return await publicClient.getPublicStoreRedirect({ from });
  } catch {
    return null;
  }
}
