CREATE TABLE "finance_expense" (
	"id" text PRIMARY KEY,
	"incurred_on" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount_subunits" integer NOT NULL,
	"payment_method" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_reconciliation" (
	"settlement_id" text PRIMARY KEY,
	"bank_amount_subunits" integer NOT NULL,
	"bank_reference" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reconciled_by" text NOT NULL,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_sync" (
	"key" text PRIMARY KEY,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paystack_settlement" (
	"id" text PRIMARY KEY,
	"status" text NOT NULL,
	"currency" text NOT NULL,
	"total_processed_subunits" integer NOT NULL,
	"total_fees_subunits" integer NOT NULL,
	"effective_amount_subunits" integer NOT NULL,
	"settlement_date" timestamp with time zone,
	"provider_created_at" timestamp with time zone,
	"provider_updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paystack_settlement_transaction" (
	"id" text PRIMARY KEY,
	"settlement_id" text NOT NULL,
	"status" text NOT NULL,
	"currency" text NOT NULL,
	"reference" text NOT NULL,
	"amount_subunits" integer NOT NULL,
	"fees_subunits" integer NOT NULL,
	"paid_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "catalogue_product_pos_search_idx" ON "catalogue_product" USING gin (to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("type", '') || ' ' || coalesce("slug", '')));--> statement-breakpoint
CREATE INDEX "finance_expense_status_date_idx" ON "finance_expense" ("status","incurred_on");--> statement-breakpoint
CREATE INDEX "finance_expense_created_idx" ON "finance_expense" ("created_at");--> statement-breakpoint
CREATE INDEX "paystack_settlement_status_date_idx" ON "paystack_settlement" ("status","settlement_date");--> statement-breakpoint
CREATE INDEX "paystack_settlement_tx_batch_idx" ON "paystack_settlement_transaction" ("settlement_id");--> statement-breakpoint
CREATE INDEX "paystack_settlement_tx_reference_idx" ON "paystack_settlement_transaction" ("reference");--> statement-breakpoint
ALTER TABLE "finance_expense" ADD CONSTRAINT "finance_expense_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "finance_expense" ADD CONSTRAINT "finance_expense_voided_by_user_id_fkey" FOREIGN KEY ("voided_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "finance_reconciliation" ADD CONSTRAINT "finance_reconciliation_TZSWFA5d0C1J_fkey" FOREIGN KEY ("settlement_id") REFERENCES "paystack_settlement"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "finance_reconciliation" ADD CONSTRAINT "finance_reconciliation_reconciled_by_user_id_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "paystack_settlement_transaction" ADD CONSTRAINT "paystack_settlement_transaction_XW0DfbUb39Ts_fkey" FOREIGN KEY ("settlement_id") REFERENCES "paystack_settlement"("id") ON DELETE CASCADE;
