import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, db, eq, events, ticketTypes } from "@/db";
import { getUser } from "@/core/auth";
import { getSettings } from "@/core/settings";
import { dateLong, time } from "@/ui/format";
import { Poster } from "@/ui/Art";
import { imageUrl } from "@/lib/events";
import { TicketPicker } from "./TicketPicker";
import { SaveButton } from "@/ui/ux/SaveButton";
import { savedIds } from "@/lib/saved";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const e = await db.query.events.findFirst({ where: eq(events.slug, (await params).slug), columns: { name: true, description: true } });
  return e ? { title: e.name, description: e.description } : {};
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const e = await db.query.events.findFirst({
    where: and(eq(events.slug, slug), eq(events.status, "PUBLISHED")),
    with: { ticketTypes: { orderBy: asc(ticketTypes.sortOrder) } },
  });
  if (!e) notFound();
  const [user, settings, saved] = await Promise.all([getUser(), getSettings(), savedIds()]);
  const past = e.startsAt < new Date();
  const sold = e.ticketTypes.reduce((a, t) => a + t.sold, 0);

  return (
    <div className="stack">
      <Link className="btn btn-ghost btn-sm" href={past ? "/past" : "/upcoming"} style={{ justifySelf: "start" }}>← {past ? "Past events" : "All events"}</Link>
      {sp.cancelled && <p className="note warn">Checkout cancelled. Your seats were released and nothing was charged.</p>}
      <div className="split">
        <div className="stack">
          <div className="card-wrap">
            <Poster big name={e.name} venue={e.venue} city={e.city} startsAt={e.startsAt} hue={e.hue} imageUrl={imageUrl(e.coverUploadId)} vt={`e-${e.slug}`} priority />
            {!past && <SaveButton itemId={e.id} name={e.name} initial={saved.has(e.id)} />}
          </div>
          <div className="stack-sm">
            <h1>{e.name}</h1>
            <p className="lede">{e.description}</p>
          </div>
          <dl className="kv">
            <div><dt>Date</dt><dd>{dateLong(e.startsAt)}</dd></div>
            <div><dt>Doors</dt><dd>{time(e.startsAt)}</dd></div>
            <div><dt>Venue</dt><dd>{e.venue}</dd></div>
            <div><dt>Area</dt><dd>{e.address ? `${e.address}, ` : ""}{e.city}</dd></div>
            <div><dt>Entry</dt><dd>{e.ageRestriction}</dd></div>
          </dl>
          {e.galleryIds.length > 0 && (
            <section className="stack-sm">
              <h2 className="h3">Gallery</h2>
              <div className="carousel gallery-swipe">{e.galleryIds.map((id, i) => <img key={id} src={imageUrl(id)!} alt={`${e.name}, photo ${i + 1}`} loading="lazy" decoding="async" width={600} height={600} />)}</div>
            </section>
          )}
        </div>
        <aside className="panel prox sticky" aria-label="Tickets">
          {past ? (
            <>
              <p className="eyebrow">Recap</p>
              <dl className="kv"><div><dt>Tickets sold</dt><dd className="mono">{sold.toLocaleString("en-AU")}</dd></div></dl>
              <p className="dim small">This event has finished. <Link href="/">See what&apos;s coming up</Link>.</p>
            </>
          ) : (
            <TicketPicker
              eventId={e.id}
              signedIn={!!user}
              defaultName={user?.name ?? ""}
              email={user?.email ?? ""}
              loginHref={`/login?next=/e/${e.slug}`}
              max={settings.maxTicketsPerOrder}
              refundHours={settings.ticketRefundCutoffHours}
              types={e.ticketTypes.map((t) => ({ id: t.id, name: t.name, priceCents: t.priceCents, left: Math.max(0, t.capacity - t.sold) }))}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
