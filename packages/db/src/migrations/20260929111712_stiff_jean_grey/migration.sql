CREATE TABLE "marketing_discount_code" (
	"id" text PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"scope" text NOT NULL,
	"target" jsonb DEFAULT '{}' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"minimum_ghs" integer DEFAULT 0 NOT NULL,
	"maximum_discount_ghs" integer,
	"usage_limit" integer NOT NULL,
	"per_customer_limit" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_promotion" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"discount_percent" integer NOT NULL,
	"scope" text NOT NULL,
	"target" jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_redemption" (
	"id" text PRIMARY KEY,
	"discount_code_id" text NOT NULL,
	"order_id" text NOT NULL,
	"customer_key" text NOT NULL,
	"discount_ghs" integer NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "customer_order" ADD COLUMN "discount_ghs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_order" ADD COLUMN "discount_code" text;--> statement-breakpoint
ALTER TABLE "customer_order" ADD COLUMN "sales_channel" text DEFAULT 'online' NOT NULL;--> statement-breakpoint
CREATE INDEX "marketing_discount_active_dates_idx" ON "marketing_discount_code" ("active","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "marketing_promotion_status_dates_idx" ON "marketing_promotion" ("status","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_redemption_order_code_idx" ON "marketing_redemption" ("discount_code_id","order_id");--> statement-breakpoint
CREATE INDEX "marketing_redemption_code_status_idx" ON "marketing_redemption" ("discount_code_id","status");--> statement-breakpoint
CREATE INDEX "marketing_redemption_customer_idx" ON "marketing_redemption" ("discount_code_id","customer_key","status");--> statement-breakpoint
ALTER TABLE "marketing_discount_code" ADD CONSTRAINT "marketing_discount_code_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "marketing_discount_code" ADD CONSTRAINT "marketing_discount_code_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "marketing_promotion" ADD CONSTRAINT "marketing_promotion_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "marketing_promotion" ADD CONSTRAINT "marketing_promotion_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "marketing_redemption" ADD CONSTRAINT "marketing_redemption_SCprHVuWsHt9_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "marketing_discount_code"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "marketing_redemption" ADD CONSTRAINT "marketing_redemption_order_id_customer_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "customer_order"("id") ON DELETE CASCADE;