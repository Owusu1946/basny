CREATE TABLE "payment_settings" (
	"id" text PRIMARY KEY,
	"provider" text NOT NULL UNIQUE,
	"public_key" text NOT NULL,
	"encrypted_secret_key" text NOT NULL,
	"encryption_iv" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transaction" (
	"id" text PRIMARY KEY,
	"order_id" text NOT NULL,
	"provider" text NOT NULL,
	"reference" text NOT NULL UNIQUE,
	"provider_transaction_id" text,
	"amount_subunits" integer NOT NULL,
	"currency" text DEFAULT 'GHS' NOT NULL,
	"status" text DEFAULT 'initialized' NOT NULL,
	"channel" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_order" ADD COLUMN "payment_provider_reference" text;--> statement-breakpoint
ALTER TABLE "customer_order" ADD CONSTRAINT "customer_order_payment_provider_reference_key" UNIQUE("payment_provider_reference");--> statement-breakpoint
CREATE INDEX "payment_transaction_order_idx" ON "payment_transaction" ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_transaction_status_idx" ON "payment_transaction" ("status","created_at");--> statement-breakpoint
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "payment_transaction" ADD CONSTRAINT "payment_transaction_order_id_customer_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "customer_order"("id") ON DELETE CASCADE;