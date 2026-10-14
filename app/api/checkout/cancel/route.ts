import { and, db, eq, payments, ticketOrders } from "@/db";
import { getUser } from "@/core/auth";
import { expirePayment } from "@/core/fulfil";
import { env } from "@/core/env";

/* Stripe sends buyers here when they leave checkout. Releases the held seats. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("order") ?? "";
  const user = await getUser();
  const order = user
    ? await db.query.ticketOrders.findFirst({ where: and(eq(ticketOrders.id, id), eq(ticketOrders.userId, user.id)), with: { event: true } })
    : null;
  if (!order) return Response.redirect(env.siteUrl, 303);
  if (order.status === "PENDING") {
    const pending = await db.query.payments.findMany({ where: and(eq(payments.ticketOrderId, order.id), eq(payments.status, "PENDING")) });
    for (const p of pending) if (p.stripeSessionId) await expirePayment(p.stripeSessionId);
  }
  return new Response(null, { status: 303, headers: { location: `${env.siteUrl}/e/${order.event.slug}?cancelled=1` } });
}
