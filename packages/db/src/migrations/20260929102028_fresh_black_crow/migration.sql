CREATE TABLE "inventory_purchase_order" (
	"id" text PRIMARY KEY,
	"reference" text NOT NULL UNIQUE,
	"supplier_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"expected_at" text,
	"supplier_reference" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"updated_by" text,
	"ordered_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_purchase_order_line" (
	"id" text PRIMARY KEY,
	"purchase_order_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"product_slug" text NOT NULL,
	"product_name" text NOT NULL,
	"variant_label" text NOT NULL,
	"sku" text NOT NULL,
	"quantity_ordered" integer NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"unit_cost_pesewas" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_purchase_receipt" (
	"id" text PRIMARY KEY,
	"reference" text NOT NULL UNIQUE,
	"purchase_order_id" text NOT NULL,
	"received_by" text,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_purchase_receipt_line" (
	"id" text PRIMARY KEY,
	"receipt_id" text NOT NULL,
	"purchase_order_line_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"product_name" text NOT NULL,
	"variant_label" text NOT NULL,
	"sku" text NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_stock_adjustment" (
	"id" text PRIMARY KEY,
	"reference" text NOT NULL UNIQUE,
	"variant_id" text NOT NULL,
	"product_slug" text NOT NULL,
	"product_name" text NOT NULL,
	"variant_label" text NOT NULL,
	"sku" text NOT NULL,
	"action" text NOT NULL,
	"change" integer NOT NULL,
	"previous" integer NOT NULL,
	"next" integer NOT NULL,
	"reason" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_reference" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_supplier" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"phone" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"lead_time_days" integer DEFAULT 7 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalogue_product_variant" ADD COLUMN "low_stock_threshold" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
CREATE INDEX "inventory_po_status_created_idx" ON "inventory_purchase_order" ("status","created_at");--> statement-breakpoint
CREATE INDEX "inventory_po_supplier_idx" ON "inventory_purchase_order" ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_po_line_variant_unique_idx" ON "inventory_purchase_order_line" ("purchase_order_id","variant_id");--> statement-breakpoint
CREATE INDEX "inventory_po_line_order_idx" ON "inventory_purchase_order_line" ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "inventory_receipt_order_created_idx" ON "inventory_purchase_receipt" ("purchase_order_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_receipt_line_receipt_idx" ON "inventory_purchase_receipt_line" ("receipt_id");--> statement-breakpoint
CREATE INDEX "inventory_adjustment_variant_created_idx" ON "inventory_stock_adjustment" ("variant_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_adjustment_created_idx" ON "inventory_stock_adjustment" ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_supplier_active_name_idx" ON "inventory_supplier" ("active","name");--> statement-breakpoint
ALTER TABLE "inventory_purchase_order" ADD CONSTRAINT "inventory_purchase_order_supplier_id_inventory_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "inventory_supplier"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "inventory_purchase_order" ADD CONSTRAINT "inventory_purchase_order_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inventory_purchase_order" ADD CONSTRAINT "inventory_purchase_order_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inventory_purchase_order_line" ADD CONSTRAINT "inventory_purchase_order_line_iJUOvt8A4lqL_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "inventory_purchase_order"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inventory_purchase_order_line" ADD CONSTRAINT "inventory_purchase_order_line_3XEKDHTnD2aY_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalogue_product_variant"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "inventory_purchase_receipt" ADD CONSTRAINT "inventory_purchase_receipt_nuCg7teC1ddK_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "inventory_purchase_order"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "inventory_purchase_receipt" ADD CONSTRAINT "inventory_purchase_receipt_received_by_user_id_fkey" FOREIGN KEY ("received_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inventory_purchase_receipt_line" ADD CONSTRAINT "inventory_purchase_receipt_line_saG9tOvhZF6N_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory_purchase_receipt"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inventory_purchase_receipt_line" ADD CONSTRAINT "inventory_purchase_receipt_line_7EwKQ4hNicS1_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "inventory_purchase_order_line"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "inventory_purchase_receipt_line" ADD CONSTRAINT "inventory_purchase_receipt_line_KYW2QkRZmPxa_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalogue_product_variant"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "inventory_stock_adjustment" ADD CONSTRAINT "inventory_stock_adjustment_3cmhPY7mv8t3_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalogue_product_variant"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "inventory_stock_adjustment" ADD CONSTRAINT "inventory_stock_adjustment_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inventory_supplier" ADD CONSTRAINT "inventory_supplier_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "inventory_supplier" ADD CONSTRAINT "inventory_supplier_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;