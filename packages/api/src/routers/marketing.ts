import { ORPCError } from "@orpc/server";
import { and, asc, count, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { catalogueCategory, catalogueProduct, catalogueProductMedia, catalogueProductVariant } from "@basny-web/db/schema/catalogue";
import { customerOrder } from "@basny-web/db/schema/customer";
import { marketingDiscountCode, marketingPromotion, marketingRedemption } from "@basny-web/db/schema/marketing";
import { staffRole } from "@basny-web/db/schema/staff";
import { protectedProcedure, publicProcedure } from "../index";

const marketingStaff = protectedProcedure.use(async ({ context, next }) => {
  const [staff] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id)).limit(1);
  if (!staff || !["content_editor", "sales_order_admin", "super_admin"].includes(staff.role)) throw new ORPCError("FORBIDDEN");
  return next();
});
const id = z.string().min(1).max(100);
const couponDraft = z.object({ id: id.optional(), code: z.string().trim().regex(/^[A-Za-z0-9_-]{3,32}$/), kind: z.enum(["Percentage", "Fixed amount"]), value: z.number().int().positive().max(100000), scope: z.enum(["Storewide", "Category", "Products"]), categoryId: id.nullable().optional(), productSlugs: z.array(z.string().regex(/^[a-z0-9-]{2,100}$/)).max(200).default([]), startsAt: z.string().datetime(), endsAt: z.string().datetime(), minimumGhs: z.number().int().min(0).max(10000000), maximumDiscountGhs: z.number().int().min(0).nullable(), usageLimit: z.number().int().min(1).max(10000000), perCustomerLimit: z.number().int().min(1).max(10000000), active: z.boolean() }).superRefine((value, ctx) => {
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) ctx.addIssue({ code: "custom", message: "End time must be after start time." });
  if (value.kind === "Percentage" && (value.value > 100 || !value.maximumDiscountGhs)) ctx.addIssue({ code: "custom", message: "Percentage discounts need a maximum discount and cannot exceed 100%." });
  if (value.perCustomerLimit > value.usageLimit) ctx.addIssue({ code: "custom", message: "Per-customer limit cannot exceed the total limit." });
  if (value.scope === "Category" && !value.categoryId) ctx.addIssue({ code: "custom", message: "Choose a category." });
  if (value.scope === "Products" && !value.productSlugs.length) ctx.addIssue({ code: "custom", message: "Choose at least one product." });
});
const promoDraft = z.object({ id: id.optional(), name: z.string().trim().min(2).max(120), kind: z.enum(["Scheduled sale", "Flash sale"]), discountPercent: z.number().int().min(1).max(90), scope: z.enum(["Category", "Products"]), categoryId: id.nullable().optional(), productSlugs: z.array(z.string().regex(/^[a-z0-9-]{2,100}$/)).max(200).default([]), startsAt: z.string().datetime(), endsAt: z.string().datetime(), status: z.enum(["Scheduled", "Active", "Paused"]) }).superRefine((value, ctx) => {
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) ctx.addIssue({ code: "custom", message: "End time must be after start time." });
  if (value.scope === "Category" && !value.categoryId) ctx.addIssue({ code: "custom", message: "Choose a category." });
  if (value.scope === "Products" && !value.productSlugs.length) ctx.addIssue({ code: "custom", message: "Choose at least one product." });
});
const cartLine = z.object({ productSlug: z.string().regex(/^[a-z0-9-]{2,100}$/), size: z.string().max(30).nullable(), colour: z.string().trim().min(1).max(40), quantity: z.number().int().min(1).max(99) });
export const customerKey = (value: string) => value.trim().toLowerCase();

export async function activeMarketingPromotions(db: any) {
  const now = new Date();
  return db.select().from(marketingPromotion).where(and(inArray(marketingPromotion.status, ["active", "scheduled"]), lte(marketingPromotion.startsAt, now), gte(marketingPromotion.endsAt, now)));
}

export function promotionPrice(priceGhs: number, productSlug: string, categoryId: string, promotions: any[]) {
  const percentage = promotions.reduce((best: number, promo: any) => {
    const targets = promo.target as { categoryId?: string; productSlugs?: string[] };
    const matches = promo.scope === "category" ? targets.categoryId === categoryId : targets.productSlugs?.includes(productSlug);
    return matches ? Math.max(best, promo.discountPercent) : best;
  }, 0);
  const salePriceGhs = percentage ? Math.max(1, Math.floor(priceGhs * (100 - percentage) / 100)) : priceGhs;
  return { salePriceGhs, promotionDiscountGhs: priceGhs - salePriceGhs, promotionPercent: percentage };
}

