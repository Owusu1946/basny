import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { catalogueProductVariant } from "./catalogue";

export type OrderLineRecord = {
  productSlug: string;
  name: string;
  image: string;
  size: string | null;
  colour: string;
  quantity: number;
  unitPriceGhs: number;
};

export type CustomerCartLineRecord = OrderLineRecord;

/** Anonymous and signed-in carts are stored only after a shopper adds an item. */
export const customerCart = pgTable("customer_cart", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  lines: jsonb("lines").$type<CustomerCartLineRecord[]>().notNull(),
  subtotalGhs: integer("subtotal_ghs").notNull(),
  status: text("status", { enum: ["active", "contacted", "recovered", "converted"] }).notNull().default("active"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("customer_cart_status_activity_idx").on(table.status, table.lastActiveAt), index("customer_cart_email_idx").on(table.customerEmail)]);

export const customerAddress = pgTable("customer_address", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  region: text("region").notNull(),
  town: text("town").notNull(),
  neighbourhood: text("neighbourhood").notNull(),
  streetAddress: text("street_address").notNull(),
  deliveryNote: text("delivery_note").notNull().default(""),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("customer_address_user_idx").on(table.userId)]);

export const customerOrder = pgTable("customer_order", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  trackingTokenHash: text("tracking_token_hash"),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  cartId: text("cart_id").references(() => customerCart.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  fulfillment: text("fulfillment", { enum: ["delivery", "pickup"] }).notNull().default("delivery"),
  deliveryArea: text("delivery_area", { enum: ["accra", "outside-accra"] }).notNull().default("accra"),
  region: text("region").notNull(),
  town: text("town").notNull(),
  address: text("address").notNull(),
  deliveryNote: text("delivery_note").notNull().default(""),
  lines: jsonb("lines").$type<OrderLineRecord[]>().notNull(),
  subtotalGhs: integer("subtotal_ghs").notNull(),
  discountGhs: integer("discount_ghs").notNull().default(0),
  promotionDiscountGhs: integer("promotion_discount_ghs").notNull().default(0),
  discountCode: text("discount_code"),
  deliveryGhs: integer("delivery_ghs").notNull(),
  totalGhs: integer("total_ghs").notNull(),
  paymentMethod: text("payment_method"),
  salesChannel: text("sales_channel", { enum: ["online", "pos"] }).notNull().default("online"),
  paymentProviderReference: text("payment_provider_reference").unique(),
  paymentStatus: text("payment_status", { enum: ["pending", "paid", "failed", "refunded"] }).notNull().default("pending"),
  status: text("status", { enum: ["pending_payment", "confirmed", "processing", "ready_for_delivery", "out_for_delivery", "delivered", "cancelled"] }).notNull().default("pending_payment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (table) => [index("customer_order_user_created_idx").on(table.userId, table.createdAt), index("customer_order_email_idx").on(table.customerEmail), index("customer_order_email_normalized_idx").on(sql`lower(trim(${table.customerEmail}))`)]);

/** Paystack credentials are encrypted by the API before they are persisted. */
export const paymentSettings = pgTable("payment_settings", {
  id: text("id").primaryKey(),
  provider: text("provider", { enum: ["paystack"] }).notNull().unique(),
  publicKey: text("public_key").notNull(),
  encryptedSecretKey: text("encrypted_secret_key").notNull(),
  encryptionIv: text("encryption_iv").notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentTransaction = pgTable("payment_transaction", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => customerOrder.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["paystack"] }).notNull(),
  reference: text("reference").notNull().unique(),
  providerTransactionId: text("provider_transaction_id"),
  amountSubunits: integer("amount_subunits").notNull(),
  currency: text("currency").notNull().default("GHS"),
  status: text("status", { enum: ["initialized", "success", "failed"] }).notNull().default("initialized"),
  channel: text("channel"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("payment_transaction_order_idx").on(table.orderId, table.createdAt), index("payment_transaction_status_idx").on(table.status, table.createdAt)]);

/** Inventory units held while an online order awaits payment. */
export const inventoryReservation = pgTable("inventory_reservation", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => customerOrder.id, { onDelete: "cascade" }),
  variantId: text("variant_id").notNull().references(() => catalogueProductVariant.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  status: text("status", { enum: ["reserved", "committed", "released"] }).notNull().default("reserved"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("inventory_reservation_order_variant_idx").on(table.orderId, table.variantId), index("inventory_reservation_expiry_idx").on(table.status, table.expiresAt), index("inventory_reservation_variant_status_idx").on(table.variantId, table.status), check("inventory_reservation_quantity_check", sql`${table.quantity} > 0`)]);

/** Shopper-authorized, one-time restock emails. Confirmation prevents third-party signups. */
export const restockSubscription = pgTable("restock_subscription", {
  id: text("id").primaryKey(),
  variantId: text("variant_id").notNull().references(() => catalogueProductVariant.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  status: text("status", { enum: ["pending", "active", "queued", "sending", "notified", "failed", "unsubscribed"] }).notNull().default("pending"),
  confirmationExpiresAt: timestamp("confirmation_expires_at", { withTimezone: true }).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
  claimUntil: timestamp("claim_until", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("restock_subscription_variant_email_idx").on(table.variantId, table.email), index("restock_subscription_delivery_idx").on(table.status, table.nextAttemptAt), check("restock_subscription_attempts_check", sql`${table.attempts} >= 0`)]);

export const customerReturn = pgTable("customer_return", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  orderId: text("order_id").notNull().references(() => customerOrder.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  status: text("status", { enum: ["requested", "approved", "rejected", "received", "refunded", "exchanged"] }).notNull().default("requested"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("customer_return_user_created_idx").on(table.userId, table.createdAt), index("customer_return_order_idx").on(table.orderId)]);

export const customerWishlist = pgTable("customer_wishlist", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  productSlug: text("product_slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("customer_wishlist_user_product_idx").on(table.userId, table.productSlug), index("customer_wishlist_user_idx").on(table.userId)]);

export const customerReview = pgTable("customer_review", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull().references(() => customerOrder.id, { onDelete: "cascade" }),
  productSlug: text("product_slug").notNull(),
  rating: integer("rating").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["pending", "published", "rejected", "hidden", "removed"] }).notNull().default("pending"),
  reply: text("reply").notNull().default(""),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("customer_review_user_order_product_idx").on(table.userId, table.orderId, table.productSlug), index("customer_review_product_status_idx").on(table.productSlug, table.status)]);

/** Staff-only service notes keyed by normalized email; supports both accounts and guest buyers. */
export const customerAdminProfile = pgTable("customer_admin_profile", {
  id: text("id").primaryKey(),
  normalizedEmail: text("normalized_email").notNull().unique(),
  internalNote: text("internal_note").notNull().default(""),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("customer_admin_profile_updated_idx").on(table.updatedAt)]);

export const customerSegment = pgTable("customer_segment", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  rule: text("rule", { enum: ["all", "repeat", "new", "high_spend"] }).notNull(),
  thresholdGhs: integer("threshold_ghs").notNull().default(500),
  description: text("description").notNull().default(""),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("customer_segment_updated_idx").on(table.updatedAt)]);
