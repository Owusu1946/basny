CREATE TABLE "catalogue_category" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue_collection" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "catalogue_collection_product" (
	"collection_id" text NOT NULL,
	"product_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue_product" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"category_id" text NOT NULL,
	"type" text NOT NULL,
	"price_ghs" integer NOT NULL,
	"description" text NOT NULL,
	"material" text DEFAULT '' NOT NULL,
	"meta_title" text DEFAULT '' NOT NULL,
	"meta_description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "catalogue_product_media" (
	"id" text PRIMARY KEY,
	"product_id" text NOT NULL,
	"object_key" text,
	"url" text NOT NULL,
	"alt" text NOT NULL,
	"width" integer,
	"height" integer,
	"mime_type" text DEFAULT 'image/webp' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue_product_variant" (
	"id" text PRIMARY KEY,
	"product_id" text NOT NULL,
	"sku" text NOT NULL UNIQUE,
	"colour" text NOT NULL,
	"colour_hex" text DEFAULT '#765139' NOT NULL,
	"size" text,
	"price_ghs" integer NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_review" ADD COLUMN "reply" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_review" ADD COLUMN "replied_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_collection_product_pk" ON "catalogue_collection_product" ("collection_id","product_id");--> statement-breakpoint
CREATE INDEX "catalogue_collection_product_product_idx" ON "catalogue_collection_product" ("product_id");--> statement-breakpoint
CREATE INDEX "catalogue_product_category_status_idx" ON "catalogue_product" ("category_id","status");--> statement-breakpoint
CREATE INDEX "catalogue_product_status_updated_idx" ON "catalogue_product" ("status","updated_at");--> statement-breakpoint
CREATE INDEX "catalogue_media_product_order_idx" ON "catalogue_product_media" ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_variant_product_options_idx" ON "catalogue_product_variant" ("product_id","colour","size");--> statement-breakpoint
CREATE INDEX "catalogue_variant_product_stock_idx" ON "catalogue_product_variant" ("product_id","active","stock");--> statement-breakpoint
ALTER TABLE "catalogue_collection" ADD CONSTRAINT "catalogue_collection_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "catalogue_collection_product" ADD CONSTRAINT "catalogue_collection_product_0E5WAfxlK6eI_fkey" FOREIGN KEY ("collection_id") REFERENCES "catalogue_collection"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "catalogue_collection_product" ADD CONSTRAINT "catalogue_collection_product_dN3QyXgA5XjI_fkey" FOREIGN KEY ("product_id") REFERENCES "catalogue_product"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "catalogue_product" ADD CONSTRAINT "catalogue_product_category_id_catalogue_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalogue_category"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "catalogue_product" ADD CONSTRAINT "catalogue_product_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "catalogue_product" ADD CONSTRAINT "catalogue_product_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "catalogue_product_media" ADD CONSTRAINT "catalogue_product_media_product_id_catalogue_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalogue_product"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "catalogue_product_variant" ADD CONSTRAINT "catalogue_product_variant_product_id_catalogue_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalogue_product"("id") ON DELETE CASCADE;