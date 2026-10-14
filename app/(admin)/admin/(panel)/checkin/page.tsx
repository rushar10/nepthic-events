import Link from "next/link";
import { and, asc, db, eq, events, gte, sql, tickets } from "@/db";
import { env } from "@/core/env";
import { dateLong, time } from "@/ui/format";
import { guard } from "@/lib/admin/guard";

export const metadata = { title: "Check-in" };

export default async function Checkin() {
  await guard("checkin");
  const since = new Date(Date.now() - 24 * 3600e3);
  const list = await db.query.events.findMany({ where: and(eq(events.status, "PUBLISHED"), gte(events.startsAt, since)), orderBy: asc(events.startsAt) });
  const stats = await db
    .select({
      eventId: tickets.eventId,
      issued: sql<number>`count(*) filter (where ${tickets.status} in ('VALID','USED','REFUND_REQUESTED'))::int`,
      used: sql<number>`count(*) filter (where ${tickets.status} = 'USED')::int`,
      last: sql<Date | null>`max(${tickets.checkedInAt})`,
    })
    .from(tickets).groupBy(tickets.eventId);
  const by = new Map(stats.map((s) => [s.eventId, s]));

  return (
    <>
      <div><p className="eyebrow">Door</p><h1 className="page" style={{ marginTop: 6 }}>Check-in</h1>
        <p className="dim small" style={{ marginTop: 6 }}>Scanning happens in the Nepthic Door app, a separate staff site door teams install on their phones. Sign in there with the same staff login.</p></div>
      {list.length === 0 && <div className="empty">No events today or coming up.</div>}
      <div className="cards">
        {list.map((e) => {
          const s = by.get(e.id);
          const pct = s?.issued ? Math.round((s.used / s.issued) * 100) : 0;
          return (
            <article key={e.id} className="card prox">
              <div className="spread">
                <div><b>{e.name}</b><div className="small dim">{dateLong(e.startsAt)} · doors {time(e.startsAt)} · {e.venue}</div></div>
                <a className="btn btn-primary btn-sm prox" href={`/door?event=${e.id}`} target="_blank" rel="noopener">Open scanner ↗</a>
              </div>
              <div className="bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
              <div className="spread small"><span><b className="mono">{s?.used ?? 0}</b> of {s?.issued ?? 0} admitted ({pct}%)</span>
                <span className="dim">{s?.last ? `Last scan ${time(s.last)}` : "No scans yet"} · <Link href={`/admin/events/${e.id}`}>Attendee list</Link></span></div>
            </article>
          );
        })}
      </div>
    </>
  );
}
