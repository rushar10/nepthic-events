import { revalidatePath } from "next/cache";
import {
  and, asc, db, desc, eq, events, gte, ilike, ne, or, payments, refundRequests, settings, sql, ticketOrders,
  ticketTypes, tickets, users, type PaymentKind,
} from "@/db";
import { getSettings } from "@/core/settings";
import { saveImages } from "@/core/uploads";
import { refundPayment } from "@/core/payments";
import { checkIn, releaseSeats } from "@/core/tickets";
import { emails } from "@/core/email";
import { audit } from "@/core/audit";
import { env } from "@/core/env";
import { refundNo } from "@/ui/format";
import { pendingCounts } from "./counts";
import { monthlyRevenue, nextEvent, recentActivity, revenueByEvent, salesToday, week } from "./dashboard";
import { OpsError, actorId, actorNote, b, money, n, ok, s, type Op } from "./kit";

/* ---------------------------------------------------------------------------
   Every admin screen and action for Nepthic Events, as named operations the portal calls
   (POST /api/ops/v1/<name>). Ticket scanning ("checkin.*") is the only thing Door staff
   can reach. Event times are entered and shown in Brisbane time (UTC+10, no daylight saving).
--------------------------------------------------------------------------- */

const fresh = () => revalidatePath("/", "layout");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const slugify = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
const fromLocalInput = (v: string) => new Date(`${v.length === 16 ? `${v}:00` : v}+10:00`);

