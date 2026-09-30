import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const staffRole = pgTable("staff_role", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["content_editor", "sales_order_admin", "super_admin"] }).notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
});
