import Link from "next/link";
import { getUser } from "@/core/auth";
import { aud0, dateLong, daysUntil, time } from "@/ui/format";
import { Poster } from "@/ui/Art";
import { availability, imageUrl, listEvents } from "@/lib/events";
import { EventCard } from "./EventCard";
import { savedIds } from "@/lib/saved";
import { SaveButton } from "@/ui/ux/SaveButton";

export default async function Home() {
  const [list, past, user, saved] = await Promise.all([listEvents("upcoming"), listEvents("past"), getUser(), savedIds()]);
  const [next, ...rest] = list;
  const a = next ? availability(next) : null;

  return (
    <div className="stack">
      <section className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Nepthic Events{user ? ` · hi ${user.name.split(" ")[0]}` : ""}</p>
        <h1>Nights built around the drop.</h1>
      </section>

      {next ? (
        <div className="card-wrap">
        <Link prefetch={false} href={`/e/${next.slug}`} className="evcard prox" aria-label={`Next up: ${next.name}`}>
          <Poster big name={next.name} venue={next.venue} city={next.city} startsAt={next.startsAt} hue={next.hue} imageUrl={imageUrl(next.coverUploadId)} vt={`e-${next.slug}`} priority />
          <span className="ev-meta">
            <span className="spread"><span className="eyebrow">Next up · in {daysUntil(next.startsAt)} days</span>{a && a.pct >= 75 && <span className="pill warn">Selling fast</span>}</span>
            <span>{dateLong(next.startsAt)} · doors {time(next.startsAt)}</span>
            <span className="spread"><span className="dim small">{a!.left.toLocaleString("en-AU")} tickets left</span>{a?.from != null && <span className="btn btn-primary btn-sm">Tickets from {aud0(a.from)}</span>}</span>
          </span>
        </Link>
        <SaveButton itemId={next.id} name={next.name} initial={saved.has(next.id)} />
        </div>
      ) : (
        <div className="empty">Nothing on sale right now. Follow @nepthic_ to hear about the next night first.</div>
      )}

      {rest.length > 0 && (
        <section className="stack-sm">
          <div className="spread"><h2 className="h3">Also coming up</h2><Link className="link" href="/upcoming">See all</Link></div>
          <div className="carousel">{rest.map((e) => <EventCard key={e.id} e={e} saved={saved.has(e.id)} />)}</div>
        </section>
      )}

      {past.length > 0 && (
        <section className="stack-sm">
          <div className="spread"><h2 className="h3">Past nights</h2><Link className="link" href="/past">Archive</Link></div>
          <div className="carousel">{past.slice(0, 6).map((e) => <EventCard key={e.id} e={e} past />)}</div>
        </section>
      )}
    </div>
  );
}
