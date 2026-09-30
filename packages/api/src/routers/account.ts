import { ORPCError } from "@orpc/server";
import type { Database } from "@basny-web/db";
import { user } from "@basny-web/db/schema/auth";
import { customerAddress, customerCart, customerOrder, customerReturn, customerReview, customerWishlist, inventoryReservation, paymentSettings, paymentTransaction, restockSubscription } from "@basny-web/db/schema/customer";
import { staffRole } from "@basny-web/db/schema/staff";
import { catalogueCategory, catalogueProduct, catalogueProductMedia, catalogueProductVariant } from "@basny-web/db/schema/catalogue";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import { encryptPaystackSecret, getPaystackCredentials, verifyPaystackTransaction } from "../paystack";
import { marketingDiscountCode, marketingRedemption } from "@basny-web/db/schema/marketing";
import { calculateMarketingCoupon, customerKey, resolveMarketingLines } from "./marketing";
import { readPublicDeliverySettings } from "./admin";
import { sendConfiguredNotification, sendCustomerOrderEmail } from "../notifications";
import { deliverRestockAlerts, hashRestockToken, queueAvailableRestockAlerts, sendRestockConfirmation } from "../restock";

const verifiedProcedure = protectedProcedure.use(async ({ context, next }) => {
  if (!context.session.user.emailVerified) throw new ORPCError("FORBIDDEN", { message: "Verify your email to use account features." });
  return next();
});

const addressInput = z.object({
  id: z.string().optional(), label: z.string().trim().min(2).max(30), fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(25), region: z.string().trim().min(2).max(80), town: z.string().trim().min(2).max(80),
  neighbourhood: z.string().trim().min(2).max(80), streetAddress: z.string().trim().min(4).max(180), deliveryNote: z.string().trim().max(300).default(""), isDefault: z.boolean().default(false),
});

const cartLineInput = z.object({ productSlug: z.string().regex(/^[a-z0-9-]{2,100}$/), size: z.string().max(30).nullable(), colour: z.string().trim().min(1).max(40), quantity: z.number().int().min(1).max(99) });
const cartTokenInput = z.string().regex(/^[a-f0-9]{64}$/);

async function resolveCartLines(db: Database, lines: z.infer<typeof cartLineInput>[]) {
  const records = await db.select({ name: catalogueProduct.name, productSlug: catalogueProduct.slug, status: catalogueProduct.status, categoryActive: catalogueCategory.active, colour: catalogueProductVariant.colour, size: catalogueProductVariant.size, priceGhs: catalogueProductVariant.priceGhs, stock: sql<number>`${catalogueProductVariant.stock} - ${catalogueProductVariant.reservedStock}`, variantActive: catalogueProductVariant.active, image: catalogueProductMedia.url }).from(catalogueProduct)
      .innerJoin(catalogueCategory, eq(catalogueCategory.id, catalogueProduct.categoryId))
      .innerJoin(catalogueProductVariant, eq(catalogueProductVariant.productId, catalogueProduct.id))
      .leftJoin(catalogueProductMedia, and(eq(catalogueProductMedia.productId, catalogueProduct.id), eq(catalogueProductMedia.sortOrder, 0)))
      .where(inArray(catalogueProduct.slug, [...new Set(lines.map((line) => line.productSlug))]));
  return lines.map((line) => {
    const record = records.find((item) => item.productSlug === line.productSlug && item.colour === line.colour && item.size === line.size);
    if (!record || record.status !== "published" || !record.categoryActive || !record.variantActive || record.stock < line.quantity) throw new ORPCError("BAD_REQUEST", { message: "A selected product option is no longer available in the requested quantity." });
    return { ...line, name: record.name, image: record.image ?? "/images/product-placeholder.svg", unitPriceGhs: record.priceGhs };
  });
}

