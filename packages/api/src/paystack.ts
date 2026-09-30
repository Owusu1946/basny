import { ORPCError } from "@orpc/server";
import { customerOrder, inventoryReservation, paymentSettings, paymentTransaction } from "@basny-web/db/schema/customer";
import { catalogueProductVariant } from "@basny-web/db/schema/catalogue";
import { and, eq, gte, sql } from "drizzle-orm";
import { marketingRedemption } from "@basny-web/db/schema/marketing";
import { sendConfiguredNotification, sendCustomerOrderEmail } from "./notifications";
import { deliverRestockAlerts, queueAvailableRestockAlerts } from "./restock";

import type { Context } from "./context";

export type PaystackCredentials = { secretKey: string; publicKey: string };

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function encryptionKey(raw: string) {
  if (raw.length < 32) throw new ORPCError("PRECONDITION_FAILED", { message: "Set PAYSTACK_CONFIG_ENCRYPTION_KEY on the server before saving gateway credentials." });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptPaystackSecret(secret: string, rawKey: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(rawKey), new TextEncoder().encode(secret));
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}

async function decryptPaystackSecret(ciphertext: string, iv: string, rawKey: string) {
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(rawKey), base64ToBytes(ciphertext));
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new ORPCError("PRECONDITION_FAILED", { message: "Paystack credentials cannot be decrypted. Restore the original PAYSTACK_CONFIG_ENCRYPTION_KEY." });
  }
}

export async function getPaystackCredentials(context: Context): Promise<PaystackCredentials> {
  const [stored] = await context.db.select().from(paymentSettings).where(eq(paymentSettings.provider, "paystack")).limit(1);
  if (stored) {
    if (!context.paystack.encryptionKey) throw new ORPCError("PRECONDITION_FAILED", { message: "PAYSTACK_CONFIG_ENCRYPTION_KEY is required to use saved Paystack credentials." });
    return { publicKey: stored.publicKey, secretKey: await decryptPaystackSecret(stored.encryptedSecretKey, stored.encryptionIv, context.paystack.encryptionKey) };
  }
  const secretKey = context.paystack.secretKey;
  const publicKey = context.paystack.publicKey;
  if (!secretKey || !publicKey) throw new ORPCError("PRECONDITION_FAILED", { message: "Paystack is not configured. Ask an administrator to add gateway credentials." });
  return { secretKey, publicKey };
}

