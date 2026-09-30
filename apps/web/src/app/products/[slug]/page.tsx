import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import ProductDetail from "@/components/product-detail";
import ProductGrid from "@/components/product-grid";
import { getPublicCatalogue, getPublicStoreRedirect, getPublicStoreSeoSettings } from "@/lib/public-catalogue.server";
import { getPublicSiteOrigin } from "@/lib/public-site.server";

type ProductPageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const catalogue = await getPublicCatalogue();
  const product = catalogue.products.find((item) => item.slug === slug) ?? null;
  if (!product) return { title: "Product" };
  const seo = await getPublicStoreSeoSettings();
  const origin = getPublicSiteOrigin(seo);
  return {
    title: product.metaTitle || product.name,
    description: product.metaDescription || product.description,
    ...(origin ? { metadataBase: origin } : {}),
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title: product.metaTitle || `${product.name} | BASNY Enterprise`,
      description: product.metaDescription || product.description,
      type: "website",
      images: [{ url: product.image, alt: product.imageAlt }],
    },
    twitter: { card: "summary_large_image", title: product.name, description: product.description, images: [product.image] },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const catalogue = await getPublicCatalogue();
  const product = catalogue.products.find((item) => item.slug === slug) ?? null;
  if (!product) {
    const destination = await getPublicStoreRedirect(`/products/${slug}`);
    if (destination) permanentRedirect(destination as Route);
    notFound();
  }

  const category = catalogue.categories.find((item) => item.slug === product.category);
  const related = catalogue.products.filter((item) => item.category === product.category && item.slug !== product.slug).slice(0, 3);
  const seo = await getPublicStoreSeoSettings();
  const origin = getPublicSiteOrigin(seo);
  const structuredProduct = seo.productStructuredData ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: origin ? new URL(product.detailImage ?? product.image, origin).toString() : product.detailImage ?? product.image,
    ...(origin ? { url: new URL(`/products/${product.slug}`, origin).toString() } : {}),
    brand: { "@type": "Brand", name: "BASNY Enterprise" },
    category: category?.name,
    color: product.colours.map((colour) => colour.name),
    offers: product.variants.map((variant) => ({
      "@type": "Offer",
      sku: variant.sku,
      priceCurrency: "GHS",
      price: (variant.priceGhs ?? product.priceGhs).toFixed(2),
      availability: variant.active && variant.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      ...(origin ? { url: new URL(`/products/${product.slug}`, origin).toString() } : {}),
    })),
  } : null;
  const structuredProductJson = structuredProduct ? JSON.stringify(structuredProduct).replace(/</g, "\\u003c") : "";

  return (
    <main className="product-page page-shell">
      {structuredProductJson && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredProductJson }} />}
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span>{category && <><Link href={`/shop/${category.slug}`}>{category.name}</Link><span aria-hidden="true">/</span></>}<span>{product.name}</span></nav>
      <ProductDetail product={product} />
      {related.length > 0 && <section className="related-products" aria-labelledby="related-title"><div className="related-products__heading"><div><p className="eyebrow">More to see</p><h2 id="related-title">You may also like</h2></div>{category && <Link href={`/shop/${category.slug}`}>Browse {category.name.toLowerCase()} <span aria-hidden="true">↗</span></Link>}</div><ProductGrid products={related} /></section>}
    </main>
  );
}
