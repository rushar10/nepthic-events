import { newQrId } from "../core/ticket-codes";
/* Twelve months of sample ticket sales for local development, so the Events dashboard has
   something to show. Runs once (marked in audit_log), never in production, and can be
   skipped with SEED_SAMPLE_HISTORY=0. */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { auditLog, db, events, payments, ticketOrders, tickets, ticketTypes, users, type TicketLine } from "./index";

const MARK = "seed.sample-history";

// Small deterministic PRNG so every developer sees the same numbers.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20261014);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const between = (a: number, b: number) => a + R() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));

const DAY = 864e5;
const now = Date.now();
const at = (daysAgo: number, hour: number, minute = int(0, 59)) => {
  const d = new Date(now - daysAgo * DAY);
  d.setHours(hour, minute, int(0, 59), 0);
  return d;
};

const FIRST = ["Ava", "Liam", "Mia", "Noah", "Zara", "Kai", "Isla", "Leo", "Ruby", "Jack", "Chloe", "Ethan", "Sienna", "Lucas", "Maya", "Oscar", "Harper", "Jai", "Willow", "Theo", "Aria", "Finn", "Layla", "Eli"];
const LAST = ["Nguyen", "Smith", "Patel", "Williams", "Chen", "Brown", "Singh", "Taylor", "Kim", "Martin", "Lee", "Walker", "Tran", "Harris", "Ali", "King"];

