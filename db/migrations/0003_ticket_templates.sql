CREATE TABLE "ticket_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"design" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ticket_template_id" text;--> statement-breakpoint
CREATE INDEX "ticket_templates_default_idx" ON "ticket_templates" USING btree ("is_default");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_ticket_template_id_ticket_templates_id_fk" FOREIGN KEY ("ticket_template_id") REFERENCES "public"."ticket_templates"("id") ON DELETE set null ON UPDATE no action;