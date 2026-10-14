import Link from "next/link";
import { aud0, dateLong, daysUntil } from "@/ui/format";
import { Poster } from "@/ui/Art";
import { availability, imageUrl, type EventWithTypes } from "@/lib/events";

export function EventCard({ e, past }: { e: EventWithTypes; past?: boolean }) {
  const a = availability(e);
  const d = daysUntil(e.startsAt);
  return (
    <Link href={`/e/${e.slug}`} className="evcard prox">
      <Poster name={e.name} venue={e.venue} city={e.city} startsAt={e.startsAt} hue={e.hue} imageUrl={imageUrl(e.coverUploadId)} />
      <span className="ev-meta">
        <span className="spread">
          <span className="small">{dateLong(e.startsAt)}</span>
          {past ? <span className="pill">Conducted</span>
            : a.left === 0 ? <span className="pill bad">Sold out</span>
            : a.pct >= 75 ? <span className="pill warn">Selling fast</span>
            : <span className="pill info">{d <= 1 ? "Tomorrow" : `In ${d} days`}</span>}
        </span>
        {past ? (
          <span className="dim small">{a.sold.toLocaleString("en-AU")} tickets sold{e.galleryIds.length ? ` · ${e.galleryIds.length} photos` : ""}</span>
        ) : (
          <>
            <span className="bar" aria-hidden="true"><i style={{ width: `${a.pct}%` }} /></span>
            <span className="spread small"><span className="dim">{a.left.toLocaleString("en-AU")} of {a.capacity.toLocaleString("en-AU")} left</span>
              {a.from != null && <span>From <b className="mono">{aud0(a.from)}</b></span>}</span>
          </>
        )}
      </span>
    </Link>
  );
}
