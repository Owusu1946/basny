import { ORPCError } from "@orpc/server";
import type { Database } from "@basny-web/db";
import { catalogueCategory, catalogueCollection, catalogueCollectionProduct, catalogueProduct, catalogueProductMedia, catalogueProductVariant } from "@basny-web/db/schema/catalogue";
import { customerReview } from "@basny-web/db/schema/customer";
import { user } from "@basny-web/db/schema/auth";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import { activeMarketingPromotions, promotionPrice } from "./marketing";

const editorProcedure = protectedProcedure.use(async ({ context, next }) => {
  const { staffRole } = await import("@basny-web/db/schema/staff");
  const [staff] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id)).limit(1);
  if (!staff || !["content_editor", "super_admin"].includes(staff.role)) throw new ORPCError("FORBIDDEN");
  return next();
});

const slugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(100);
const categoryInput = z.object({ id: z.string().optional(), slug: slugSchema, name: z.string().trim().min(2).max(80), description: z.string().trim().max(500).default(""), active: z.boolean(), sortOrder: z.number().int().min(0).default(0) });
const variantInput = z.object({ id: z.string().optional(), sku: z.string().trim().min(2).max(80), colour: z.string().trim().min(1).max(40), colourHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/), size: z.string().trim().max(20).nullable(), priceGhs: z.number().int().positive().max(10000000), stock: z.number().int().min(0).max(1000000), active: z.boolean().default(true), sortOrder: z.number().int().min(0).default(0) });
const mediaUrl = z.string().max(2000).refine((value) => value.startsWith("/images/") || (URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol)), "Use a public image URL.");
const mediaInput = z.object({ id: z.string().optional(), objectKey: z.string().max(500).nullable().optional(), url: mediaUrl, thumbnailUrl: mediaUrl.nullable().optional(), detailUrl: mediaUrl.nullable().optional(), alt: z.string().trim().min(3).max(240), width: z.number().int().positive().nullable().optional(), height: z.number().int().positive().nullable().optional(), mimeType: z.enum(["image/webp", "image/avif", "image/jpeg", "image/png"]).default("image/webp"), sortOrder: z.number().int().min(0).default(0) });
const productInput = z.object({ id: z.string().optional(), slug: slugSchema, name: z.string().trim().min(2).max(120), categoryId: z.string().min(1), type: z.string().trim().min(1).max(80), priceGhs: z.number().int().positive().max(10000000), description: z.string().trim().min(5).max(3000), material: z.string().trim().max(500).default(""), metaTitle: z.string().trim().max(160).default(""), metaDescription: z.string().trim().max(320).default(""), status: z.enum(["published", "draft", "archived"]), featured: z.boolean(), variants: z.array(variantInput).min(1).max(100), media: z.array(mediaInput).min(1).max(12) });
const collectionInput = z.object({ id: z.string().optional(), slug: slugSchema, name: z.string().trim().min(2).max(100), description: z.string().trim().max(1000).default(""), status: z.enum(["published", "draft"]), featured: z.boolean(), sortOrder: z.number().int().min(0).default(0), productSlugs: z.array(slugSchema).max(200) });

