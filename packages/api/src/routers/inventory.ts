import { ORPCError } from "@orpc/server";
import { catalogueCategory, catalogueProduct, catalogueProductMedia, catalogueProductVariant } from "@basny-web/db/schema/catalogue";
import { inventoryPurchaseOrder, inventoryPurchaseOrderLine, inventoryPurchaseReceipt, inventoryPurchaseReceiptLine, inventoryStockAdjustment, inventorySupplier } from "@basny-web/db/schema/inventory";
import type { Database } from "@basny-web/db";
import { staffRole } from "@basny-web/db/schema/staff";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { deliverRestockAlerts, queueAvailableRestockAlerts } from "../restock";

const inventoryStaffProcedure = protectedProcedure.use(async ({ context, next }) => {
  const [staff] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id)).limit(1);
  if (!staff || !["sales_order_admin", "super_admin"].includes(staff.role)) throw new ORPCError("FORBIDDEN");
  return next();
});
const id = z.string().min(1).max(100);
const nonnegativeInt = z.number().int().min(0).max(10000000);
const supplierInput = z.object({ id: id.optional(), name: z.string().trim().min(2).max(120), contact: z.string().trim().max(100).default(""), phone: z.string().trim().min(7).max(25), email: z.string().trim().max(254).default(""), location: z.string().trim().max(120).default(""), leadTimeDays: z.number().int().min(0).max(365).default(7), notes: z.string().trim().max(2000).default(""), active: z.boolean() });
const orderInput = z.object({ id: id.optional(), supplierId: id, expectedAt: z.string().refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, "Expected date must be a valid calendar date." ).default(""), supplierReference: z.string().trim().max(120).default(""), note: z.string().trim().max(2000).default(""), status: z.enum(["draft", "ordered"]), lines: z.array(z.object({ variantId: id, quantityOrdered: z.number().int().min(1).max(100000), unitCostPesewas: nonnegativeInt })).min(1).max(100) });