async function hashTrackingToken(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hashesMatch(presented: string, stored: string) {
  let difference = presented.length ^ stored.length;
  for (let index = 0; index < Math.max(presented.length, stored.length); index += 1) {
    difference |= (presented.charCodeAt(index) || 0) ^ (stored.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function ensureCheckoutReservation(db: Database, order: typeof customerOrder.$inferSelect) {
  if (order.salesChannel !== "online" || order.paymentStatus !== "pending") return;
  const now = new Date();
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(inventoryReservation).where(eq(inventoryReservation.orderId, order.id)).for("update");
    if (existing.length) {
      if (existing.some((reservation) => reservation.status !== "reserved" || reservation.expiresAt <= now)) throw new ORPCError("PRECONDITION_FAILED", { message: "Your stock hold has expired. Please return to your bag and place the order again." });
      return;
    }
    const resolved = await resolveMarketingLines(tx, order.lines.map((line) => ({ productSlug: line.productSlug, size: line.size, colour: line.colour, quantity: line.quantity })));
    const quantities = new Map<string, number>();
    for (const line of resolved) quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    for (const [variantId, quantity] of [...quantities].sort(([left], [right]) => left.localeCompare(right))) {
      const [reserved] = await tx.update(catalogueProductVariant).set({ reservedStock: sql`${catalogueProductVariant.reservedStock} + ${quantity}`, updatedAt: now }).where(and(eq(catalogueProductVariant.id, variantId), gte(sql`${catalogueProductVariant.stock} - ${catalogueProductVariant.reservedStock}`, quantity))).returning({ id: catalogueProductVariant.id });
      if (!reserved) throw new ORPCError("CONFLICT", { message: "Some items in this order are no longer available. Please contact BASNY before paying." });
      await tx.insert(inventoryReservation).values({ id: crypto.randomUUID(), orderId: order.id, variantId, quantity, status: "reserved", expiresAt });
    }
  });
}

const accountRouter = {
  requestRestockAlert: publicProcedure.input(z.object({ productSlug: z.string().regex(/^[a-z0-9-]{2,100}$/), colour: z.string().trim().min(1).max(40), size: z.string().trim().max(30).nullable(), email: z.email().max(254) })).handler(async ({ context, input }) => {
    const [variant] = await context.db.select({ id: catalogueProductVariant.id, name: catalogueProduct.name, slug: catalogueProduct.slug, colour: catalogueProductVariant.colour, size: catalogueProductVariant.size, available: sql<number>`${catalogueProductVariant.stock} - ${catalogueProductVariant.reservedStock}` })
      .from(catalogueProductVariant).innerJoin(catalogueProduct, eq(catalogueProduct.id, catalogueProductVariant.productId)).innerJoin(catalogueCategory, eq(catalogueCategory.id, catalogueProduct.categoryId))
      .where(and(eq(catalogueProduct.slug, input.productSlug), eq(catalogueProduct.status, "published"), eq(catalogueCategory.active, true), eq(catalogueProductVariant.active, true), eq(catalogueProductVariant.colour, input.colour), input.size === null ? isNull(catalogueProductVariant.size) : eq(catalogueProductVariant.size, input.size))).limit(1);
    if (!variant) throw new ORPCError("NOT_FOUND", { message: "This product option is no longer available." });
    if (variant.available > 0) return { alreadyAvailable: true, confirmationSent: false, alreadySubscribed: false };
    const email = input.email.trim().toLowerCase();
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const tokenHash = await hashRestockToken(token);
    const subscriptionId = crypto.randomUUID();
    const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    let [created] = await context.db.insert(restockSubscription).values({ id: subscriptionId, variantId: variant.id, email, tokenHash, status: "pending", confirmationExpiresAt }).onConflictDoNothing().returning({ id: restockSubscription.id });
    if (!created) {
      const [existing] = await context.db.select({ id: restockSubscription.id, status: restockSubscription.status, confirmationExpiresAt: restockSubscription.confirmationExpiresAt }).from(restockSubscription).where(and(eq(restockSubscription.variantId, variant.id), eq(restockSubscription.email, email))).limit(1);
      if (!existing) return { alreadyAvailable: false, confirmationSent: false, alreadySubscribed: false };
      if (["active", "queued", "sending"].includes(existing.status)) return { alreadyAvailable: false, confirmationSent: false, alreadySubscribed: true };
      if (existing.status === "pending" && existing.confirmationExpiresAt > new Date()) return { alreadyAvailable: false, confirmationSent: true, alreadySubscribed: false };
      const now = new Date();
      const [refreshed] = await context.db.update(restockSubscription).set({ tokenHash, status: "pending", confirmationExpiresAt, confirmedAt: null, notifiedAt: null, claimUntil: null, attempts: 0, nextAttemptAt: now, updatedAt: now }).where(and(eq(restockSubscription.id, existing.id), or(and(eq(restockSubscription.status, "pending"), lte(restockSubscription.confirmationExpiresAt, now)), inArray(restockSubscription.status, ["notified", "failed", "unsubscribed"])))).returning({ id: restockSubscription.id });
      created = refreshed;
      if (!created) return { alreadyAvailable: false, confirmationSent: false, alreadySubscribed: true };
    }
    const sent = await sendRestockConfirmation(context, email, variant, token);
    if (!sent) {
      await context.db.delete(restockSubscription).where(eq(restockSubscription.id, created.id));
      throw new ORPCError("SERVICE_UNAVAILABLE", { message: "We couldn’t send the confirmation email. Please try again shortly." });
    }
    return { alreadyAvailable: false, confirmationSent: true, alreadySubscribed: false };
  }),
  confirmRestockAlert: publicProcedure.input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) })).handler(async ({ context, input }) => {
    const tokenHash = await hashRestockToken(input.token);
    const now = new Date();
    const [subscription] = await context.db.update(restockSubscription).set({ status: "active", confirmedAt: now, updatedAt: now }).where(and(eq(restockSubscription.tokenHash, tokenHash), eq(restockSubscription.status, "pending"), gte(restockSubscription.confirmationExpiresAt, now))).returning({ id: restockSubscription.id, variantId: restockSubscription.variantId });
    if (!subscription) {
      const [existing] = await context.db.select({ status: restockSubscription.status }).from(restockSubscription).where(eq(restockSubscription.tokenHash, tokenHash)).limit(1);
      if (existing?.status === "queued" || existing?.status === "sending" || existing?.status === "notified") return { confirmed: true };
      throw new ORPCError("NOT_FOUND", { message: "This confirmation link is invalid or has already expired." });
    }
    await queueAvailableRestockAlerts(context, [subscription.variantId]);
    await deliverRestockAlerts(context);
    return { confirmed: true };
  }),
  saveCustomerCart: publicProcedure.input(z.object({
    token: cartTokenInput,
    lines: z.array(cartLineInput).max(20),
    contact: z.object({ name: z.string().trim().min(2).max(100), email: z.email().max(254), phone: z.string().trim().min(7).max(25) }).optional(),
  })).handler(async ({ context, input }) => {
    const tokenHash = await hashTrackingToken(input.token);
    if (!input.lines.length) {
      await context.db.delete(customerCart).where(and(eq(customerCart.tokenHash, tokenHash), eq(customerCart.status, "active")));
      void context.publishStaffEvent("cart.changed", { updatedAt: new Date().toISOString() }).catch(() => undefined);
      return { saved: true, empty: true };
    }
    const lines = await resolveCartLines(context.db, input.lines);
    const subtotalGhs = lines.reduce((sum, line) => sum + line.unitPriceGhs * line.quantity, 0);
    const now = new Date();
    await context.db.insert(customerCart).values({
      id: crypto.randomUUID(), tokenHash, userId: context.session?.user.emailVerified ? context.session.user.id : null,
      customerName: input.contact?.name ?? null, customerEmail: input.contact?.email.toLowerCase() ?? null, customerPhone: input.contact?.phone ?? null,
      lines, subtotalGhs, lastActiveAt: now, updatedAt: now,
    }).onConflictDoUpdate({ target: customerCart.tokenHash, set: {
      userId: context.session?.user.emailVerified ? context.session.user.id : undefined,
      customerName: input.contact?.name ?? undefined,
      customerEmail: input.contact?.email.toLowerCase() ?? undefined,
      customerPhone: input.contact?.phone ?? undefined,
      lines, subtotalGhs,
      status: sql`case when ${customerCart.status} = 'converted' then 'converted' else 'active' end`,
      lastActiveAt: now, updatedAt: now,
    } });
    void context.publishStaffEvent("cart.changed", { updatedAt: now.toISOString() }).catch(() => undefined);
    return { saved: true, empty: false };
  }),
  createCheckoutOrder: publicProcedure.input(z.object({
    reference: z.string().regex(/^BNY-[A-F0-9]{8}$/), trackingToken: z.string().regex(/^[a-f0-9]{64}$/),
    cartToken: cartTokenInput.optional(),
    name: z.string().trim().min(2).max(100), email: z.email(), phone: z.string().trim().min(7).max(25),
    deliveryArea: z.enum(["accra", "outside-accra"]), region: z.string().trim().min(2).max(80), town: z.string().trim().min(2).max(100),
    address: z.string().trim().min(4).max(180), note: z.string().trim().max(300).default(""),
    couponCode: z.string().trim().max(32).optional(),
    lines: z.array(z.object({ productSlug: z.string().min(2), size: z.string().nullable(), colour: z.string().min(1).max(40), quantity: z.number().int().min(1).max(99) })).min(1).max(20),
  })).handler(async ({ context, input }) => {
    const resolvedLines = await resolveMarketingLines(context.db, input.lines);
    const lines = resolvedLines.map(({ productId: _productId, categoryId: _categoryId, variantId: _variantId, salePriceGhs, promotionPercent: _promotionPercent, ...line }) => ({ ...line, unitPriceGhs: salePriceGhs }));
    const subtotalGhs = resolvedLines.reduce((sum, line) => sum + line.unitPriceGhs * line.quantity, 0);
    const promotionDiscountGhs = resolvedLines.reduce((sum, line) => sum + (line.unitPriceGhs - line.salePriceGhs) * line.quantity, 0);
    const userId = context.session?.user.emailVerified ? context.session.user.id : null;
    const cartTokenHash = input.cartToken ? await hashTrackingToken(input.cartToken) : null;
    const [cart] = cartTokenHash ? await context.db.select({ id: customerCart.id, status: customerCart.status }).from(customerCart).where(eq(customerCart.tokenHash, cartTokenHash)).limit(1) : [];
    const id = crypto.randomUUID();
    const { reference, trackingToken } = input;
    const trackingTokenHash = await hashTrackingToken(trackingToken);
    const [existingOrder] = await context.db.select({ id: customerOrder.id, reference: customerOrder.reference, status: customerOrder.status, paymentStatus: customerOrder.paymentStatus, trackingTokenHash: customerOrder.trackingTokenHash, subtotalGhs: customerOrder.subtotalGhs, promotionDiscountGhs: customerOrder.promotionDiscountGhs, discountGhs: customerOrder.discountGhs, discountCode: customerOrder.discountCode, deliveryGhs: customerOrder.deliveryGhs, totalGhs: customerOrder.totalGhs }).from(customerOrder).where(eq(customerOrder.reference, reference)).limit(1);
    if (existingOrder) {
      if (!existingOrder.trackingTokenHash || !hashesMatch(trackingTokenHash, existingOrder.trackingTokenHash)) throw new ORPCError("CONFLICT", { message: "This order reference is already in use. Return to your bag and start checkout again." });
      return { ...existingOrder, trackingToken };
    }
    const publicSettings = await readPublicDeliverySettings(context.db);
    const group = input.deliveryArea === "accra" ? "Accra" : "Outside Accra";
    const location = input.deliveryArea === "accra" ? input.town : input.region;
    const matchingZone = publicSettings.deliveryZones.find((zone) => zone.group === group && (zone.name.toLowerCase() === location.toLowerCase() || zone.area.toLowerCase() === location.toLowerCase()));
    const groupDefaultZone = publicSettings.deliveryZones.find((zone) => zone.group === group);
    const deliveryZone = matchingZone ?? (input.deliveryArea === "accra" ? groupDefaultZone : undefined);
    if (!deliveryZone) throw new ORPCError("BAD_REQUEST", { message: "This delivery area is not currently available. Choose an active region or contact BASNY for help." });
    const freeDeliveryThreshold = publicSettings.store.freeDeliveryThresholdGhs;
    const deliveryGhs = freeDeliveryThreshold > 0 && subtotalGhs >= freeDeliveryThreshold ? 0 : deliveryZone.feeGhs;
    const order = await context.db.transaction(async (tx) => {
      const coupon = input.couponCode ? await calculateMarketingCoupon(tx, input.couponCode, resolvedLines, input.email, true) : null;
      const discountGhs = coupon?.discountGhs ?? 0;
      const [created] = await tx.insert(customerOrder).values({
        id, reference, trackingTokenHash, userId, cartId: cart?.id ?? null, customerName: input.name, customerEmail: input.email.toLowerCase(), customerPhone: input.phone,
        fulfillment: "delivery", deliveryArea: input.deliveryArea, region: input.region, town: input.town, address: input.address, deliveryNote: input.note,
        lines, subtotalGhs, promotionDiscountGhs, discountGhs, discountCode: coupon?.code ?? null, deliveryGhs, totalGhs: subtotalGhs - promotionDiscountGhs - discountGhs + deliveryGhs, status: "pending_payment", paymentStatus: "pending",
      }).onConflictDoNothing({ target: customerOrder.reference }).returning({ id: customerOrder.id, reference: customerOrder.reference, status: customerOrder.status, paymentStatus: customerOrder.paymentStatus, subtotalGhs: customerOrder.subtotalGhs, promotionDiscountGhs: customerOrder.promotionDiscountGhs, discountGhs: customerOrder.discountGhs, discountCode: customerOrder.discountCode, deliveryGhs: customerOrder.deliveryGhs, totalGhs: customerOrder.totalGhs });
      if (created) {
        const quantities = new Map<string, number>();
        for (const line of resolvedLines) quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        for (const [variantId, quantity] of [...quantities].sort(([left], [right]) => left.localeCompare(right))) {
          const [reserved] = await tx.update(catalogueProductVariant).set({ reservedStock: sql`${catalogueProductVariant.reservedStock} + ${quantity}`, updatedAt: new Date() }).where(and(eq(catalogueProductVariant.id, variantId), gte(sql`${catalogueProductVariant.stock} - ${catalogueProductVariant.reservedStock}`, quantity))).returning({ id: catalogueProductVariant.id });
          if (!reserved) throw new ORPCError("CONFLICT", { message: "Stock changed while placing your order. Review your bag and try again." });
          await tx.insert(inventoryReservation).values({ id: crypto.randomUUID(), orderId: created.id, variantId, quantity, status: "reserved", expiresAt });
        }
      }
      if (created && coupon) {
        const [code] = await tx.select({ id: marketingDiscountCode.id }).from(marketingDiscountCode).where(eq(marketingDiscountCode.code, coupon.code)).limit(1);
        if (!code) throw new ORPCError("BAD_REQUEST", { message: "This coupon is no longer available." });
        await tx.insert(marketingRedemption).values({ id: crypto.randomUUID(), discountCodeId: code.id, orderId: created.id, customerKey: customerKey(input.email), discountGhs, status: "reserved" });
      }
      if (created && cart) await tx.update(customerCart).set({ status: "converted", updatedAt: new Date() }).where(eq(customerCart.id, cart.id));
      return created;
    });
    if (!order) {
      const [existing] = await context.db.select({ id: customerOrder.id, reference: customerOrder.reference, status: customerOrder.status, paymentStatus: customerOrder.paymentStatus, trackingTokenHash: customerOrder.trackingTokenHash, subtotalGhs: customerOrder.subtotalGhs, promotionDiscountGhs: customerOrder.promotionDiscountGhs, discountGhs: customerOrder.discountGhs, discountCode: customerOrder.discountCode, deliveryGhs: customerOrder.deliveryGhs, totalGhs: customerOrder.totalGhs }).from(customerOrder).where(eq(customerOrder.reference, reference)).limit(1);
      if (!existing || !existing.trackingTokenHash || !hashesMatch(trackingTokenHash, existing.trackingTokenHash)) throw new ORPCError("CONFLICT", { message: "This order reference is already in use. Return to your bag and start checkout again." });
      if (cart && cart.status !== "converted") await context.db.update(customerCart).set({ status: "converted", updatedAt: new Date() }).where(eq(customerCart.id, cart.id));
      return { id: existing.id, reference: existing.reference, status: existing.status, paymentStatus: existing.paymentStatus, subtotalGhs: existing.subtotalGhs, promotionDiscountGhs: existing.promotionDiscountGhs, discountGhs: existing.discountGhs, discountCode: existing.discountCode, deliveryGhs: existing.deliveryGhs, totalGhs: existing.totalGhs, trackingToken };
    }
    if (cart) void context.publishStaffEvent("cart.changed", { updatedAt: new Date().toISOString() }).catch(() => undefined);
    void context.publishPublicCatalogueEvent("catalogue.changed", { at: new Date().toISOString() }).catch(() => undefined);
    void sendConfiguredNotification(context, { event: "order-received", recipient: "team", subject: `New BASNY order ${order.reference}`, lines: [`Order: ${order.reference}`, `Customer: ${input.name}`, `Email: ${input.email}`, `Total: GHS ${order.totalGhs.toFixed(2)}`] });
    await sendCustomerOrderEmail(context, {
      event: "customer-order-placed", name: input.name, email: input.email.toLowerCase(), reference: order.reference,
      status: order.status, paymentStatus: order.paymentStatus, paymentMethod: null, fulfillment: "delivery",
      address: input.address, town: input.town, region: input.region, note: input.note, lines,
      subtotalGhs, promotionDiscountGhs, discountGhs: order.discountGhs, discountCode: order.discountCode,
      deliveryGhs, totalGhs: order.totalGhs, trackingToken,
    });
    await context.publishStaffEvent("order.created", { reference, totalGhs: order.totalGhs, currency: "GHS" });
      await context.publishOrderEvent(reference, "order.created", { reference, status: order.status });
    if (userId) await context.publishAccountEvent(userId, "order.created", { reference, status: order.status });
    return { ...order, trackingToken, promotionDiscountGhs, discountGhs: order.discountGhs, discountCode: order.discountCode, totalGhs: subtotalGhs - promotionDiscountGhs - order.discountGhs + deliveryGhs };
  }),
  trackGuestOrder: publicProcedure.input(z.object({ reference: z.string().min(4).max(40), trackingToken: z.string().regex(/^[a-f0-9]{64}$/) })).handler(async ({ context, input }) => {
    const [order] = await context.db.select().from(customerOrder).where(eq(customerOrder.reference, input.reference)).limit(1);
    if (!order?.trackingTokenHash) throw new ORPCError("NOT_FOUND", { message: "We couldn’t find an order with those tracking details." });
    const presentedHash = await hashTrackingToken(input.trackingToken);
    if (!hashesMatch(presentedHash, order.trackingTokenHash)) throw new ORPCError("NOT_FOUND", { message: "We couldn’t find an order with those tracking details." });
    return {
      reference: order.reference, createdAt: order.createdAt, status: order.status, paymentStatus: order.paymentStatus,
      customerName: order.customerName, customerEmail: order.customerEmail, customerPhone: order.customerPhone,
      deliveryArea: order.deliveryArea, region: order.region, town: order.town, address: order.address, deliveryNote: order.deliveryNote,
      lines: order.lines, subtotalGhs: order.subtotalGhs, promotionDiscountGhs: order.promotionDiscountGhs, discountGhs: order.discountGhs, discountCode: order.discountCode, deliveryGhs: order.deliveryGhs, totalGhs: order.totalGhs,
    };
  }),
  accountProfile: verifiedProcedure.handler(({ context }) => ({
    id: context.session.user.id,
    name: context.session.user.name,
    email: context.session.user.email,
    phone: context.session.user.phone ?? "",
    emailVerified: context.session.user.emailVerified,
  })),
  accountAccess: verifiedProcedure.handler(async ({ context }) => {
    const [staff] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id));
    return { isStaff: Boolean(staff), role: staff?.role ?? null };
  }),
  updateAccountProfile: verifiedProcedure.input(z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().max(25) })).handler(async ({ context, input }) => {
    const [updated] = await context.db.update(user).set({ name: input.name, phone: input.phone || null, updatedAt: new Date() }).where(eq(user.id, context.session.user.id)).returning({ id: user.id, name: user.name, phone: user.phone });
    if (!updated) throw new ORPCError("NOT_FOUND");
    return updated;
  }),
  listAccountAddresses: verifiedProcedure.handler(({ context }) => context.db.select().from(customerAddress).where(eq(customerAddress.userId, context.session.user.id)).orderBy(desc(customerAddress.isDefault), desc(customerAddress.createdAt))),
  saveAccountAddress: verifiedProcedure.input(addressInput).handler(async ({ context, input }) => {
    const userId = context.session.user.id;
    if (input.isDefault) await context.db.update(customerAddress).set({ isDefault: false, updatedAt: new Date() }).where(eq(customerAddress.userId, userId));
    if (input.id) {
      const [updated] = await context.db.update(customerAddress).set({ ...input, updatedAt: new Date() }).where(and(eq(customerAddress.id, input.id), eq(customerAddress.userId, userId))).returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }
    const [created] = await context.db.insert(customerAddress).values({ ...input, id: crypto.randomUUID(), userId }).returning();
    return created;
  }),
  deleteAccountAddress: verifiedProcedure.input(z.object({ id: z.string() })).handler(async ({ context, input }) => {
    const deleted = await context.db.delete(customerAddress).where(and(eq(customerAddress.id, input.id), eq(customerAddress.userId, context.session.user.id))).returning({ id: customerAddress.id });
    if (!deleted.length) throw new ORPCError("NOT_FOUND");
    return { deleted: true };
  }),
  listAccountWishlist: verifiedProcedure.handler(({ context }) => context.db.select({ id: customerWishlist.id, productSlug: customerWishlist.productSlug, createdAt: customerWishlist.createdAt }).from(customerWishlist).where(eq(customerWishlist.userId, context.session.user.id)).orderBy(desc(customerWishlist.createdAt))),
  addAccountWishlistItem: verifiedProcedure.input(z.object({ productSlug: z.string().regex(/^[a-z0-9-]{2,100}$/) })).handler(async ({ context, input }) => {
    await context.db.insert(customerWishlist).values({ id: crypto.randomUUID(), userId: context.session.user.id, productSlug: input.productSlug }).onConflictDoNothing();
    await context.publishAccountEvent(context.session.user.id, "wishlist.updated", { productSlug: input.productSlug, saved: true });
    return { saved: true };
  }),
  removeAccountWishlistItem: verifiedProcedure.input(z.object({ productSlug: z.string() })).handler(async ({ context, input }) => {
    await context.db.delete(customerWishlist).where(and(eq(customerWishlist.userId, context.session.user.id), eq(customerWishlist.productSlug, input.productSlug)));
    await context.publishAccountEvent(context.session.user.id, "wishlist.updated", { productSlug: input.productSlug, saved: false });
    return { removed: true };
  }),
  listAccountOrders: verifiedProcedure.handler(async ({ context }) => {
    const actor = context.session.user;
    await context.db.update(customerOrder).set({ userId: actor.id, updatedAt: new Date() }).where(and(isNull(customerOrder.userId), sql`lower(${customerOrder.customerEmail}) = lower(${actor.email})`));
    return context.db.select().from(customerOrder).where(eq(customerOrder.userId, actor.id)).orderBy(desc(customerOrder.createdAt));
  }),
  getAccountOrder: verifiedProcedure.input(z.object({ reference: z.string().min(4) })).handler(async ({ context, input }) => {
    const [order] = await context.db.select().from(customerOrder).where(and(eq(customerOrder.reference, input.reference), eq(customerOrder.userId, context.session.user.id)));
    if (!order) throw new ORPCError("NOT_FOUND");
    return order;
  }),
  listAccountReturns: verifiedProcedure.handler(({ context }) => context.db.select().from(customerReturn).where(eq(customerReturn.userId, context.session.user.id)).orderBy(desc(customerReturn.createdAt))),
  requestAccountReturn: verifiedProcedure.input(z.object({ orderId: z.string(), reason: z.enum(["wrong_item", "damaged", "size_fit", "changed_mind", "other"]), details: z.string().trim().max(500).default("") })).handler(async ({ context, input }) => {
    const [order] = await context.db.select().from(customerOrder).where(and(eq(customerOrder.id, input.orderId), eq(customerOrder.userId, context.session.user.id)));
    if (!order || order.status !== "delivered" || !order.deliveredAt || Date.now() - order.deliveredAt.getTime() > 14 * 86400000) throw new ORPCError("BAD_REQUEST", { message: "This order is outside the 14-day return window or is not yet delivered." });
    const [already] = await context.db.select({ id: customerReturn.id }).from(customerReturn).where(and(eq(customerReturn.orderId, order.id), eq(customerReturn.userId, context.session.user.id)));
    if (already) throw new ORPCError("CONFLICT", { message: "A return request already exists for this order." });
    const id = crypto.randomUUID();
    const [created] = await context.db.insert(customerReturn).values({ id, reference: `BAS-R-${id.slice(0, 8).toUpperCase()}`, orderId: order.id, userId: context.session.user.id, reason: input.reason, details: input.details }).returning();
    if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "The return request could not be saved." });
    await context.publishAccountEvent(context.session.user.id, "return.created", { reference: created.reference, status: created.status });
    await context.publishStaffEvent("return.created", { reference: created.reference, orderReference: order.reference });
    void sendConfiguredNotification(context, { event: "return-request", recipient: "team", subject: `Return request ${created.reference}`, lines: [`Return: ${created.reference}`, `Order: ${order.reference}`, `Customer: ${order.customerName}`, `Reason: ${input.reason}`, `Details: ${input.details || "Not provided"}`] });
    return created;
  }),
  listEligibleReviews: verifiedProcedure.handler(async ({ context }) => {
    const orders = await context.db.select({ id: customerOrder.id, reference: customerOrder.reference, lines: customerOrder.lines }).from(customerOrder).where(and(eq(customerOrder.userId, context.session.user.id), eq(customerOrder.status, "delivered"))).orderBy(desc(customerOrder.createdAt));
    const existing = await context.db.select({ orderId: customerReview.orderId, productSlug: customerReview.productSlug, status: customerReview.status }).from(customerReview).where(eq(customerReview.userId, context.session.user.id));
    const submitted = new Set(existing.map((item) => `${item.orderId}:${item.productSlug}`));
    return orders.flatMap((order) => order.lines.filter((line) => line.productSlug && !submitted.has(`${order.id}:${line.productSlug}`)).map((line) => ({ orderId: order.id, reference: order.reference, productSlug: line.productSlug, productName: line.name, image: line.image })));
  }),
  submitAccountReview: verifiedProcedure.input(z.object({ orderId: z.string(), productSlug: z.string(), rating: z.number().int().min(1).max(5), title: z.string().trim().min(3).max(80), body: z.string().trim().min(10).max(1500) })).handler(async ({ context, input }) => {
    const [order] = await context.db.select().from(customerOrder).where(and(eq(customerOrder.id, input.orderId), eq(customerOrder.userId, context.session.user.id), eq(customerOrder.status, "delivered")));
    if (!order || !order.lines.some((line) => line.productSlug === input.productSlug)) throw new ORPCError("FORBIDDEN", { message: "Reviews are available for products from delivered orders." });
    const [review] = await context.db.insert(customerReview).values({ id: crypto.randomUUID(), userId: context.session.user.id, orderId: order.id, productSlug: input.productSlug, rating: input.rating, title: input.title, body: input.body }).returning();
    return review;
  }),
};

