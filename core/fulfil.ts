import { and, db, eq, partners, payments, ticketOrders } from "@/db";
import { emails } from "./email";
import { qrPng, releaseSeats } from "./tickets";
import { issueTickets } from "./issue";

/* Runs once per successful payment (Stripe webhook or mock). Idempotent: a payment that
   is no longer PENDING is skipped, so Stripe retries are harmless. */
export async function fulfilPayment(sessionId: string, paymentIntentId?: string) {
  const payment = await db.query.payments.findFirst({ where: eq(payments.stripeSessionId, sessionId) });
  if (!payment || payment.status !== "PENDING") return;

  const after = await db.transaction(async (tx) => {
    const flipped = await tx.update(payments)
      .set({ status: "SUCCEEDED", stripePaymentIntentId: paymentIntentId, paidAt: new Date() })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "PENDING")))
      .returning({ id: payments.id });
    if (flipped.length !== 1) return null;

    if (payment.ticketOrderId) {
      const to = await tx.query.ticketOrders.findFirst({ where: eq(ticketOrders.id, payment.ticketOrderId), with: { event: { with: { ticketTypes: true } } } });
      if (!to || to.status !== "PENDING") return null;
      const partner = to.partnerId ? await tx.query.partners.findFirst({ where: eq(partners.id, to.partnerId) }) : null;
      const issued: { code: string; qrId: string }[] = [];
      for (const l of to.items) {
        const type = to.event.ticketTypes.find((t) => t.id === l.typeId)!;
        // Physical (and "both") tickets bought online are already sold; one ticket id serves both forms.
        issued.push(...await issueTickets(tx, {
          event: to.event, type, count: l.quantity, holderName: to.buyerName, buyerEmail: to.buyerEmail, orderId: to.id,
          format: to.format, stage: to.format === "ETICKET" ? null : "SOLD", sold: true,
          source: partner ? "PARTNER" : "ONLINE", partner: partner ? { id: partner.id, code: partner.code } : null,
        }));
      }
      await tx.update(ticketOrders).set({ status: "PAID" }).where(eq(ticketOrders.id, to.id));
      return { to: to.buyerEmail, event: to.event, codes: issued.map((t) => t.code), qrIds: issued.map((t) => t.qrId) };
    }
    return null;
  });

  if (!after) return;
  {
    const when = after.event.startsAt.toLocaleString("en-AU", {
      weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane",
    });
    const pngs = await Promise.all(after.qrIds.map((q) => qrPng(q)));
    await emails.ticketsIssued(after.to, after.event.name, `${when} · ${after.event.venue}, ${after.event.city}`, after.codes, pngs);
  }
}

/** Abandoned or failed checkout: mark it failed and give held seats back. */
export async function expirePayment(sessionId: string) {
  const payment = await db.query.payments.findFirst({ where: eq(payments.stripeSessionId, sessionId) });
  if (!payment || payment.status !== "PENDING") return;
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "FAILED" }).where(eq(payments.id, payment.id));
    if (payment.ticketOrderId) {
      const cancelled = await tx.update(ticketOrders).set({ status: "CANCELLED" })
        .where(and(eq(ticketOrders.id, payment.ticketOrderId), eq(ticketOrders.status, "PENDING")))
        .returning();
      if (cancelled[0]) await releaseSeats(tx, cancelled[0].items);
    }
  });
}
