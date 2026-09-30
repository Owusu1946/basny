import type { Metadata } from "next";

import CatalogListing from "@/components/catalog-listing";
import { getPublicCatalogue } from "@/lib/public-catalogue.server";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim().slice(0, 120) ?? "";
  const normalized = query.toLocaleLowerCase("en-GH");
  const catalogue = await getPublicCatalogue();
  const results = normalized
    ? catalogue.products.filter((product) => [product.name, product.type, product.category, product.description].some((value) => value.toLocaleLowerCase("en-GH").includes(normalized)))
    : catalogue.products;

  return <CatalogListing key={query} products={results} initialCategories={catalogue.categories} title={query ? `Results for “${query}”` : "Search the collection"} description={query ? `${results.length} ${results.length === 1 ? "piece" : "pieces"} found.` : "Search shoes, bags and accessories using the search field above."} query={query} />;
}
