-- Tickets bought online before physical tickets existed: they were sold when they were issued.
UPDATE "tickets" SET "sold_at" = "created_at" WHERE "sold_at" IS NULL AND "ticket_order_id" IS NOT NULL AND "status" <> 'VOID';