export const orderStatusValues = ["confirmed", "processing", "ready_for_delivery", "out_for_delivery", "delivered", "cancelled"] as const;
export const staffOrderProcedure = verifiedProcedure.use(async ({ context, next }) => {
  const [staff] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id));
  if (!staff || !["super_admin", "sales_order_admin"].includes(staff.role)) throw new ORPCError("FORBIDDEN");
  return next();
});

const superAdminProcedure = verifiedProcedure.use(async ({ context, next }) => {
  const [staff] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id));
  if (staff?.role !== "super_admin") throw new ORPCError("FORBIDDEN", { message: "Only a Super Administrator can manage payment credentials." });
  return next();
});

export const accountProcedures = {
  ...accountRouter,
  listAbandonedCarts: staffOrderProcedure.handler(async ({ context }) => {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const rows = await context.db.select({ cart: customerCart }).from(customerCart)
      .leftJoin(customerOrder, eq(customerOrder.cartId, customerCart.id))
      .where(and(lte(customerCart.lastActiveAt, cutoff), inArray(customerCart.status, ["active", "contacted"]), isNull(customerOrder.id)))
      .orderBy(desc(customerCart.lastActiveAt)).limit(500);
    return rows.map(({ cart }) => ({
      id: cart.id, customer: cart.customerName || "Guest shopper", email: cart.customerEmail ?? "", contact: cart.customerPhone || "No phone added",
      subtotalGhs: cart.subtotalGhs, status: cart.status === "contacted" ? "Contacted" : "Not contacted",
      lastActiveAt: cart.lastActiveAt.toISOString(), createdAt: cart.createdAt.toISOString(),
      itemCount: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
      items: cart.lines.map((line) => ({ ...line, variant: `${line.colour}${line.size ? ` · EU ${line.size}` : " · One size"}` })),
    }));
  }),
  updateAbandonedCartStatus: staffOrderProcedure.input(z.object({ cartId: z.string().uuid(), status: z.enum(["contacted", "recovered"]) })).handler(async ({ context, input }) => {
    const [updated] = await context.db.update(customerCart).set({ status: input.status, updatedAt: new Date() }).where(and(eq(customerCart.id, input.cartId), inArray(customerCart.status, ["active", "contacted"]))).returning({ id: customerCart.id });
    if (!updated) throw new ORPCError("NOT_FOUND", { message: "This cart is no longer available for follow-up." });
    void context.publishStaffEvent("cart.changed", { updatedAt: new Date().toISOString() }).catch(() => undefined);
    return { updated: true };
  }),
  getPaystackSettings: superAdminProcedure.handler(async ({ context }) => {
    const [stored] = await context.db.select({ publicKey: paymentSettings.publicKey, updatedAt: paymentSettings.updatedAt }).from(paymentSettings).where(eq(paymentSettings.provider, "paystack")).limit(1);
    const publicKey = stored?.publicKey ?? context.paystack.publicKey ?? "";
    const hasSecret = Boolean(stored || context.paystack.secretKey);
    return { publicKey, hasSecret, mode: publicKey.startsWith("pk_live_") ? "live" : publicKey.startsWith("pk_test_") ? "test" : "unconfigured", updatedAt: stored?.updatedAt?.toISOString() ?? null };
  }),
  savePaystackSettings: superAdminProcedure.input(z.object({ publicKey: z.string().trim().regex(/^pk_(test|live)_[A-Za-z0-9]+$/), secretKey: z.string().trim().regex(/^sk_(test|live)_[A-Za-z0-9]+$/) })).handler(async ({ context, input }) => {
    const mode = input.publicKey.startsWith("pk_live_") ? "live" : "test";
    if (!input.secretKey.startsWith(`sk_${mode}_`)) throw new ORPCError("BAD_REQUEST", { message: "The public and secret keys must both use the same Paystack mode." });
    if (!context.paystack.encryptionKey) throw new ORPCError("PRECONDITION_FAILED", { message: "The server needs PAYSTACK_CONFIG_ENCRYPTION_KEY before credentials can be safely saved from this page." });
    const encrypted = await encryptPaystackSecret(input.secretKey, context.paystack.encryptionKey);
    const values = { id: "paystack", provider: "paystack" as const, publicKey: input.publicKey, encryptedSecretKey: encrypted.ciphertext, encryptionIv: encrypted.iv, updatedBy: context.session.user.id, updatedAt: new Date() };
    await context.db.insert(paymentSettings).values(values).onConflictDoUpdate({ target: paymentSettings.provider, set: { ...values, id: "paystack", provider: "paystack" } });
    await context.publishStaffEvent("payment.settings.updated", { provider: "paystack", mode });
    return { saved: true, mode, hasSecret: true, publicKey: input.publicKey };
  }),
  initializeOrderPayment: publicProcedure.input(z.object({ reference: z.string().regex(/^BNY-[A-F0-9]{8}$/), trackingToken: z.string().regex(/^[a-f0-9]{64}$/) })).handler(async ({ context, input }) => {
    const [order] = await context.db.select().from(customerOrder).where(eq(customerOrder.reference, input.reference)).limit(1);
    if (!order?.trackingTokenHash || !hashesMatch(await hashTrackingToken(input.trackingToken), order.trackingTokenHash)) throw new ORPCError("NOT_FOUND", { message: "We couldn’t find this order." });
    if (order.paymentStatus === "paid") throw new ORPCError("CONFLICT", { message: "This order has already been paid." });
    if (order.status === "cancelled") throw new ORPCError("PRECONDITION_FAILED", { message: "This order has been cancelled." });
    await ensureCheckoutReservation(context.db, order);
    const recentAttempts = await context.db.select({ status: paymentTransaction.status, createdAt: paymentTransaction.createdAt }).from(paymentTransaction).where(and(eq(paymentTransaction.orderId, order.id), gte(paymentTransaction.createdAt, new Date(Date.now() - 60 * 60 * 1000)))).orderBy(desc(paymentTransaction.createdAt)).limit(5);
    if (recentAttempts.length >= 5) throw new ORPCError("TOO_MANY_REQUESTS", { message: "Too many payment attempts for this order. Please try again later or contact BASNY." });
    if (recentAttempts[0]?.status === "initialized" && Date.now() - recentAttempts[0].createdAt.getTime() < 45_000) throw new ORPCError("TOO_MANY_REQUESTS", { message: "A payment link was just created. Please wait a moment before retrying." });
    const credentials = await getPaystackCredentials(context);
    const reference = `${order.reference}-${crypto.randomUUID().slice(0, 8)}`;
    const amountSubunits = order.totalGhs * 100;
    const [transaction] = await context.db.insert(paymentTransaction).values({ id: crypto.randomUUID(), orderId: order.id, provider: "paystack", reference, amountSubunits, currency: "GHS", status: "initialized" }).returning({ id: paymentTransaction.id });
    if (!transaction) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not create payment record." });
    try {
      const response = await fetch("https://api.paystack.co/transaction/initialize", { method: "POST", headers: { Authorization: `Bearer ${credentials.secretKey}`, "Content-Type": "application/json", "Cache-Control": "no-cache" }, body: JSON.stringify({ email: order.customerEmail, amount: String(amountSubunits), currency: "GHS", reference, callback_url: context.paystack.callbackUrl, metadata: { order_reference: order.reference } }), signal: AbortSignal.timeout(15000), cache: "no-store" });
      const result = await response.json() as { status?: boolean; message?: string; data?: { authorization_url?: string; reference?: string } };
      if (!response.ok || !result.status || result.data?.reference !== reference || !result.data.authorization_url?.startsWith("https://checkout.paystack.com/")) throw new Error("Paystack did not return a valid checkout link.");
      await context.db.update(customerOrder).set({ paymentProviderReference: reference, updatedAt: new Date() }).where(eq(customerOrder.id, order.id));
      return { authorizationUrl: result.data.authorization_url, reference };
    } catch (error) {
      await context.db.update(paymentTransaction).set({ status: "failed", updatedAt: new Date() }).where(eq(paymentTransaction.id, transaction.id));
      if (error instanceof ORPCError) throw error;
      throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Paystack could not start checkout. Your order is saved; you can retry payment." });
    }
  }),
  verifyOrderPayment: publicProcedure.input(z.object({ reference: z.string().regex(/^BNY-[A-F0-9]{8}-[a-f0-9-]{8,36}$/i) })).handler(({ context, input }) => verifyPaystackTransaction(context, input.reference)),
  updateOrderStatus: staffOrderProcedure.input(z.object({ orderId: z.string(), status: z.enum(orderStatusValues) })).handler(async ({ context, input }) => {
    const result = await context.db.transaction(async (tx) => {
      const [current] = await tx.select().from(customerOrder).where(eq(customerOrder.id, input.orderId)).for("update");
      if (!current) throw new ORPCError("NOT_FOUND");
      const allowedNext: Record<string, string[]> = {
        pending_payment: ["cancelled"], confirmed: ["processing", "cancelled"],
        processing: ["ready_for_delivery", "cancelled"], ready_for_delivery: ["out_for_delivery", "cancelled"],
        out_for_delivery: ["delivered"], delivered: [], cancelled: [],
      };
      if (input.status !== current.status && !allowedNext[current.status]?.includes(input.status)) throw new ORPCError("PRECONDITION_FAILED", { message: "Choose the next available order status." });
      if (input.status !== "cancelled" && current.paymentStatus !== "paid") throw new ORPCError("PRECONDITION_FAILED", { message: "Only verified paid orders can move into fulfilment." });
      const [updated] = await tx.update(customerOrder).set({ status: input.status, deliveredAt: input.status === "delivered" ? new Date() : undefined, updatedAt: new Date() }).where(eq(customerOrder.id, input.orderId)).returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      const releasedVariantIds: string[] = [];
      if (updated.status === "cancelled") {
        const holds = await tx.select().from(inventoryReservation).where(and(eq(inventoryReservation.orderId, updated.id), eq(inventoryReservation.status, "reserved"))).for("update");
        for (const hold of holds) {
          const [released] = await tx.update(catalogueProductVariant).set({ reservedStock: sql`${catalogueProductVariant.reservedStock} - ${hold.quantity}`, updatedAt: new Date() }).where(and(eq(catalogueProductVariant.id, hold.variantId), gte(catalogueProductVariant.reservedStock, hold.quantity))).returning({ id: catalogueProductVariant.id });
          if (!released) throw new Error(`Reservation stock invariant failed for variant ${hold.variantId}`);
          await tx.update(inventoryReservation).set({ status: "released", updatedAt: new Date() }).where(eq(inventoryReservation.id, hold.id));
          releasedVariantIds.push(hold.variantId);
        }
        await tx.update(marketingRedemption).set({ status: "released" }).where(and(eq(marketingRedemption.orderId, updated.id), eq(marketingRedemption.status, "reserved")));
      }
      return { updated, releasedVariantIds, previousStatus: current.status };
    });
    const { updated, releasedVariantIds, previousStatus } = result;
    if (releasedVariantIds.length) {
      await queueAvailableRestockAlerts(context, releasedVariantIds);
      void deliverRestockAlerts(context).catch((error) => console.error("BASNY restock email delivery failed", error));
      void context.publishPublicCatalogueEvent("catalogue.changed", { at: new Date().toISOString() });
    }
    if (updated.userId) await context.publishAccountEvent(updated.userId, "order.status", { reference: updated.reference, status: updated.status, updatedAt: updated.updatedAt.toISOString() });
    await context.publishOrderEvent(updated.reference, "order.status", { reference: updated.reference, status: updated.status, updatedAt: updated.updatedAt.toISOString() });
    await context.publishStaffEvent("order.status", { reference: updated.reference, status: updated.status, updatedAt: updated.updatedAt.toISOString() });
    if (input.status !== previousStatus) {
      await sendCustomerOrderEmail(context, {
        event: "customer-order-status", name: updated.customerName, email: updated.customerEmail, reference: updated.reference,
        status: updated.status, paymentStatus: updated.paymentStatus, paymentMethod: updated.paymentMethod,
        fulfillment: updated.fulfillment, address: updated.address, town: updated.town, region: updated.region,
        note: updated.deliveryNote, lines: updated.lines, subtotalGhs: updated.subtotalGhs,
        promotionDiscountGhs: updated.promotionDiscountGhs, discountGhs: updated.discountGhs,
        discountCode: updated.discountCode, deliveryGhs: updated.deliveryGhs, totalGhs: updated.totalGhs,
        updatedAt: updated.updatedAt,
      });
    }
    return updated;
  }),
  listStaffOrders: staffOrderProcedure.handler(({ context }) => context.db.select().from(customerOrder).orderBy(desc(customerOrder.createdAt)).limit(500)),
  listStaffPayments: staffOrderProcedure.handler(({ context }) => context.db.select({ payment: paymentTransaction, orderReference: customerOrder.reference, customerName: customerOrder.customerName, customerEmail: customerOrder.customerEmail }).from(paymentTransaction).innerJoin(customerOrder, eq(paymentTransaction.orderId, customerOrder.id)).orderBy(desc(paymentTransaction.createdAt)).limit(1000)),
  listStaffReturns: staffOrderProcedure.handler(({ context }) => context.db.select({
    request: customerReturn, order: customerOrder, customerName: user.name, customerEmail: user.email,
  }).from(customerReturn).innerJoin(customerOrder, eq(customerReturn.orderId, customerOrder.id)).innerJoin(user, eq(customerReturn.userId, user.id)).orderBy(desc(customerReturn.createdAt)).limit(500)),
  updateReturnStatus: staffOrderProcedure.input(z.object({ returnId: z.string(), status: z.enum(["approved", "rejected", "received", "refunded", "exchanged"]) })).handler(async ({ context, input }) => {
    const [current] = await context.db.select({ status: customerReturn.status }).from(customerReturn).where(eq(customerReturn.id, input.returnId)).limit(1);
    if (!current) throw new ORPCError("NOT_FOUND");
    const [updated] = await context.db.update(customerReturn).set({ status: input.status, updatedAt: new Date() }).where(eq(customerReturn.id, input.returnId)).returning();
    if (!updated) throw new ORPCError("NOT_FOUND");
    await context.publishAccountEvent(updated.userId, "return.status", { reference: updated.reference, status: updated.status, updatedAt: updated.updatedAt.toISOString() });
    await context.publishStaffEvent("return.status", { reference: updated.reference, status: updated.status, updatedAt: updated.updatedAt.toISOString() });
    const [order] = await context.db.select({ reference: customerOrder.reference, customerName: customerOrder.customerName, customerEmail: customerOrder.customerEmail }).from(customerOrder).where(eq(customerOrder.id, updated.orderId)).limit(1);
    if (order && current.status !== updated.status) void sendConfiguredNotification(context, { event: "return-update", recipient: "customer", email: order.customerEmail, subject: `BASNY return ${updated.reference}: ${updated.status}`, lines: [`Hello ${order.customerName},`, `Your return request ${updated.reference} for order ${order.reference} is now ${updated.status}.`] });
    return updated;
  }),
};
