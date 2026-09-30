CREATE TABLE "inventory_reservation" (
	"id" text PRIMARY KEY,
	"order_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restock_subscription" (
	"id" text PRIMARY KEY,
	"variant_id" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claim_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"confirmed_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalogue_product_variant" ADD COLUMN "reserved_stock" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservation_order_variant_idx" ON "inventory_reservation" ("order_id","variant_id");--> statement-breakpoint
CREATE INDEX "inventory_reservation_expiry_idx" ON "inventory_reservation" ("status","expires_at");--> statement-breakpoint
CREATE INDEX "inventory_reservation_variant_status_idx" ON "inventory_reservation" ("variant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "restock_subscription_variant_email_idx" ON "restock_subscription" ("variant_id","email");--> statement-breakpoint
CREATE INDEX "restock_subscription_delivery_idx" ON "restock_subscription" ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_order_id_customer_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "customer_order"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_tF26qh74gh2J_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalogue_product_variant"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "restock_subscription" ADD CONSTRAINT "restock_subscription_04ej1ygGEeTT_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalogue_product_variant"("id") ON DELETE CASCADE;