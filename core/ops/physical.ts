import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  allocations, and, asc, count, db, desc, eq, events, ilike, inArray, isNull, ne, or, partners, printBatches, scans, sql,
  ticketOrders, ticketTypes, tickets, type Tx,
} from "@/db";
import { audit } from "@/core/audit";
import { emails } from "@/core/email";
import { CodeRangeError, eventFormat, initials, issueTickets } from "@/core/issue";
import { qrPng } from "@/core/tickets";
import { codeKey, formatProblems, maxNumber, normalizeFormat, scopeKey, type CodeFormat } from "@/core/ticket-code-format";
import { OpsError, actorId, actorNote, b, n, ok, s, type Actor, type Input, type Op } from "./kit";

/* ---------------------------------------------------------------------------
   Physical tickets, partners and ticket codes (admin API).

   view     partners.list, allocations.list, batches.list, tickets.search, codes.get,
            partners.report, orders.physical
   operate  batch.markPrinted, tickets.stage, order.ship, order.pickedUp
   manage   partner.save, partner.status, allocation.save, allocation.revoke,
            allocation.issue, batch.create, ticket.void, ticket.reissue, ticket.retag (Super
            Admins only once sold), codes.save
   partner  partner.me, partner.markSold, partner.issue (a PARTNER account's own allocations)
--------------------------------------------------------------------------- */

const fresh = () => revalidatePath("/", "layout");
const PARTNER_KINDS = ["RESELLER", "VENUE", "PROMOTER", "SPONSOR", "OUTLET"];
const HEX = /^#[0-9a-fA-F]{6}$/;
const PHYSICAL_HOLDER = "Physical ticket";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function needEvent(id: string) {
  const e = await db.query.events.findFirst({ where: eq(events.id, id), with: { ticketTypes: { orderBy: asc(ticketTypes.sortOrder) } } });
  if (!e) throw new OpsError("Event not found.", 404);
  return e;
}

/** Capacity: allocated and printed stock holds seats like a checkout does. */
async function holdSeats(tx: Tx, typeId: string, qty: number) {
  const rows = await tx.update(ticketTypes).set({ sold: sql`${ticketTypes.sold} + ${qty}` })
    .where(and(eq(ticketTypes.id, typeId), sql`${ticketTypes.sold} + ${qty} <= ${ticketTypes.capacity}`)).returning({ id: ticketTypes.id });
  if (!rows.length) {
    const t = await tx.query.ticketTypes.findFirst({ where: eq(ticketTypes.id, typeId) });
    throw new OpsError(`Only ${Math.max(0, (t?.capacity ?? 0) - (t?.sold ?? 0))} ${t?.name ?? ""} tickets are left. Raise the capacity first, or allocate fewer.`, 409);
  }
}
async function releaseHeld(tx: Tx, typeId: string, qty: number) {
  if (qty > 0) await tx.update(ticketTypes).set({ sold: sql`GREATEST(${ticketTypes.sold} - ${qty}, 0)` }).where(eq(ticketTypes.id, typeId));
}

/** Tickets issued so far per allocation. */
async function issuedByAllocation(ids: string[]) {
  if (!ids.length) return new Map<string, { issued: number; sold: number; scanned: number }>();
  const rows = await db.select({
    id: tickets.allocationId,
    issued: sql<number>`count(*) filter (where ${tickets.status} <> 'VOID')::int`,
    sold: sql<number>`count(*) filter (where ${tickets.soldAt} is not null and ${tickets.status} <> 'VOID')::int`,
    scanned: sql<number>`count(*) filter (where ${tickets.status} = 'USED')::int`,
  }).from(tickets).where(inArray(tickets.allocationId, ids)).groupBy(tickets.allocationId);
  return new Map(rows.map((r) => [r.id!, r]));
}

/** Allocation with what's left to issue. */
async function allocationState(id: string) {
  const al = await db.query.allocations.findFirst({ where: eq(allocations.id, id), with: { partner: true, event: true, ticketType: true } });
  if (!al) throw new OpsError("That allocation no longer exists.", 404);
  const used = (await issuedByAllocation([al.id])).get(al.id) ?? { issued: 0, sold: 0, scanned: 0 };
  return { al, ...used, left: al.kind === "LINK" ? Infinity : al.quantity - used.issued };
}