export async function verifyPaystackTransaction(context: Context, reference: string) {
  const [transaction] = await context.db.select().from(paymentTransaction).where(eq(paymentTransaction.reference, reference)).limit(1);
  if (!transaction) throw new ORPCError("NOT_FOUND", { message: "Payment reference not found." });
  const [order] = await context.db.select().from(customerOrder).where(eq(customerOrder.id, transaction.orderId)).limit(1);
  if (!order) throw new ORPCError("NOT_FOUND", { message: "The order for this payment was not found." });
  const { secretKey } = await getPaystackCredentials(context);
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secretKey}`, "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok) throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Paystack could not verify this payment right now." });
  const result = await response.json() as { status?: boolean; data?: { id?: number; status?: string; reference?: string; amount?: number; currency?: string; channel?: string; paid_at?: string | null } };
  const data = result.data;
  const isPaid = Boolean(result.status && data?.status === "success" && data.reference === reference && data.amount === transaction.amountSubunits && data.currency === transaction.currency);
  if (isPaid) {
    const paidAt = data?.paid_at ? new Date(data.paid_at) : new Date();
    // Record payment and commit (or release) the held units in the same transaction.
    // The server DB uses Neon Pool/WebSockets, which supports these interactive transactions.
    const outcome = await context.db.transaction(async (tx) => {
      const [lockedOrder] = await tx.select().from(customerOrder).where(eq(customerOrder.id, order.id)).for("update").limit(1);
      const [savedPayment] = await tx.update(paymentTransaction).set({ status: "success", providerTransactionId: data?.id ? String(data.id) : null, channel: data?.channel ?? null, paidAt, updatedAt: new Date() }).where(and(eq(paymentTransaction.id, transaction.id), eq(paymentTransaction.status, "initialized"))).returning({ id: paymentTransaction.id });
      if (!savedPayment || !lockedOrder) return { updated: null, latePayment: false, duplicatePayment: false, alertOrder: null, releasedVariantIds: [] as string[] };
      if (lockedOrder.paymentStatus === "paid") return { updated: null, latePayment: true, duplicatePayment: true, alertOrder: lockedOrder, releasedVariantIds: [] as string[] };
      const holds = await tx.select().from(inventoryReservation).where(and(eq(inventoryReservation.orderId, order.id), eq(inventoryReservation.status, "reserved"))).for("update");
      const allHoldsActive = holds.length > 0 && holds.every((hold) => hold.expiresAt > paidAt);
      let sold = allHoldsActive;
      if (allHoldsActive) {
        for (const hold of holds) {
          const [committed] = await tx.update(catalogueProductVariant).set({ stock: sql`${catalogueProductVariant.stock} - ${hold.quantity}`, reservedStock: sql`${catalogueProductVariant.reservedStock} - ${hold.quantity}`, updatedAt: new Date() })
            .where(and(eq(catalogueProductVariant.id, hold.variantId), gte(catalogueProductVariant.stock, hold.quantity), gte(catalogueProductVariant.reservedStock, hold.quantity))).returning({ id: catalogueProductVariant.id });
          if (!committed) throw new Error(`Inventory reservation invariant failed for variant ${hold.variantId}`);
          await tx.update(inventoryReservation).set({ status: "committed", updatedAt: new Date() }).where(eq(inventoryReservation.id, hold.id));
        }
      } else {
        for (const hold of holds) {
          const [released] = await tx.update(catalogueProductVariant).set({ reservedStock: sql`${catalogueProductVariant.reservedStock} - ${hold.quantity}`, updatedAt: new Date() }).where(and(eq(catalogueProductVariant.id, hold.variantId), gte(catalogueProductVariant.reservedStock, hold.quantity))).returning({ id: catalogueProductVariant.id });
          if (!released) throw new Error(`Inventory reservation invariant failed for variant ${hold.variantId}`);
          await tx.update(inventoryReservation).set({ status: "released", updatedAt: new Date() }).where(eq(inventoryReservation.id, hold.id));
        }
      }
      const nextStatus = sold && lockedOrder.status === "pending_payment" ? "confirmed" : lockedOrder.status === "pending_payment" ? "cancelled" : lockedOrder.status;
      const [updated] = await tx.update(customerOrder).set({ paymentStatus: "paid", paymentMethod: "Paystack", status: nextStatus, updatedAt: new Date() }).where(and(eq(customerOrder.id, order.id), eq(customerOrder.paymentStatus, "pending"))).returning();
      if (sold && updated?.status === "confirmed") await tx.update(marketingRedemption).set({ status: "redeemed", redeemedAt: paidAt }).where(and(eq(marketingRedemption.orderId, order.id), eq(marketingRedemption.status, "reserved")));
      else await tx.update(marketingRedemption).set({ status: "released" }).where(and(eq(marketingRedemption.orderId, order.id), eq(marketingRedemption.status, "reserved")));
      return { updated: updated ?? null, latePayment: !sold || nextStatus === "cancelled", duplicatePayment: false, alertOrder: null, releasedVariantIds: sold ? [] : holds.map((hold) => hold.variantId) };
    });
    const updated = outcome.updated;
    if (outcome.releasedVariantIds.length) {
      await queueAvailableRestockAlerts(context, outcome.releasedVariantIds);
      void deliverRestockAlerts(context).catch((error) => console.error("BASNY restock email delivery failed", error));
      void context.publishPublicCatalogueEvent("catalogue.changed", { at: new Date().toISOString() });
    }
    if (outcome.duplicatePayment && outcome.alertOrder) {
      const alert = { event: "payment-confirmed", recipient: "team" as const, subject: `URGENT: Duplicate Paystack payment — ${outcome.alertOrder.reference}`, lines: [`Order: ${outcome.alertOrder.reference}`, `Additional payment reference: ${reference}`, `Additional amount: GHS ${(transaction.amountSubunits / 100).toFixed(2)}`, `Customer: ${outcome.alertOrder.customerName} · ${outcome.alertOrder.customerEmail}`, "The order was already paid. Review the additional Paystack transaction and issue a refund if it settled."] };
      void sendConfiguredNotification(context, alert);
      void sendConfiguredNotification(context, { ...alert, recipient: "customer", email: outcome.alertOrder.customerEmail, subject: `We’re reviewing an additional payment for ${outcome.alertOrder.reference}`, lines: [`Hello ${outcome.alertOrder.customerName},`, `We received an additional payment notification for order ${outcome.alertOrder.reference}. The order was already paid, so we have asked our team to review the extra transaction and arrange any necessary refund.`, `Additional payment reference: ${reference}`, `Additional amount: GHS ${(transaction.amountSubunits / 100).toFixed(2)}`, "We’ll contact you with an update. Please reply to this email if you need help."] });
    }
    if (updated) {
      void sendConfiguredNotification(context, { event: "payment-confirmed", recipient: "team", subject: outcome.latePayment ? `URGENT: Paid order needs refund review — ${updated.reference}` : `Payment confirmed for ${updated.reference}`, lines: [`Order: ${updated.reference}`, `Payment reference: ${reference}`, `Amount: GHS ${updated.totalGhs.toFixed(2)}`, ...(outcome.latePayment ? ["The payment arrived after the inventory hold expired or the order was cancelled. The order was not confirmed to avoid overselling. Review and refund this payment in Paystack."] : [])] });
      await sendCustomerOrderEmail(context, {
        event: "customer-order-status", name: order.customerName, email: order.customerEmail, reference: updated.reference,
        status: updated.status, paymentStatus: updated.paymentStatus, paymentMethod: updated.paymentMethod,
        fulfillment: order.fulfillment, address: order.address, town: order.town, region: order.region,
        note: order.deliveryNote, lines: order.lines, subtotalGhs: order.subtotalGhs,
        promotionDiscountGhs: order.promotionDiscountGhs, discountGhs: order.discountGhs,
        discountCode: order.discountCode, deliveryGhs: order.deliveryGhs, totalGhs: updated.totalGhs,
        updatedAt: updated.updatedAt,
      });
      await context.publishStaffEvent("marketing.changed", { at: paidAt.toISOString() });
      if (updated.userId) await context.publishAccountEvent(updated.userId, "order.payment", { reference: updated.reference, paymentStatus: "paid", status: "confirmed" });
      await context.publishOrderEvent(updated.reference, "order.payment", { reference: updated.reference, paymentStatus: "paid", status: "confirmed" });
      await context.publishStaffEvent("payment.succeeded", { reference: updated.reference, totalGhs: updated.totalGhs, currency: "GHS", inventoryHoldExpired: outcome.latePayment });
    }
  } else if (data?.status === "failed" || data?.status === "abandoned") {
    const [failed] = await context.db.update(paymentTransaction).set({ status: "failed", providerTransactionId: data.id ? String(data.id) : null, updatedAt: new Date() }).where(and(eq(paymentTransaction.id, transaction.id), eq(paymentTransaction.status, "initialized"))).returning({ id: paymentTransaction.id });
    if (failed) void sendConfiguredNotification(context, { event: "failed-payment", recipient: "team", subject: `Payment needs attention: ${order.reference}`, lines: [`Order: ${order.reference}`, `Payment reference: ${reference}`, `Paystack status: ${data.status}`, `Customer: ${order.customerName} · ${order.customerEmail}`] });
  }
  const [latest] = await context.db.select({ status: paymentTransaction.status }).from(paymentTransaction).where(eq(paymentTransaction.id, transaction.id)).limit(1);
  return { paid: latest?.status === "success", reference: order.reference, paymentReference: reference };
}
