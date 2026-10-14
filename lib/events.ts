import { and, asc, db, desc, eq, events, gte, lt, ticketTypes } from "@/db";
import { env } from "@/core/env";

export async function listEvents(when: "upcoming" | "past") {
  const now = new Date();
  return db.query.events.findMany({
    where: and(eq(events.status, "PUBLISHED"), when === "upcoming" ? gte(events.startsAt, now) : lt(events.startsAt, now)),
    orderBy: when === "upcoming" ? asc(events.startsAt) : desc(events.startsAt),
    with: { ticketTypes: { orderBy: asc(ticketTypes.sortOrder) } },
  });
}

export type EventWithTypes = Awaited<ReturnType<typeof listEvents>>[number];

export function availability(e: EventWithTypes) {
  const capacity = e.ticketTypes.reduce((a, t) => a + t.capacity, 0);
  const sold = e.ticketTypes.reduce((a, t) => a + t.sold, 0);
  const open = e.ticketTypes.filter((t) => t.sold < t.capacity);
  const from = open.length ? Math.min(...open.map((t) => t.priceCents)) : null;
  return { capacity, sold, left: capacity - sold, pct: capacity ? (sold / capacity) * 100 : 0, from };
}

export const imageUrl = (id: string | null | undefined) => (id ? `${env.siteUrl}/api/uploads/${id}` : null);
