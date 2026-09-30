CREATE TABLE "customer_address" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"region" text NOT NULL,
	"town" text NOT NULL,
	"neighbourhood" text NOT NULL,
	"street_address" text NOT NULL,
	"delivery_note" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_order" (
	"id" text PRIMARY KEY,
	"reference" text NOT NULL UNIQUE,
	"user_id" text,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text NOT NULL,
	"fulfillment" text DEFAULT 'delivery' NOT NULL,
	"delivery_area" text DEFAULT 'accra' NOT NULL,
	"region" text NOT NULL,
	"town" text NOT NULL,
	"address" text NOT NULL,
	"delivery_note" text DEFAULT '' NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal_ghs" integer NOT NULL,
	"delivery_ghs" integer NOT NULL,
	"total_ghs" integer NOT NULL,
	"payment_method" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_return" (
	"id" text PRIMARY KEY,
	"reference" text NOT NULL UNIQUE,
	"order_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_review" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"order_id" text NOT NULL,
	"product_slug" text NOT NULL,
	"rating" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_wishlist" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"product_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone" text;--> statement-breakpoint
CREATE INDEX "customer_address_user_idx" ON "customer_address" ("user_id");--> statement-breakpoint
CREATE INDEX "customer_order_user_created_idx" ON "customer_order" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_order_email_idx" ON "customer_order" ("customer_email");--> statement-breakpoint
CREATE INDEX "customer_return_user_created_idx" ON "customer_return" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_return_order_idx" ON "customer_return" ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_user_order_product_idx" ON "customer_review" ("user_id","order_id","product_slug");--> statement-breakpoint
CREATE INDEX "customer_review_product_status_idx" ON "customer_review" ("product_slug","status");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_wishlist_user_product_idx" ON "customer_wishlist" ("user_id","product_slug");--> statement-breakpoint
CREATE INDEX "customer_wishlist_user_idx" ON "customer_wishlist" ("user_id");--> statement-breakpoint
ALTER TABLE "customer_address" ADD CONSTRAINT "customer_address_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "customer_order" ADD CONSTRAINT "customer_order_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "customer_return" ADD CONSTRAINT "customer_return_order_id_customer_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "customer_order"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "customer_return" ADD CONSTRAINT "customer_return_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "customer_review" ADD CONSTRAINT "customer_review_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "customer_review" ADD CONSTRAINT "customer_review_order_id_customer_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "customer_order"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "customer_wishlist" ADD CONSTRAINT "customer_wishlist_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;