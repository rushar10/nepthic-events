import Link from "next/link";
import { and, asc, count, db, eq, events, gte, sql, tickets } from "@/db";
import { DOOR_ROLES, requireUser } from "@/core/auth";
import { dateShort, time } from "@/ui/format";
import { Scanner } from "./Scanner";

export const metadata = { title: "Door scanner" };

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const staff = await requireUser(DOOR_ROLES, "/door/login");
  const { event } = await searchParams;
  const since = new Date(Date.now() - 24 * 3600e3);
  const list = await db.query.events.findMany({
    where: and(eq(events.status, "PUBLISHED"), gte(events.startsAt, since)),
    orderBy: asc(events.startsAt),
    limit: 20,
  });
  const current = list.find((e) => e.id === event) ?? list[0];

  if (!current) {
    return <div className="empty">No published events in the next few weeks. Create one in the Events admin first.</div>;
  }
  const [stats] = await db
    .select({ issued: count(), admitted: sql<number>`count(*) filter (where ${tickets.status} = 'USED')::int` })
    .from(tickets)
    .where(and(eq(tickets.eventId, current.id), sql`${tickets.status} in ('VALID','USED','REFUND_REQUESTED')`));

  return (
    <div className="stack">
      <div className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Door scanner · {staff.name}</p>
        <h1 className="page">Check-in</h1>
      </div>
      <nav className="chips" aria-label="Event">
        {list.map((e) => (
          <Link key={e.id} className="tab" href={`/door?event=${e.id}`} aria-current={e.id === current.id ? "page" : undefined}>
            {e.name} · {dateShort(e.startsAt)}
          </Link>
        ))}
      </nav>
      <Scanner eventId={current.id} eventName={`${current.name} · doors ${time(current.startsAt)}`} issued={stats.issued} admitted={stats.admitted} />
    </div>
  );
}
