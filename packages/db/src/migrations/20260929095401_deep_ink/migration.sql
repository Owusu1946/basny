CREATE TABLE "customer_cart" (
	"id" text PRIMARY KEY,
	"token_hash" text NOT NULL UNIQUE,
	"user_id" text,
	"customer_name" text,
	"customer_email" text,
	"customer_phone" text,
	"lines" jsonb NOT NULL,
	"subtotal_ghs" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_order" ADD COLUMN "cart_id" text;--> statement-breakpoint
CREATE INDEX "customer_cart_status_activity_idx" ON "customer_cart" ("status","last_active_at");--> statement-breakpoint
CREATE INDEX "customer_cart_email_idx" ON "customer_cart" ("customer_email");--> statement-breakpoint
ALTER TABLE "customer_cart" ADD CONSTRAINT "customer_cart_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "customer_order" ADD CONSTRAINT "customer_order_cart_id_customer_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "customer_cart"("id") ON DELETE SET NULL;