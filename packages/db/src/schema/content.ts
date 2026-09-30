import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const homeContent = pgTable("home_content", {
  id: text("id").primaryKey(),
  draft: jsonb("draft").notNull(),
  published: jsonb("published").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  publishedBy: text("published_by"),
  publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  history: jsonb("history").notNull().default([]),
});