export async function resolveMarketingLines(db: any, lines: z.infer<typeof cartLine>[]) {
  const promotions = await activeMarketingPromotions(db);
  return Promise.all(lines.map(async (line) => {
    const [row] = await db.select({ productId: catalogueProduct.id, slug: catalogueProduct.slug, name: catalogueProduct.name, categoryId: catalogueProduct.categoryId, status: catalogueProduct.status, categoryActive: catalogueCategory.active, variantId: catalogueProductVariant.id, colour: catalogueProductVariant.colour, size: catalogueProductVariant.size, priceGhs: catalogueProductVariant.priceGhs, stock: sql<number>`${catalogueProductVariant.stock} - ${catalogueProductVariant.reservedStock}`, active: catalogueProductVariant.active, image: catalogueProductMedia.url })
      .from(catalogueProduct).innerJoin(catalogueCategory, eq(catalogueCategory.id, catalogueProduct.categoryId))
      .innerJoin(catalogueProductVariant, and(eq(catalogueProductVariant.productId, catalogueProduct.id), eq(catalogueProductVariant.colour, line.colour), line.size === null ? isNull(catalogueProductVariant.size) : eq(catalogueProductVariant.size, line.size)))
      .leftJoin(catalogueProductMedia, and(eq(catalogueProductMedia.productId, catalogueProduct.id), eq(catalogueProductMedia.sortOrder, 0))).where(eq(catalogueProduct.slug, line.productSlug)).limit(1);
    if (!row || row.status !== "published" || !row.categoryActive || !row.active || row.stock < line.quantity) throw new ORPCError("BAD_REQUEST", { message: "A selected product option is no longer available in the requested quantity." });
    const sale = promotionPrice(row.priceGhs, row.slug, row.categoryId, promotions);
    return { ...line, productId: row.productId, categoryId: row.categoryId, variantId: row.variantId, name: row.name, image: row.image ?? "/images/product-placeholder.svg", unitPriceGhs: row.priceGhs, salePriceGhs: sale.salePriceGhs, promotionPercent: sale.promotionPercent };
  }));
}

export async function calculateMarketingCoupon(db: any, codeValue: string, lines: Awaited<ReturnType<typeof resolveMarketingLines>>, identity: string, lock = false) {
  const now = new Date();
  const query = db.select().from(marketingDiscountCode).where(eq(marketingDiscountCode.code, codeValue.trim().toUpperCase()));
  const [code] = await (lock ? query.for("update") : query).limit(1);
  if (!code || !code.active || now < code.startsAt || now >= code.endsAt) throw new ORPCError("BAD_REQUEST", { message: "This coupon is not active." });
  let eligibleLines = lines;
  if (code.scope === "category") eligibleLines = lines.filter((line: any) => line.categoryId === code.target.categoryId);
  if (code.scope === "products") eligibleLines = lines.filter((line: any) => code.target.productSlugs.includes(line.productSlug));
  const eligibleSubtotal = eligibleLines.reduce((sum: number, line: any) => sum + line.salePriceGhs * line.quantity, 0);
  if (!eligibleSubtotal || eligibleSubtotal < code.minimumGhs) throw new ORPCError("BAD_REQUEST", { message: "Your eligible items do not meet this coupon’s minimum spend." });
  const [[allUses], [customerUses]] = await Promise.all([
    db.select({ value: count() }).from(marketingRedemption).where(and(eq(marketingRedemption.discountCodeId, code.id), inArray(marketingRedemption.status, ["reserved", "redeemed"]))),
    identity ? db.select({ value: count() }).from(marketingRedemption).where(and(eq(marketingRedemption.discountCodeId, code.id), eq(marketingRedemption.customerKey, customerKey(identity)), inArray(marketingRedemption.status, ["reserved", "redeemed"]))) : Promise.resolve([{ value: 0 }]),
  ]);
  if (allUses.value >= code.usageLimit) throw new ORPCError("BAD_REQUEST", { message: "This coupon has reached its use limit." });
  if (identity && customerUses.value >= code.perCustomerLimit) throw new ORPCError("BAD_REQUEST", { message: "You have already used this coupon the maximum number of times." });
  if (!identity && code.perCustomerLimit < 10000000) throw new ORPCError("BAD_REQUEST", { message: "Enter the customer’s email address or phone number to use this coupon." });
  const raw = code.kind === "percentage" ? Math.floor(eligibleSubtotal * code.value / 100) : Math.min(eligibleSubtotal, code.value);
  const discountGhs = Math.min(eligibleSubtotal, code.maximumDiscountGhs ?? raw, raw);
  const subtotalGhs = lines.reduce((sum: number, line: any) => sum + line.unitPriceGhs * line.quantity, 0);
  const promotionDiscountGhs = lines.reduce((sum: number, line: any) => sum + (line.unitPriceGhs - line.salePriceGhs) * line.quantity, 0);
  return { code: code.code, discountGhs, eligibleSubtotalGhs: eligibleSubtotal, subtotalGhs, promotionDiscountGhs, kind: code.kind, value: code.value };
}

