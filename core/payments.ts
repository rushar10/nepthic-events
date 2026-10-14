import crypto from "node:crypto";
import Stripe from "stripe";
import { and, db, eq, payments, sql, type PaymentKind } from "@/db";
import { env } from "./env";
import { fulfilPayment, expirePayment } from "./fulfil";

/* Every charge goes through Stripe Checkout (one payments row per session).
   PAYMENTS_MODE=mock skips Stripe: the payment is marked paid straight away and the buyer
   goes directly to the success page. Use mock for local work and demos only. */

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

export type CheckoutInput = {
  kind: PaymentKind;
  amountCents: number;
  description: string;
  email: string;
  ticketOrderId?: string;
  successUrl: string;
  cancelUrl: string;
};

export async function startCheckout(i: CheckoutInput): Promise<string> {
  if (i.amountCents <= 0) throw new Error("Nothing to pay.");
  if (env.paymentsMode === "mock" || !stripe) {
    const sessionId = `mock_${crypto.randomUUID()}`;
    await db.insert(payments).values({
      kind: i.kind, amountCents: i.amountCents, description: i.description,
      ticketOrderId: i.ticketOrderId, stripeSessionId: sessionId,
    });
    await fulfilPayment(sessionId, `pi_${sessionId}`);
    return i.successUrl;
  }
  const metadata = { kind: i.kind, ticketOrderId: i.ticketOrderId ?? "" };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: i.email,
    currency: "aud",
    line_items: [{ quantity: 1, price_data: { currency: "aud", unit_amount: i.amountCents, product_data: { name: i.description } } }],
    success_url: i.successUrl,
    cancel_url: i.cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata,
    payment_intent_data: { metadata },
  });
  await db.insert(payments).values({
    kind: i.kind, amountCents: i.amountCents, description: i.description,
    ticketOrderId: i.ticketOrderId, stripeSessionId: session.id,
  });
  return session.url!;
}

/** Refunds part or all of a succeeded payment. Call only after an admin approved it. */
export async function refundPayment(paymentId: string, amountCents: number, description: string) {
  const original = await db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
  if (!original || original.status !== "SUCCEEDED" || original.amountCents <= 0) throw new Error("Only a completed payment can be refunded.");
  const [{ refunded }] = await db
    .select({ refunded: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.refundOfId, paymentId), eq(payments.status, "SUCCEEDED")));
  const remaining = original.amountCents + refunded;
  if (amountCents > remaining) throw new Error(`Only $${(remaining / 100).toFixed(2)} can still be refunded on this payment.`);

  let stripeRefundId: string | null = null;
  if (stripe && original.stripePaymentIntentId && !original.stripeSessionId?.startsWith("mock_")) {
    const r = await stripe.refunds.create({ payment_intent: original.stripePaymentIntentId, amount: amountCents });
    stripeRefundId = r.id;
  }
  const [row] = await db.insert(payments).values({
    kind: "REFUND", status: "SUCCEEDED", amountCents: -amountCents, description,
    ticketOrderId: original.ticketOrderId, refundOfId: original.id, stripeRefundId, paidAt: new Date(),
  }).returning();
  return row;
}

/** POST /api/stripe/webhook */
export async function handleStripeWebhook(req: Request) {
  if (!stripe || !env.stripeWebhookSecret) return new Response("Stripe not configured", { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", env.stripeWebhookSecret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object;
    if (s.payment_status === "paid") await fulfilPayment(s.id, typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id);
  }
  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    await expirePayment(event.data.object.id);
  }
  return new Response("ok");
}
