/* Nepthic Events database. Belongs to events.nepthic.com only: no other site reads or
   writes it. Money is stored in integer cents (AUD). */
import { randomUUID } from "node:crypto";
import { relations, sql } from "drizzle-orm";
import { boolean, customType, index, integer, jsonb, pgEnum, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/* CUSTOMER buys tickets; DOOR scans at the venue; STAFF runs events; ADMIN also approves refunds and changes settings. */
export const role = pgEnum("role", ["CUSTOMER", "DOOR", "STAFF", "ADMIN"]);
export const paymentKind = pgEnum("payment_kind", ["TICKET", "REFUND"]);
export const paymentStatus = pgEnum("payment_status", ["PENDING", "SUCCEEDED", "FAILED"]);
export const eventStatus = pgEnum("event_status", ["DRAFT", "PUBLISHED", "CANCELLED"]);
export const ticketOrderStatus = pgEnum("ticket_order_status", ["PENDING", "PAID", "CANCELLED"]);
export const ticketStatus = pgEnum("ticket_status", ["VALID", "USED", "REFUND_REQUESTED", "REFUNDED", "VOID"]);
export const refundStatus = pgEnum("refund_status", ["PENDING", "APPROVED", "REJECTED"]);

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
});

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
  createdAt: createdAt(),
});

export const ticketTypes = pgTable("ticket_types", {
  id: id(),
  eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  capacity: integer("capacity").notNull(),
  sold: integer("sold").notNull().default(0), // includes seats held by unpaid checkouts
  sortOrder: integer("sort_order").notNull().default(0),
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
  createdAt: createdAt(),
});

export const tickets = pgTable("tickets", {
  id: id(),
  code: text("code").notNull().unique(),
  ticketOrderId: text("ticket_order_id").notNull().references(() => ticketOrders.id),
  ticketTypeId: text("ticket_type_id").notNull().references(() => ticketTypes.id),
  eventId: text("event_id").notNull().references(() => events.id),
  holderName: text("holder_name").notNull(),
  status: ticketStatus("status").notNull().default("VALID"),
  checkedInAt: ts("checked_in_at"),
  checkedInById: text("checked_in_by_id"),
  createdAt: createdAt(),
}, (t) => [index("tickets_event_status_idx").on(t.eventId, t.status)]);

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
export const eventsRelations = relations(events, ({ many }) => ({ ticketTypes: many(ticketTypes), tickets: many(tickets), ticketOrders: many(ticketOrders) }));
export const ticketTypesRelations = relations(ticketTypes, ({ one }) => ({ event: one(events, { fields: [ticketTypes.eventId], references: [events.id] }) }));
export const ticketOrdersRelations = relations(ticketOrders, ({ one, many }) => ({
  user: one(users, { fields: [ticketOrders.userId], references: [users.id] }),
  event: one(events, { fields: [ticketOrders.eventId], references: [events.id] }),
  tickets: many(tickets), payments: many(payments),
}));
export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  ticketOrder: one(ticketOrders, { fields: [tickets.ticketOrderId], references: [ticketOrders.id] }),
  ticketType: one(ticketTypes, { fields: [tickets.ticketTypeId], references: [ticketTypes.id] }),
  event: one(events, { fields: [tickets.eventId], references: [events.id] }),
  refundRequests: many(refundRequests),
}));
export const refundRequestsRelations = relations(refundRequests, ({ one }) => ({
  ticket: one(tickets, { fields: [refundRequests.ticketId], references: [tickets.id] }),
  user: one(users, { fields: [refundRequests.userId], references: [users.id] }),
}));
