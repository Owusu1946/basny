import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { customerOrder } from "./customer";

export type MarketingTarget = { categoryId?: string; productSlugs?: string[] };

export const marketingDiscountCode = pgTable("marketing_discount_code", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  kind: text("kind", { enum: ["percentage", "fixed"] }).notNull(),
  value: integer("value").notNull(), // percentage points or whole GHS
  scope: text("scope", { enum: ["storewide", "category", "products"] }).notNull(),
  target: jsonb("target").$type<MarketingTarget>().notNull().default({}),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  minimumGhs: integer("minimum_ghs").notNull().default(0),
  maximumDiscountGhs: integer("maximum_discount_ghs"),
  usageLimit: integer("usage_limit").notNull(),
  perCustomerLimit: integer("per_customer_limit").notNull(),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("marketing_discount_active_dates_idx").on(table.active, table.startsAt, table.endsAt)]);

export const marketingPromotion = pgTable("marketing_promotion", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["scheduled_sale", "flash_sale"] }).notNull(),
  discountPercent: integer("discount_percent").notNull(),
  scope: text("scope", { enum: ["category", "products"] }).notNull(),
  target: jsonb("target").$type<MarketingTarget>().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status", { enum: ["scheduled", "active", "paused"] }).notNull().default("scheduled"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("marketing_promotion_status_dates_idx").on(table.status, table.startsAt, table.endsAt)]);

export const marketingRedemption = pgTable("marketing_redemption", {
  id: text("id").primaryKey(),
  discountCodeId: text("discount_code_id").notNull().references(() => marketingDiscountCode.id, { onDelete: "restrict" }),
  orderId: text("order_id").notNull().references(() => customerOrder.id, { onDelete: "cascade" }),
  customerKey: text("customer_key").notNull(),
  discountGhs: integer("discount_ghs").notNull(),
  status: text("status", { enum: ["reserved", "redeemed", "released"] }).notNull().default("reserved"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
}, (table) => [uniqueIndex("marketing_redemption_order_code_idx").on(table.discountCodeId, table.orderId), index("marketing_redemption_code_status_idx").on(table.discountCodeId, table.status), index("marketing_redemption_customer_idx").on(table.discountCodeId, table.customerKey, table.status)]);
