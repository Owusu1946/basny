import "varlock/auto-load";
import { createDb } from "@basny-web/db";
import { catalogueCategory, catalogueCollection, catalogueCollectionProduct, catalogueProduct, catalogueProductMedia, catalogueProductVariant } from "@basny-web/db/schema/catalogue";
import { sampleProducts } from "../../web/src/lib/sample-catalog";
import { inArray } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
if (process.env.NODE_ENV === "production") throw new Error("The preview catalogue seed is disabled in production.");
if (process.env.ALLOW_CATALOGUE_SEED !== "true") throw new Error("Set ALLOW_CATALOGUE_SEED=true for this command. This seed is for development/preview databases only.");

const db = createDb({ DATABASE_URL: connectionString });
const categoryData = [
  { slug: "shoes", name: "Shoes", description: "Heels, flats and sandals for wherever the day goes." },
  { slug: "bags", name: "Bags", description: "The pieces you reach for on ordinary days and special ones." },
  { slug: "accessories", name: "Accessories", description: "Small finishing touches, chosen with care." },
];
const stockBySlug: Record<string, number> = { "sera-block-heel": 12, "adwoa-ballet-flat": 8, "nia-strap-sandal": 4, "mira-shoulder-bag": 6, "everyday-tote": 3, "twist-hoops": 18, "kora-satin-scarf": 7, "tortoiseshell-clips": 0 };
const collections = [
  { id: "COL-001", slug: "new-arrivals", name: "New arrivals", description: "Fresh pieces just added to the BASNY edit.", products: ["sera-block-heel", "mira-shoulder-bag", "kora-satin-scarf"], status: "published" as const, featured: true },
  { id: "COL-002", slug: "everyday-favourites", name: "Everyday favourites", description: "Easy pieces made for the daily rotation.", products: ["adwoa-ballet-flat", "everyday-tote", "tortoiseshell-clips"], status: "published" as const, featured: true },
  { id: "COL-003", slug: "occasion-edit", name: "Occasion edit", description: "Finishing touches for plans worth dressing up for.", products: ["nia-strap-sandal", "sera-block-heel", "twist-hoops"], status: "draft" as const, featured: false },
];

for (const [sortOrder, category] of categoryData.entries()) {
  await db.insert(catalogueCategory).values({ id: category.slug, ...category, active: true, sortOrder }).onConflictDoNothing();
}

let addedProducts = 0;
for (const [index, product] of sampleProducts.entries()) {
  const id = crypto.randomUUID();
  const [created] = await db.insert(catalogueProduct).values({
    id, slug: product.slug, name: product.name, categoryId: product.category, type: product.type, priceGhs: product.priceGhs,
    description: product.description, material: product.material, metaTitle: `${product.name} | BASNY Enterprise`, metaDescription: product.description,
    status: index === 7 ? "draft" : "published", featured: Boolean(product.badge),
  }).onConflictDoNothing().returning({ id: catalogueProduct.id });
  if (!created) continue;
  addedProducts += 1;
  const totalStock = stockBySlug[product.slug] ?? 0;
  const sizes = product.sizes.length ? product.sizes : [null];
  const variants = sizes.map((size, variantIndex) => {
    const units = Math.floor(totalStock / sizes.length) + (variantIndex < totalStock % sizes.length ? 1 : 0);
    return { id: crypto.randomUUID(), productId: id, sku: `BAS-${product.category.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(3, "0")}${size ? `-${size}` : ""}`, colour: product.colours[0]?.name ?? "Standard", colourHex: product.colours[0]?.hex ?? "#765139", size, priceGhs: product.priceGhs, stock: units, active: true, sortOrder: variantIndex };
  });
  await db.insert(catalogueProductVariant).values(variants).onConflictDoNothing();
  await db.insert(catalogueProductMedia).values({ id: crypto.randomUUID(), productId: id, url: product.image, alt: product.imageAlt, width: 1200, height: 1200, mimeType: "image/webp", sortOrder: 0 }).onConflictDoNothing();
}

for (const [sortOrder, collection] of collections.entries()) {
  const [created] = await db.insert(catalogueCollection).values({ id: collection.id, slug: collection.slug, name: collection.name, description: collection.description, status: collection.status, featured: collection.featured, sortOrder }).onConflictDoNothing().returning({ id: catalogueCollection.id });
  if (!created) continue;
  const selected = collection.products.length ? await db.select({ id: catalogueProduct.id }).from(catalogueProduct).where(inArray(catalogueProduct.slug, collection.products)) : [];
  if (selected.length) await db.insert(catalogueCollectionProduct).values(selected.map((product, itemOrder) => ({ collectionId: created.id, productId: product.id, sortOrder: itemOrder }))).onConflictDoNothing();
}

console.info(`Catalogue seed complete: ${categoryData.length} categories considered, ${addedProducts} products inserted, ${collections.length} collections considered. Existing records were left unchanged.`);