async function chunks<T>(rows: T[], size: number, fn: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export async function seedSampleHistory(passwordHash: string) {
  if (process.env.NODE_ENV === "production" || process.env.SEED_SAMPLE_HISTORY === "0") return;
  if (await db.query.auditLog.findFirst({ where: eq(auditLog.action, MARK) })) return;

  // ── people ──────────────────────────────────────────────────────────
  const customers = [];
  for (let i = 0; i < 24; i++) {
    const name = `${FIRST[i]} ${pick(LAST)}`;
    const email = `${FIRST[i].toLowerCase()}.${i}@sample.events.nepthic.dev`;
    const [u] = await db.insert(users).values({ email, name, passwordHash, role: "CUSTOMER" }).onConflictDoNothing().returning();
    customers.push(u ?? (await db.query.users.findFirst({ where: eq(users.email, email) }))!);
  }

  const payRows: (typeof payments.$inferInsert)[] = [];
  const hourNow = new Date().getHours();

  // ── Events: ticket sales that build up before each night ──
  const past = [
    { slug: "launch-night-01", name: "Launch Night 01", venue: "Warehouse 25", city: "Brisbane", daysAgo: 322, hue: 150, types: [["General admission", 3000, 320]] as const },
    { slug: "static-sessions-vol-1", name: "Static Sessions Vol. 1", venue: "The Zoo", city: "Fortitude Valley, Brisbane", daysAgo: 200, hue: 30, types: [["General admission", 4000, 450]] as const },
  ];
  for (const e of past) {
    if (await db.query.events.findFirst({ where: eq(events.slug, e.slug) })) continue;
    const [ev] = await db.insert(events).values({
      slug: e.slug, name: e.name, venue: e.venue, city: e.city, startsAt: at(e.daysAgo, 20, 0), hue: e.hue, status: "PUBLISHED",
      description: `${e.name}. A Nepthic night at ${e.venue}.`,
    }).returning();
    await db.insert(ticketTypes).values(e.types.map(([name, priceCents, capacity], i) => ({ eventId: ev.id, name, priceCents, capacity, sortOrder: i })));
  }

  // How much of each type sells, and over which window (days ago → days ago).
  const plan: Record<string, { from: number; to: number; share: Record<string, number> }> = {
    "launch-night-01": { from: 380, to: 323, share: { "General admission": 0.96 } },
    "static-sessions-vol-1": { from: 255, to: 201, share: { "General admission": 0.9 } },
    "nepthic-night-02": { from: 150, to: 61, share: { "General admission": 0.98 } },
    "nepthic-night-03": { from: 75, to: 0, share: { "Early bird": 1, "General admission": 0.42, "VIP · mezzanine + merch pack": 0.5 } },
    "static-sessions-live": { from: 40, to: 0, share: { "General admission": 0.11, "Seated mezzanine": 0.14 } },
  };

  const toRows: (typeof ticketOrders.$inferInsert)[] = [];
  const tkRows: (typeof tickets.$inferInsert)[] = [];
  const soldBy = new Map<string, number>();
  const codes = new Set<string>();
  const A = "ACDEFGHJKMNPQRTUVWXY34679";
  const code = () => { let c: string; do { let s = ""; for (let i = 0; i < 8; i++) s += A[Math.floor(R() * A.length)]; c = `NPT-${s.slice(0, 4)}-${s.slice(4)}`; } while (codes.has(c)); codes.add(c); return c; };

  for (const [slug, p] of Object.entries(plan)) {
    const ev = await db.query.events.findFirst({ where: eq(events.slug, slug), with: { ticketTypes: true } });
    if (!ev) continue;
    const isPast = ev.startsAt.getTime() < now;
    for (const tt of ev.ticketTypes) {
      const want = Math.floor(tt.capacity * (p.share[tt.name] ?? 0)) - tt.sold;
      let left = Math.max(0, want);
      // Early bird sells in the first part of the window; the rest accelerates toward the night.
      const early = tt.name === "Early bird";
      while (left > 0) {
        const qty = Math.min(left, pick([1, 2, 2, 2, 3, 4]));
        left -= qty;
        const u = R();
        const span = p.from - p.to;
        const d = early ? p.from - Math.floor(u * span * 0.3) : Math.round(p.to + span * (1 - Math.sqrt(u)));
        const hour = int(8, 23);
        if (d === 0 && hour >= hourNow) { left += qty; if (hourNow <= 8) break; continue; }
        const created = at(Math.max(0, d), hour);
        const buyer = pick(customers);
        const id = randomUUID();
        const total = qty * tt.priceCents;
        const line: TicketLine = { typeId: tt.id, name: tt.name, quantity: qty, priceCents: tt.priceCents };
        toRows.push({ id, userId: buyer.id, eventId: ev.id, status: "PAID", buyerName: buyer.name, buyerEmail: buyer.email, items: [line], totalCents: total, createdAt: created });
        payRows.push({ kind: "TICKET", status: "SUCCEEDED", amountCents: total, description: `${ev.name} · ${qty} × ${tt.name}`, ticketOrderId: id, paidAt: created, createdAt: created });
        for (let q = 0; q < qty; q++) {
          const c = code();
          tkRows.push({ code: c, codeKey: c.replace(/[^A-Z0-9]/g, ""), qrId: newQrId(), priceCents: tt.priceCents, soldAt: created, ticketOrderId: id, ticketTypeId: tt.id, eventId: ev.id, holderName: buyer.name,
            status: isPast ? (R() < 0.97 ? "USED" : "VALID") : "VALID", checkedInAt: isPast ? ev.startsAt : null, createdAt: created });
        }
        soldBy.set(tt.id, (soldBy.get(tt.id) ?? 0) + qty);
      }
    }
  }

  await chunks(toRows, 400, (p) => db.insert(ticketOrders).values(p));
  await chunks(tkRows, 600, (p) => db.insert(tickets).values(p));
  await chunks(payRows, 500, (p) => db.insert(payments).values(p));
  for (const [id, n] of soldBy) {
    const tt = await db.query.ticketTypes.findFirst({ where: eq(ticketTypes.id, id) });
    if (tt) await db.update(ticketTypes).set({ sold: tt.sold + n }).where(eq(ticketTypes.id, id));
  }

  await db.insert(auditLog).values({ action: MARK, entity: "Seed", entityId: "history", data: { ticketOrders: toRows.length, tickets: tkRows.length, payments: payRows.length } });
  console.log(`Sample history: ${toRows.length} ticket orders, ${tkRows.length} tickets, ${payRows.length} payments.`);
}
