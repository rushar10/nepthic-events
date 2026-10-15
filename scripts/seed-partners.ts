/* Development sample data for physical tickets and partners (refuses in production; skips if
   partners already exist). Run after `npm run db:seed`:  npm run db:seed-partners

   - 5 partners (one suspended), code formats on two events, ticket-type prefixes and zones
   - NEPTHIC Night 03 (upcoming): allocations (physical with a reserved range, e-ticket, link),
     a partner print batch and a box-office batch at different stages, partner e-tickets, link sales
   - NEPTHIC Night 02 (past): partner sales and door scans across gates, with a few
     duplicate and invalid scans, so the partner report has a timeline, no-shows and alerts */
import { asc, db, eq, events, partners, printBatches, scans, sql, ticketOrders, tickets, ticketTypes, users, allocations } from "../db";
import { issueTickets } from "../core/issue";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed sample data in production.");
  if ((await db.select({ id: partners.id }).from(partners).limit(1)).length) { console.log("Partners already exist; skipping."); process.exit(0); }

  let seed = 11;
  const R = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];

  const P = await db.insert(partners).values([
    { name: "Halftone Records", code: "P012", kind: "OUTLET", contactName: "Mia Tran", email: "events@halftone.example", phone: "07 3000 0012", color: "#F59E0B", commissionPct: 10, paymentTerms: "Monthly, 14 days", referralCode: "p012-halftone" },
    { name: "Southside Promotions", code: "P013", kind: "PROMOTER", contactName: "Leo Park", email: "leo@southside.example", phone: "0400 000 013", color: "#22C55E", commissionPct: 12.5, paymentTerms: "After the event, 7 days", referralCode: "p013-southside" },
    { name: "The Valley Bar Co.", code: "P014", kind: "VENUE", contactName: "Ruby Chen", email: "hello@valleybar.example", phone: "07 3000 0014", color: "#38BDF8", commissionPct: 8, paymentTerms: "Monthly, 30 days", referralCode: "p014-valley" },
    { name: "Wavelength Radio", code: "TKTEK", kind: "SPONSOR", contactName: "Arlo Ward", email: "promo@wavelength.example", phone: "07 3000 0015", color: "#A78BFA", commissionPct: 0, paymentTerms: "Sponsorship (no commission)", referralCode: "tktek-wavelength" },
    { name: "Night Owl Tickets", code: "P016", kind: "RESELLER", contactName: "Kai Smith", email: "ops@nightowl.example", phone: "0400 000 016", color: "#F43F5E", commissionPct: 15, paymentTerms: "Weekly", referralCode: "p016-nightowl" },
  ]).returning();
  const [halftone, southside, valley, wavelength, nightowl] = P;

  const ev = async (slug: string) => db.query.events.findFirst({ where: eq(events.slug, slug), with: { ticketTypes: { orderBy: asc(ticketTypes.sortOrder) } } });
  const n3 = (await ev("nepthic-night-03"))!, n2 = (await ev("nepthic-night-02"))!;
  const gates = ["North Gate", "South Gate", "VIP Entry"];
  await db.update(events).set({ gates, codeFormat: { parts: ["brand", "type"], brand: "NEP03", separator: "-", padding: 6, start: 1001, increment: 1, scope: "EVENT", mode: "SEQUENTIAL", checkChar: true, avoidAmbiguous: true, dateStyle: "YYYY", typePrefixes: {}, partnerPrefixes: {} } }).where(eq(events.id, n3.id));
  await db.update(events).set({ gates: ["North Gate", "South Gate"], codeFormat: { parts: ["brand", "partner"], brand: "NYE26", separator: "/", padding: 4, start: 1, increment: 1, scope: "PARTNER", mode: "SEQUENTIAL", checkChar: false, avoidAmbiguous: false, dateStyle: "YYYY", typePrefixes: {}, partnerPrefixes: {} } }).where(eq(events.id, n2.id));
  const prefix: Record<string, [string, string]> = { "Early bird": ["EB", ""], "General admission": ["GA", "General floor"], "VIP · mezzanine + merch pack": ["VIP", "VIP Mezzanine"] };
  for (const t of [...n3.ticketTypes, ...n2.ticketTypes]) {
    const [cp, zone] = prefix[t.name] ?? ["", ""];
    await db.update(ticketTypes).set({ codePrefix: cp, zone }).where(eq(ticketTypes.id, t.id));
  }
  await db.update(ticketTypes).set({ capacity: 900 }).where(eq(ticketTypes.eventId, n2.id)); // room for the sample partner stock

  const reload = async () => ({ n3: (await ev("nepthic-night-03"))!, n2: (await ev("nepthic-night-02"))! });
  let { n3: e3, n2: e2 } = await reload();
  const ga3 = e3.ticketTypes.find((t) => t.name === "General admission")!, vip3 = e3.ticketTypes.find((t) => t.name.startsWith("VIP"))!;
  const ga2 = e2.ticketTypes[0];
  const hold = (typeId: string, q: number) => db.update(ticketTypes).set({ sold: sql`${ticketTypes.sold} + ${q}` }).where(eq(ticketTypes.id, typeId));

  // --- Night 03 (upcoming) ---
  const [a1] = await db.insert(allocations).values({ eventId: e3.id, partnerId: halftone.id, ticketTypeId: ga3.id, kind: "PHYSICAL", quantity: 200, rangeStart: 500001, rangeEnd: 500200 }).returning();
  const [a2] = await db.insert(allocations).values({ eventId: e3.id, partnerId: southside.id, ticketTypeId: vip3.id, kind: "ETICKET", quantity: 20 }).returning();
  await db.insert(allocations).values({ eventId: e3.id, partnerId: valley.id, ticketTypeId: ga3.id, kind: "LINK", quantity: 100 });
  const [a4] = await db.insert(allocations).values({ eventId: e3.id, partnerId: nightowl.id, ticketTypeId: ga3.id, kind: "PHYSICAL", quantity: 30 }).returning();
  await hold(ga3.id, 230); await hold(vip3.id, 20);
  ({ n3: e3 } = await reload());

  await db.transaction(async (tx) => {
    const [b1] = await tx.insert(printBatches).values({ eventId: e3.id, ticketTypeId: ga3.id, partnerId: halftone.id, allocationId: a1.id, quantity: 120, printFormat: "a4", createdBy: "Ava Nguyen (owner@nepthic.com)" }).returning();
    const t1 = await issueTickets(tx, { event: e3, type: ga3, count: 120, holderName: "Physical ticket", batchId: b1.id, format: "PHYSICAL", stage: "GENERATED", source: "PARTNER", partner: halftone, allocation: a1 });
    await tx.update(tickets).set({ stage: "DISTRIBUTED", printedAt: new Date() }).where(eq(tickets.batchId, b1.id));
    await tx.update(tickets).set({ stage: "SOLD", soldAt: new Date() }).where(sql`${tickets.id} in (${sql.join(t1.slice(0, 64).map((t) => sql`${t.id}`), sql`, `)})`);
    await tx.insert(printBatches).values({ eventId: e3.id, ticketTypeId: ga3.id, quantity: 50, printFormat: "stub", createdBy: "Ava Nguyen (owner@nepthic.com)" }).returning().then(async ([b2]) => {
      await hold(ga3.id, 50);
      const t2 = await issueTickets(tx, { event: e3, type: ga3, count: 50, holderName: "Physical ticket", batchId: b2.id, format: "PHYSICAL", stage: "GENERATED", source: "BOX_OFFICE" });
      await tx.update(tickets).set({ stage: "PRINTED", printedAt: new Date() }).where(eq(tickets.batchId, b2.id));
      await tx.update(tickets).set({ stage: "SOLD", soldAt: new Date() }).where(sql`${tickets.id} in (${sql.join(t2.slice(0, 18).map((t) => sql`${t.id}`), sql`, `)})`);
    });
    const [b3] = await tx.insert(printBatches).values({ eventId: e3.id, ticketTypeId: ga3.id, partnerId: nightowl.id, allocationId: a4.id, quantity: 30, printFormat: "thermal", createdBy: "Ava Nguyen (owner@nepthic.com)" }).returning();
    await issueTickets(tx, { event: e3, type: ga3, count: 30, holderName: "Physical ticket", batchId: b3.id, format: "PHYSICAL", stage: "DISTRIBUTED", source: "PARTNER", partner: nightowl, allocation: a4 });
    for (const name of ["Isla Hughes", "Theo Rossi", "Nina Kaur", "Finn Walker", "Maya Lee", "Jay Murphy", "Sienna Park", "Eli Ward"])
      await issueTickets(tx, { event: e3, type: vip3, count: name === "Isla Hughes" ? 2 : 1, holderName: name, buyerEmail: `${name.toLowerCase().replace(" ", ".")}@example.com`, format: "ETICKET", source: "PARTNER", partner: southside, allocation: a2, sold: true });
  });
  // Link sales through The Valley Bar Co. (paid online orders tagged with the partner)
  const buyers = await db.select().from(users).limit(40);
  for (let k = 0; k < 14; k++) {
    const u = pick(buyers), qty = 1 + Math.floor(R() * 3), fmt = (["ETICKET", "ETICKET", "BOTH", "PHYSICAL"] as const)[k % 4];
    const [o] = await db.insert(ticketOrders).values({ userId: u.id, eventId: e3.id, status: "PAID", buyerName: u.name, buyerEmail: u.email, items: [{ typeId: ga3.id, name: ga3.name, quantity: qty, priceCents: ga3.priceCents }], totalCents: qty * ga3.priceCents + (fmt !== "ETICKET" && k % 3 === 0 ? 800 : 0), format: fmt, delivery: fmt === "ETICKET" ? null : k % 3 === 0 ? "POST" : "PICKUP", deliveryFeeCents: fmt !== "ETICKET" && k % 3 === 0 ? 800 : 0, shipTo: fmt !== "ETICKET" && k % 3 === 0 ? "12 Example St, West End QLD 4101" : null, partnerId: valley.id }).returning();
    await hold(ga3.id, qty);
    await db.transaction((tx) => issueTickets(tx, { event: e3, type: ga3, count: qty, holderName: u.name, buyerEmail: u.email, orderId: o.id, format: fmt, stage: fmt === "ETICKET" ? null : "SOLD", source: "PARTNER", partner: valley, sold: true }));
  }

  // --- Night 02 (past): partner sales and door scans ---
  const [p1] = await db.insert(allocations).values({ eventId: e2.id, partnerId: halftone.id, ticketTypeId: ga2.id, kind: "PHYSICAL", quantity: 120 }).returning();
  const [p2] = await db.insert(allocations).values({ eventId: e2.id, partnerId: southside.id, ticketTypeId: ga2.id, kind: "ETICKET", quantity: 60 }).returning();
  const [p3] = await db.insert(allocations).values({ eventId: e2.id, partnerId: wavelength.id, ticketTypeId: ga2.id, kind: "PHYSICAL", quantity: 30 }).returning();
  await hold(ga2.id, 210);
  ({ n2: e2 } = await reload());
  const doors = new Date(e2.startsAt);
  const issued2: { id: string; partner: string | null }[] = [];
  await db.transaction(async (tx) => {
    const [b] = await tx.insert(printBatches).values({ eventId: e2.id, ticketTypeId: ga2.id, partnerId: halftone.id, allocationId: p1.id, quantity: 120, printFormat: "a4", createdBy: "Ava Nguyen (owner@nepthic.com)" }).returning();
    const h = await issueTickets(tx, { event: e2, type: ga2, count: 120, holderName: "Physical ticket", batchId: b.id, format: "PHYSICAL", stage: "SOLD", source: "PARTNER", partner: halftone, allocation: p1, sold: true });
    await tx.update(tickets).set({ stage: "DISTRIBUTED", soldAt: null }).where(sql`${tickets.id} in (${sql.join(h.slice(104).map((t) => sql`${t.id}`), sql`, `)})`);
    issued2.push(...h.slice(0, 104).map((t) => ({ id: t.id, partner: halftone.id })));
    const s = await issueTickets(tx, { event: e2, type: ga2, count: 52, holderName: "Southside buyer", buyerEmail: "buyers@southside.example", format: "ETICKET", source: "PARTNER", partner: southside, allocation: p2, sold: true });
    issued2.push(...s.map((t) => ({ id: t.id, partner: southside.id })));
    const [bw] = await tx.insert(printBatches).values({ eventId: e2.id, ticketTypeId: ga2.id, partnerId: wavelength.id, allocationId: p3.id, quantity: 30, printFormat: "stub", createdBy: "Ava Nguyen (owner@nepthic.com)" }).returning();
    const w = await issueTickets(tx, { event: e2, type: ga2, count: 30, holderName: "Physical ticket", batchId: bw.id, format: "PHYSICAL", stage: "SOLD", source: "PARTNER", partner: wavelength, allocation: p3, sold: true });
    issued2.push(...w.map((t) => ({ id: t.id, partner: wavelength.id })));
  });
  // Door scans: most partner tickets admitted between 7:30pm and 9:30pm across two gates.
  const scanRows: (typeof scans.$inferInsert)[] = [];
  for (const t of issued2) {
    if (R() < 0.12) continue; // no-show
    const at = new Date(doors.getTime() - 30 * 60e3 + Math.floor(R() * R() * 120) * 60e3);
    const gate = R() < 0.6 ? "North Gate" : "South Gate";
    await db.update(tickets).set({ status: "USED", checkedInAt: at, checkedInGate: gate, checkedInById: "portal:door-staff" }).where(eq(tickets.id, t.id));
    scanRows.push({ eventId: e2.id, ticketId: t.id, gate, result: "ADMIT", method: "CAMERA", partnerId: t.partner, staff: "portal:door-staff", at });
    if (t.partner === wavelength.id && R() < 0.2) scanRows.push({ eventId: e2.id, ticketId: t.id, gate: gate === "North Gate" ? "South Gate" : "North Gate", result: "ALREADY_USED", method: "CAMERA", partnerId: t.partner, staff: "portal:door-staff", at: new Date(at.getTime() + 25 * 60e3) });
  }
  // Online tickets that were checked in already have statuses; log them as scans too (by gate).
  const online2 = await db.select({ id: tickets.id, at: tickets.checkedInAt }).from(tickets).where(sql`${tickets.eventId} = ${e2.id} and ${tickets.source} = 'ONLINE' and ${tickets.status} = 'USED'`);
  for (const t of online2) {
    const at = new Date(doors.getTime() - 30 * 60e3 + Math.floor(R() * R() * 120) * 60e3);
    const gate = R() < 0.55 ? "North Gate" : "South Gate";
    await db.update(tickets).set({ checkedInAt: at, checkedInGate: gate }).where(eq(tickets.id, t.id));
    scanRows.push({ eventId: e2.id, ticketId: t.id, gate, result: "ADMIT", method: R() < 0.05 ? "MANUAL" : "CAMERA", staff: "portal:door-staff", at });
  }
  for (let k = 0; k < 7; k++) scanRows.push({ eventId: e2.id, code: `NPT-FAKE-${k}`, gate: "South Gate", result: k < 2 ? "FORGED" : "INVALID", method: k % 2 ? "MANUAL" : "CAMERA", staff: "portal:door-staff", at: new Date(doors.getTime() + k * 9 * 60e3) });
  for (let k = 0; k < scanRows.length; k += 500) await db.insert(scans).values(scanRows.slice(k, k + 500));
  await db.update(partners).set({ status: "SUSPENDED" }).where(eq(partners.id, nightowl.id));
  console.log(`Seeded ${P.length} partners, allocations on 2 events, ${scanRows.length} door scans.`);
  process.exit(0);
}
main();
