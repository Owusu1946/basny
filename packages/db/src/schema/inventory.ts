import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { catalogueProductVariant } from "./catalogue";

export const inventorySupplier = pgTable("inventory_supplier", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  phone: text("phone").notNull(),
  email: text("email").notNull().default(""),
  location: text("location").notNull().default(""),
  leadTimeDays: integer("lead_time_days").notNull().default(7),
  notes: text("notes").notNull().default(""),
  active: text("active", { enum: ["active", "inactive"] }).notNull().default("active"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("inventory_supplier_active_name_idx").on(table.active, table.name)]);

export const inventoryPurchaseOrder = pgTable("inventory_purchase_order", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  supplierId: text("supplier_id").notNull().references(() => inventorySupplier.id, { onDelete: "restrict" }),
  status: text("status", { enum: ["draft", "ordered", "partially_received", "received", "cancelled"] }).notNull().default("draft"),
  expectedAt: text("expected_at"),
  supplierReference: text("supplier_reference").notNull().default(""),
  note: text("note").notNull().default(""),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  orderedAt: timestamp("ordered_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("inventory_po_status_created_idx").on(table.status, table.createdAt), index("inventory_po_supplier_idx").on(table.supplierId)]);

export const inventoryPurchaseOrderLine = pgTable("inventory_purchase_order_line", {
  id: text("id").primaryKey(),
  purchaseOrderId: text("purchase_order_id").notNull().references(() => inventoryPurchaseOrder.id, { onDelete: "cascade" }),
  variantId: text("variant_id").notNull().references(() => catalogueProductVariant.id, { onDelete: "restrict" }),
  productSlug: text("product_slug").notNull(),
  productName: text("product_name").notNull(),
  variantLabel: text("variant_label").notNull(),
  sku: text("sku").notNull(),
  quantityOrdered: integer("quantity_ordered").notNull(),
  quantityReceived: integer("quantity_received").notNull().default(0),
  unitCostPesewas: integer("unit_cost_pesewas").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("inventory_po_line_variant_unique_idx").on(table.purchaseOrderId, table.variantId), index("inventory_po_line_order_idx").on(table.purchaseOrderId)]);

export const inventoryPurchaseReceipt = pgTable("inventory_purchase_receipt", {
  id: text("id").primaryKey(), // Client-generated UUID; makes retries idempotent.
  reference: text("reference").notNull().unique(),
  purchaseOrderId: text("purchase_order_id").notNull().references(() => inventoryPurchaseOrder.id, { onDelete: "restrict" }),
  receivedBy: text("received_by").references(() => user.id, { onDelete: "set null" }),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("inventory_receipt_order_created_idx").on(table.purchaseOrderId, table.createdAt)]);

export const inventoryPurchaseReceiptLine = pgTable("inventory_purchase_receipt_line", {
  id: text("id").primaryKey(),
  receiptId: text("receipt_id").notNull().references(() => inventoryPurchaseReceipt.id, { onDelete: "cascade" }),
  purchaseOrderLineId: text("purchase_order_line_id").notNull().references(() => inventoryPurchaseOrderLine.id, { onDelete: "restrict" }),
  variantId: text("variant_id").notNull().references(() => catalogueProductVariant.id, { onDelete: "restrict" }),
  productName: text("product_name").notNull(),
  variantLabel: text("variant_label").notNull(),
  sku: text("sku").notNull(),
  quantity: integer("quantity").notNull(),
}, (table) => [index("inventory_receipt_line_receipt_idx").on(table.receiptId)]);

export const inventoryStockAdjustment = pgTable("inventory_stock_adjustment", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  variantId: text("variant_id").notNull().references(() => catalogueProductVariant.id, { onDelete: "restrict" }),
  productSlug: text("product_slug").notNull(),
  productName: text("product_name").notNull(),
  variantLabel: text("variant_label").notNull(),
  sku: text("sku").notNull(),
  action: text("action", { enum: ["add", "remove", "set"] }).notNull(),
  change: integer("change").notNull(),
  previous: integer("previous").notNull(),
  next: integer("next").notNull(),
  reason: text("reason").notNull(),
  note: text("note").notNull().default(""),
  source: text("source").notNull().default("manual"),
  sourceReference: text("source_reference").notNull().default(""),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("inventory_adjustment_variant_created_idx").on(table.variantId, table.createdAt), index("inventory_adjustment_created_idx").on(table.createdAt)]);
