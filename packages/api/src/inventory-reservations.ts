import { and, eq, gte, lte, sql } from "drizzle-orm";
import { catalogueProductVariant } from "@basny-web/db/schema/catalogue";
import { customerOrder, inventoryReservation } from "@basny-web/db/schema/customer";
import { marketingRedemption } from "@basny-web/db/schema/marketing";
import type { Context } from "./context";
import { sendCustomerOrderEmail } from "./notifications";
import { deliverRestockAlerts, queueAvailableRestockAlerts } from "./restock";

/** Expire unpaid checkout holds once; locks and guarded state transitions make multi-replica polling safe. */
export async function expirePendingOrderReservations(context: Context, batchSize = 20) {
  for (let attempt = 0; attempt < batchSize; attempt += 1) {
    const expired = await context.db.transaction(async (tx) => {
      const now = new Date();
      const [candidate] = await tx.select({ orderId: inventoryReservation.orderId }).from(inventoryReservation)
        .where(and(eq(inventoryReservation.status, "reserved"), lte(inventoryReservation.expiresAt, now)))
        .orderBy(inventoryReservation.expiresAt).limit(1);
      if (!candidate) return null;
      const [order] = await tx.select().from(customerOrder).where(eq(customerOrder.id, candidate.orderId)).for("update").limit(1);
      const reservations = await tx.select().from(inventoryReservation).where(and(eq(inventoryReservation.orderId, candidate.orderId), eq(inventoryReservation.status, "reserved"))).for("update");
      const variantIds: string[] = [];
      for (const reservation of reservations) {
        const [released] = await tx.update(catalogueProductVariant).set({ reservedStock: sql`${catalogueProductVariant.reservedStock} - ${reservation.quantity}`, updatedAt: now })
          .where(and(eq(catalogueProductVariant.id, reservation.variantId), gte(catalogueProductVariant.reservedStock, reservation.quantity))).returning({ id: catalogueProductVariant.id });
        if (!released) throw new Error(`Reservation stock invariant failed for variant ${reservation.variantId}`);
        await tx.update(inventoryReservation).set({ status: "released", updatedAt: now }).where(and(eq(inventoryReservation.id, reservation.id), eq(inventoryReservation.status, "reserved")));
        variantIds.push(reservation.variantId);
      }
      let updatedOrder = order;
      if (order?.paymentStatus === "pending" && order.status === "pending_payment") {
        const [cancelled] = await tx.update(customerOrder).set({ status: "cancelled", updatedAt: now }).where(and(eq(customerOrder.id, order.id), eq(customerOrder.paymentStatus, "pending"), eq(customerOrder.status, "pending_payment"))).returning();
        updatedOrder = cancelled ?? order;
        await tx.update(marketingRedemption).set({ status: "released" }).where(and(eq(marketingRedemption.orderId, order.id), eq(marketingRedemption.status, "reserved")));
      }
      return { order: updatedOrder, variantIds };
    });
    if (!expired) return;
    if (expired.variantIds.length) {
      await queueAvailableRestockAlerts(context, expired.variantIds);
      void deliverRestockAlerts(context).catch((error) => console.error("BASNY restock email delivery failed", error));
      await context.publishPublicCatalogueEvent("catalogue.changed", { at: new Date().toISOString() });
      void context.publishStaffEvent("inventory.changed", { at: new Date().toISOString() });
    }
    const order = expired.order;
    if (order?.status === "cancelled" && order.paymentStatus === "pending") {
      await sendCustomerOrderEmail(context, { event: "customer-order-status", name: order.customerName, email: order.customerEmail, reference: order.reference, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod, fulfillment: order.fulfillment, address: order.address, town: order.town, region: order.region, note: order.deliveryNote, lines: order.lines, subtotalGhs: order.subtotalGhs, promotionDiscountGhs: order.promotionDiscountGhs, discountGhs: order.discountGhs, discountCode: order.discountCode, deliveryGhs: order.deliveryGhs, totalGhs: order.totalGhs, updatedAt: order.updatedAt });
      if (order.userId) await context.publishAccountEvent(order.userId, "order.status", { reference: order.reference, status: order.status, updatedAt: order.updatedAt.toISOString() });
      await context.publishOrderEvent(order.reference, "order.status", { reference: order.reference, status: order.status, updatedAt: order.updatedAt.toISOString() });
      await context.publishStaffEvent("order.status", { reference: order.reference, status: order.status, updatedAt: order.updatedAt.toISOString() });
    }
  }
}
