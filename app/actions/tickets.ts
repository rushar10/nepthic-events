"use server";
import { redirect } from "next/navigation";
import { and, db, eq, events, refundRequests, ticketOrders, tickets, type TicketLine } from "@/db";
import { requireUser } from "@/core/auth";
import { getSettings } from "@/core/settings";
import { reserveSeats, SoldOutError } from "@/core/tickets";
import { startCheckout } from "@/core/payments";
import { emails } from "@/core/email";
import { audit } from "@/core/audit";
import { env } from "@/core/env";
import { int, str, type FormState } from "@/core/forms";

export async function startTicketCheckout(_: FormState, fd: FormData): Promise<FormState> {
  const eventId = str(fd, "eventId");
  const event = await db.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.status, "PUBLISHED")), with: { ticketTypes: true } });
  if (!event || event.startsAt < new Date()) return { error: "Tickets for this event are no longer on sale." };
  const user = await requireUser(undefined, `/login?next=/e/${event.slug}`);
  const settings = await getSettings();

  const lines: TicketLine[] = event.ticketTypes
    .map((t) => ({ typeId: t.id, name: t.name, priceCents: t.priceCents, quantity: Math.max(0, int(fd, `qty_${t.id}`)) }))
    .filter((l) => l.quantity > 0);
  const count = lines.reduce((a, l) => a + l.quantity, 0);
  if (count === 0) return { error: "Choose at least one ticket." };
  if (count > settings.maxTicketsPerOrder) return { error: `You can buy up to ${settings.maxTicketsPerOrder} tickets per order.` };
  const buyerName = str(fd, "buyerName") || user.name;
  const totalCents = lines.reduce((a, l) => a + l.quantity * l.priceCents, 0);

  let orderId: string;
  try {
    orderId = await db.transaction(async (tx) => {
      await reserveSeats(tx, lines);
      const [o] = await tx.insert(ticketOrders).values({
        userId: user.id, eventId: event.id, buyerName, buyerEmail: user.email, items: lines, totalCents,
      }).returning({ id: ticketOrders.id });
      return o.id;
    });
  } catch (e) {
    if (e instanceof SoldOutError) return { error: `${e.message} Try fewer tickets or another type.` };
    throw e;
  }

  const url = await startCheckout({
    kind: "TICKET",
    amountCents: totalCents,
    description: `${event.name} · ${count} ticket${count > 1 ? "s" : ""}`,
    email: user.email,
    ticketOrderId: orderId,
    successUrl: `${env.siteUrl}/checkout/${orderId}`,
    cancelUrl: `${env.siteUrl}/api/checkout/cancel?order=${orderId}`,
  });
  redirect(url);
}

export async function requestRefund(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser(undefined, "/login?next=/tickets");
  const code = str(fd, "code");
  const t = await db.query.tickets.findFirst({ where: eq(tickets.code, code), with: { ticketOrder: true, ticketType: true, event: true } });
  if (!t || t.ticketOrder.userId !== user.id) return { error: "We couldn't find that ticket on your account." };
  if (t.status !== "VALID") return { error: "This ticket can't be refunded in its current state." };
  const settings = await getSettings();
  const cutoff = new Date(t.event.startsAt.getTime() - settings.ticketRefundCutoffHours * 3600e3);
  if (new Date() > cutoff) return { error: `Refund requests close ${settings.ticketRefundCutoffHours} hours before the event.` };
  const reason = str(fd, "reason");
  if (!reason) return { error: "Choose a reason." };

  const created = await db.transaction(async (tx) => {
    const flipped = await tx.update(tickets).set({ status: "REFUND_REQUESTED" })
      .where(and(eq(tickets.id, t.id), eq(tickets.status, "VALID"))).returning({ id: tickets.id });
    if (flipped.length !== 1) return null;
    const [r] = await tx.insert(refundRequests).values({ ticketId: t.id, userId: user.id, reason, amountCents: t.ticketType.priceCents }).returning();
    return r;
  });
  if (!created) return { error: "This ticket can't be refunded in its current state." };
  await audit(user.id, "refund.requested", "Ticket", t.id);
  await emails.refundRequested(user.email, created.number, t.event.name);
  return { ok: "Refund requested. Your ticket stays valid until our team decides, and we'll email you." };
}
