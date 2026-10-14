import Link from "next/link";
import { listEvents } from "@/lib/events";
import { EventCard } from "../EventCard";
import { savedIds } from "@/lib/saved";
import { SearchList, SearchItem } from "@/ui/ux/SearchList";
import { dateLong } from "@/ui/format";

export const metadata = { title: "Upcoming events" };

export default async function Upcoming() {
  const [list, saved] = await Promise.all([listEvents("upcoming"), savedIds()]);
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
        <SearchList id="upcoming" className="ev-grid" placeholder="Search events, venues or cities" suggestions={[...new Set(list.map((e) => e.city.split(",").at(-1)!.trim()))].slice(0, 4)}
          empty="No upcoming events match that search.">
          {list.map((e) => (
            <SearchItem key={e.id} terms={`${e.name} ${e.venue} ${e.city} ${dateLong(e.startsAt)}`}>
              <EventCard e={e} saved={saved.has(e.id)} />
            </SearchItem>
          ))}
        </SearchList>
      )}
    </div>
  );
}