/** Partner-issued e-tickets (to a buyer without an account): email with QR codes. */
async function emailTickets(to: string, eventName: string, startsAt: Date, venue: string, issued: { code: string; qrId: string }[]) {
  const when = startsAt.toLocaleString("en-AU", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" });
  const pngs = await Promise.all(issued.map((t) => qrPng(t.qrId)));
  await emails.ticketsIssued(to, eventName, `${when} · ${venue}`, issued.map((t) => t.code), pngs);
}

/** Issue e-tickets from an ETICKET allocation (admin or the partner themselves). */
async function issueFromAllocation(actor: Actor, allocationId: string, i: Input, partnerCode?: string) {
  const st = await allocationState(allocationId);
  const { al } = st;
  if (partnerCode && al.partner.code !== partnerCode) throw new OpsError("That allocation isn't yours.", 403);
  if (al.revokedAt) throw new OpsError("This allocation was revoked.", 409);
  if (al.partner.status === "SUSPENDED") throw new OpsError("This partner is suspended, so it can't issue tickets.", 409);
  if (al.kind !== "ETICKET") throw new OpsError("Only e-ticket allocations issue e-tickets here. Physical allocations are printed.", 409);
  const qty = Math.max(1, Math.min(20, n(i, "quantity") || 1));
  const holderName = s(i, "holderName"), email = s(i, "email").toLowerCase();
  if (!holderName) throw new OpsError("Add the name on the ticket.");
  if (!EMAIL.test(email)) throw new OpsError("Add the buyer's email so they get their e-ticket.");
  if (qty > st.left) throw new OpsError(`Only ${st.left} left in this allocation.`, 409);
  const issued = await db.transaction((tx) => issueTickets(tx, {
    event: al.event, type: al.ticketType, count: qty, holderName, buyerEmail: email, format: "ETICKET", stage: null,
    source: "PARTNER", partner: { id: al.partner.id, code: al.partner.code }, allocation: al, sold: true,
  })).catch((e) => { if (e instanceof CodeRangeError) throw new OpsError(e.message, 409); throw e; });
  await emailTickets(email, al.event.name, al.event.startsAt, `${al.event.venue}, ${al.event.city}`, issued);
  await audit(actorId(actor), "partner.issued", "Allocation", al.id, { ...actorNote(actor), quantity: qty, codes: issued.map((t) => t.code) });
  fresh();
  return ok(`Issued ${qty} e-ticket${qty > 1 ? "s" : ""} (${issued.map((t) => t.code).join(", ")}) and emailed ${email}.`, { codes: issued.map((t) => t.code) });
}

const partnerRow = (p: typeof partners.$inferSelect) => ({ ...p, link: `/?ref=${p.referralCode}` });

export const physicalOps: Record<string, Op> = {
  /* ------------------------------ partners ------------------------------ */
  "partners.list": { level: "view", run: async () => {
    const list = await db.query.partners.findMany({ orderBy: asc(partners.name) });
    const stats = await db.select({
      id: tickets.partnerId,
      sold: sql<number>`count(*) filter (where ${tickets.soldAt} is not null and ${tickets.status} <> 'VOID')::int`,
      scanned: sql<number>`count(*) filter (where ${tickets.status} = 'USED')::int`,
      revenue: sql<number>`coalesce(sum(${tickets.priceCents}) filter (where ${tickets.soldAt} is not null and ${tickets.status} not in ('VOID','REFUNDED')), 0)::int`,
    }).from(tickets).where(sql`${tickets.partnerId} is not null`).groupBy(tickets.partnerId);
    const alloc = await db.select({ id: allocations.partnerId, q: sql<number>`coalesce(sum(${allocations.quantity}) filter (where ${allocations.revokedAt} is null and ${allocations.kind} <> 'LINK'), 0)::int` }).from(allocations).groupBy(allocations.partnerId);
    const by = new Map(stats.map((x) => [x.id, x])), al = new Map(alloc.map((x) => [x.id, x.q]));
    return { partners: list.map((p) => ({ ...partnerRow(p), allocated: al.get(p.id) ?? 0, sold: by.get(p.id)?.sold ?? 0, scanned: by.get(p.id)?.scanned ?? 0, revenueCents: by.get(p.id)?.revenue ?? 0 })) };
  } },

  "partner.save": { level: "manage", run: async (i, a) => {
    const id = s(i, "id");
    const code = s(i, "code").toUpperCase().replace(/\s+/g, "");
    const name = s(i, "name");
    if (name.length < 2) throw new OpsError("Give the partner a name.");
    if (!/^[A-Z0-9-]{2,10}$/.test(code)) throw new OpsError("Partner codes are 2–10 letters, numbers or dashes, e.g. P012 or TKTEK.");
    const pct = Number.parseFloat(s(i, "commissionPct") || "0");
    if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw new OpsError("Commission is a percentage from 0 to 50.");
    const values = {
      name, code, kind: PARTNER_KINDS.includes(s(i, "kind")) ? s(i, "kind") : "RESELLER",
      contactName: s(i, "contactName"), email: s(i, "email"), phone: s(i, "phone"),
      color: HEX.test(s(i, "color")) ? s(i, "color").toUpperCase() : "#8B5CF6",
      commissionPct: Math.round(pct * 100) / 100, paymentTerms: s(i, "paymentTerms"),
    };
    if (values.email && !EMAIL.test(values.email)) throw new OpsError("That email doesn't look right.");
    const clash = await db.query.partners.findFirst({ where: and(eq(partners.code, code), id ? ne(partners.id, id) : undefined) });
    if (clash) throw new OpsError(`${code} is already ${clash.name}'s code.`, 409);
    if (id) {
      const before = await db.query.partners.findFirst({ where: eq(partners.id, id) });
      if (!before) throw new OpsError("Partner not found.", 404);
      if (before.code !== code) {
        const [{ c }] = await db.select({ c: count() }).from(tickets).where(eq(tickets.partnerId, id));
        if (c > 0) throw new OpsError(`${before.code} is already printed on ${c} tickets, so the code can't change. Edit the name or details instead.`, 409);
      }
      await db.update(partners).set(values).where(eq(partners.id, id));
      await audit(actorId(a), "partner.updated", "Partner", id, { ...actorNote(a), before: { code: before.code, commissionPct: before.commissionPct }, after: { code, commissionPct: values.commissionPct } });
      fresh();
      return ok(`${name} saved.`, { id });
    }
    const referralCode = `${code.toLowerCase()}-${crypto.randomBytes(3).toString("hex")}`;
    const [p] = await db.insert(partners).values({ ...values, referralCode }).returning();
    await audit(actorId(a), "partner.created", "Partner", p.id, { ...actorNote(a), code });
    fresh();
    return ok(`${name} added. Their sales link and code are ready.`, { id: p.id });
  } },

  "partner.status": { level: "manage", run: async (i, a) => {
    const p = await db.query.partners.findFirst({ where: eq(partners.id, s(i, "id")) });
    if (!p) throw new OpsError("Partner not found.", 404);
    const status = s(i, "status") === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
    await db.update(partners).set({ status }).where(eq(partners.id, p.id));
    await audit(actorId(a), status === "SUSPENDED" ? "partner.suspended" : "partner.activated", "Partner", p.id, actorNote(a));
    fresh();
    return ok(status === "SUSPENDED" ? `${p.name} suspended. Their tickets are flagged at the door and their link stops tagging sales.` : `${p.name} is active again.`);
  } },

  /* ----------------------------- allocations ---------------------------- */
  "allocations.list": { level: "view", run: async (i) => {
    const e = await needEvent(s(i, "eventId"));
    const list = await db.query.allocations.findMany({ where: eq(allocations.eventId, e.id), with: { partner: true, ticketType: true }, orderBy: asc(allocations.createdAt) });
    const used = await issuedByAllocation(list.map((x) => x.id));
    const linkSales = await db.select({ partnerId: tickets.partnerId, typeId: tickets.ticketTypeId, n: sql<number>`count(*)::int` }).from(tickets)
      .where(and(eq(tickets.eventId, e.id), isNull(tickets.allocationId), eq(tickets.source, "PARTNER"), ne(tickets.status, "VOID"))).groupBy(tickets.partnerId, tickets.ticketTypeId);
    const f = eventFormat(e);
    return {
      event: { id: e.id, name: e.name, slug: e.slug, ticketTypes: e.ticketTypes.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity, sold: t.sold })) },
      format: { padding: f.padding, scope: f.scope, max: maxNumber(f) },
      allocations: list.map((x) => {
        const u = used.get(x.id) ?? { issued: 0, sold: 0, scanned: 0 };
        const link = x.kind === "LINK" ? linkSales.find((l) => l.partnerId === x.partnerId && l.typeId === x.ticketTypeId)?.n ?? 0 : 0;
        return {
          id: x.id, kind: x.kind, quantity: x.quantity, rangeStart: x.rangeStart, rangeEnd: x.rangeEnd, revokedAt: x.revokedAt, createdAt: x.createdAt,
          partner: { id: x.partner.id, name: x.partner.name, code: x.partner.code, color: x.partner.color, status: x.partner.status, referralCode: x.partner.referralCode },
          ticketType: { id: x.ticketType.id, name: x.ticketType.name },
          issued: x.kind === "LINK" ? link : u.issued, sold: x.kind === "LINK" ? link : u.sold, scanned: u.scanned,
          left: x.kind === "LINK" ? Math.max(0, x.quantity - link) : x.quantity - u.issued,
          rangeUsed: x.rangeStart != null ? u.issued : null,
        };
      }),
      partners: (await db.query.partners.findMany({ orderBy: asc(partners.name) })).map((p) => ({ id: p.id, name: p.name, code: p.code, status: p.status })),
    };
  } },

  "allocation.save": { level: "manage", run: async (i, a) => {
    const e = await needEvent(s(i, "eventId"));
    const partner = await db.query.partners.findFirst({ where: eq(partners.id, s(i, "partnerId")) });
    if (!partner) throw new OpsError("Choose a partner.");
    if (partner.status === "SUSPENDED") throw new OpsError(`${partner.name} is suspended. Reactivate them first.`, 409);
    const type = e.ticketTypes.find((t) => t.id === s(i, "typeId"));
    if (!type) throw new OpsError("Choose a ticket type.");
    const kind = (["PHYSICAL", "ETICKET", "LINK"] as const).find((k) => k === s(i, "kind")) ?? "PHYSICAL";
    const quantity = n(i, "quantity");
    if (quantity < 1 || quantity > 20000) throw new OpsError("Allocate between 1 and 20,000 tickets.");
    const f = eventFormat(e);
    let rangeStart: number | null = s(i, "rangeStart") ? n(i, "rangeStart") : null;
    let rangeEnd: number | null = s(i, "rangeEnd") ? n(i, "rangeEnd") : null;
    if (kind === "LINK") { rangeStart = null; rangeEnd = null; }
    if ((rangeStart == null) !== (rangeEnd == null)) throw new OpsError("Give both ends of the number range, or neither.");
    if (rangeStart != null && rangeEnd != null) {
      if (f.mode === "RANDOM") throw new OpsError("This event uses random numbers, so ranges can't be reserved. Switch to sequential numbers in Ticket settings.");
      if (rangeStart < 0 || rangeEnd < rangeStart) throw new OpsError("The range must run from a lower number to a higher one.");
      if (rangeEnd > maxNumber(f)) throw new OpsError(`Numbers only go up to ${maxNumber(f)} with ${f.padding} digits.`);
      if (rangeEnd - rangeStart + 1 < quantity) throw new OpsError(`The range ${rangeStart}–${rangeEnd} holds ${rangeEnd - rangeStart + 1} numbers, fewer than the ${quantity} allocated.`);
      const key = scopeKey(f, { typeId: type.id, partnerId: partner.id });
      const others = await db.query.allocations.findMany({ where: and(eq(allocations.eventId, e.id), isNull(allocations.revokedAt)), with: { partner: true } });
      const hit = others.find((o) => o.rangeStart != null && scopeKey(f, { typeId: o.ticketTypeId, partnerId: o.partnerId }) === key && rangeStart! <= o.rangeEnd! && o.rangeStart <= rangeEnd!);
      if (hit) throw new OpsError(`That overlaps ${hit.partner.name}'s range ${hit.rangeStart}–${hit.rangeEnd}. Ranges can't overlap.`, 409);
      // Numbers already used by tickets in the same sequence can't be reserved either.
      const usedNums = await db.select({ c: count() }).from(tickets).where(and(eq(tickets.eventId, e.id), sql`${tickets.serial} between ${rangeStart} and ${rangeEnd}`,
        f.scope === "TYPE" ? eq(tickets.ticketTypeId, type.id) : f.scope === "PARTNER" ? eq(tickets.partnerId, partner.id) : undefined));
      if (usedNums[0].c > 0) throw new OpsError(`${usedNums[0].c} ticket${usedNums[0].c > 1 ? "s" : ""} already use numbers in ${rangeStart}–${rangeEnd}. Pick a higher range.`, 409);
    }
    const created = await db.transaction(async (tx) => {
      if (kind !== "LINK") await holdSeats(tx, type.id, quantity);
      const [al] = await tx.insert(allocations).values({ eventId: e.id, partnerId: partner.id, ticketTypeId: type.id, kind, quantity, rangeStart, rangeEnd }).returning();
      return al;
    });
    await audit(actorId(a), "allocation.created", "Allocation", created.id, { ...actorNote(a), partner: partner.code, type: type.name, kind, quantity, rangeStart, rangeEnd });
    fresh();
    return ok(`${quantity} ${type.name} ${kind === "LINK" ? "via sales link" : kind === "PHYSICAL" ? "physical tickets" : "e-tickets"} allocated to ${partner.name}${rangeStart != null ? ` (numbers ${rangeStart}–${rangeEnd})` : ""}.`, { id: created.id });
  } },

  "allocation.revoke": { level: "manage", run: async (i, a) => {
    const st = await allocationState(s(i, "id"));
    if (st.al.revokedAt) throw new OpsError("Already revoked.", 409);
    await db.transaction(async (tx) => {
      await tx.update(allocations).set({ revokedAt: new Date() }).where(eq(allocations.id, st.al.id));
      if (st.al.kind !== "LINK") await releaseHeld(tx, st.al.ticketTypeId, Math.max(0, st.left));
    });
    await audit(actorId(a), "allocation.revoked", "Allocation", st.al.id, { ...actorNote(a), partner: st.al.partner.code, unissuedReleased: Math.max(0, st.left), issued: st.issued });
    fresh();
    return ok(`Allocation revoked. ${Math.max(0, st.left)} unissued seats went back on sale; ${st.issued} tickets already issued are flagged at the door.`);
  } },

  "allocation.issue": { level: "manage", run: async (i, a) => issueFromAllocation(a, s(i, "allocationId"), i) },

  /* ------------------------- physical print batches ------------------------- */
  "batches.list": { level: "view", run: async (i) => {
    const eventId = s(i, "eventId");
    const list = await db.query.printBatches.findMany({ where: eventId ? eq(printBatches.eventId, eventId) : undefined, with: { event: true, ticketType: true, partner: true }, orderBy: desc(printBatches.createdAt), limit: 100 });
    const st = list.length ? await db.select({
      id: tickets.batchId,
      generated: sql<number>`count(*) filter (where ${tickets.stage} = 'GENERATED')::int`,
      printed: sql<number>`count(*) filter (where ${tickets.stage} = 'PRINTED')::int`,
      distributed: sql<number>`count(*) filter (where ${tickets.stage} = 'DISTRIBUTED')::int`,
      sold: sql<number>`count(*) filter (where ${tickets.stage} = 'SOLD')::int`,
      scanned: sql<number>`count(*) filter (where ${tickets.status} = 'USED')::int`,
      voided: sql<number>`count(*) filter (where ${tickets.status} = 'VOID')::int`,
      first: sql<string>`min(${tickets.code})`, last: sql<string>`max(${tickets.code})`,
    }).from(tickets).where(inArray(tickets.batchId, list.map((x) => x.id))).groupBy(tickets.batchId) : [];
    const by = new Map(st.map((x) => [x.id, x]));
    const evs = await db.query.events.findMany({ orderBy: desc(events.startsAt), with: { ticketTypes: { orderBy: asc(ticketTypes.sortOrder) } } });
    return {
      batches: list.map((x) => ({ id: x.id, number: x.number, quantity: x.quantity, printFormat: x.printFormat, createdAt: x.createdAt, createdBy: x.createdBy,
        event: { id: x.event.id, name: x.event.name }, ticketType: { name: x.ticketType.name }, partner: x.partner ? { name: x.partner.name, code: x.partner.code } : null,
        stats: by.get(x.id) ?? null })),
      events: evs.map((e) => ({ id: e.id, name: e.name, startsAt: e.startsAt, status: e.status, ticketTypes: e.ticketTypes.map((t) => ({ id: t.id, name: t.name, left: t.capacity - t.sold })) })),
      partners: (await db.query.partners.findMany({ where: eq(partners.status, "ACTIVE"), orderBy: asc(partners.name) })).map((p) => ({ id: p.id, name: p.name, code: p.code })),
      allocations: (await db.query.allocations.findMany({ where: and(eq(allocations.kind, "PHYSICAL"), isNull(allocations.revokedAt)), with: { partner: true, ticketType: true } }))
        .map((x) => ({ id: x.id, eventId: x.eventId, label: `${x.partner.code} · ${x.ticketType.name} · ${x.quantity}`, partnerId: x.partnerId, typeId: x.ticketTypeId })),
    };
  } },

  "batch.create": { level: "manage", run: async (i, a) => {
    const e = await needEvent(s(i, "eventId"));
    const qty = n(i, "quantity");
    if (qty < 1 || qty > 2000) throw new OpsError("Generate between 1 and 2,000 tickets per batch.");
    const printFormat = (["stub", "a4", "thermal"] as const).find((x) => x === s(i, "printFormat")) ?? "a4";
    let type = e.ticketTypes.find((t) => t.id === s(i, "typeId"));
    let partner = s(i, "partnerId") ? await db.query.partners.findFirst({ where: eq(partners.id, s(i, "partnerId")) }) : null;
    let allocation: Awaited<ReturnType<typeof allocationState>> | null = null;
    if (s(i, "allocationId")) {
      allocation = await allocationState(s(i, "allocationId"));
      if (allocation.al.eventId !== e.id) throw new OpsError("That allocation is for another event.");
      if (allocation.al.kind !== "PHYSICAL") throw new OpsError("Only physical allocations are printed.");
      if (allocation.al.revokedAt) throw new OpsError("That allocation was revoked.", 409);
      if (qty > allocation.left) throw new OpsError(`Only ${allocation.left} left to print in this allocation.`, 409);
      type = e.ticketTypes.find((t) => t.id === allocation!.al.ticketTypeId);
      partner = allocation.al.partner;
    }
    if (!type) throw new OpsError("Choose a ticket type.");
    if (partner?.status === "SUSPENDED") throw new OpsError(`${partner.name} is suspended.`, 409);
    const result = await db.transaction(async (tx) => {
      if (!allocation) await holdSeats(tx, type!.id, qty); // allocations already hold their seats
      const [batch] = await tx.insert(printBatches).values({ eventId: e.id, ticketTypeId: type!.id, partnerId: partner?.id ?? null, allocationId: allocation?.al.id ?? null, quantity: qty, printFormat, createdBy: `${a.name} (${a.email})` }).returning();
      const issued = await issueTickets(tx, {
        event: e, type: type!, count: qty, holderName: PHYSICAL_HOLDER, batchId: batch.id, format: "PHYSICAL", stage: "GENERATED",
        source: partner ? "PARTNER" : "BOX_OFFICE", partner: partner ? { id: partner.id, code: partner.code } : null, allocation: allocation?.al ?? null,
      });
      return { batch, issued };
    }).catch((err) => { if (err instanceof CodeRangeError) throw new OpsError(err.message, 409); throw err; });
    await audit(actorId(a), "batch.created", "PrintBatch", result.batch.id, { ...actorNote(a), event: e.name, type: type.name, quantity: qty, partner: partner?.code ?? null, first: result.issued[0]?.code, last: result.issued.at(-1)?.code });
    fresh();
    return ok(`Batch PB-${result.batch.number}: ${qty} ${type.name} tickets generated (${result.issued[0].code} … ${result.issued.at(-1)!.code}). Download the PDF to print.`, { id: result.batch.id, number: result.batch.number });
  } },

  "batch.markPrinted": { level: "operate", run: async (i, a) => {
    const id = s(i, "batchId");
    const r = await db.update(tickets).set({ stage: "PRINTED", printedAt: new Date() }).where(and(eq(tickets.batchId, id), eq(tickets.stage, "GENERATED"), ne(tickets.status, "VOID"))).returning({ id: tickets.id });
    await audit(actorId(a), "batch.printed", "PrintBatch", id, { ...actorNote(a), tickets: r.length });
    fresh();
    return ok(r.length ? `${r.length} tickets marked printed.` : "Nothing left to mark printed in this batch.");
  } },

  /** Move physical stock along: DISTRIBUTED (handed to a partner/outlet) or SOLD. By batch, or by codes. */
  "tickets.stage": { level: "operate", run: async (i, a) => {
    const stage = s(i, "stage") === "SOLD" ? "SOLD" : "DISTRIBUTED";
    const codes = s(i, "codes").split(/[\s,]+/).map((c) => codeKey(c)).filter(Boolean);
    const batchId = s(i, "batchId");
    if (!batchId && !codes.length) throw new OpsError("Choose a batch or enter ticket codes.");
    const where = and(batchId ? eq(tickets.batchId, batchId) : inArray(tickets.codeKey, codes), sql`${tickets.stage} is not null`, ne(tickets.stage, "SOLD"), ne(tickets.status, "VOID"),
      stage === "DISTRIBUTED" ? inArray(tickets.stage, ["GENERATED", "PRINTED"]) : undefined);
    const r = await db.update(tickets).set({ stage, ...(stage === "SOLD" ? { soldAt: new Date() } : {}) }).where(where).returning({ code: tickets.code });
    await audit(actorId(a), `tickets.${stage.toLowerCase()}`, "Ticket", batchId || codes.slice(0, 5).join(","), { ...actorNote(a), count: r.length });
    fresh();
    return ok(r.length ? `${r.length} ticket${r.length > 1 ? "s" : ""} marked ${stage === "SOLD" ? "sold" : "distributed"}.` : "No matching physical tickets needed changing.");
  } },

  /* -------------------------------- tickets -------------------------------- */
  "tickets.search": { level: "view", run: async (i) => {
    const q = s(i, "q");
    const key = codeKey(q);
    const conds = [
      s(i, "eventId") ? eq(tickets.eventId, s(i, "eventId")) : undefined,
      s(i, "status") ? eq(tickets.status, s(i, "status") as "VALID") : undefined,
      s(i, "source") ? eq(tickets.source, s(i, "source") as "ONLINE") : undefined,
      s(i, "format") ? eq(tickets.format, s(i, "format") as "ETICKET") : undefined,
      s(i, "partnerId") ? eq(tickets.partnerId, s(i, "partnerId")) : undefined,
      s(i, "batchId") ? eq(tickets.batchId, s(i, "batchId")) : undefined,
      q ? or(key ? ilike(tickets.codeKey, `%${key}%`) : undefined, ilike(tickets.holderName, `%${q}%`), ilike(tickets.buyerEmail, `%${q}%`)) : undefined,
    ].filter(Boolean);
    const rows = await db.query.tickets.findMany({
      where: conds.length ? and(...conds) : undefined, with: { event: { columns: { id: true, name: true } }, ticketType: { columns: { name: true } }, partner: { columns: { name: true, code: true, color: true } }, ticketOrder: { columns: { number: true, buyerEmail: true } } },
      orderBy: desc(tickets.createdAt), limit: 100,
    });
    const evs = await db.query.events.findMany({ orderBy: desc(events.startsAt), columns: { id: true, name: true } });
    const ps = await db.query.partners.findMany({ orderBy: asc(partners.name), columns: { id: true, name: true, code: true } });
    return {
      tickets: rows.map((t) => ({
        id: t.id, code: t.code, serial: t.serial, status: t.status, format: t.format, stage: t.stage, source: t.source, holderName: t.holderName,
        email: t.buyerEmail ?? t.ticketOrder?.buyerEmail ?? null, order: t.ticketOrder?.number ?? null, event: t.event, type: t.ticketType.name, partner: t.partner,
        priceCents: t.priceCents, soldAt: t.soldAt, checkedInAt: t.checkedInAt, checkedInGate: t.checkedInGate, voidReason: t.voidReason, reissuedFromId: t.reissuedFromId, createdAt: t.createdAt,
      })),
      events: evs, partners: ps,
    };
  } },

  "ticket.void": { level: "manage", run: async (i, a) => {
    const t = await db.query.tickets.findFirst({ where: eq(tickets.id, s(i, "ticketId")) });
    if (!t) throw new OpsError("Ticket not found.", 404);
    if (t.status === "VOID") throw new OpsError("Already void.", 409);
    if (t.status === "USED") throw new OpsError("This ticket has been scanned in, so it can't be voided.", 409);
    const reason = s(i, "reason") || "Voided by an admin";
    await db.transaction(async (tx) => {
      await tx.update(tickets).set({ status: "VOID", voidReason: reason }).where(eq(tickets.id, t.id));
      // Unsold stock gives its seat back. Sold tickets keep it (refund separately if needed).
      if (!t.soldAt) await releaseHeld(tx, t.ticketTypeId, 1);
    });
    await audit(actorId(a), "ticket.voided", "Ticket", t.id, { ...actorNote(a), code: t.code, reason });
    fresh();
    return ok(`${t.code} is void. Its QR is now rejected at the door.`);
  } },

  /** Lost or damaged: void the old ticket and issue a replacement with a new code and a new QR. */
  "ticket.reissue": { level: "manage", run: async (i, a) => {
    const t = await db.query.tickets.findFirst({ where: eq(tickets.id, s(i, "ticketId")), with: { event: true, ticketType: true, partner: true, allocation: true } });
    if (!t) throw new OpsError("Ticket not found.", 404);
    if (t.status === "USED") throw new OpsError("This ticket has already been scanned in.", 409);
    if (t.status === "VOID" || t.status === "REFUNDED") throw new OpsError("This ticket is no longer valid, so it can't be reissued.", 409);
    const reason = s(i, "reason") || "Lost or damaged";
    const [fresh1] = await db.transaction(async (tx) => {
      await tx.update(tickets).set({ status: "VOID", voidReason: `Reissued: ${reason}` }).where(eq(tickets.id, t.id));
      return issueTickets(tx, {
        event: t.event, type: t.ticketType, count: 1, holderName: t.holderName, buyerEmail: t.buyerEmail, orderId: t.ticketOrderId, batchId: t.batchId,
        format: t.format, stage: t.stage, source: t.source, partner: t.partner ? { id: t.partner.id, code: t.partner.code } : null,
        allocation: t.allocation ? { ...t.allocation, rangeStart: null, rangeEnd: null } : null, sold: !!t.soldAt, reissuedFromId: t.id,
      });
    });
    if (t.soldAt) await db.update(tickets).set({ soldAt: t.soldAt }).where(eq(tickets.id, fresh1.id));
    await audit(actorId(a), "ticket.reissued", "Ticket", t.id, { ...actorNote(a), from: t.code, to: fresh1.code, reason });
    fresh();
    return ok(`${t.code} voided and reissued as ${fresh1.code}${t.format !== "ETICKET" ? ". Print the new ticket from the ticket list" : ""}.`, { id: fresh1.id, code: fresh1.code });
  } },

  /** Change where a ticket came from. Once sold, only Super Admins can; always audited. */
  "ticket.retag": { level: "manage", run: async (i, a) => {
    const t = await db.query.tickets.findFirst({ where: eq(tickets.id, s(i, "ticketId")), with: { partner: true } });
    if (!t) throw new OpsError("Ticket not found.", 404);
    if (t.soldAt && a.role !== "SUPER") throw new OpsError("This ticket is sold, so only a Super Admin can change its partner.", 403);
    const partnerId = s(i, "partnerId") || null;
    const p = partnerId ? await db.query.partners.findFirst({ where: eq(partners.id, partnerId) }) : null;
    if (partnerId && !p) throw new OpsError("Partner not found.", 404);
    const source = p ? "PARTNER" : s(i, "source") === "BOX_OFFICE" ? "BOX_OFFICE" : "ONLINE";
    await db.update(tickets).set({ partnerId: p?.id ?? null, source }).where(eq(tickets.id, t.id));
    await audit(actorId(a), "ticket.retagged", "Ticket", t.id, { ...actorNote(a), code: t.code, from: t.partner?.code ?? t.source, to: p?.code ?? source });
    fresh();
    return ok(`${t.code} now shows ${p ? `${p.name} (${p.code})` : source === "BOX_OFFICE" ? "Box Office" : "Nepthic Online"} as its source.`);
  } },

  /* ------------------------------ ticket codes ------------------------------ */
  "codes.get": { level: "view", run: async (i) => {
    const e = await needEvent(s(i, "eventId"));
    const f = eventFormat(e);
    const counters = await db.execute(sql`select scope_key, next from code_counters where event_id = ${e.id}`);
    const [{ c }] = await db.select({ c: count() }).from(tickets).where(eq(tickets.eventId, e.id));
    const al = await db.query.allocations.findMany({ where: and(eq(allocations.eventId, e.id), isNull(allocations.revokedAt)), with: { partner: true, ticketType: true } });
    const ps = await db.query.partners.findMany({ orderBy: asc(partners.name) });
    return {
      event: { id: e.id, name: e.name, slug: e.slug, startsAt: e.startsAt, ticketFormats: e.ticketFormats, gates: e.gates },
      format: f, issued: c,
      types: e.ticketTypes.map((t) => ({ id: t.id, name: t.name, codePrefix: t.codePrefix, fallback: initials(t.name), zone: t.zone })),
      partners: ps.map((p) => ({ id: p.id, name: p.name, code: p.code })),
      ranges: al.filter((x) => x.rangeStart != null).map((x) => ({ partner: x.partner.code, type: x.ticketType.name, start: x.rangeStart, end: x.rangeEnd })),
      counters: (counters.rows as { scope_key: string; next: number }[]).map((r) => ({ key: r.scope_key, next: r.next })),
    };
  } },

  "codes.save": { level: "manage", run: async (i, a) => {
    const e = await needEvent(s(i, "eventId"));
    const before = eventFormat(e);
    const raw = (i.format ?? {}) as Partial<CodeFormat> & Record<string, unknown>;
    const parts = Array.isArray(raw.parts) ? raw.parts : String(raw.parts ?? "").split(",").filter(Boolean);
    const f = normalizeFormat({
      ...raw, parts: parts as CodeFormat["parts"],
      checkChar: b(raw as Input, "checkChar"), avoidAmbiguous: b(raw as Input, "avoidAmbiguous"),
      typePrefixes: (raw.typePrefixes ?? {}) as Record<string, string>, partnerPrefixes: (raw.partnerPrefixes ?? {}) as Record<string, string>,
    }, before.brand);
    const typeCodes = (i.typeCode ?? {}) as Record<string, string>;
    const zones = (i.zone ?? {}) as Record<string, string>;
    const cleanPrefix = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    const typePrefixes = e.ticketTypes.map((t) => cleanPrefix(typeCodes[t.id] ?? t.codePrefix) || initials(t.name));
    const ps = await db.query.partners.findMany();
    const problems = formatProblems(f, { typePrefixes, partnerCodes: ps.map((p) => p.code.replace(/[^A-Z0-9]/g, "")) });
    if (problems.length) throw new OpsError(problems.join(" "));
    const formats = (["ETICKET", "PHYSICAL", "BOTH"] as const).filter((x) => b((i.formats ?? {}) as Input, x));
    if (!formats.length) throw new OpsError("Allow at least one ticket format at checkout.");
    const gates = s(i, "gates").split(",").map((g) => g.trim()).filter(Boolean).slice(0, 12);
    await db.transaction(async (tx) => {
      await tx.update(events).set({ codeFormat: f, ticketFormats: [...formats], gates: gates.length ? gates : ["Main"] }).where(eq(events.id, e.id));
      for (const t of e.ticketTypes) await tx.update(ticketTypes).set({ codePrefix: cleanPrefix(typeCodes[t.id] ?? t.codePrefix), zone: String(zones[t.id] ?? t.zone).trim().slice(0, 40) }).where(eq(ticketTypes.id, t.id));
    });
    await audit(actorId(a), "codes.updated", "Event", e.id, { ...actorNote(a), before, after: f, formats, gates });
    fresh();
    return ok(`Ticket settings saved for ${e.name}. New tickets use them; tickets already issued keep their codes.`);
  } },

  /* ---------------------------- physical orders ---------------------------- */
  "orders.physical": { level: "view", run: async (i) => {
    const show = s(i, "show") === "all" ? "all" : "open";
    const rows = await db.query.ticketOrders.findMany({
      where: and(eq(ticketOrders.status, "PAID"), ne(ticketOrders.format, "ETICKET"), show === "open" ? and(isNull(ticketOrders.shippedAt), isNull(ticketOrders.pickedUpAt)) : undefined),
      with: { event: { columns: { name: true, startsAt: true } }, tickets: { columns: { id: true, code: true, status: true } } }, orderBy: asc(ticketOrders.createdAt), limit: 200,
    });
    return { show, orders: rows.map((o) => ({ id: o.id, number: o.number, buyerName: o.buyerName, buyerEmail: o.buyerEmail, format: o.format, delivery: o.delivery, shipTo: o.shipTo, shippedAt: o.shippedAt, tracking: o.tracking, pickedUpAt: o.pickedUpAt, totalCents: o.totalCents, createdAt: o.createdAt, event: o.event, tickets: o.tickets })) };
  } },
  "order.ship": { level: "operate", run: async (i, a) => {
    const o = await db.query.ticketOrders.findFirst({ where: eq(ticketOrders.id, s(i, "orderId")) });
    if (!o || o.delivery !== "POST") throw new OpsError("That isn't a posted order.", 404);
    if (o.shippedAt) throw new OpsError("Already marked posted.", 409);
    const tracking = s(i, "tracking");
    if (!tracking) throw new OpsError("Add the tracking number.");
    await db.update(ticketOrders).set({ shippedAt: new Date(), tracking }).where(eq(ticketOrders.id, o.id));
    await audit(actorId(a), "order.posted", "TicketOrder", o.id, { ...actorNote(a), tracking });
    fresh();
    return ok(`TO-${o.number} marked posted (${tracking}).`);
  } },
  "order.pickedUp": { level: "operate", run: async (i, a) => {
    const o = await db.query.ticketOrders.findFirst({ where: eq(ticketOrders.id, s(i, "orderId")) });
    if (!o || o.delivery !== "PICKUP") throw new OpsError("That isn't a pickup order.", 404);
    if (o.pickedUpAt) throw new OpsError("Already picked up.", 409);
    await db.update(ticketOrders).set({ pickedUpAt: new Date() }).where(eq(ticketOrders.id, o.id));
    await audit(actorId(a), "order.picked_up", "TicketOrder", o.id, actorNote(a));
    fresh();
    return ok(`TO-${o.number} handed over at the box office.`);
  } },

  /* ------------------------------- reports -------------------------------- */
  "partners.report": { level: "view", run: async (i) => partnerReport(s(i, "eventId")) },

  /* --------------------------- partner accounts --------------------------- */
  "partner.me": { level: "partner", run: async (_i, a) => {
    const p = await db.query.partners.findFirst({ where: eq(partners.code, a.partner ?? "") });
    if (!p) throw new OpsError("Your partner account isn't linked to a partner. Ask Nepthic.", 404);
    const al = await db.query.allocations.findMany({ where: eq(allocations.partnerId, p.id), with: { event: true, ticketType: true }, orderBy: desc(allocations.createdAt) });
    const used = await issuedByAllocation(al.map((x) => x.id));
    const linkSold = await db.select({ eventId: tickets.eventId, n: sql<number>`count(*)::int`, rev: sql<number>`coalesce(sum(${tickets.priceCents}),0)::int` }).from(tickets)
      .where(and(eq(tickets.partnerId, p.id), isNull(tickets.allocationId), ne(tickets.status, "VOID"))).groupBy(tickets.eventId);
    const recent = await db.query.tickets.findMany({ where: eq(tickets.partnerId, p.id), with: { event: { columns: { name: true } }, ticketType: { columns: { name: true } } }, orderBy: desc(tickets.createdAt), limit: 50 });
    return {
      partner: { name: p.name, code: p.code, color: p.color, status: p.status, commissionPct: p.commissionPct, link: `/?ref=${p.referralCode}`, referralCode: p.referralCode },
      allocations: al.map((x) => {
        const u = used.get(x.id) ?? { issued: 0, sold: 0, scanned: 0 };
        return { id: x.id, kind: x.kind, quantity: x.quantity, revoked: !!x.revokedAt, event: { name: x.event.name, startsAt: x.event.startsAt }, type: x.ticketType.name, priceCents: x.ticketType.priceCents, ...u, left: x.quantity - u.issued, unsold: u.issued - u.sold };
      }),
      linkSales: linkSold,
      tickets: recent.map((t) => ({ id: t.id, code: t.code, event: t.event.name, type: t.ticketType.name, format: t.format, stage: t.stage, status: t.status, soldAt: t.soldAt, holderName: t.holderName })),
    };
  } },
  "partner.markSold": { level: "partner", run: async (i, a) => {
    const p = await db.query.partners.findFirst({ where: eq(partners.code, a.partner ?? "") });
    if (!p) throw new OpsError("Not linked to a partner.", 404);
    if (p.status === "SUSPENDED") throw new OpsError("Your partner account is suspended.", 403);
    const codes = s(i, "codes").split(/[\s,]+/).map((c) => codeKey(c)).filter(Boolean).slice(0, 200);
    if (!codes.length) throw new OpsError("Enter or scan the ticket codes you sold.");
    const r = await db.update(tickets).set({ stage: "SOLD", soldAt: new Date() })
      .where(and(eq(tickets.partnerId, p.id), inArray(tickets.codeKey, codes), sql`${tickets.stage} is not null`, ne(tickets.stage, "SOLD"), ne(tickets.status, "VOID"))).returning({ code: tickets.code });
    await audit(actorId(a), "partner.sold", "Partner", p.id, { ...actorNote(a), codes: r.map((x) => x.code) });
    fresh();
    const missing = codes.length - r.length;
    return ok(`${r.length} ticket${r.length === 1 ? "" : "s"} marked sold.${missing ? ` ${missing} code${missing > 1 ? "s weren't" : " wasn't"} yours, already sold, or void.` : ""}`);
  } },
  "partner.issue": { level: "partner", run: async (i, a) => issueFromAllocation(a, s(i, "allocationId"), i, a.partner) },
};