async function productRecords(db: Database, publicOnly: boolean) {
  const where = publicOnly ? eq(catalogueProduct.status, "published") : undefined;
  const records = await db.select({ product: catalogueProduct, category: catalogueCategory }).from(catalogueProduct).innerJoin(catalogueCategory, eq(catalogueProduct.categoryId, catalogueCategory.id)).where(where).orderBy(asc(catalogueProduct.createdAt));
  const ids = records.map((record: { product: { id: string } }) => record.product.id);
  if (!ids.length) return [];
  const promotions = publicOnly ? await activeMarketingPromotions(db) : [];
  const [variants, media] = await Promise.all([
    db.select().from(catalogueProductVariant).where(publicOnly ? and(inArray(catalogueProductVariant.productId, ids), eq(catalogueProductVariant.active, true)) : inArray(catalogueProductVariant.productId, ids)).orderBy(asc(catalogueProductVariant.sortOrder)),
    db.select().from(catalogueProductMedia).where(inArray(catalogueProductMedia.productId, ids)).orderBy(asc(catalogueProductMedia.sortOrder)),
  ]);
  return records.filter((record: { category: { active: boolean } }) => !publicOnly || record.category.active).map((record: { product: typeof catalogueProduct.$inferSelect; category: typeof catalogueCategory.$inferSelect }) => {
    const productVariants = variants.filter((variant: typeof catalogueProductVariant.$inferSelect) => variant.productId === record.product.id).map((variant: typeof catalogueProductVariant.$inferSelect) => ({ ...variant, ...promotionPrice(variant.priceGhs, record.product.slug, record.product.categoryId, promotions) }));
    const productMedia = media.filter((item: typeof catalogueProductMedia.$inferSelect) => item.productId === record.product.id);
    const minimumSalePrice = productVariants.length ? Math.min(...productVariants.map((variant: typeof catalogueProductVariant.$inferSelect & { salePriceGhs: number }) => variant.salePriceGhs)) : record.product.priceGhs;
    const visibleVariants = publicOnly ? productVariants.map(({ reservedStock, stock, ...variant }) => ({ ...variant, stock: Math.max(0, stock - reservedStock) })) : productVariants;
    return { ...record.product, regularPriceGhs: record.product.priceGhs, priceGhs: publicOnly ? minimumSalePrice : record.product.priceGhs, category: record.category, variants: visibleVariants, media: productMedia, stock: visibleVariants.reduce((sum: number, variant: { stock: number }) => sum + variant.stock, 0), colours: [...new Map(visibleVariants.map((variant: { colour: string; colourHex: string }) => [variant.colour, { name: variant.colour, hex: variant.colourHex }])).values()], sizes: [...new Set(visibleVariants.map((variant: { size: string | null }) => variant.size).filter(Boolean))] };
  });
}

function publishCatalogue(context: { publishStaffEvent: (name: string, data: Record<string, unknown>) => Promise<void>; publishPublicCatalogueEvent: (name: string, data: Record<string, unknown>) => Promise<void>; revalidatePublicCatalogue: () => Promise<void> }) {
  const data = { at: new Date().toISOString() };
  // Start cache/realtime fan-out after the database commit without making the
  // admin wait on Ably or a separate Vercel revalidation request.
  void Promise.resolve().then(() => Promise.allSettled([
    context.publishStaffEvent("catalogue.changed", data),
    context.publishPublicCatalogueEvent("catalogue.changed", data),
    context.revalidatePublicCatalogue(),
  ])).catch((error: unknown) => console.error("Catalogue change notifications could not be started", error));
}

