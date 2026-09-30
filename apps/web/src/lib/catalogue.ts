import type { client } from "@/utils/orpc";
import type { SampleProduct } from "@/lib/sample-catalog";

export type PublicCatalogueData = Awaited<ReturnType<typeof client.listPublicCatalogue>>;
export type CatalogueRecord = PublicCatalogueData["products"][number];
export type StoreProduct = Omit<SampleProduct, "category"> & {
  category: string;
  categoryId: string;
  regularPriceGhs?: number;
  variants: (CatalogueRecord["variants"][number] & { regularPriceGhs: number })[];
  stock: number;
  status: string;
  featured: boolean;
  metaTitle: string;
  metaDescription: string;
  detailImage?: string;
  thumbnailImage?: string;
};
export type StoreCategory = PublicCatalogueData["categories"][number];
export type StoreCatalogue = { products: StoreProduct[]; categories: StoreCategory[]; collections: PublicCatalogueData["collections"] };

export function mapStoreProduct(record: CatalogueRecord): StoreProduct {
  const media = record.media[0];
  const variants = record.variants;
  return {
    slug: record.slug,
    name: record.name,
    category: record.category.slug,
    categoryId: record.category.id,
    type: record.type,
    priceGhs: record.priceGhs,
    regularPriceGhs: record.regularPriceGhs,
    description: record.description,
    material: record.material,
    image: media?.url ?? "/images/product-placeholder.svg",
    thumbnailImage: media?.thumbnailUrl ?? media?.url,
    detailImage: media?.detailUrl ?? media?.url,
    imageAlt: media?.alt ?? `${record.name} product image`,
    badge: record.featured ? "Featured" : undefined,
    colours: record.colours,
    sizes: record.sizes.filter((size): size is string => Boolean(size)),
    variants: variants.map((variant) => ({ ...variant, regularPriceGhs: variant.priceGhs, priceGhs: variant.salePriceGhs })),
    stock: record.stock,
    status: record.status,
    featured: record.featured,
    metaTitle: record.metaTitle,
    metaDescription: record.metaDescription,
  };
}

export function mapStoreCatalogue(data: PublicCatalogueData): StoreCatalogue {
  return { products: data.products.map(mapStoreProduct), categories: data.categories, collections: data.collections };
}
