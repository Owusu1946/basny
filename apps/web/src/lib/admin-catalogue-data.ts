import { sampleProducts, type SampleProduct } from "@/lib/sample-catalog";

export type CatalogueProduct = Omit<SampleProduct, "category"> & {
  category: string;
  metaTitle: string;
  metaDescription: string;
  sku: string;
  stock: number;
  status: "Published" | "Draft" | "Archived";
  featured: boolean;
  updatedAt: string;
  imageMedia?: { objectKey: string; thumbnailUrl: string; detailUrl: string; width: number; height: number };
  variantStock?: Record<string, number>;
};

export type CatalogueCategory = { slug: string; name: string; description: string; active: boolean };
export type CatalogueCollection = { id: string; name: string; description: string; products: string[]; status: "Published" | "Draft"; featured: boolean };
export type CatalogueReview = { id: string; productSlug: string; customer: string; rating: number; title: string; body: string; submitted: string; status: "Pending" | "Published" | "Hidden" | "Rejected" | "Removed"; verifiedPurchase?: boolean; reply: string };

export const initialCatalogueProducts: CatalogueProduct[] = sampleProducts.map((product, index) => ({
  ...product,
  metaTitle: `${product.name} | BASNY Enterprise`,
  metaDescription: product.description,
  sku: `BAS-${product.category.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
  stock: [12, 8, 4, 6, 3, 18, 7, 0][index] ?? 0,
  status: index === 7 ? "Draft" : "Published",
  featured: Boolean(product.badge),
  updatedAt: index < 3 ? "Today" : "This week",
}));

export const initialCatalogueCategories: CatalogueCategory[] = [
  { slug: "shoes", name: "Shoes", description: "Heels, flats and sandals for wherever the day goes.", active: true },
  { slug: "bags", name: "Bags", description: "The pieces you reach for on ordinary days and special ones.", active: true },
  { slug: "accessories", name: "Accessories", description: "Small finishing touches, chosen with care.", active: true },
];

export const initialCatalogueCollections: CatalogueCollection[] = [
  { id: "COL-001", name: "New arrivals", description: "Fresh pieces just added to the BASNY edit.", products: ["sera-block-heel", "mira-shoulder-bag", "kora-satin-scarf"], status: "Published", featured: true },
  { id: "COL-002", name: "Everyday favourites", description: "Easy pieces made for the daily rotation.", products: ["adwoa-ballet-flat", "everyday-tote", "tortoiseshell-clips"], status: "Published", featured: true },
  { id: "COL-003", name: "Occasion edit", description: "Finishing touches for plans worth dressing up for.", products: ["nia-strap-sandal", "sera-block-heel", "twist-hoops"], status: "Draft", featured: false },
];

export function readCatalogueState<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(`basny-admin-${key}`);
    return saved ? JSON.parse(saved) as T : fallback;
  } catch {
    return fallback;
  }
}

export function writeCatalogueState<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`basny-admin-${key}`, JSON.stringify(value));
  } catch {
    // The screen remains usable if browser storage is unavailable or full.
  }
}
