import crypto from "node:crypto";
import { allocations, and, codeCounters, eq, events, isNotNull, isNull, tickets, type Tx } from "@/db";
import { newQrId } from "./ticket-codes";
import { codeKey, composeCode, maxNumber, normalizeFormat, scopeKey, type CodeFormat } from "./ticket-code-format";

/* ---------------------------------------------------------------------------
   Issuing tickets: every ticket (online order, bulk physical batch, partner sale, reissue)
   is created here, so codes always follow the event's format and are always unique.

   - Sequential numbers come from a per-sequence counter row, locked for the transaction, so two
     checkouts can never take the same number. Numbers inside a partner's reserved range are
     skipped by every other sequence; an allocation with a range draws only from that range.
   - Random numbers are drawn with crypto randomness and retried on the (unique) code.
   - The readable code is unique (and so is its separator-free form, used for typed codes).
   - The QR gets its own random id; nothing in the readable code is needed to make a QR.
--------------------------------------------------------------------------- */

export type IssueEvent = { id: string; slug: string; codeFormat: unknown };
export type IssueType = { id: string; codePrefix: string; priceCents: number; name: string };
export type IssuePartner = { id: string; code: string } | null;
export type IssueAllocation = { id: string; rangeStart: number | null; rangeEnd: number | null } | null;

export type IssueOpts = {
  event: IssueEvent; type: IssueType; count: number; holderName: string;
  buyerEmail?: string | null; orderId?: string | null; batchId?: string | null;
  format: "ETICKET" | "PHYSICAL" | "BOTH"; stage?: "GENERATED" | "PRINTED" | "DISTRIBUTED" | "SOLD" | null;
  source: "ONLINE" | "BOX_OFFICE" | "PARTNER"; partner?: IssuePartner; allocation?: IssueAllocation;
  sold?: boolean; reissuedFromId?: string | null;
};

export class CodeRangeError extends Error {}

export const brandFromSlug = (slug: string) => {
  const s = slug.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return ("NEP" + (s.match(/\d+/)?.[0] ?? "")).slice(0, 8).replace(/[OI]/g, "");
};

export const eventFormat = (e: IssueEvent): CodeFormat => normalizeFormat(e.codeFormat as Partial<CodeFormat> | null, brandFromSlug(e.slug));

const randomInt = (lo: number, hi: number) => crypto.randomInt(lo, hi + 1);

/** Reserved ranges in the same sequence (other allocations' ranges), to skip. */
async function reservedRanges(tx: Tx, f: CodeFormat, eventId: string, key: string, exceptAllocation?: string) {
  const rows = await tx.select({ id: allocations.id, typeId: allocations.ticketTypeId, partnerId: allocations.partnerId, a: allocations.rangeStart, b: allocations.rangeEnd })
    .from(allocations).where(and(eq(allocations.eventId, eventId), isNotNull(allocations.rangeStart), isNull(allocations.revokedAt)));
  return rows.filter((r) => r.id !== exceptAllocation && scopeKey(f, { typeId: r.typeId, partnerId: r.partnerId }) === key).map((r) => [r.a!, r.b!] as const);
}

async function takeNumber(tx: Tx, f: CodeFormat, eventId: string, key: string, first: number, last: number, skip: (readonly [number, number])[]) {
  await tx.insert(codeCounters).values({ eventId, scopeKey: key, next: first }).onConflictDoNothing();
  const [row] = await tx.select().from(codeCounters).where(and(eq(codeCounters.eventId, eventId), eq(codeCounters.scopeKey, key))).for("update");
  let n = Math.max(row.next, first);
  for (;;) {
    const hit = skip.find(([a, b]) => n >= a && n <= b);
    if (!hit) break;
    n = hit[1] + 1;
  }
  if (n > last) throw new CodeRangeError(last === maxNumber(f) ? `The ${f.padding}-digit numbers for this sequence have run out. Add a digit in Ticket settings.` : `This allocation's number range is used up (last number ${last}).`);
  await tx.update(codeCounters).set({ next: n + f.increment }).where(and(eq(codeCounters.eventId, eventId), eq(codeCounters.scopeKey, key)));
  return n;
}

export async function issueTickets(tx: Tx, o: IssueOpts) {
  const f = eventFormat(o.event);
  const ctx = { typeId: o.type.id, typePrefix: o.type.codePrefix || initials(o.type.name), partnerId: o.partner?.id ?? null, partnerCode: o.partner?.code ?? null, date: new Date() };
  const ranged = o.allocation?.rangeStart != null && o.allocation.rangeEnd != null;
  const key = ranged ? `alloc:${o.allocation!.id}` : scopeKey(f, ctx);
  const skip = ranged ? [] : await reservedRanges(tx, f, o.event.id, key);
  const out: { id: string; code: string; qrId: string; serial: number }[] = [];

  for (let i = 0; i < o.count; i++) {
    for (let attempt = 0; ; attempt++) {
      if (attempt > 50) throw new Error("Couldn't find a free ticket number; widen the number format.");
      const n = f.mode === "RANDOM" && !ranged
        ? randomInt(10 ** (f.padding - 1), maxNumber(f))
        : await takeNumber(tx, f, o.event.id, key, ranged ? o.allocation!.rangeStart! : f.start, ranged ? o.allocation!.rangeEnd! : maxNumber(f), skip);
      if (f.mode === "RANDOM" && skip.some(([a, b]) => n >= a && n <= b)) continue;
      const code = composeCode(f, ctx, n);
      const qrId = newQrId();
      const rows = await tx.insert(tickets).values({
        code, codeKey: codeKey(code), qrId, serial: n,
        ticketOrderId: o.orderId ?? null, ticketTypeId: o.type.id, eventId: o.event.id,
        holderName: o.holderName, buyerEmail: o.buyerEmail ?? null,
        format: o.format, stage: o.stage ?? null, source: o.source,
        partnerId: o.partner?.id ?? null, allocationId: o.allocation?.id ?? null, batchId: o.batchId ?? null,
        priceCents: o.type.priceCents, soldAt: o.sold ? new Date() : null, reissuedFromId: o.reissuedFromId ?? null,
      }).onConflictDoNothing().returning({ id: tickets.id });
      if (rows[0]) { out.push({ id: rows[0].id, code, qrId, serial: n }); break; }
      // Code already taken (an earlier format produced it): move on to the next number.
    }
  }
  return out;
}

/** "General admission" → "GA", "VIP" → "VIP", "Early bird" → "EB". */
export function initials(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4);
  return words.map((w) => w[0]).join("").slice(0, 4);
}

/** Does the event exist and what's its format (for callers that only have an id). */
export async function eventForIssue(tx: Tx, eventId: string) {
  const [e] = await tx.select({ id: events.id, slug: events.slug, codeFormat: events.codeFormat }).from(events).where(eq(events.id, eventId));
  return e ?? null;
}

