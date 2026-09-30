import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** Server-owned configuration used by Storefront and Settings workspaces. */
export const adminSetting = pgTable("admin_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  revision: text("revision").notNull(),
  updatedBy: text("updated_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Append-only audit entries; ordinary settings writes never overwrite history. */
export const adminAuditLog = pgTable("admin_audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("admin_audit_log_created_idx").on(table.createdAt), index("admin_audit_log_actor_idx").on(table.actorId, table.createdAt)]);
