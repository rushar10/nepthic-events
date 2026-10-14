import Link from "next/link";
import { listEvents } from "@/lib/events";
import { EventCard } from "../EventCard";

export const metadata = { title: "Past events" };

export default async function Past() {
  const list = await listEvents("past");
  return (
    <div className="stack">
      <section className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Archive</p>
        <h1 className="page">Past events</h1>
      </section>
      <nav className="chips" aria-label="Events">
        <Link className="tab" href="/upcoming">Upcoming</Link>
        <Link className="tab" href="/past" aria-current="page">Past events<span className="count">{list.length}</span></Link>
        <Link className="tab" href="/tickets">My tickets</Link>
      </nav>
      {list.length === 0 ? <div className="empty">No past events yet.</div> : <div className="ev-grid">{list.map((e) => <EventCard key={e.id} e={e} past />)}</div>}
    </div>
  );
}
