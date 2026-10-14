import Link from "next/link";
import { listEvents } from "@/lib/events";
import { EventCard } from "../EventCard";

export const metadata = { title: "Upcoming events" };

export default async function Upcoming() {
  const list = await listEvents("upcoming");
  return (
    <div className="stack">
      <section className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">On sale</p>
        <h1 className="page">Upcoming events</h1>
      </section>
      <nav className="chips" aria-label="Events">
        <Link className="tab" href="/upcoming" aria-current="page">Upcoming<span className="count">{list.length}</span></Link>
        <Link className="tab" href="/past">Past events</Link>
        <Link className="tab" href="/tickets">My tickets</Link>
      </nav>
      {list.length === 0 ? <div className="empty">No events on sale right now.</div> : (
        <div className="ev-grid">{list.map((e) => <EventCard key={e.id} e={e} />)}</div>
      )}
    </div>
  );
}