export const ops: Record<string, Op> = {
  /* ------------------------------ reads ------------------------------ */

  "summary": { level: "view", run: async () => {
    const [months, wk, next, today, pending, [last30]] = await Promise.all([
      monthlyRevenue(), week(), nextEvent(), salesToday(), pendingCounts(),
      db.select({ cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` }).from(payments)
        .where(sql`${payments.status} = 'SUCCEEDED' and ${payments.paidAt} >= now() - interval '30 days'`),
    ]);
    return {
      site: "events", generatedAt: new Date().toISOString(),
      revenue: { monthly: months.map((m) => ({ month: m.key, cents: m.value })), last30Cents: last30.cents },
      orders: wk.orders, tickets: wk.tickets, next, pending, today: { totalCents: today.total },
    };
  } },

  "counts": { level: "view", run: () => pendingCounts() },

  "dashboard": { level: "view", run: async () => {
    const [months, byEvent, wk, next, activity, today, appr] = await Promise.all([
      monthlyRevenue(), revenueByEvent(30), week(), nextEvent(), recentActivity(), salesToday(), pendingCounts(),
    ]);
    return { months, byEvent, week: wk, next, activity, today, approvals: appr };
  } },

  "events.list": { level: "view", run: async () => {
    const list = await db.query.events.findMany({ orderBy: desc(events.startsAt), with: { ticketTypes: { orderBy: asc(ticketTypes.sortOrder) } } });
    const checked = await db.select({ eventId: tickets.eventId, n: sql<number>`count(*) filter (where ${tickets.status} = 'USED')::int` }).from(tickets).groupBy(tickets.eventId);
    const by = new Map(checked.map((c) => [c.eventId, c.n]));
    return { events: list.map((e) => ({ ...e, checkedIn: by.get(e.id) ?? 0 })) };
  } },

  "event.get": { level: "view", run: async (i) => {
    const e = await db.query.events.findFirst({ where: eq(events.id, s(i, "id")), with: { ticketTypes: { orderBy: asc(ticketTypes.sortOrder) } } });
    if (!e) throw new OpsError("Event not found.", 404);
    const attendees = await db.query.tickets.findMany({
      where: eq(tickets.eventId, e.id), orderBy: desc(tickets.createdAt), limit: 500,
      with: { ticketType: { columns: { name: true, priceCents: true } }, ticketOrder: { columns: { buyerEmail: true } } },
      columns: { id: true, code: true, holderName: true, status: true, checkedInAt: true },
    });
    return { event: e, attendees, siteUrl: env.siteUrl };
  } },

  /** For the admin preview bar's "Edit this event" shortcut. */
  "event.bySlug": { level: "view", run: async (i) => {
    const e = await db.query.events.findFirst({ where: eq(events.slug, s(i, "slug")), columns: { id: true, name: true, slug: true } });
    if (!e) throw new OpsError("Event not found.", 404);
    return e;
  } },

  "refunds.list": { level: "view", run: async (i) => {
    const all = await db.query.refundRequests.findMany({
      orderBy: desc(refundRequests.createdAt), limit: 200,
      with: { user: { columns: { name: true, email: true } }, ticket: { columns: { code: true }, with: { event: { columns: { name: true, startsAt: true } }, ticketType: { columns: { name: true } } } } },
    });
    return { refunds: s(i, "show") === "all" ? all : all.filter((r) => r.status === "PENDING") };
  } },

  "customers.list": { level: "view", run: async (i) => {
    const term = s(i, "q");
    const list = await db.query.users.findMany({
      where: term ? or(ilike(users.name, `%${term}%`), ilike(users.email, `%${term}%`)) : undefined,
      orderBy: desc(users.createdAt), limit: 200, columns: { id: true, name: true, email: true, createdAt: true },
    });
    const spend = list.length
      ? await db.select({ userId: ticketOrders.userId, n: sql<number>`count(*)::int`, cents: sql<number>`coalesce(sum(${ticketOrders.totalCents}),0)::int` })
          .from(ticketOrders).where(eq(ticketOrders.status, "PAID")).groupBy(ticketOrders.userId)
      : [];
    const by = new Map(spend.map((x) => [x.userId, x]));
    return { customers: list.map((u) => ({ ...u, orderCount: by.get(u.id)?.n ?? 0, spendCents: by.get(u.id)?.cents ?? 0 })) };
  } },

  "payments.list": { level: "manage", run: async (i) => {
    const KINDS: PaymentKind[] = ["TICKET", "REFUND"];
    const k = KINDS.find((x) => x === s(i, "kind"));
    const list = await db.query.payments.findMany({
      where: and(eq(payments.status, "SUCCEEDED"), sql`${payments.paidAt} is not null`, k ? eq(payments.kind, k) : undefined),
      orderBy: desc(payments.paidAt), limit: 300,
    });
    return { payments: list, mode: env.paymentsMode };
  } },

  "settings.get": { level: "manage", run: async () => ({
    settings: await getSettings(),
    connections: {
      payments: env.paymentsMode === "stripe" ? "Stripe (live keys from env)" : "Mock mode — nothing is charged",
      email: env.resendApiKey ? `Resend · from ${env.emailFrom}` : "Logged only (no RESEND_API_KEY)",
      alerts: env.adminNotifyEmail || "Not set (ADMIN_NOTIFY_EMAIL)",
    },
  }) },

  /* -------------------------- the door (scanning) -------------------------- */

  /** Events from yesterday onwards, with admitted / issued counts. */
  "checkin.events": { level: "door", run: async () => {
    const since = new Date(Date.now() - 24 * 3600e3);
    const list = await db.query.events.findMany({ where: and(eq(events.status, "PUBLISHED"), gte(events.startsAt, since)), orderBy: asc(events.startsAt), columns: { id: true, name: true, startsAt: true, venue: true } });
    const stats = await db.select({
      eventId: tickets.eventId,
      issued: sql<number>`count(*) filter (where ${tickets.status} in ('VALID','USED','REFUND_REQUESTED'))::int`,
      used: sql<number>`count(*) filter (where ${tickets.status} = 'USED')::int`,
      last: sql<Date | null>`max(${tickets.checkedInAt})`,
    }).from(tickets).groupBy(tickets.eventId);
    const by = new Map(stats.map((x) => [x.eventId, x]));
    return { events: list.map((e) => ({ ...e, issued: by.get(e.id)?.issued ?? 0, used: by.get(e.id)?.used ?? 0, last: by.get(e.id)?.last ?? null })) };
  } },

  /** Validate one scan and admit the ticket at most once. */
  "checkin.scan": { level: "door", run: async (i, a) => checkIn(s(i, "raw"), s(i, "eventId"), actorId(a)) },

  /** Ticket list for one event, so the scanner keeps working if the venue's signal drops. */
  "checkin.tickets": { level: "door", run: async (i) => {
    const e = await db.query.events.findFirst({ where: eq(events.id, s(i, "eventId")), columns: { id: true, name: true } });
    if (!e) throw new OpsError("Event not found.", 404);
    const rows = await db.query.tickets.findMany({ where: eq(tickets.eventId, e.id), with: { ticketType: { columns: { name: true } } }, columns: { code: true, status: true, holderName: true, checkedInAt: true } });
    return { event: e, at: new Date().toISOString(), tickets: rows.map((t) => ({ code: t.code, status: t.status, holder: t.holderName, type: t.ticketType.name, checkedInAt: t.checkedInAt })) };
  } },

  /* ------------------------ events, refunds, settings ------------------------ */

  "event.save": { level: "manage", run: async (i, a, files) => {
    const id = s(i, "id");
    const name = s(i, "name");
    const startsRaw = s(i, "startsAt");
    if (name.length < 3) throw new OpsError("Give the event a name.");
    if (!startsRaw) throw new OpsError("Set the date and time.");
    const slug = slugify(s(i, "slug") || name);
    const clash = await db.query.events.findFirst({ where: and(eq(events.slug, slug), id ? ne(events.id, id) : undefined) });
    if (clash) throw new OpsError(`Another event already uses the link /e/${slug}. Change the link.`, 409);
    const status = (["DRAFT", "PUBLISHED", "CANCELLED"] as const).find((x) => x === s(i, "status")) ?? "DRAFT";
    const values = {
      name, slug, status,
      description: s(i, "description"), venue: s(i, "venue"), address: s(i, "address"), city: s(i, "city"),
      startsAt: fromLocalInput(startsRaw), ageRestriction: s(i, "ageRestriction") || "18+", hue: clamp(n(i, "hue"), 0, 359),
    };
    if (!values.venue || !values.city) throw new OpsError("Add the venue and city.");
    const cover = await saveImages(files.cover ?? [], actorId(a), { max: 1, isPublic: true });
    const gallery = await saveImages(files.gallery ?? [], actorId(a), { max: 24, isPublic: true });
    if (id) {
      const existing = await db.query.events.findFirst({ where: eq(events.id, id) });
      if (!existing) throw new OpsError("Event not found.", 404);
      await db.update(events).set({ ...values, coverUploadId: cover[0] ?? existing.coverUploadId, galleryIds: [...existing.galleryIds, ...gallery] }).where(eq(events.id, id));
      await audit(actorId(a), status === "CANCELLED" && existing.status !== "CANCELLED" ? "event.cancelled" : "event.updated", "Event", id, actorNote(a));
      fresh();
      return ok(`${name} saved.`, { id });
    }
    const [e] = await db.insert(events).values({ ...values, coverUploadId: cover[0] ?? null, galleryIds: gallery }).returning();
    const types = (Array.isArray(i.types) ? (i.types as Record<string, unknown>[]) : [])
      .map((t, k) => ({ name: s(t, "name"), priceCents: money(t, "price"), capacity: n(t, "capacity"), sortOrder: k }))
      .filter((t) => t.name && t.capacity > 0);
    if (types.length) await db.insert(ticketTypes).values(types.map((t) => ({ ...t, eventId: e.id })));
    await audit(actorId(a), "event.created", "Event", e.id, actorNote(a));
    fresh();
    return ok(status === "DRAFT" ? `${name} created as a draft. Set it to Published when you're ready to sell.` : `${name} created and on sale.`, { id: e.id });
  } },

  "ticketType.save": { level: "manage", run: async (i, a) => {
    const id = s(i, "typeId"), eventId = s(i, "eventId");
    const name = s(i, "name"), priceCents = money(i, "price"), capacity = n(i, "capacity");
    if (!name) throw new OpsError("Name the ticket type.");
    if (id) {
      const t = await db.query.ticketTypes.findFirst({ where: eq(ticketTypes.id, id) });
      if (!t) throw new OpsError("Ticket type not found.", 404);
      if (capacity < t.sold) throw new OpsError(`${t.sold} are already sold or held. Capacity can't go below that.`);
      await db.update(ticketTypes).set({ name, priceCents, capacity }).where(eq(ticketTypes.id, id));
    } else {
      if (capacity < 1) throw new OpsError("Set a capacity.");
      await db.insert(ticketTypes).values({ eventId, name, priceCents, capacity, sortOrder: n(i, "sortOrder") });
    }
    await audit(actorId(a), "ticket_type.saved", "Event", eventId, { ...actorNote(a), name, priceCents, capacity });
    fresh();
    return ok(`${name} saved.`);
  } },

  "gallery.remove": { level: "manage", run: async (i, a) => {
    const e = await db.query.events.findFirst({ where: eq(events.id, s(i, "eventId")) });
    if (!e) throw new OpsError("Event not found.", 404);
    await db.update(events).set({ galleryIds: e.galleryIds.filter((g) => g !== s(i, "uploadId")) }).where(eq(events.id, e.id));
    await audit(actorId(a), "event.gallery_removed", "Event", e.id, actorNote(a));
    fresh();
    return ok("Photo removed from the gallery.");
  } },

  "refund.decide": { level: "manage", run: async (i, a) => {
    const r = await db.query.refundRequests.findFirst({ where: eq(refundRequests.id, s(i, "refundId")), with: { user: true, ticket: { with: { ticketType: true } } } });
    if (!r || r.status !== "PENDING") throw new OpsError("This refund has already been decided.", 409);
    const approve = s(i, "decision") === "APPROVED";
    const note = s(i, "note");
    if (approve) {
      const paid = await db.query.payments.findMany({ where: and(eq(payments.ticketOrderId, r.ticket.ticketOrderId), eq(payments.status, "SUCCEEDED"), eq(payments.kind, "TICKET")) });
      if (!paid[0]) throw new OpsError("No completed payment found for this ticket.", 409);
      await refundPayment(paid[0].id, r.amountCents, `${refundNo(r.number)} · ticket ${r.ticket.code}`);
      await db.transaction(async (tx) => {
        await tx.update(tickets).set({ status: "REFUNDED" }).where(eq(tickets.id, r.ticketId));
        await releaseSeats(tx, [{ typeId: r.ticket.ticketTypeId, quantity: 1 }]);
        await tx.update(refundRequests).set({ status: "APPROVED", decisionNote: note || null, reviewedById: actorId(a), reviewedAt: new Date() }).where(eq(refundRequests.id, r.id));
      });
    } else {
      await db.transaction(async (tx) => {
        await tx.update(tickets).set({ status: "VALID" }).where(and(eq(tickets.id, r.ticketId), eq(tickets.status, "REFUND_REQUESTED")));
        await tx.update(refundRequests).set({ status: "REJECTED", decisionNote: note || null, reviewedById: actorId(a), reviewedAt: new Date() }).where(eq(refundRequests.id, r.id));
      });
    }
    await emails.refundDecision(r.user.email, r.number, approve, r.amountCents, note);
    await audit(actorId(a), approve ? "refund.approved" : "refund.rejected", "RefundRequest", r.id, { ...actorNote(a), amountCents: r.amountCents });
    fresh();
    return ok(`${refundNo(r.number)} ${approve ? "refunded" : "rejected"}. ${r.user.name} has been emailed.`);
  } },

  "settings.save": { level: "manage", run: async (i, a) => {
    const values = {
      ticketRefundCutoffHours: clamp(n(i, "ticketRefundCutoffHours"), 0, 24 * 60),
      maxTicketsPerOrder: clamp(n(i, "maxTicketsPerOrder"), 1, 50),
      proximityRadius: clamp(n(i, "proximityRadius"), 20, 400),
      proximityIntensity: clamp(parseFloat(s(i, "proximityIntensity")) || 0, 0, 1),
      proximityEnabled: b(i, "proximityEnabled"),
      updatedAt: new Date(),
    };
    await db.update(settings).set(values).where(eq(settings.id, 1));
    await audit(actorId(a), "settings.saved", "Setting", "1", { ...actorNote(a), values });
    fresh();
    return ok("Settings saved. Customers see them on their next page load.");
  } },
};
