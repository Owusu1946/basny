import type { Metadata } from "next";
import type { Route } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getPublicStoreRedirect } from "@/lib/public-catalogue.server";

import CatalogListing from "@/components/catalog-listing";
import { getPublicCatalogue } from "@/lib/public-catalogue.server";

type CategoryPageProps = { params: Promise<{ category: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  const catalogue = await getPublicCatalogue();
  const item = catalogue.categories.find((entry) => entry.slug === category);
  return { title: item?.name ?? "Category" };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;
  const catalogue = await getPublicCatalogue();
  const item = catalogue.categories.find((entry) => entry.slug === category);
  if (!item) {
    const destination = await getPublicStoreRedirect(`/shop/${category}`);
    if (destination) permanentRedirect(destination as Route);
    notFound();
  }

  return <CatalogListing products={catalogue.products} initialCategories={catalogue.categories} title={item.name} description={item.description} initialCategory={item.slug as never} />;
}
