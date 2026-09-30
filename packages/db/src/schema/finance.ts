import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const financeExpense = pgTable("finance_expense", {
  id: text("id").primaryKey(),
  incurredOn: text("incurred_on").notNull(),
  category: text("category", { enum: ["packaging", "delivery", "utilities", "rent", "supplies", "marketing", "other"] }).notNull(),
  description: text("description").notNull(),
  amountSubunits: integer("amount_subunits").notNull(),
  paymentMethod: text("payment_method", { enum: ["cash", "mobile_money", "bank_transfer", "card"] }).notNull(),
  reference: text("reference").notNull().default(""),
  status: text("status", { enum: ["active", "void"] }).notNull().default("active"),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  voidedBy: text("voided_by").references(() => user.id, { onDelete: "set null" }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("finance_expense_status_date_idx").on(t.status, t.incurredOn), index("finance_expense_created_idx").on(t.createdAt)]);

export const paystackSettlement = pgTable("paystack_settlement", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  currency: text("currency").notNull(),
  totalProcessedSubunits: integer("total_processed_subunits").notNull(),
  totalFeesSubunits: integer("total_fees_subunits").notNull(),
  effectiveAmountSubunits: integer("effective_amount_subunits").notNull(),
  settlementDate: timestamp("settlement_date", { withTimezone: true }),
  providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
  providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("paystack_settlement_status_date_idx").on(t.status, t.settlementDate)]);

export const paystackSettlementTransaction = pgTable("paystack_settlement_transaction", {
  id: text("id").primaryKey(),
  settlementId: text("settlement_id").notNull().references(() => paystackSettlement.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  currency: text("currency").notNull(),
  reference: text("reference").notNull(),
  amountSubunits: integer("amount_subunits").notNull(),
  feesSubunits: integer("fees_subunits").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("paystack_settlement_tx_batch_idx").on(t.settlementId), index("paystack_settlement_tx_reference_idx").on(t.reference)]);

export const financeReconciliation = pgTable("finance_reconciliation", {
  settlementId: text("settlement_id").primaryKey().references(() => paystackSettlement.id, { onDelete: "restrict" }),
  bankAmountSubunits: integer("bank_amount_subunits").notNull(),
  bankReference: text("bank_reference").notNull(),
  note: text("note").notNull().default(""),
  reconciledBy: text("reconciled_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }).defaultNow().notNull(),
});

export const financeSync = pgTable("finance_sync", {
  key: text("key").primaryKey(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
