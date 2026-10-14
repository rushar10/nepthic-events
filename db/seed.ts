/* Seeds the Events database: settings, the first admin, and (outside production) demo
   staff, a demo customer, sample events and a year of sample ticket sales.
   Safe to run more than once. */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, events, pool, settings, ticketTypes, users, type Role } from "./index";
import { seedSampleHistory } from "./seed-history";

const days = (n: number, hour = 20) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

async function user(email: string, name: string, role: Role, password: string) {
  const found = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (found) return found;
  const [u] = await db.insert(users).values({ email, name, role, passwordHash: await bcrypt.hash(password, 12) }).returning();
  return u;
}

async function main() {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();

  // No staff, door or admin accounts here: Nepthic staff sign in to the separate Admin Portal.
  // Demo accounts for local testing only.
  if (process.env.NODE_ENV !== "production") {
    await user("jordan@example.com", "Jordan Lee", "CUSTOMER", "demo-password");

    const sample = [
      { slug: "nepthic-night-03", name: "NEPTHIC Night 03", venue: "The Triffid", city: "Newstead, Brisbane", startsAt: days(38), hue: 265,
        description: "Three DJs, the first look at the summer drop and a pop-up rail with event-only pieces. Doors 8pm.",
        types: [["Early bird", 3500, 150], ["General admission", 4500, 600], ["VIP · mezzanine + merch pack", 9500, 80]] as const },
      { slug: "static-sessions-live", name: "Static Sessions: Live", venue: "Fortitude Music Hall", city: "Fortitude Valley, Brisbane", startsAt: days(58, 19), hue: 20,
        description: "A live showcase with four Brisbane acts, styled head to toe in Nepthic.",
        types: [["General admission", 5500, 1200], ["Seated mezzanine", 8500, 200]] as const },
      { slug: "nepthic-night-02", name: "NEPTHIC Night 02", venue: "The Triffid", city: "Newstead, Brisbane", startsAt: days(-60), hue: 300,
        description: "Sold out. The Void Hoodie restock was gone in 40 minutes.",
        types: [["General admission", 4000, 700]] as const },
    ];
    for (const e of sample) {
      if (await db.query.events.findFirst({ where: eq(events.slug, e.slug) })) continue;
      const [ev] = await db.insert(events).values({
        slug: e.slug, name: e.name, venue: e.venue, city: e.city, startsAt: e.startsAt, hue: e.hue, description: e.description, status: "PUBLISHED",
      }).returning();
      await db.insert(ticketTypes).values(e.types.map(([name, priceCents, capacity], i) => ({ eventId: ev.id, name, priceCents, capacity, sortOrder: i })));
    }

    // A year of sample trading so the Admin dashboard has data (skipped with SEED_SAMPLE_HISTORY=0).
    await seedSampleHistory(await bcrypt.hash("demo-password", 10));
  }
  console.log("Seeded Events.");
}

main().finally(() => pool.end());
