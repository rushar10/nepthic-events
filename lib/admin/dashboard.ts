import { and, asc, db, eq, events, gt, sql } from "@/db";
import { pendingCounts } from "./counts";

/* Data for the Events admin overview and the read-only summary API. Everything comes from
   this site's own database. Money is in cents, inc GST, net of refunds. Days, weeks and
   months use Brisbane time. */

const TZ = sql.raw("'Australia/Brisbane'");
type Row = Record<string, unknown>;
const rows = async <T extends Row>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
const n = (v: unknown) => Number(v ?? 0);

/** Year-month keys for the last `count` months, ending with the current Brisbane month. */
export function monthKeys(count = 12, now = new Date()) {
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit" }).format(now);
  let [y, m] = ym.split("-").map(Number);
  const out: { key: string; label: string; long: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1, 15));
    out.unshift({ key: `${y}-${String(m).padStart(2, "0")}`, label: d.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" }), long: d.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }) });
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

/** Net ticket revenue per month for the last 12 months. */
export async function monthlyRevenue() {
  const r = await rows<{ m: string; v: string }>(sql`
    select to_char(date_trunc('month', paid_at at time zone ${TZ}), 'YYYY-MM') as m, sum(amount_cents) as v
    from payments
    where status = 'SUCCEEDED' and paid_at >= ((date_trunc('month', now() at time zone ${TZ}) - interval '11 months') at time zone ${TZ})
    group by 1`);
  return monthKeys().map((k) => ({ ...k, value: n(r.find((x) => x.m === k.key)?.v) }));
}

/** Net revenue per event over the last 30 days: the top three, then everything else. */
export async function revenueByEvent(days = 30) {
  const r = await rows<{ name: string; v: string }>(sql`
    select e.name, sum(p.amount_cents) as v
    from payments p join ticket_orders t on t.id = p.ticket_order_id join events e on e.id = t.event_id
    where p.status = 'SUCCEEDED' and p.paid_at >= now() - make_interval(days => ${days})
    group by e.name order by v desc`);
  const top = r.slice(0, 3).map((x) => ({ label: x.name, value: Math.max(0, n(x.v)) }));
  const rest = r.slice(3).reduce((a, x) => a + Math.max(0, n(x.v)), 0);
  return rest > 0 ? [...top, { label: "Other events", value: rest }] : top;
}

/** Paid ticket orders and tickets issued: last 7 days vs the 7 before. */
export async function week() {
  const [r] = await rows<{ o_now: string; o_prev: string; t_now: string; t_prev: string }>(sql`
    select
      (select count(*) from ticket_orders where status = 'PAID' and created_at >= now() - interval '7 days') as o_now,
      (select count(*) from ticket_orders where status = 'PAID' and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') as o_prev,
      (select count(*) from tickets where status in ('VALID','USED','REFUND_REQUESTED') and created_at >= now() - interval '7 days') as t_now,
      (select count(*) from tickets where status in ('VALID','USED','REFUND_REQUESTED') and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') as t_prev`);
  return { orders: { now: n(r.o_now), prev: n(r.o_prev) }, tickets: { now: n(r.t_now), prev: n(r.t_prev) } };
}

/** The soonest published event, with seats sold and capacity across its ticket types. */
export async function nextEvent() {
  const e = await db.query.events.findFirst({
    where: and(eq(events.status, "PUBLISHED"), gt(events.startsAt, new Date())),
    orderBy: asc(events.startsAt),
    with: { ticketTypes: true },
  });
  if (!e) return null;
  const capacity = e.ticketTypes.reduce((a, t) => a + t.capacity, 0);
  const sold = e.ticketTypes.reduce((a, t) => a + Math.min(t.sold, t.capacity), 0);
  return { id: e.id, slug: e.slug, name: e.name, venue: e.venue, city: e.city, startsAt: e.startsAt, sold, capacity };
}

export type Activity = { id: string; kind: "tickets" | "refund"; who: string; detail: string; amount: number | null; at: Date };

/** Newest ticket purchases and refund requests. */
export async function recentActivity(limit = 7) {
  const r = await rows<{ id: string; kind: Activity["kind"]; who: string; detail: string; amount: string | null; at: Date }>(sql`
    select * from (
      select t.id, 'tickets' as kind, t.buyer_name as who,
             (select sum((x->>'quantity')::int) from jsonb_array_elements(t.items) x)::text || ' tickets · ' || e.name as detail,
             t.total_cents::text as amount, t.created_at as at
      from ticket_orders t join events e on e.id = t.event_id where t.status = 'PAID'
      union all
      select r.id, 'refund', u.name, 'Refund request RF-' || r.number || ' · ' || e.name, r.amount_cents::text, r.created_at
      from refund_requests r join users u on u.id = r.user_id join tickets k on k.id = r.ticket_id join events e on e.id = k.event_id
    ) a order by a.at desc limit ${limit}`);
  return r.map((x): Activity => ({ id: x.id, kind: x.kind, who: x.who, detail: x.detail.replace(/^1 tickets/, "1 ticket"), amount: x.amount == null ? null : n(x.amount), at: new Date(x.at) }));
}

/** Today's ticket takings by hour (Brisbane), up to now, and yesterday's total to the same time. */
export async function salesToday() {
  const r = await rows<{ h: number; v: string }>(sql`
    select extract(hour from paid_at at time zone ${TZ})::int as h, sum(amount_cents) as v
    from payments where status = 'SUCCEEDED' and amount_cents > 0
      and (paid_at at time zone ${TZ})::date = (now() at time zone ${TZ})::date
    group by 1 order by 1`);
  const [y] = await rows<{ v: string }>(sql`
    select coalesce(sum(amount_cents), 0) as v from payments
    where status = 'SUCCEEDED' and amount_cents > 0
      and (paid_at at time zone ${TZ})::date = (now() at time zone ${TZ})::date - 1
      and (paid_at at time zone ${TZ})::time <= (now() at time zone ${TZ})::time`);
  const hourNow = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", hour: "numeric", hour12: false }).format(new Date())) % 24;
  const hours = Array.from({ length: hourNow + 1 }, (_, h) => n(r.find((x) => n(x.h) === h)?.v));
  return { hours, total: hours.reduce((a, b) => a + b, 0), yesterday: n(y?.v) };
}

export const approvals = pendingCounts;
export const changePct = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : now > 0 ? null : 0);
