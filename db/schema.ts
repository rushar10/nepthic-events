/* Nepthic Events database. Belongs to events.nepthic.com only: no other site reads or
   writes it. Money is stored in integer cents (AUD). */
import { randomUUID } from "node:crypto";
import { relations, sql } from "drizzle-orm";
import { boolean, check, customType, index, integer, jsonb, pgEnum, pgTable, real, serial, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/* CUSTOMER buys tickets; DOOR scans at the venue; STAFF runs events; ADMIN also approves refunds and changes settings. */
/* Kept for compatibility; only CUSTOMER is allowed (check constraint on users). Staff, door
   staff and admins have no accounts on this site: they use the Nepthic Admin Portal. */
export const role = pgEnum("role", ["CUSTOMER", "DOOR", "STAFF", "ADMIN"]);
export const paymentKind = pgEnum("payment_kind", ["TICKET", "REFUND"]);
export const paymentStatus = pgEnum("payment_status", ["PENDING", "SUCCEEDED", "FAILED"]);
export const eventStatus = pgEnum("event_status", ["DRAFT", "PUBLISHED", "CANCELLED"]);
export const ticketOrderStatus = pgEnum("ticket_order_status", ["PENDING", "PAID", "CANCELLED"]);
export const ticketStatus = pgEnum("ticket_status", ["VALID", "USED", "REFUND_REQUESTED", "REFUNDED", "VOID"]);
export const refundStatus = pgEnum("refund_status", ["PENDING", "APPROVED", "REJECTED"]);
/* Physical tickets and partners */
export const ticketFormat = pgEnum("ticket_format", ["ETICKET", "PHYSICAL", "BOTH"]);
export const ticketSource = pgEnum("ticket_source", ["ONLINE", "BOX_OFFICE", "PARTNER"]);
/** Physical stock lifecycle. Null for e-tickets. Validity (VALID/USED/VOID…) is `status`. */
export const physicalStage = pgEnum("physical_stage", ["GENERATED", "PRINTED", "DISTRIBUTED", "SOLD"]);
export const partnerStatus = pgEnum("partner_status", ["ACTIVE", "SUSPENDED"]);
export const allocationKind = pgEnum("allocation_kind", ["PHYSICAL", "ETICKET", "LINK"]);
export const deliveryMethod = pgEnum("delivery_method", ["PICKUP", "POST"]);

export type Role = (typeof role.enumValues)[number];
export type PaymentKind = (typeof paymentKind.enumValues)[number];
export type TicketLine = { typeId: string; name: string; quantity: number; priceCents: number };

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: role("role").notNull().default("CUSTOMER"),
  createdAt: createdAt(),
}, () => [check("users_customers_only", sql`role = 'CUSTOMER'`)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  ticketRefundCutoffHours: integer("ticket_refund_cutoff_hours").notNull().default(72),
  maxTicketsPerOrder: integer("max_tickets_per_order").notNull().default(8),
  proximityRadius: integer("proximity_radius").notNull().default(150),
  proximityIntensity: real("proximity_intensity").notNull().default(0.85),
  proximityEnabled: boolean("proximity_enabled").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  venue: text("venue").notNull(),
  address: text("address").notNull().default(""),
  city: text("city").notNull(),
  startsAt: ts("starts_at").notNull(),
  ageRestriction: text("age_restriction").notNull().default("18+"),
  hue: integer("hue").notNull().default(265),
  coverUploadId: text("cover_upload_id"),
  galleryIds: text("gallery_ids").array().notNull().default(sql`'{}'::text[]`),
  status: eventStatus("status").notNull().default("DRAFT"),
  /** How this event's tickets look (null = the default template). */
  ticketTemplateId: text("ticket_template_id").references(() => ticketTemplates.id, { onDelete: "set null" }),
  /** Ticket code format (core/ticket-code-format.ts). Null = the default. Applies to new tickets only. */
  codeFormat: jsonb("code_format"),
  /** What customers may choose at checkout. */
  ticketFormats: ticketFormat("ticket_formats").array().notNull().default(sql`'{ETICKET,PHYSICAL,BOTH}'::ticket_format[]`),
  /** Door/gate names offered in the scanner. */
  gates: text("gates").array().notNull().default(sql`'{Main}'::text[]`),
  createdAt: createdAt(),
});

