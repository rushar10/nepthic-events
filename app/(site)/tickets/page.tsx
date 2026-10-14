import Link from "next/link";
import { and, desc, db, eq, ticketOrders } from "@/db";
import { requireUser } from "@/core/auth";
import { TicketCard } from "@/app/(site)/TicketCard";
import { PullToRefresh } from "@/ui/ux/PullToRefresh";

export const metadata = { title: "My tickets" };

export default async function MyTickets() {
  const user = await requireUser(undefined, "/login?next=/tickets");
  const orders = await db.query.ticketOrders.findMany({
    where: and(eq(ticketOrders.userId, user.id), eq(ticketOrders.status, "PAID")),
    orderBy: desc(ticketOrders.createdAt),
    with: { event: true, tickets: { with: { ticketType: true } } },
  });
  const now = new Date();
  const all = orders.flatMap((o) => o.tickets.map((t) => ({ ...t, event: o.event })));
  const upcoming = all.filter((t) => t.event.startsAt >= now).sort((a, b) => +a.event.startsAt - +b.event.startsAt);
  const past = all.filter((t) => t.event.startsAt < now);

  return (
    <PullToRefresh>
    <div className="stack">
      <section className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Signed in as {user.name}</p>
        <h1 className="page">My tickets</h1>
      </section>
      <nav className="chips" aria-label="Events">
        <Link className="tab" href="/upcoming">Upcoming</Link>
        <Link className="tab" href="/past">Past events</Link>
        <Link className="tab" href="/tickets" aria-current="page">My tickets<span className="count">{upcoming.length}</span></Link>
      </nav>
      {all.length === 0 && <div className="empty">No tickets yet. <Link href="/">See what&apos;s on</Link>.</div>}
      {upcoming.length > 0 && (
        <div className="tickets">
          {upcoming.map((t) => <TicketCard key={t.id} code={t.code} status={t.status} holderName={t.holderName} checkedInAt={t.checkedInAt} typeName={t.ticketType.name} event={t.event} />)}
        </div>
      )}
      {past.length > 0 && (
        <section className="stack-sm">
          <h2 className="h3">Past</h2>
          <div className="tickets">
            {past.map((t) => <TicketCard key={t.id} code={t.code} status={t.status} holderName={t.holderName} checkedInAt={t.checkedInAt} typeName={t.ticketType.name} event={t.event} />)}
          </div>
        </section>
      )}
    </div>
    </PullToRefresh>
  );
}
