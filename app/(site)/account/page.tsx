import Link from "next/link";
import { and, db, desc, eq, ticketOrders } from "@/db";
import { requireUser } from "@/core/auth";
import { aud, dateShort } from "@/ui/format";
import { Status } from "@/ui/Status";
import { logout } from "@/app/actions/auth";

export const metadata = { title: "Account" };

export default async function Account() {
  const user = await requireUser(undefined, "/login?next=/account");
  const orders = await db.query.ticketOrders.findMany({
    where: and(eq(ticketOrders.userId, user.id)), orderBy: desc(ticketOrders.createdAt), limit: 30, with: { event: true, tickets: true },
  });
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <section className="row panel prox" style={{ display: "flex" }}>
        <div className="avatar" aria-hidden="true">{user.name[0]}</div>
        <div style={{ minWidth: 0 }}><b>{user.name}</b><div className="small dim">{user.email}</div></div>
      </section>
      <section className="stack-sm">
        <h2 className="h3">Orders</h2>
        {orders.length === 0 ? <div className="empty">No orders yet. <Link href="/upcoming">See what&apos;s on</Link>.</div> : (
          <div className="cards">
            {orders.map((o) => (
              <Link key={o.id} href={o.status === "PAID" ? "/tickets" : `/checkout/${o.id}`} className="card prox">
                <div className="spread"><b>{o.event.name}</b><Status value={o.status} label={o.status === "PENDING" ? "Awaiting payment" : undefined} /></div>
                <span className="small dim">{dateShort(o.createdAt)} · {o.tickets.length || (o.items as { quantity: number }[]).reduce((a, i) => a + i.quantity, 0)} tickets · {aud(o.totalCents)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="panel prox">
        <form action={logout}><button className="btn btn-ghost" type="submit">Sign out</button></form>
      </section>
    </div>
  );
}
