CREATE TABLE "admin_previews" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Staff, door and admin logins move to the separate Nepthic Admin Portal. Remove them from
-- this site, then make sure only customers can ever have an account here.
DELETE FROM "users" WHERE "role" <> 'CUSTOMER';
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_customers_only" CHECK (role = 'CUSTOMER');