CREATE TABLE "staff_role" (
	"user_id" text PRIMARY KEY,
	"role" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_role" ADD CONSTRAINT "staff_role_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;