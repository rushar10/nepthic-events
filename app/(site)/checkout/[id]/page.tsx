import Link from "next/link";
import { notFound } from "next/navigation";
import { and, db, eq, ticketOrders } from "@/db";
import { requireUser } from "@/core/auth";
import { aud } from "@/ui/format";
import { TicketCard } from "@/app/(site)/TicketCard";
import { Haptic } from "@/ui/ux/Haptic";
import { Stagger } from "@/ui/ux/Stagger";

export const metadata = { title: "Your tickets" };

export default async function Confirmation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(undefined, "/login?next=/tickets");
  const o = await db.query.ticketOrders.findFirst({
    where: and(eq(ticketOrders.id, id), eq(ticketOrders.userId, user.id)),
    with: { event: true, tickets: { with: { ticketType: true } } },
  });
  if (!o) notFound();

  if (o.status === "PENDING") {
    return (
      <div className="stack" style={{ maxWidth: 640 }}>
        <meta httpEquiv="refresh" content="3" />
        <p className="eyebrow">Confirming payment</p>
        <h1 className="page">Hang tight…</h1>
        <p className="dim">We&apos;re waiting for the payment provider to confirm. This page refreshes on its own and your tickets appear here.</p>
      </div>
    );
  }
  if (o.status === "CANCELLED") {
    return (
      <div className="stack" style={{ maxWidth: 640 }}>
        <h1 className="page">Checkout didn&apos;t complete</h1>
        <p className="dim">Nothing was charged and your seats were released.</p>
        <Link className="btn prox" href={`/e/${o.event.slug}`} style={{ justifySelf: "start" }}>Try again</Link>
      </div>
    );
  }
  return (
    <div className="stack">
      <Haptic kind="success" />
      <section className="hero">
        <p className="eyebrow">Payment received · {aud(o.totalCents)}</p>
        <h1>You&apos;re in.</h1>
        <p className="lede">{o.tickets.length} e-ticket{o.tickets.length > 1 ? "s" : ""} for {o.event.name}. We&apos;ve emailed {o.tickets.length > 1 ? "them" : "it"} to {o.buyerEmail}. Show one QR code per person at the door.</p>
      </section>
      <Stagger id={`confirm-${o.id}`} className="tickets">
        {o.tickets.map((t) => (
          <TicketCard key={t.id} code={t.code} status={t.status} holderName={t.holderName} checkedInAt={t.checkedInAt} typeName={t.ticketType.name} event={o.event} />
        ))}
      </Stagger>
      <div className="row"><Link className="btn prox" href="/tickets">All my tickets</Link><Link className="btn btn-ghost" href="/">More events</Link></div>
    </div>
  );
}
