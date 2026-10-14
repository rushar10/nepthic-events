import Link from "next/link";
import { asc, db, desc, events, sql, tickets, ticketTypes } from "@/db";
import { aud0, dateLong } from "@/ui/format";
import { Status } from "@/ui/Status";
import { guard } from "@/lib/admin/guard";

export const metadata = { title: "Events" };

export default async function Events() {
  const user = await guard("events");
  const list = await db.query.events.findMany({ orderBy: desc(events.startsAt), with: { ticketTypes: { orderBy: asc(ticketTypes.sortOrder) } } });
  const checked = await db
    .select({ eventId: tickets.eventId, n: sql<number>`count(*) filter (where ${tickets.status} = 'USED')::int` })
    .from(tickets).groupBy(tickets.eventId);
  const checkedBy = new Map(checked.map((c) => [c.eventId, c.n]));
  const now = new Date();

  return (
    <>
      <div className="spread">
        <div><p className="eyebrow">Events</p><h1 className="page" style={{ marginTop: 6 }}>Events &amp; ticket sales</h1></div>
        {user.role === "ADMIN" && <Link className="btn btn-primary prox" href="/admin/events/new">New event</Link>}
      </div>
      <section className="panel prox">
        <div className="scroll"><table className="tbl rtable">
          <thead><tr><th>Event</th><th>Date</th><th>Ticket types</th><th>Sold / capacity</th><th className="num">Gross</th><th className="num">Checked in</th><th>Status</th></tr></thead>
          <tbody>
            {list.map((e) => {
              const cap = e.ticketTypes.reduce((a, t) => a + t.capacity, 0);
              const sold = e.ticketTypes.reduce((a, t) => a + t.sold, 0);
              const gross = e.ticketTypes.reduce((a, t) => a + t.sold * t.priceCents, 0);
              return (
                <tr key={e.id}>
                  <td><Link href={`/admin/events/${e.id}`}><b>{e.name}</b></Link><div className="small dim">{e.venue}</div></td>
                  <td className="small" data-label="Date">{dateLong(e.startsAt)}</td>
                  <td className="small" data-label="Types">{e.ticketTypes.map((t) => <div key={t.id}>{t.name} <span className="mono dim">{aud0(t.priceCents)}</span></div>)}</td>
                  <td style={{ minWidth: 150 }} data-label="Sold"><div className="bar"><i style={{ width: `${cap ? (sold / cap) * 100 : 0}%` }} /></div><span className="small mono">{sold} / {cap}</span></td>
                  <td className="num" data-label="Gross">{aud0(gross)}</td>
                  <td className="num" data-label="Checked in">{checkedBy.get(e.id) ?? 0}</td>
                  <td data-label="Status">{e.status === "PUBLISHED" && e.startsAt < now ? <span className="pill">Conducted</span> : <Status value={e.status} />}</td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={7} className="dim">No events yet.</td></tr>}
          </tbody>
        </table></div>
        <p className="small dim">Sold includes seats held by checkouts in progress (released after 30 minutes if unpaid).</p>
      </section>
    </>
  );
}