function publishMarketing(context: { publishStaffEvent: (name: string, data: Record<string, unknown>) => Promise<void>; publishPublicCatalogueEvent: (name: string, data: Record<string, unknown>) => Promise<void>; revalidatePublicCatalogue: () => Promise<void> }, publicPriceChange = false) {
  const at = new Date().toISOString();
  void Promise.allSettled([context.publishStaffEvent("marketing.changed", { at }), ...(publicPriceChange ? [context.publishPublicCatalogueEvent("catalogue.changed", { at }), context.revalidatePublicCatalogue()] : [])]);
}

export const marketingProcedures = {
  listMarketing: marketingStaff.handler(async ({ context }) => {
    const [codes, promotions, categories, products] = await Promise.all([
      context.db.select().from(marketingDiscountCode).orderBy(asc(marketingDiscountCode.code)),
      context.db.select().from(marketingPromotion).orderBy(asc(marketingPromotion.startsAt)),
      context.db.select({ id: catalogueCategory.id, name: catalogueCategory.name, slug: catalogueCategory.slug, active: catalogueCategory.active }).from(catalogueCategory).orderBy(asc(catalogueCategory.sortOrder)),
      context.db.select({ slug: catalogueProduct.slug, name: catalogueProduct.name, status: catalogueProduct.status }).from(catalogueProduct).orderBy(asc(catalogueProduct.name)),
    ]);
    const redemptionCounts = codes.length ? await context.db.select({ discountCodeId: marketingRedemption.discountCodeId, used: count() }).from(marketingRedemption).where(and(inArray(marketingRedemption.discountCodeId, codes.map((item) => item.id)), inArray(marketingRedemption.status, ["redeemed", "reserved"]))).groupBy(marketingRedemption.discountCodeId) : [];
    return { codes: codes.map((item) => ({ ...item, used: redemptionCounts.find((usage: { discountCodeId: string; used: number }) => usage.discountCodeId === item.id)?.used ?? 0 })), promotions, categories, products };
  }),
  saveDiscountCode: marketingStaff.input(couponDraft).handler(async ({ context, input }) => {
    const category = input.scope === "Category" ? await context.db.select({ id: catalogueCategory.id }).from(catalogueCategory).where(and(eq(catalogueCategory.id, input.categoryId!), eq(catalogueCategory.active, true))).limit(1) : [];
    if (input.scope === "Category" && !category.length) throw new ORPCError("BAD_REQUEST", { message: "Choose an active category." });
    if (input.scope === "Products") {
      const selected = await context.db.select({ slug: catalogueProduct.slug }).from(catalogueProduct).where(and(inArray(catalogueProduct.slug, input.productSlugs), eq(catalogueProduct.status, "published")));
      if (selected.length !== input.productSlugs.length) throw new ORPCError("BAD_REQUEST", { message: "Every selected product must be published." });
    }
    const now = new Date(); const normalizedCode = input.code.toUpperCase(); const target = input.scope === "Category" ? { categoryId: input.categoryId! } : { productSlugs: input.scope === "Products" ? input.productSlugs : [] };
    const values = { code: normalizedCode, kind: input.kind === "Percentage" ? "percentage" as const : "fixed" as const, value: input.value, scope: input.scope === "Storewide" ? "storewide" as const : input.scope === "Category" ? "category" as const : "products" as const, target, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), minimumGhs: input.minimumGhs, maximumDiscountGhs: input.maximumDiscountGhs, usageLimit: input.usageLimit, perCustomerLimit: input.perCustomerLimit, active: input.active, updatedBy: context.session.user.id, updatedAt: now };
    const saved = await context.db.transaction(async (tx) => {
      if (input.id) {
        const [existing] = await tx.select().from(marketingDiscountCode).where(eq(marketingDiscountCode.id, input.id)).for("update").limit(1);
        if (!existing) throw new ORPCError("NOT_FOUND");
        const [usage] = await tx.select({ value: count() }).from(marketingRedemption).where(and(eq(marketingRedemption.discountCodeId, input.id), inArray(marketingRedemption.status, ["reserved", "redeemed"])));
        if (input.usageLimit < (usage?.value ?? 0)) throw new ORPCError("BAD_REQUEST", { message: "The total use limit cannot be lower than existing redemptions." });
        const [updated] = await tx.update(marketingDiscountCode).set(values).where(eq(marketingDiscountCode.id, input.id)).returning(); return updated;
      }
      const [created] = await tx.insert(marketingDiscountCode).values({ ...values, id: crypto.randomUUID(), createdBy: context.session.user.id }).returning(); return created;
    });
    publishMarketing(context); return { ...saved, used: 0 };
  }),
  savePromotion: marketingStaff.input(promoDraft).handler(async ({ context, input }) => {
    const category = input.scope === "Category" ? await context.db.select({ id: catalogueCategory.id }).from(catalogueCategory).where(and(eq(catalogueCategory.id, input.categoryId!), eq(catalogueCategory.active, true))).limit(1) : [];
    if (input.scope === "Category" && !category.length) throw new ORPCError("BAD_REQUEST", { message: "Choose an active category." });
    if (input.scope === "Products") {
      const selected = await context.db.select({ slug: catalogueProduct.slug }).from(catalogueProduct).where(and(inArray(catalogueProduct.slug, input.productSlugs), eq(catalogueProduct.status, "published")));
      if (selected.length !== input.productSlugs.length) throw new ORPCError("BAD_REQUEST", { message: "Every selected product must be published." });
    }
    const values = { name: input.name, kind: input.kind === "Flash sale" ? "flash_sale" as const : "scheduled_sale" as const, discountPercent: input.discountPercent, scope: input.scope === "Category" ? "category" as const : "products" as const, target: input.scope === "Category" ? { categoryId: input.categoryId! } : { productSlugs: input.productSlugs }, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), status: input.status.toLowerCase() as "scheduled" | "active" | "paused", updatedBy: context.session.user.id, updatedAt: new Date() };
    const [saved] = input.id ? await context.db.update(marketingPromotion).set(values).where(eq(marketingPromotion.id, input.id)).returning() : await context.db.insert(marketingPromotion).values({ ...values, id: crypto.randomUUID(), createdBy: context.session.user.id }).returning();
    if (!saved) throw new ORPCError("NOT_FOUND"); publishMarketing(context, true); return saved;
  }),
  setPromotionStatus: marketingStaff.input(z.object({ id, status: z.enum(["scheduled", "active", "paused"]) })).handler(async ({ context, input }) => {
    const [saved] = await context.db.update(marketingPromotion).set({ status: input.status, updatedBy: context.session.user.id, updatedAt: new Date() }).where(eq(marketingPromotion.id, input.id)).returning();
    if (!saved) throw new ORPCError("NOT_FOUND"); publishMarketing(context, true); return saved;
  }),
  validateDiscountCode: publicProcedure.input(z.object({ code: z.string().trim().min(3).max(32), identity: z.string().trim().max(254).optional(), lines: z.array(cartLine).min(1).max(100) })).handler(async ({ context, input }) => {
    const lines = await resolveMarketingLines(context.db, input.lines); return calculateMarketingCoupon(context.db, input.code, lines, input.identity ?? "");
  }),
  priceCheckout: publicProcedure.input(z.object({ lines: z.array(cartLine).min(1).max(100), identity: z.string().trim().max(254).optional(), couponCode: z.string().trim().max(32).optional() })).handler(async ({ context, input }) => {
    const lines = await resolveMarketingLines(context.db, input.lines);
    const subtotalGhs = lines.reduce((sum, line) => sum + line.unitPriceGhs * line.quantity, 0);
    const promotionDiscountGhs = lines.reduce((sum, line) => sum + (line.unitPriceGhs - line.salePriceGhs) * line.quantity, 0);
    const coupon = input.couponCode ? await calculateMarketingCoupon(context.db, input.couponCode, lines, input.identity ?? "") : null;
    return { subtotalGhs, promotionDiscountGhs, discountGhs: coupon?.discountGhs ?? 0, discountCode: coupon?.code ?? null, totalGhs: subtotalGhs - promotionDiscountGhs - (coupon?.discountGhs ?? 0), lines: lines.map((line) => ({ productSlug: line.productSlug, colour: line.colour, size: line.size, quantity: line.quantity, name: line.name, image: line.image, unitPriceGhs: line.unitPriceGhs, salePriceGhs: line.salePriceGhs })) };
  }),
  createPosSale: marketingStaff.input(z.object({ reference: z.string().regex(/^POS-[A-F0-9]{8}$/), customerName: z.string().trim().min(2).max(100).default("Walk-in customer"), customerEmail: z.email().optional(), customerPhone: z.string().trim().min(7).max(25).optional(), paymentMethod: z.enum(["Cash", "Mobile Money", "Card", "Bank transfer"]), couponCode: z.string().trim().max(32).optional(), lines: z.array(cartLine).min(1).max(100) })).handler(async ({ context, input }) => {
    const result = await context.db.transaction(async (tx) => {
      const lines = await resolveMarketingLines(tx, input.lines); const subtotalGhs = lines.reduce((sum: number, line: any) => sum + line.unitPriceGhs * line.quantity, 0); const promotionDiscountGhs = lines.reduce((sum: number, line: any) => sum + (line.unitPriceGhs - line.salePriceGhs) * line.quantity, 0);
      const id = crypto.randomUUID(); const identity = input.customerEmail ?? input.customerPhone ?? "";
      const coupon = input.couponCode ? await calculateMarketingCoupon(tx, input.couponCode, lines, identity, true) : null;
      const discountGhs = coupon?.discountGhs ?? 0; const reference = input.reference; const totalGhs = subtotalGhs - promotionDiscountGhs - discountGhs;
      const [order] = await tx.insert(customerOrder).values({ id, reference, customerName: input.customerName, customerEmail: input.customerEmail?.toLowerCase() ?? "walk-in@pos.basny.invalid", customerPhone: input.customerPhone ?? "N/A", fulfillment: "pickup", deliveryArea: "accra", region: "Greater Accra", town: "Accra store", address: "In-store sale", deliveryNote: "", lines: lines.map(({ productId: _productId, categoryId: _categoryId, variantId: _variantId, salePriceGhs, promotionPercent: _promotionPercent, ...line }: any) => ({ ...line, unitPriceGhs: salePriceGhs })), subtotalGhs, promotionDiscountGhs, discountGhs, discountCode: coupon?.code ?? null, deliveryGhs: 0, totalGhs, paymentMethod: input.paymentMethod, salesChannel: "pos", paymentStatus: "paid", status: "confirmed" }).onConflictDoNothing({ target: customerOrder.reference }).returning({ id: customerOrder.id, reference: customerOrder.reference, createdAt: customerOrder.createdAt });
      if (!order) throw new ORPCError("CONFLICT", { message: "This register receipt was already recorded. Refresh the register before retrying." });
      for (const line of lines as any[]) {
        const [updated] = await tx.update(catalogueProductVariant).set({ stock: sql`${catalogueProductVariant.stock} - ${line.quantity}`, updatedAt: new Date() }).where(and(eq(catalogueProductVariant.id, line.variantId), gte(sql`${catalogueProductVariant.stock} - ${catalogueProductVariant.reservedStock}`, line.quantity))).returning({ id: catalogueProductVariant.id });
        if (!updated) throw new ORPCError("CONFLICT", { message: `Stock changed while completing ${line.name}. Review the cart and retry.` });
      }
      if (coupon) await tx.insert(marketingRedemption).values({ id: crypto.randomUUID(), discountCodeId: (await tx.select({ id: marketingDiscountCode.id }).from(marketingDiscountCode).where(eq(marketingDiscountCode.code, coupon.code)).limit(1))[0]!.id, orderId: order.id, customerKey: customerKey(identity), discountGhs, status: "redeemed", redeemedAt: new Date() });
      return { ...order, customerName: input.customerName, customerEmail: input.customerEmail ?? "", customerPhone: input.customerPhone ?? "", lines: lines.map(({ productId: _productId, categoryId: _categoryId, variantId: _variantId, salePriceGhs: _salePriceGhs, promotionPercent: _promotionPercent, ...line }: any) => line), subtotalGhs, promotionDiscountGhs, discountGhs, discountCode: coupon?.code ?? null, totalGhs, paymentMethod: input.paymentMethod, paymentStatus: "paid" as const, status: "confirmed" as const };
    });
    publishMarketing(context); void context.publishStaffEvent("inventory.changed", { at: new Date().toISOString() }).catch(() => undefined); void context.publishPublicCatalogueEvent("catalogue.changed", { at: new Date().toISOString() }).catch(() => undefined); void context.revalidatePublicCatalogue().catch(() => undefined); void context.publishStaffEvent("order.created", { reference: result.reference, totalGhs: result.totalGhs, currency: "GHS" }).catch(() => undefined); return result;
  }),
};
