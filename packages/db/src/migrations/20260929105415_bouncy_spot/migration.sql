CREATE TABLE "customer_admin_profile" (
	"id" text PRIMARY KEY,
	"normalized_email" text NOT NULL UNIQUE,
	"internal_note" text DEFAULT '' NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_segment" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL UNIQUE,
	"rule" text NOT NULL,
	"threshold_ghs" integer DEFAULT 500 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "customer_admin_profile_updated_idx" ON "customer_admin_profile" ("updated_at");--> statement-breakpoint
CREATE INDEX "customer_segment_updated_idx" ON "customer_segment" ("updated_at");--> statement-breakpoint
ALTER TABLE "customer_admin_profile" ADD CONSTRAINT "customer_admin_profile_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "customer_segment" ADD CONSTRAINT "customer_segment_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "customer_segment" ADD CONSTRAINT "customer_segment_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;