export const catalogueProcedures = {
  listPublicCatalogue: publicProcedure.handler(async ({ context }) => {
    const [categories, products, collections] = await Promise.all([
      context.db.select().from(catalogueCategory).where(eq(catalogueCategory.active, true)).orderBy(asc(catalogueCategory.sortOrder)),
      productRecords(context.db, true),
      context.db.select().from(catalogueCollection).where(eq(catalogueCollection.status, "published")).orderBy(asc(catalogueCollection.sortOrder)),
    ]);
    const collectionIds = collections.map((item) => item.id);
    const membership = collectionIds.length ? await context.db.select({ collectionId: catalogueCollectionProduct.collectionId, productId: catalogueCollectionProduct.productId, productSlug: catalogueProduct.slug }).from(catalogueCollectionProduct).innerJoin(catalogueProduct, eq(catalogueProduct.id, catalogueCollectionProduct.productId)).innerJoin(catalogueCategory, eq(catalogueCategory.id, catalogueProduct.categoryId)).where(and(inArray(catalogueCollectionProduct.collectionId, collectionIds), eq(catalogueProduct.status, "published"), eq(catalogueCategory.active, true))).orderBy(asc(catalogueCollectionProduct.sortOrder)) : [];
    return { categories, products, collections: collections.map((collection) => ({ ...collection, products: membership.filter((item) => item.collectionId === collection.id).map((item) => item.productSlug) })) };
  }),
  searchPublicPosCatalogue: publicProcedure.input(z.object({ query: z.string().trim().max(100).default(""), category: z.string().max(100).default("All items"), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(48).default(24) })).handler(async ({ context, input }) => {
    const conditions = [eq(catalogueProduct.status, "published"), eq(catalogueCategory.active, true), input.category !== "All items" ? eq(catalogueCategory.slug, input.category) : undefined];
    const term = input.query.trim();
    if (term) {
      conditions.push(sql`to_tsvector('simple', coalesce(${catalogueProduct.name}, '') || ' ' || coalesce(${catalogueProduct.type}, '') || ' ' || coalesce(${catalogueProduct.slug}, '')) @@ plainto_tsquery('simple', ${term})` as typeof conditions[number]);
    }
    const where = and(...conditions.filter(Boolean) as [typeof conditions[number], ...typeof conditions[number][]]);
    const [categories, countResult, rows] = await Promise.all([
      context.db.select().from(catalogueCategory).where(eq(catalogueCategory.active, true)).orderBy(asc(catalogueCategory.sortOrder)),
      context.db.select({ total: sql<number>`count(*)::int` }).from(catalogueProduct).innerJoin(catalogueCategory, eq(catalogueProduct.categoryId, catalogueCategory.id)).where(where),
      context.db.select({ product: catalogueProduct, category: catalogueCategory }).from(catalogueProduct).innerJoin(catalogueCategory, eq(catalogueProduct.categoryId, catalogueCategory.id)).where(where).orderBy(asc(catalogueProduct.createdAt), asc(catalogueProduct.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    ]);
    const ids = rows.map(({ product }) => product.id);
    const [variants, media, promotions] = await Promise.all([
      ids.length ? context.db.select().from(catalogueProductVariant).where(and(inArray(catalogueProductVariant.productId, ids), eq(catalogueProductVariant.active, true))).orderBy(asc(catalogueProductVariant.sortOrder)) : [],
      ids.length ? context.db.select().from(catalogueProductMedia).where(inArray(catalogueProductMedia.productId, ids)).orderBy(asc(catalogueProductMedia.sortOrder)) : [],
      activeMarketingPromotions(context.db),
    ]);
    const products = rows.map(({ product, category }) => {
      const productVariants = variants.filter((variant) => variant.productId === product.id).map((variant) => ({ ...variant, ...promotionPrice(variant.priceGhs, product.slug, product.categoryId, promotions) }));
      const productMedia = media.filter((item) => item.productId === product.id);
      const availableVariants = productVariants.map(({ reservedStock, stock, ...variant }) => ({ ...variant, stock: Math.max(0, stock - reservedStock) }));
      return { ...product, regularPriceGhs: product.priceGhs, priceGhs: productVariants.length ? Math.min(...productVariants.map((item) => item.salePriceGhs)) : product.priceGhs, category, variants: availableVariants, media: productMedia, stock: availableVariants.reduce((sum, item) => sum + item.stock, 0), colours: [...new Map(availableVariants.map((item) => [item.colour, { name: item.colour, hex: item.colourHex }])).values()], sizes: [...new Set(availableVariants.map((item) => item.size).filter((size): size is string => Boolean(size)))] };
    });
    return { categories, products, total: countResult[0]?.total ?? 0, page: input.page, pageSize: input.pageSize, hasMore: input.page * input.pageSize < (countResult[0]?.total ?? 0) };
  }),
  getPublicProduct: publicProcedure.input(z.object({ slug: slugSchema })).handler(async ({ context, input }) => {
    const products = await productRecords(context.db, true);
    return products.find((product: { slug: string }) => product.slug === input.slug) ?? null;
  }),
  listAdminCatalogue: editorProcedure.handler(async ({ context }) => {
    const [categories, products, collections, reviews] = await Promise.all([
      context.db.select().from(catalogueCategory).orderBy(asc(catalogueCategory.sortOrder)),
      productRecords(context.db, false),
      context.db.select().from(catalogueCollection).orderBy(asc(catalogueCollection.sortOrder)),
      context.db.select({ review: customerReview, customer: user.name, email: user.email }).from(customerReview).innerJoin(user, eq(customerReview.userId, user.id)).orderBy(asc(customerReview.createdAt)),
    ]);
    const memberships = collections.length ? await context.db.select({ collectionId: catalogueCollectionProduct.collectionId, productId: catalogueCollectionProduct.productId, slug: catalogueProduct.slug }).from(catalogueCollectionProduct).innerJoin(catalogueProduct, eq(catalogueProduct.id, catalogueCollectionProduct.productId)).where(inArray(catalogueCollectionProduct.collectionId, collections.map((item) => item.id))).orderBy(asc(catalogueCollectionProduct.sortOrder)) : [];
    return { categories, products, collections: collections.map((item) => ({ ...item, products: memberships.filter((membership) => membership.collectionId === item.id).map((membership) => membership.slug) })), reviews: reviews.map(({ review, customer, email }) => ({ ...review, customer, email, verifiedPurchase: true })) };
  }),
  saveCatalogueCategory: editorProcedure.input(categoryInput).handler(async ({ context, input }) => {
    if (input.id) {
      const [current] = await context.db.select().from(catalogueCategory).where(eq(catalogueCategory.id, input.id)).limit(1);
      if (!current) throw new ORPCError("NOT_FOUND");
      if (current.slug !== input.slug) throw new ORPCError("BAD_REQUEST", { message: "Category slugs are stable and cannot be changed after creation." });
      const [saved] = await context.db.update(catalogueCategory).set({ name: input.name, description: input.description, active: input.active, sortOrder: input.sortOrder, updatedAt: new Date() }).where(eq(catalogueCategory.id, input.id)).returning();
      publishCatalogue(context); return saved;
    }
    const [saved] = await context.db.insert(catalogueCategory).values({ id: crypto.randomUUID(), ...input, updatedAt: new Date() }).returning();
    publishCatalogue(context); return saved;
  }),
  saveCatalogueProduct: editorProcedure.input(productInput).handler(async ({ context, input }) => {
    const [category] = await context.db.select({ id: catalogueCategory.id }).from(catalogueCategory).where(eq(catalogueCategory.id, input.categoryId)).limit(1);
    if (!category) throw new ORPCError("BAD_REQUEST", { message: "Choose an existing category." });
    if (new Set(input.variants.map((variant) => `${variant.colour.toLocaleLowerCase()}\u0000${variant.size ?? ""}`)).size !== input.variants.length) throw new ORPCError("BAD_REQUEST", { message: "Colour and size options must be unique for this product." });
    if (new Set(input.variants.map((variant) => variant.sku.toLocaleLowerCase())).size !== input.variants.length) throw new ORPCError("BAD_REQUEST", { message: "Each variant needs a unique SKU." });
    const productId = input.id ?? crypto.randomUUID();
    let current: typeof catalogueProduct.$inferSelect | undefined;
    if (input.id) {
      [current] = await context.db.select().from(catalogueProduct).where(eq(catalogueProduct.id, input.id)).limit(1);
      if (!current) throw new ORPCError("NOT_FOUND");
      if (current.slug !== input.slug) throw new ORPCError("BAD_REQUEST", { message: "Product slugs are stable and cannot be changed after creation." });
    }
    await context.db.transaction(async (tx) => {
      const productValues = { name: input.name, categoryId: input.categoryId, type: input.type, priceGhs: input.priceGhs, description: input.description, material: input.material, metaTitle: input.metaTitle, metaDescription: input.metaDescription, status: input.status, featured: input.featured, updatedBy: context.session.user.id, updatedAt: new Date() };
      if (current) await tx.update(catalogueProduct).set(productValues).where(eq(catalogueProduct.id, productId));
      else await tx.insert(catalogueProduct).values({ id: productId, slug: input.slug, ...productValues, createdBy: context.session.user.id });
      const existingVariants = await tx.select().from(catalogueProductVariant).where(eq(catalogueProductVariant.productId, productId)).for("update");
      const retained = new Set<string>();
      for (const variant of input.variants) {
        const existing = existingVariants.find((item: typeof catalogueProductVariant.$inferSelect) => item.colour.toLocaleLowerCase() === variant.colour.toLocaleLowerCase() && item.size === variant.size);
        if (existing) {
          retained.add(existing.id);
          // Product editing must never reset stock or low-stock settings. Inventory owns those fields.
          await tx.update(catalogueProductVariant).set({ sku: variant.sku, colour: variant.colour, colourHex: variant.colourHex, size: variant.size, priceGhs: variant.priceGhs, active: variant.active, sortOrder: variant.sortOrder, updatedAt: new Date() }).where(eq(catalogueProductVariant.id, existing.id));
        } else {
          await tx.insert(catalogueProductVariant).values({ id: crypto.randomUUID(), productId, ...variant, stock: 0, lowStockThreshold: 3, updatedAt: new Date() });
        }
      }
      for (const obsolete of existingVariants) {
        if (!retained.has(obsolete.id)) await tx.update(catalogueProductVariant).set({ active: false, updatedAt: new Date() }).where(eq(catalogueProductVariant.id, obsolete.id));
      }
      await tx.delete(catalogueProductMedia).where(eq(catalogueProductMedia.productId, productId));
      await tx.insert(catalogueProductMedia).values(input.media.map((item) => ({ id: crypto.randomUUID(), productId, ...item })));
    });
    publishCatalogue(context);
    return { saved: true, id: productId, slug: input.slug };
  }),
  setCatalogueProductStatus: editorProcedure.input(z.object({ slug: slugSchema, status: z.enum(["published", "draft", "archived"]) })).handler(async ({ context, input }) => {
    const [saved] = await context.db.update(catalogueProduct).set({ status: input.status, updatedBy: context.session.user.id, updatedAt: new Date() }).where(eq(catalogueProduct.slug, input.slug)).returning({ id: catalogueProduct.id, slug: catalogueProduct.slug, status: catalogueProduct.status });
    if (!saved) throw new ORPCError("NOT_FOUND");
    publishCatalogue(context); return saved;
  }),
  saveCatalogueCollection: editorProcedure.input(collectionInput).handler(async ({ context, input }) => {
    const productIds = input.productSlugs.length ? await context.db.select({ id: catalogueProduct.id, slug: catalogueProduct.slug }).from(catalogueProduct).where(inArray(catalogueProduct.slug, input.productSlugs)) : [];
    if (productIds.length !== new Set(input.productSlugs).size) throw new ORPCError("BAD_REQUEST", { message: "One or more selected products no longer exist." });
    const id = input.id ?? crypto.randomUUID();
    await context.db.transaction(async (tx) => {
      const values = { name: input.name, description: input.description, status: input.status, featured: input.featured, sortOrder: input.sortOrder, updatedBy: context.session.user.id, updatedAt: new Date() };
      if (input.id) {
        const [current] = await tx.select().from(catalogueCollection).where(eq(catalogueCollection.id, id)).limit(1);
        if (!current) throw new ORPCError("NOT_FOUND");
        if (current.slug !== input.slug) throw new ORPCError("BAD_REQUEST", { message: "Collection slugs are stable and cannot be changed after creation." });
        await tx.update(catalogueCollection).set(values).where(eq(catalogueCollection.id, id));
      } else await tx.insert(catalogueCollection).values({ id, slug: input.slug, ...values });
      await tx.delete(catalogueCollectionProduct).where(eq(catalogueCollectionProduct.collectionId, id));
      if (productIds.length) await tx.insert(catalogueCollectionProduct).values(productIds.map((product, sortOrder) => ({ collectionId: id, productId: product.id, sortOrder })));
    });
    publishCatalogue(context); return { saved: true, id, slug: input.slug };
  }),
  moderateCatalogueReview: editorProcedure.input(z.object({ id: z.string(), status: z.enum(["pending", "published", "rejected", "hidden", "removed"]), reply: z.string().trim().max(1500).default("") })).handler(async ({ context, input }) => {
    const [review] = await context.db.update(customerReview).set({ status: input.status, reply: input.reply, repliedAt: input.reply ? new Date() : null, updatedAt: new Date() }).where(and(eq(customerReview.id, input.id), ne(customerReview.status, "removed"))).returning();
    if (!review) throw new ORPCError("NOT_FOUND");
    publishCatalogue(context); return review;
  }),
};
