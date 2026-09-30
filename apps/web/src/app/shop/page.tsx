import type { Metadata } from "next";

import CatalogListing from "@/components/catalog-listing";
import { getPublicCatalogue } from "@/lib/public-catalogue.server";

export const metadata: Metadata = { title: "Shop all" };
export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const catalogue = await getPublicCatalogue();
  return <CatalogListing products={catalogue.products} initialCategories={catalogue.categories} title="The collection" description="Shoes, bags and the finishing touches for the days ahead." />;
}
