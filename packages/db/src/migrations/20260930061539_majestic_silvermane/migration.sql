ALTER TABLE "restock_subscription" ADD COLUMN "confirmation_expires_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "restock_subscription" ALTER COLUMN "confirmation_expires_at" DROP DEFAULT;