/* Ticket designs, made in the Admin Portal (Events → Ticket templates). The design itself is
   a small JSON object rendered by core/ticket-design.ts. One template is the default. */
export const ticketTemplates = pgTable("ticket_templates", {
  id: id(),
  name: text("name").notNull(),
  design: jsonb("design").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [index("ticket_templates_default_idx").on(t.isDefault)]);

export const ticketTypes = pgTable("ticket_types", {
  id: id(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  capacity: integer("capacity").notNull(),
  sold: integer("sold").notNull().default(0), // includes seats held by unpaid checkouts
  sortOrder: integer("sort_order").notNull().default(0),
  /** Default ticket-type part of the code prefix, e.g. VIP, GA, EB. */
  codePrefix: text("code_prefix").notNull().default(""),
  /** Seat/zone printed on tickets, if the venue uses them. */
  zone: text("zone").notNull().default(""),
});

export const ticketOrders = pgTable("ticket_orders", {
  id: id(),
  number: serial("number").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id),
  eventId: text("event_id").notNull().references(() => events.id),
  status: ticketOrderStatus("status").notNull().default("PENDING"),
  buyerName: text("buyer_name").notNull(),
  buyerEmail: text("buyer_email").notNull(),
  items: jsonb("items").$type<TicketLine[]>().notNull(),
  totalCents: integer("total_cents").notNull(),
  /** E-ticket, physical or both (chosen at checkout). */
  format: ticketFormat("format").notNull().default("ETICKET"),
  delivery: deliveryMethod("delivery"),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  shipTo: text("ship_to"),
  shippedAt: ts("shipped_at"),
  tracking: text("tracking"),
  pickedUpAt: ts("picked_up_at"),
  /** Partner whose referral link or code brought this order. */
  partnerId: text("partner_id").references(() => partners.id),
  createdAt: createdAt(),
});

export const tickets = pgTable("tickets", {
  id: id(),
  /** The readable code printed under the QR and typed at the door (format set per event). */
  code: text("code").notNull().unique(),
  /** The code without separators or spaces, so typed codes match however they're written. */
  codeKey: text("code_key").notNull().unique(),
  /** Random id carried (signed) in the QR. Never printed, so a guessed readable code can't make a valid QR. */
  qrId: text("qr_id").notNull().unique(),
  /** The number part of the code (serial number on printed tickets). */
  serial: integer("serial"),
  ticketOrderId: text("ticket_order_id").references(() => ticketOrders.id),
  ticketTypeId: text("ticket_type_id").notNull().references(() => ticketTypes.id),
  eventId: text("event_id").notNull().references(() => events.id),
  holderName: text("holder_name").notNull(),
  /** For tickets issued by a partner or the box office to a buyer without an account. */
  buyerEmail: text("buyer_email"),
  status: ticketStatus("status").notNull().default("VALID"),
  format: ticketFormat("format").notNull().default("ETICKET"),
  stage: physicalStage("stage"),
  source: ticketSource("source").notNull().default("ONLINE"),
  partnerId: text("partner_id").references(() => partners.id),
  allocationId: text("allocation_id").references(() => allocations.id),
  batchId: text("batch_id").references(() => printBatches.id),
  /** Face value when issued (revenue and commission). */
  priceCents: integer("price_cents").notNull().default(0),
  soldAt: ts("sold_at"),
  printedAt: ts("printed_at"),
  checkedInAt: ts("checked_in_at"),
  checkedInById: text("checked_in_by_id"),
  checkedInGate: text("checked_in_gate"),
  voidReason: text("void_reason"),
  reissuedFromId: text("reissued_from_id"),
  createdAt: createdAt(),
}, (t) => [
  index("tickets_event_status_idx").on(t.eventId, t.status),
  index("tickets_partner_idx").on(t.partnerId),
  index("tickets_batch_idx").on(t.batchId),
]);

/* Partners: resellers, venues, promoters, sponsors and outlets that sell Nepthic tickets. */
export const partners = pgTable("partners", {
  id: id(),
  name: text("name").notNull(),
  /** Short code printed on their tickets and used in ticket codes, e.g. P012. */
  code: text("code").notNull().unique(),
  kind: text("kind").notNull().default("RESELLER"),
  contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  /** Badge colour shown in the scanner. */
  color: text("color").notNull().default("#8B5CF6"),
  commissionPct: real("commission_pct").notNull().default(0),
  paymentTerms: text("payment_terms").notNull().default(""),
  /** For their referral link (?ref=…) and promo code. */
  referralCode: text("referral_code").notNull().unique(),
  status: partnerStatus("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
});

/* Tickets set aside for a partner at one event. */
export const allocations = pgTable("allocations", {
  id: id(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  partnerId: text("partner_id").notNull().references(() => partners.id),
  ticketTypeId: text("ticket_type_id").notNull().references(() => ticketTypes.id),
  kind: allocationKind("kind").notNull(),
  quantity: integer("quantity").notNull(),
  /** Reserved number range for this allocation's codes (inclusive), optional. */
  rangeStart: integer("range_start"),
  rangeEnd: integer("range_end"),
  revokedAt: ts("revoked_at"),
  createdAt: createdAt(),
}, (t) => [index("allocations_event_idx").on(t.eventId), check("allocations_qty_positive", sql`${t.quantity} > 0`)]);

/* One bulk run of physical tickets ("Generate 500 VIP for Event X"). */
export const printBatches = pgTable("print_batches", {
  id: id(),
  number: serial("number").notNull().unique(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  ticketTypeId: text("ticket_type_id").notNull().references(() => ticketTypes.id),
  partnerId: text("partner_id").references(() => partners.id),
  allocationId: text("allocation_id").references(() => allocations.id),
  quantity: integer("quantity").notNull(),
  printFormat: text("print_format").notNull().default("A4"),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

/* Next number per code sequence (per event; or per ticket type / partner, depending on the format). */
export const codeCounters = pgTable("code_counters", {
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  scopeKey: text("scope_key").notNull(),
  next: integer("next").notNull(),
}, (t) => [primaryKey({ columns: [t.eventId, t.scopeKey] })]);

/* Every scan at the door, admitted or not (reports, timelines and suspicious-activity alerts). */
export const scans = pgTable("scans", {
  id: id(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  ticketId: text("ticket_id").references(() => tickets.id),
  code: text("code"),
  gate: text("gate").notNull().default("Main"),
  result: text("result").notNull(),
  method: text("method").notNull().default("CAMERA"),
  partnerId: text("partner_id"),
  staff: text("staff"),
  at: ts("at").notNull().defaultNow(),
}, (t) => [index("scans_event_at_idx").on(t.eventId, t.at)]);

export const refundRequests = pgTable("refund_requests", {
  id: id(),
  number: serial("number").notNull().unique(),
  ticketId: text("ticket_id").notNull().references(() => tickets.id),
  userId: text("user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: refundStatus("status").notNull().default("PENDING"),
  decisionNote: text("decision_note"),
  reviewedById: text("reviewed_by_id"),
  reviewedAt: ts("reviewed_at"),
  createdAt: createdAt(),
});

export const payments = pgTable("payments", {
  id: id(),
  kind: paymentKind("kind").notNull(),
  status: paymentStatus("status").notNull().default("PENDING"),
  amountCents: integer("amount_cents").notNull(), // negative for refunds
  description: text("description").notNull(),
  ticketOrderId: text("ticket_order_id").references(() => ticketOrders.id),
  stripeSessionId: text("stripe_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeRefundId: text("stripe_refund_id"),
  refundOfId: text("refund_of_id"),
  paidAt: ts("paid_at"),
  createdAt: createdAt(),
}, (t) => [index("payments_ticket_order_idx").on(t.ticketOrderId)]);

export const uploads = pgTable("uploads", {
  id: id(),
  userId: text("user_id"),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});

export const emailLog = pgTable("email_log", {
  id: id(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  data: jsonb("data"),
  createdAt: createdAt(),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId)]);

/* relations (for db.query.* with `with`) */
export const usersRelations = relations(users, ({ many }) => ({ ticketOrders: many(ticketOrders) }));
export const sessionsRelations = relations(sessions, ({ one }) => ({ user: one(users, { fields: [sessions.userId], references: [users.id] }) }));
export const paymentsRelations = relations(payments, ({ one }) => ({
  ticketOrder: one(ticketOrders, { fields: [payments.ticketOrderId], references: [ticketOrders.id] }),
}));
export const eventsRelations = relations(events, ({ one, many }) => ({
  ticketTypes: many(ticketTypes), tickets: many(tickets), ticketOrders: many(ticketOrders),
  ticketTemplate: one(ticketTemplates, { fields: [events.ticketTemplateId], references: [ticketTemplates.id] }),
}));
export const ticketTypesRelations = relations(ticketTypes, ({ one }) => ({ event: one(events, { fields: [ticketTypes.eventId], references: [events.id] }) }));
export const ticketOrdersRelations = relations(ticketOrders, ({ one, many }) => ({
  user: one(users, { fields: [ticketOrders.userId], references: [users.id] }),
  event: one(events, { fields: [ticketOrders.eventId], references: [events.id] }),
  tickets: many(tickets), payments: many(payments),
}));
export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  partner: one(partners, { fields: [tickets.partnerId], references: [partners.id] }),
  allocation: one(allocations, { fields: [tickets.allocationId], references: [allocations.id] }),
  ticketOrder: one(ticketOrders, { fields: [tickets.ticketOrderId], references: [ticketOrders.id] }),
  ticketType: one(ticketTypes, { fields: [tickets.ticketTypeId], references: [ticketTypes.id] }),
  event: one(events, { fields: [tickets.eventId], references: [events.id] }),
  refundRequests: many(refundRequests),
}));
export const refundRequestsRelations = relations(refundRequests, ({ one }) => ({
  ticket: one(tickets, { fields: [refundRequests.ticketId], references: [tickets.id] }),
  user: one(users, { fields: [refundRequests.userId], references: [users.id] }),
}));

/* Things a signed-in person has saved (the heart on a event card). Private to that person. */
export const savedItems = pgTable("saved_items", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.itemId] })]);

/* Admin preview sessions. A Nepthic Admin Portal user who clicks "View live site" gets one of
   these (30 minutes), created from a one-time token signed by the portal. While it's valid the
   site shows them the admin preview bar. Customers never get one; only a hash of the cookie is stored. */
export const adminPreviews = pgTable("admin_previews", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const partnersRelations = relations(partners, ({ many }) => ({ allocations: many(allocations), tickets: many(tickets) }));
export const allocationsRelations = relations(allocations, ({ one, many }) => ({
  partner: one(partners, { fields: [allocations.partnerId], references: [partners.id] }),
  event: one(events, { fields: [allocations.eventId], references: [events.id] }),
  ticketType: one(ticketTypes, { fields: [allocations.ticketTypeId], references: [ticketTypes.id] }),
  tickets: many(tickets),
}));
export const printBatchesRelations = relations(printBatches, ({ one, many }) => ({
  event: one(events, { fields: [printBatches.eventId], references: [events.id] }),
  ticketType: one(ticketTypes, { fields: [printBatches.ticketTypeId], references: [ticketTypes.id] }),
  partner: one(partners, { fields: [printBatches.partnerId], references: [partners.id] }),
  tickets: many(tickets),
}));
