import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, db, desc, eq, events, tickets, ticketTypes } from "@/db";
import { env } from "@/core/env";
import { aud, aud0, dateLong, time } from "@/ui/format";
import { Status } from "@/ui/Status";
import { ActionForm, Submit } from "@/ui/Forms";
import { guard } from "@/lib/admin/guard";
import { removeGalleryImage, saveTicketType } from "@/lib/admin/actions/events";
import { EventForm } from "../EventForm";

export const metadata = { title: "Event" };

export default async function EventDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await guard("events");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const e = await db.query.events.findFirst({ where: eq(events.id, id), with: { ticketTypes: { orderBy: asc(ticketTypes.sortOrder) } } });
  if (!e) notFound();
  const admin = user.role === "ADMIN";
  const attendees = await db.query.tickets.findMany({ where: eq(tickets.eventId, e.id), orderBy: desc(tickets.createdAt), with: { ticketType: true, ticketOrder: true }, limit: 500 });
  const used = attendees.filter((t) => t.status === "USED").length;
  const live = attendees.filter((t) => t.status === "VALID" || t.status === "USED" || t.status === "REFUND_REQUESTED").length;

  return (
    <>
      <Link className="btn btn-ghost btn-sm" href="/admin/events" style={{ justifySelf: "start" }}>← Events</Link>
      {sp.created && <p className="note ok">Event created{e.status === "DRAFT" ? " as a draft. Set it to Published when you're ready to sell." : " and on sale."}</p>}
      <div className="spread">
        <div><p className="eyebrow">{dateLong(e.startsAt)} · {time(e.startsAt)}</p><h1 className="page" style={{ marginTop: 6 }}>{e.name}</h1></div>
        <div className="row"><Status value={e.status} />{e.status === "PUBLISHED" && <a className="btn btn-sm prox" href={`${env.siteUrl}/e/${e.slug}`} target="_blank" rel="noopener">View on site ↗</a>}</div>
      </div>

      <div className="kpis">
        <div className="kpi prox"><span className="l">Tickets issued</span><span className="v">{live}</span></div>
        <div className="kpi prox"><span className="l">Checked in</span><span className="v">{used}</span><span className="small dim">{live ? Math.round((used / live) * 100) : 0}% of issued</span></div>
        <div className="kpi prox"><span className="l">Gross</span><span className="v">{aud0(e.ticketTypes.reduce((a, t) => a + t.sold * t.priceCents, 0))}</span></div>
      </div>

      <section className="panel prox">
        <h2 className="h3">Ticket types</h2>
        <div className="cards">
          {e.ticketTypes.map((t) => (
            <ActionForm key={t.id} action={saveTicketType} className="row" >
              <input type="hidden" name="typeId" value={t.id} /><input type="hidden" name="eventId" value={e.id} />
              <label className="f" style={{ flex: 2, minWidth: 180 }}>Name<input type="text" name="name" defaultValue={t.name} disabled={!admin} /></label>
              <label className="f" style={{ width: 120 }}>Price ($)<input type="number" name="price" step="0.01" defaultValue={(t.priceCents / 100).toFixed(2)} disabled={!admin} /></label>
              <label className="f" style={{ width: 110 }}>Capacity<input type="number" name="capacity" min={t.sold} defaultValue={t.capacity} disabled={!admin} /></label>
              <span className="small dim" style={{ alignSelf: "end", paddingBottom: 10 }}>{t.sold} sold</span>
              {admin && <span style={{ alignSelf: "end" }}><Submit className="btn btn-sm prox" pendingText="Saving…">Save</Submit></span>}
            </ActionForm>
          ))}
          {admin && (
            <ActionForm action={saveTicketType} className="row">
              <input type="hidden" name="eventId" value={e.id} /><input type="hidden" name="sortOrder" value={e.ticketTypes.length} />
              <label className="f" style={{ flex: 2, minWidth: 180 }}>New type<input type="text" name="name" placeholder="e.g. Final release" /></label>
              <label className="f" style={{ width: 120 }}>Price ($)<input type="number" name="price" step="0.01" min="0" /></label>
              <label className="f" style={{ width: 110 }}>Capacity<input type="number" name="capacity" min="1" /></label>
              <span style={{ alignSelf: "end" }}><Submit className="btn btn-sm prox" pendingText="Adding…">Add</Submit></span>
            </ActionForm>
          )}
        </div>
      </section>

      {admin && <EventForm event={e} />}

      {e.galleryIds.length > 0 && (
        <section className="panel prox">
          <h2 className="h3">Gallery</h2>
          <div className="thumbs">
            {e.galleryIds.map((g) => (
              <figure key={g} style={{ margin: 0, display: "grid", gap: 4 }}>
                <img src={`/api/uploads/${g}`} alt="Gallery photo" />
                {admin && <form action={removeGalleryImage}><input type="hidden" name="eventId" value={e.id} /><input type="hidden" name="uploadId" value={g} /><button className="link">Remove</button></form>}
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="panel prox">
        <div className="spread"><h2 className="h3">Attendees</h2><Link className="btn btn-sm prox" href={`/admin/checkin?event=${e.id}`}>Check-in view</Link></div>
        <div className="scroll"><table className="tbl rtable">
          <thead><tr><th>Name</th><th>Buyer email</th><th>Ticket</th><th>Code</th><th>Status</th><th>Checked in</th></tr></thead>
          <tbody>
            {attendees.map((t) => (
              <tr key={t.id}><td>{t.holderName}</td><td className="small" data-label="Email">{t.ticketOrder.buyerEmail}</td><td data-label="Ticket">{t.ticketType.name} <span className="dim mono small">{aud(t.ticketType.priceCents)}</span></td>
                <td className="mono small" data-label="Code">{t.code}</td><td data-label="Status"><Status value={t.status} /></td><td className="mono" data-label="In">{t.checkedInAt ? time(t.checkedInAt) : "—"}</td></tr>
            ))}
            {attendees.length === 0 && <tr><td colSpan={6} className="dim">No tickets sold yet.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