/* Partner report for one event: allocation, sales, attendance, money, timeline and alerts. */
export async function partnerReport(eventId: string) {
  const e = await needEvent(eventId);
  const ps = await db.query.partners.findMany();
  const pmap = new Map(ps.map((p) => [p.id, p]));
  const rows = await db.select({
    partnerId: tickets.partnerId, source: tickets.source,
    issued: sql<number>`count(*) filter (where ${tickets.status} <> 'VOID')::int`,
    sold: sql<number>`count(*) filter (where ${tickets.soldAt} is not null and ${tickets.status} not in ('VOID','REFUNDED'))::int`,
    scanned: sql<number>`count(*) filter (where ${tickets.status} = 'USED')::int`,
    revenue: sql<number>`coalesce(sum(${tickets.priceCents}) filter (where ${tickets.soldAt} is not null and ${tickets.status} not in ('VOID','REFUNDED')), 0)::int`,
    physical: sql<number>`count(*) filter (where ${tickets.format} <> 'ETICKET' and ${tickets.status} <> 'VOID')::int`,
  }).from(tickets).where(eq(tickets.eventId, e.id)).groupBy(tickets.partnerId, tickets.source);
  const alloc = await db.select({ partnerId: allocations.partnerId, q: sql<number>`coalesce(sum(${allocations.quantity}) filter (where ${allocations.revokedAt} is null), 0)::int` })
    .from(allocations).where(eq(allocations.eventId, e.id)).groupBy(allocations.partnerId);
  const past = e.startsAt.getTime() + 6 * 3600e3 < Date.now();
  const line = (key: string, label: string, code: string | null, color: string, r: (typeof rows)[number] | undefined, allocated: number, pct: number) => {
    const sold = r?.sold ?? 0, scanned = r?.scanned ?? 0, revenue = r?.revenue ?? 0;
    return {
      key, label, code, color, allocated, issued: r?.issued ?? 0, sold, unsold: Math.max(0, (allocated || (r?.issued ?? 0)) - sold), scanned,
      noShows: past ? Math.max(0, sold - scanned) : null, physical: r?.physical ?? 0, revenueCents: revenue, commissionPct: pct, commissionCents: Math.round((revenue * pct) / 100),
    };
  };
  const lines = [
    line("ONLINE", "Nepthic Online", null, "#8B5CF6", rows.find((r) => r.source === "ONLINE"), 0, 0),
    line("BOX_OFFICE", "Box Office", null, "#64748B", rows.find((r) => r.source === "BOX_OFFICE"), 0, 0),
    ...[...new Set([...rows.filter((r) => r.partnerId).map((r) => r.partnerId!), ...alloc.map((x) => x.partnerId)])].map((pid) => {
      const p = pmap.get(pid)!;
      return line(pid, p.name, p.code, p.color, rows.find((r) => r.partnerId === pid), alloc.find((x) => x.partnerId === pid)?.q ?? 0, p.commissionPct);
    }),
  ];

  // Entry timeline: admits per 15 minutes, by source and by gate.
  const sc = await db.select().from(scans).where(eq(scans.eventId, e.id)).orderBy(asc(scans.at));
  const admits = sc.filter((x) => x.result === "ADMIT");
  const bucket = (d: Date) => new Date(Math.floor(d.getTime() / 900e3) * 900e3).toISOString();
  const tkSource = new Map((await db.select({ id: tickets.id, partnerId: tickets.partnerId, source: tickets.source }).from(tickets).where(eq(tickets.eventId, e.id))).map((t) => [t.id, t.partnerId ?? t.source]));
  const timeline: Record<string, Record<string, number>> = {}, gates: Record<string, Record<string, number>> = {};
  for (const x of admits) {
    const k = bucket(x.at);
    const src = tkSource.get(x.ticketId!) ?? "ONLINE";
    (timeline[k] ??= {})[src] = (timeline[k][src] ?? 0) + 1;
    (gates[k] ??= {})[x.gate] = (gates[k][x.gate] ?? 0) + 1;
  }

  // Alerts
  const alerts: { level: "warn" | "bad"; text: string }[] = [];
  const byTicket = new Map<string, typeof sc>();
  for (const x of sc) if (x.ticketId) byTicket.set(x.ticketId, [...(byTicket.get(x.ticketId) ?? []), x]);
  const multiGate = [...byTicket.values()].filter((list) => list.some((x) => x.result === "ADMIT") && new Set(list.map((x) => x.gate)).size > 1);
  if (multiGate.length) alerts.push({ level: "bad", text: `${multiGate.length} ticket${multiGate.length > 1 ? "s were" : " was"} scanned at more than one gate (possible copies). Check the ticket list for "Already used" attempts.` });
  const refusedByPartner = new Map<string, number>();
  for (const x of sc) if (x.partnerId && ["ALREADY_USED", "VOID", "FLAGGED"].includes(x.result)) refusedByPartner.set(x.partnerId, (refusedByPartner.get(x.partnerId) ?? 0) + 1);
  for (const [pid, nRef] of refusedByPartner) {
    const l = lines.find((x) => x.key === pid);
    if (nRef >= 3 && nRef >= (l?.scanned ?? 0) * 0.05) alerts.push({ level: "warn", text: `${pmap.get(pid)?.name ?? "A partner"} (${pmap.get(pid)?.code}): ${nRef} refused scans (already used, void or flagged) from their tickets.` });
  }
  const invalid = sc.filter((x) => x.result === "INVALID" || x.result === "FORGED").length;
  if (invalid >= 5) alerts.push({ level: invalid >= 20 ? "bad" : "warn", text: `${invalid} invalid or forged codes were scanned at this event.` });
  for (const p of ps) if (p.status === "SUSPENDED" && lines.some((l) => l.key === p.id)) alerts.push({ level: "warn", text: `${p.name} (${p.code}) is suspended; their tickets are flagged at the door.` });

  return {
    event: { id: e.id, name: e.name, startsAt: e.startsAt, past },
    lines,
    totals: lines.reduce((t, l) => ({ sold: t.sold + l.sold, scanned: t.scanned + l.scanned, revenueCents: t.revenueCents + l.revenueCents, commissionCents: t.commissionCents + l.commissionCents }), { sold: 0, scanned: 0, revenueCents: 0, commissionCents: 0 }),
    timeline: Object.entries(timeline).map(([at, v]) => ({ at, ...v })),
    gates: Object.entries(gates).map(([at, v]) => ({ at, ...v })),
    gateNames: [...new Set(admits.map((x) => x.gate))],
    scanResults: Object.entries(sc.reduce<Record<string, number>>((m, x) => ((m[x.result] = (m[x.result] ?? 0) + 1), m), {})).map(([result, n]) => ({ result, n })),
    alerts,
  };
}

