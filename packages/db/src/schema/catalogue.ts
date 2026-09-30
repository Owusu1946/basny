import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";

export const catalogueCategory = pgTable("catalogue_category", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const catalogueProduct = pgTable("catalogue_product", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  categoryId: text("category_id").notNull().references(() => catalogueCategory.id, { onDelete: "restrict" }),
  type: text("type").notNull(),
  priceGhs: integer("price_ghs").notNull(),
  description: text("description").notNull(),
  material: text("material").notNull().default(""),
  metaTitle: text("meta_title").notNull().default(""),
  metaDescription: text("meta_description").notNull().default(""),
  status: text("status", { enum: ["published", "draft", "archived"] }).notNull().default("draft"),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
}, (table) => [index("catalogue_product_category_status_idx").on(table.categoryId, table.status), index("catalogue_product_status_updated_idx").on(table.status, table.updatedAt), index("catalogue_product_pos_page_idx").on(table.status, table.createdAt, table.id), index("catalogue_product_pos_search_idx").using("gin", sql`to_tsvector('simple', coalesce(${table.name}, '') || ' ' || coalesce(${table.type}, '') || ' ' || coalesce(${table.slug}, ''))`)]);

export const catalogueProductVariant = pgTable("catalogue_product_variant", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => catalogueProduct.id, { onDelete: "cascade" }),
  sku: text("sku").notNull().unique(),
  colour: text("colour").notNull(),
  colourHex: text("colour_hex").notNull().default("#765139"),
  size: text("size"),
  priceGhs: integer("price_ghs").notNull(),
  stock: integer("stock").notNull().default(0),
  reservedStock: integer("reserved_stock").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(3),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("catalogue_variant_product_options_idx").on(table.productId, table.colour, table.size), index("catalogue_variant_product_stock_idx").on(table.productId, table.active, table.stock), check("catalogue_variant_stock_reservation_check", sql`${table.stock} >= ${table.reservedStock} AND ${table.reservedStock} >= 0`)]);

export const catalogueProductMedia = pgTable("catalogue_product_media", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => catalogueProduct.id, { onDelete: "cascade" }),
  objectKey: text("object_key"),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  detailUrl: text("detail_url"),
  alt: text("alt").notNull(),
  width: integer("width"),
  height: integer("height"),
  mimeType: text("mime_type").notNull().default("image/webp"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("catalogue_media_product_order_idx").on(table.productId, table.sortOrder)]);

export const catalogueCollection = pgTable("catalogue_collection", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["published", "draft"] }).notNull().default("draft"),
  featured: boolean("featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

export const catalogueCollectionProduct = pgTable("catalogue_collection_product", {
  collectionId: text("collection_id").notNull().references(() => catalogueCollection.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => catalogueProduct.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("catalogue_collection_product_pk").on(table.collectionId, table.productId), index("catalogue_collection_product_product_idx").on(table.productId)]);