const publishInventory = (context: { publishStaffEvent: (name: string, data: Record<string, unknown>) => Promise<void>; publishPublicCatalogueEvent: (name: string, data: Record<string, unknown>) => Promise<void>; revalidatePublicCatalogue: () => Promise<void> }) => {
  const data = { at: new Date().toISOString() };
  void Promise.allSettled([context.publishStaffEvent("inventory.changed", data), context.publishPublicCatalogueEvent("catalogue.changed", data), context.revalidatePublicCatalogue()]);
};
const formatVariant = (colour: string, size: string | null) => `${colour} · ${size ? `EU ${size}` : "One size"}`;
const newId = () => crypto.randomUUID();
const ref = (prefix: string) => `${prefix}-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

async function orderWithLines(db: Database, orderId: string) {
  const [row] = await db.select({ order: inventoryPurchaseOrder, supplier: inventorySupplier }).from(inventoryPurchaseOrder).innerJoin(inventorySupplier, eq(inventorySupplier.id, inventoryPurchaseOrder.supplierId)).where(eq(inventoryPurchaseOrder.id, orderId)).limit(1);
  if (!row) return null;
  const lines = await db.select().from(inventoryPurchaseOrderLine).where(eq(inventoryPurchaseOrderLine.purchaseOrderId, orderId)).orderBy(asc(inventoryPurchaseOrderLine.createdAt));
  return { ...row.order, supplierName: row.supplier.name, lines: lines.map((line: typeof inventoryPurchaseOrderLine.$inferSelect) => ({ ...line, variantId: line.variantId, unitCostGhs: line.unitCostPesewas / 100 })) };
}

export const inventoryProcedures = {
  listInventory: inventoryStaffProcedure.handler(async ({ context }) => {
    const rows = await context.db.select({ variant: catalogueProductVariant, product: catalogueProduct, category: catalogueCategory, media: catalogueProductMedia }).from(catalogueProductVariant).innerJoin(catalogueProduct, eq(catalogueProduct.id, catalogueProductVariant.productId)).innerJoin(catalogueCategory, eq(catalogueCategory.id, catalogueProduct.categoryId)).leftJoin(catalogueProductMedia, and(eq(catalogueProductMedia.productId, catalogueProduct.id), eq(catalogueProductMedia.sortOrder, 0))).orderBy(asc(catalogueProduct.name), asc(catalogueProductVariant.sortOrder));
    return rows.filter((row) => row.variant.active).map(({ variant, product, category, media }) => ({ id: variant.id, productSlug: product.slug, productName: product.name, productImage: media?.url ?? "/images/product-placeholder.svg", category: category.name, colour: variant.colour, size: variant.size ?? "One size", sku: variant.sku, onHand: variant.stock, reserved: variant.reservedStock, lowStockThreshold: variant.lowStockThreshold, location: "Accra store" }));
  }),
  setInventoryThreshold: inventoryStaffProcedure.input(z.object({ variantId: id, threshold: nonnegativeInt })).handler(async ({ context, input }) => {
    const [updated] = await context.db.update(catalogueProductVariant).set({ lowStockThreshold: input.threshold, updatedAt: new Date() }).where(eq(catalogueProductVariant.id, input.variantId)).returning({ id: catalogueProductVariant.id });
    if (!updated) throw new ORPCError("NOT_FOUND");
    publishInventory(context); return { saved: true };
  }),
  listStockAdjustments: inventoryStaffProcedure.handler(({ context }) => context.db.select().from(inventoryStockAdjustment).orderBy(desc(inventoryStockAdjustment.createdAt)).limit(500)),
  createStockAdjustment: inventoryStaffProcedure.input(z.object({ variantId: id, action: z.enum(["add", "remove", "set"]), quantity: nonnegativeInt, reason: z.string().trim().min(2).max(120), note: z.string().trim().max(1000).default("") })).handler(async ({ context, input }) => {
    if ((input.action !== "set" && input.quantity === 0)) throw new ORPCError("BAD_REQUEST", { message: "Enter a positive whole quantity." });
    const adjustment = await context.db.transaction(async (tx) => {
      const [row] = await tx.select({ variant: catalogueProductVariant, product: catalogueProduct, media: catalogueProductMedia }).from(catalogueProductVariant).innerJoin(catalogueProduct, eq(catalogueProduct.id, catalogueProductVariant.productId)).leftJoin(catalogueProductMedia, and(eq(catalogueProductMedia.productId, catalogueProduct.id), eq(catalogueProductMedia.sortOrder, 0))).where(eq(catalogueProductVariant.id, input.variantId)).for("update").limit(1);
      if (!row || !row.variant.active) throw new ORPCError("NOT_FOUND", { message: "This product option is no longer active." });
      const previous = row.variant.stock;
      const next = input.action === "add" ? previous + input.quantity : input.action === "remove" ? previous - input.quantity : input.quantity;
      if (!Number.isSafeInteger(next) || next < 0 || next > 10000000) throw new ORPCError("BAD_REQUEST", { message: "Stock cannot be negative or exceed 10,000,000 units." });
      if (next < row.variant.reservedStock) throw new ORPCError("CONFLICT", { message: `At least ${row.variant.reservedStock} units are currently reserved for online checkout. Wait for payment or cancel those orders first.` });
      if (next === previous) throw new ORPCError("BAD_REQUEST", { message: "The adjustment must change the current stock count." });
      await tx.update(catalogueProductVariant).set({ stock: next, updatedAt: new Date() }).where(eq(catalogueProductVariant.id, row.variant.id));
      const adjustmentId = newId();
      const [saved] = await tx.insert(inventoryStockAdjustment).values({ id: adjustmentId, reference: ref("ADJ"), variantId: row.variant.id, productSlug: row.product.slug, productName: row.product.name, variantLabel: formatVariant(row.variant.colour, row.variant.size), sku: row.variant.sku, action: input.action, change: next - previous, previous, next, reason: input.reason, note: input.note, source: "manual", createdBy: context.session.user.id }).returning();
      return saved;
    });
    if (!adjustment) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "The inventory adjustment could not be saved." });
    publishInventory(context);
    await queueAvailableRestockAlerts(context, [adjustment.variantId]);
    void deliverRestockAlerts(context).catch((error) => console.error("BASNY restock email delivery failed", error));
    return adjustment;
  }),
  listInventorySuppliers: inventoryStaffProcedure.handler(async ({ context }) => (await context.db.select().from(inventorySupplier).orderBy(asc(inventorySupplier.name))).map((supplier) => ({ ...supplier, active: supplier.active === "active" }))),
  saveInventorySupplier: inventoryStaffProcedure.input(supplierInput).handler(async ({ context, input }) => {
    const { id: supplierId, ...values } = input;
    const now = new Date();
    const [saved] = supplierId
      ? await context.db.update(inventorySupplier).set({ ...values, active: values.active ? "active" : "inactive", updatedBy: context.session.user.id, updatedAt: now }).where(eq(inventorySupplier.id, supplierId)).returning()
      : await context.db.insert(inventorySupplier).values({ ...values, id: newId(), active: values.active ? "active" : "inactive", createdBy: context.session.user.id, updatedBy: context.session.user.id, updatedAt: now }).returning();
    if (!saved) throw new ORPCError("NOT_FOUND");
    publishInventory(context); return { ...saved, active: saved.active === "active" };
  }),
  listInventoryPurchaseOrders: inventoryStaffProcedure.handler(async ({ context }) => {
    const records = await context.db.select({ order: inventoryPurchaseOrder, supplierName: inventorySupplier.name }).from(inventoryPurchaseOrder).innerJoin(inventorySupplier, eq(inventorySupplier.id, inventoryPurchaseOrder.supplierId)).orderBy(desc(inventoryPurchaseOrder.createdAt));
    if (!records.length) return [];
    const lines = await context.db.select().from(inventoryPurchaseOrderLine).where(inArray(inventoryPurchaseOrderLine.purchaseOrderId, records.map(({ order }) => order.id))).orderBy(asc(inventoryPurchaseOrderLine.createdAt));
    return records.map(({ order, supplierName }) => ({ ...order, supplierName, lines: lines.filter((line: typeof inventoryPurchaseOrderLine.$inferSelect) => line.purchaseOrderId === order.id).map((line: typeof inventoryPurchaseOrderLine.$inferSelect) => ({ ...line, unitCostGhs: line.unitCostPesewas / 100 })) }));
  }),
  saveInventoryPurchaseOrder: inventoryStaffProcedure.input(orderInput).handler(async ({ context, input }) => {
    const duplicateVariant = new Set(input.lines.map((line) => line.variantId)).size !== input.lines.length;
    if (duplicateVariant) throw new ORPCError("BAD_REQUEST", { message: "Each variant can appear only once on a purchase order." });
    const result = await context.db.transaction(async (tx) => {
      const [supplier] = await tx.select().from(inventorySupplier).where(eq(inventorySupplier.id, input.supplierId)).limit(1);
      if (!supplier || supplier.active !== "active") throw new ORPCError("BAD_REQUEST", { message: "Choose an active supplier." });
      const variants = await tx.select({ variant: catalogueProductVariant, product: catalogueProduct }).from(catalogueProductVariant).innerJoin(catalogueProduct, eq(catalogueProduct.id, catalogueProductVariant.productId)).where(inArray(catalogueProductVariant.id, input.lines.map((line) => line.variantId)));
      if (variants.length !== input.lines.length || variants.some(({ variant }) => !variant.active)) throw new ORPCError("BAD_REQUEST", { message: "One or more product variants are no longer active." });
      const now = new Date();
      let orderId = input.id;
      if (orderId) {
        const [order] = await tx.select().from(inventoryPurchaseOrder).where(eq(inventoryPurchaseOrder.id, orderId)).for("update").limit(1);
        if (!order || order.status !== "draft") throw new ORPCError("BAD_REQUEST", { message: "Only draft purchase orders can be edited." });
        await tx.update(inventoryPurchaseOrder).set({ supplierId: input.supplierId, expectedAt: input.expectedAt || null, supplierReference: input.supplierReference, note: input.note, status: input.status, orderedAt: input.status === "ordered" ? now : null, updatedBy: context.session.user.id, updatedAt: now }).where(eq(inventoryPurchaseOrder.id, orderId));
        await tx.delete(inventoryPurchaseOrderLine).where(eq(inventoryPurchaseOrderLine.purchaseOrderId, orderId));
      } else {
        orderId = newId();
        await tx.insert(inventoryPurchaseOrder).values({ id: orderId, reference: ref("PO"), supplierId: input.supplierId, status: input.status, expectedAt: input.expectedAt || null, supplierReference: input.supplierReference, note: input.note, createdBy: context.session.user.id, updatedBy: context.session.user.id, orderedAt: input.status === "ordered" ? now : null });
      }
      await tx.insert(inventoryPurchaseOrderLine).values(input.lines.map((line) => {
        const found = variants.find(({ variant }) => variant.id === line.variantId)!;
        return { id: newId(), purchaseOrderId: orderId!, variantId: found.variant.id, productSlug: found.product.slug, productName: found.product.name, variantLabel: formatVariant(found.variant.colour, found.variant.size), sku: found.variant.sku, quantityOrdered: line.quantityOrdered, quantityReceived: 0, unitCostPesewas: line.unitCostPesewas };
      }));
      return orderId!;
    });
    publishInventory(context); return await orderWithLines(context.db, result);
  }),
  updateInventoryPurchaseOrderStatus: inventoryStaffProcedure.input(z.object({ id, status: z.enum(["ordered", "cancelled"]) })).handler(async ({ context, input }) => {
    const updated = await context.db.transaction(async (tx) => {
      const [current] = await tx.select().from(inventoryPurchaseOrder).where(eq(inventoryPurchaseOrder.id, input.id)).for("update").limit(1);
      if (!current || !["draft", "ordered", "partially_received"].includes(current.status)) throw new ORPCError("BAD_REQUEST", { message: "This purchase order can no longer change status." });
      if (input.status === "ordered" && current.status !== "draft") throw new ORPCError("BAD_REQUEST", { message: "Only draft orders can be marked ordered." });
      if (input.status === "cancelled" && current.status === "partially_received") throw new ORPCError("BAD_REQUEST", { message: "An order with received stock cannot be cancelled. Receive the balance or contact an administrator." });
      const [saved] = await tx.update(inventoryPurchaseOrder).set({ status: input.status, orderedAt: input.status === "ordered" ? new Date() : current.orderedAt, updatedBy: context.session.user.id, updatedAt: new Date() }).where(eq(inventoryPurchaseOrder.id, input.id)).returning();
      return saved;
    });
    publishInventory(context); return { ...updated, ...(await orderWithLines(context.db, input.id)) };
  }),
  receiveInventoryPurchaseOrder: inventoryStaffProcedure.input(z.object({ id, receiptId: z.string().uuid(), note: z.string().trim().max(1000).default(""), lines: z.array(z.object({ lineId: id, quantity: z.number().int().min(1).max(100000) })).min(1).max(100) })).handler(async ({ context, input }) => {
    const outcome = await context.db.transaction(async (tx) => {
      const [order] = await tx.select().from(inventoryPurchaseOrder).where(eq(inventoryPurchaseOrder.id, input.id)).for("update").limit(1);
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Purchase order not found." });
      const [replay] = await tx.select().from(inventoryPurchaseReceipt).where(eq(inventoryPurchaseReceipt.id, input.receiptId)).limit(1);
      if (replay) {
        if (replay.purchaseOrderId !== input.id) throw new ORPCError("CONFLICT", { message: "This receipt retry belongs to another purchase order." });
        return { orderId: replay.purchaseOrderId, replay: true };
      }
      if (!["ordered", "partially_received"].includes(order.status)) throw new ORPCError("BAD_REQUEST", { message: "This order is not accepting receipts." });
      const orderLines = await tx.select().from(inventoryPurchaseOrderLine).where(eq(inventoryPurchaseOrderLine.purchaseOrderId, order.id)).for("update");
      const uniqueLines = new Set(input.lines.map((line) => line.lineId));
      if (uniqueLines.size !== input.lines.length) throw new ORPCError("BAD_REQUEST", { message: "Each line can be received only once per submission." });
      const receiptReference = ref("RCV");
      await tx.insert(inventoryPurchaseReceipt).values({ id: input.receiptId, reference: receiptReference, purchaseOrderId: order.id, receivedBy: context.session.user.id, note: input.note });
      const changedVariantIds: string[] = [];
      for (const received of input.lines) {
        const line = orderLines.find((item: typeof inventoryPurchaseOrderLine.$inferSelect) => item.id === received.lineId);
        if (!line || line.quantityReceived + received.quantity > line.quantityOrdered) throw new ORPCError("BAD_REQUEST", { message: "Received quantity exceeds the remaining order quantity." });
        const [variant] = await tx.select({ variant: catalogueProductVariant, product: catalogueProduct }).from(catalogueProductVariant).innerJoin(catalogueProduct, eq(catalogueProduct.id, catalogueProductVariant.productId)).where(eq(catalogueProductVariant.id, line.variantId)).for("update").limit(1);
        if (!variant) throw new ORPCError("NOT_FOUND", { message: `Variant ${line.sku} no longer exists.` });
        const previous = variant.variant.stock;
        const next = previous + received.quantity;
        if (next > 10000000) throw new ORPCError("BAD_REQUEST", { message: "Received stock exceeds the supported inventory limit." });
        await tx.update(catalogueProductVariant).set({ stock: next, updatedAt: new Date() }).where(eq(catalogueProductVariant.id, line.variantId));
        changedVariantIds.push(line.variantId);
        await tx.update(inventoryPurchaseOrderLine).set({ quantityReceived: line.quantityReceived + received.quantity }).where(eq(inventoryPurchaseOrderLine.id, line.id));
        await tx.insert(inventoryPurchaseReceiptLine).values({ id: newId(), receiptId: input.receiptId, purchaseOrderLineId: line.id, variantId: line.variantId, productName: line.productName, variantLabel: line.variantLabel, sku: line.sku, quantity: received.quantity });
        await tx.insert(inventoryStockAdjustment).values({ id: newId(), reference: ref("ADJ"), variantId: line.variantId, productSlug: line.productSlug, productName: line.productName, variantLabel: line.variantLabel, sku: line.sku, action: "add", change: received.quantity, previous, next, reason: "Purchase order receipt", note: input.note || `${received.quantity} unit${received.quantity === 1 ? "" : "s"} received against ${order.reference}.`, source: "purchase_receipt", sourceReference: receiptReference, createdBy: context.session.user.id });
      }
      const newReceived = orderLines.reduce((sum: number, line: typeof inventoryPurchaseOrderLine.$inferSelect) => sum + line.quantityReceived + (input.lines.find((entry) => entry.lineId === line.id)?.quantity ?? 0), 0);
      const totalOrdered = orderLines.reduce((sum: number, line: typeof inventoryPurchaseOrderLine.$inferSelect) => sum + line.quantityOrdered, 0);
      const allReceived = newReceived === totalOrdered;
      await tx.update(inventoryPurchaseOrder).set({ status: allReceived ? "received" : "partially_received", receivedAt: allReceived ? new Date() : null, updatedBy: context.session.user.id, updatedAt: new Date() }).where(eq(inventoryPurchaseOrder.id, order.id));
      return { orderId: order.id, replay: false, changedVariantIds };
    });
    if (!outcome.replay) {
      publishInventory(context);
      await queueAvailableRestockAlerts(context, outcome.changedVariantIds ?? []);
      void deliverRestockAlerts(context).catch((error) => console.error("BASNY restock email delivery failed", error));
    }
    return await orderWithLines(context.db, outcome.orderId);
  }),
};
