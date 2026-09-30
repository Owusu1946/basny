import "server-only";

import type { PublicSeoSettings } from "@/lib/public-site-types";

/** Use only an explicitly configured canonical origin or deployment origin. */
export function getPublicSiteOrigin(seo: Pick<PublicSeoSettings, "canonicalBaseUrl">): URL | undefined {
  const candidate = seo.canonicalBaseUrl.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) return undefined;
    if (url.username || url.password) return undefined;
    return new URL(url.origin);
  } catch {
    return undefined;
  }
}
