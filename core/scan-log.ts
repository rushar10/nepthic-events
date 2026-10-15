import { and, db, desc, eq, events, ilike, inArray, isNull, or, partners, scans, sql, tickets, ticketTypes } from "@/db";

/* The door log: every scan at an event, newest first, with what the door was told and where the
   ticket came from (online, box office, or which partner). Read by the portal's Door scans page
   and its CSV export. The partner is the one recorded at the moment of the scan. */

export const SCAN_RESULTS = ["ADMIT", "ALREADY_USED", "FLAGGED", "INVALID", "FORGED", "VOID", "REFUNDED", "WRONG_EVENT"] as const;
export const REFUSED = SCAN_RESULTS.filter((r) => r !== "ADMIT");

export type ScanFilters = {
  eventId: string;
  /** Partner id, "none" (not from a partner) or "" (any). */
  partnerId?: string;
  gate?: string;
  /** A result, "refused" (anything but ADMIT) or "" (any). */
  result?: string;
  method?: string;
  /** Ticket code or name. */
  q?: string;
};

function where(f: ScanFilters) {
  const q = (f.q ?? "").trim().slice(0, 60);
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return and(
    eq(scans.eventId, f.eventId),
    f.partnerId === "none" ? isNull(scans.partnerId) : f.partnerId ? eq(scans.partnerId, f.partnerId) : undefined,
    f.gate ? eq(scans.gate, f.gate) : undefined,
    f.result === "refused" ? inArray(scans.result, [...REFUSED]) : f.result ? eq(scans.result, f.result) : undefined,
    f.method ? eq(scans.method, f.method) : undefined,
    q ? or(ilike(scans.code, like), ilike(tickets.code, like), ilike(tickets.holderName, like)) : undefined,
  );
}

const cols = {
  id: scans.id, at: scans.at, result: scans.result, gate: scans.gate, method: scans.method, staff: scans.staff, typed: scans.code,
  ticketCode: tickets.code, holder: tickets.holderName, status: tickets.status, format: tickets.format, source: tickets.source,
  type: ticketTypes.name, zone: ticketTypes.zone,
  partnerName: partners.name, partnerCode: partners.code, partnerColor: partners.color, partnerStatus: partners.status,
};

export type ScanRow = Awaited<ReturnType<typeof scanRows>>[number];

/** One page of the log, newest first. */
export async function scanRows(f: ScanFilters, opts: { limit?: number; offset?: number } = {}) {
  return db.select(cols).from(scans)
    .leftJoin(tickets, eq(tickets.id, scans.ticketId))
    .leftJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .leftJoin(partners, eq(partners.id, scans.partnerId))
    .where(where(f))
    .orderBy(desc(scans.at), desc(scans.id))
    .limit(opts.limit ?? 100).offset(opts.offset ?? 0);
}

/** Counts for the whole event (ignores the filters), for the summary strip and the filter menus. */
export async function scanSummary(eventId: string) {
  const [byResult, byGate, byPartner, ev] = await Promise.all([
    db.select({ k: scans.result, n: sql<number>`count(*)::int` }).from(scans).where(eq(scans.eventId, eventId)).groupBy(scans.result),
    db.select({ k: scans.gate, n: sql<number>`count(*)::int` }).from(scans).where(eq(scans.eventId, eventId)).groupBy(scans.gate),
    db.select({
      id: scans.partnerId, name: partners.name, code: partners.code, color: partners.color,
      admitted: sql<number>`count(*) filter (where ${scans.result} = 'ADMIT')::int`,
      refused: sql<number>`count(*) filter (where ${scans.result} <> 'ADMIT')::int`,
    }).from(scans).leftJoin(partners, eq(partners.id, scans.partnerId)).where(eq(scans.eventId, eventId))
      .groupBy(scans.partnerId, partners.name, partners.code, partners.color),
    db.query.events.findFirst({ where: eq(events.id, eventId), columns: { id: true, name: true, startsAt: true, gates: true } }),
  ]);
  return {
    event: ev ?? null,
    total: byResult.reduce((a, r) => a + r.n, 0),
    byResult: Object.fromEntries(byResult.map((r) => [r.k, r.n])) as Record<string, number>,
    gates: [...new Set([...(ev?.gates ?? []), ...byGate.map((g) => g.k)])].map((g) => ({ gate: g, n: byGate.find((x) => x.k === g)?.n ?? 0 })),
    partners: byPartner.map((p) => ({ id: p.id, name: p.name ?? "Online and box office", code: p.code, color: p.color, admitted: p.admitted, refused: p.refused }))
      .sort((a, b) => (a.id ? 1 : 0) - (b.id ? 1 : 0) || b.admitted + b.refused - (a.admitted + a.refused)),
  };
}
