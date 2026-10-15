CREATE TYPE "public"."allocation_kind" AS ENUM('PHYSICAL', 'ETICKET', 'LINK');--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('PICKUP', 'POST');--> statement-breakpoint
CREATE TYPE "public"."partner_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."physical_stage" AS ENUM('GENERATED', 'PRINTED', 'DISTRIBUTED', 'SOLD');--> statement-breakpoint
CREATE TYPE "public"."ticket_format" AS ENUM('ETICKET', 'PHYSICAL', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."ticket_source" AS ENUM('ONLINE', 'BOX_OFFICE', 'PARTNER');--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"ticket_type_id" text NOT NULL,
	"kind" "allocation_kind" NOT NULL,
	"quantity" integer NOT NULL,
	"range_start" integer,
	"range_end" integer,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_qty_positive" CHECK ("allocations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "code_counters" (
	"event_id" text NOT NULL,
	"scope_key" text NOT NULL,
	"next" integer NOT NULL,
	CONSTRAINT "code_counters_event_id_scope_key_pk" PRIMARY KEY("event_id","scope_key")
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'RESELLER' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#8B5CF6' NOT NULL,
	"commission_pct" real DEFAULT 0 NOT NULL,
	"payment_terms" text DEFAULT '' NOT NULL,
	"referral_code" text NOT NULL,
	"status" "partner_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_code_unique" UNIQUE("code"),
	CONSTRAINT "partners_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "print_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"number" serial NOT NULL,
	"event_id" text NOT NULL,
	"ticket_type_id" text NOT NULL,
	"partner_id" text,
	"allocation_id" text,
	"quantity" integer NOT NULL,
	"print_format" text DEFAULT 'A4' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_batches_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"ticket_id" text,
	"code" text,
	"gate" text DEFAULT 'Main' NOT NULL,
	"result" text NOT NULL,
	"method" text DEFAULT 'CAMERA' NOT NULL,
	"partner_id" text,
	"staff" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "ticket_order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "code_format" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ticket_formats" "ticket_format"[] DEFAULT '{ETICKET,PHYSICAL,BOTH}'::ticket_format[] NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "gates" text[] DEFAULT '{Main}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "format" "ticket_format" DEFAULT 'ETICKET' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "delivery" "delivery_method";--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "delivery_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "ship_to" text;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "tracking" text;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "picked_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "partner_id" text;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "code_prefix" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "zone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "code_key" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "qr_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "serial" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "buyer_email" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "format" "ticket_format" DEFAULT 'ETICKET' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "stage" "physical_stage";--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "source" "ticket_source" DEFAULT 'ONLINE' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "partner_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "allocation_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "price_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sold_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "checked_in_gate" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "reissued_from_id" text;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_counters" ADD CONSTRAINT "code_counters_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_batches" ADD CONSTRAINT "print_batches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_batches" ADD CONSTRAINT "print_batches_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_batches" ADD CONSTRAINT "print_batches_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_batches" ADD CONSTRAINT "print_batches_allocation_id_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocations_event_idx" ON "allocations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "scans_event_at_idx" ON "scans" USING btree ("event_id","at");--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_allocation_id_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_batch_id_print_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."print_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_partner_idx" ON "tickets" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "tickets_batch_idx" ON "tickets" USING btree ("batch_id");--> statement-breakpoint
-- Existing tickets: readable key from their code, a fresh random QR id, face value from their type.
UPDATE "tickets" SET "code_key" = regexp_replace(upper("code"), '[^A-Z0-9]', '', 'g'),
  "qr_id" = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
  "price_cents" = (SELECT "price_cents" FROM "ticket_types" WHERE "ticket_types"."id" = "tickets"."ticket_type_id"),
  "serial" = NULL;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "code_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "qr_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_code_key_unique" UNIQUE("code_key");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_qr_id_unique" UNIQUE("qr_id");