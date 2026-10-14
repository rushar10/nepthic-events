import { overviewAuthorised, shortName } from "@/core/overview-api";
import { monthlyRevenue, nextEvent, recentActivity, salesToday, week } from "@/lib/admin/dashboard";
import { pendingCounts } from "@/lib/admin/counts";
import { db, payments, sql } from "@/db";

export const dynamic = "force-dynamic";

/** GET /api/overview/summary — read-only numbers for the Nepthic Overview dashboard. */
export async function GET(req: Request) {
  const auth = overviewAuthorised(req);
  if (auth === "off") return new Response("Not found", { status: 404 });
  if (auth === "denied") return new Response("Unauthorised", { status: 401, headers: { "www-authenticate": "Bearer" } });

  const [months, wk, next, activity, today, pending, [last30]] = await Promise.all([
    monthlyRevenue(), week(), nextEvent(), recentActivity(8), salesToday(), pendingCounts(),
    db.select({ cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` }).from(payments)
      .where(sql`${payments.status} = 'SUCCEEDED' and ${payments.paidAt} >= now() - interval '30 days'`),
  ]);

  return Response.json({
    site: "events",
    name: "Nepthic Events",
    generatedAt: new Date().toISOString(),
    currency: "AUD",
    revenue: { monthly: months.map((m) => ({ month: m.key, cents: m.value })), last30Cents: last30.cents },
    orders: wk.orders,
    tickets: wk.tickets,
    pending: { refunds: pending.refunds, total: pending.total },
    today,
    nextEvent: next && { name: next.name, startsAt: next.startsAt.toISOString(), venue: next.venue, city: next.city, sold: next.sold, capacity: next.capacity },
    activity: activity.map((a) => ({ at: a.at.toISOString(), who: shortName(a.who), detail: a.detail, cents: a.amount, kind: a.kind })),
  }, { headers: { "cache-control": "no-store" } });
}
