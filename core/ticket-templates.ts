import { asc, db, eq, ticketTemplates, type Tx } from "@/db";
import { DEFAULT_TEMPLATE, normalizeTemplate, ticketSvg, type TicketData, type TicketTemplate } from "./ticket-design";
import { qrDataUrl } from "./tickets";
import { aud, time } from "@/ui/format";

/** "Sat 21 Nov 2026": short enough for every layout. */
const ticketDate = (d: Date) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" }).replace(/,/g, "");

/* Ticket templates on the server: which design a ticket uses, and its rendered SVG. */

export type StoredTemplate = { id: string; name: string; design: TicketTemplate; isDefault: boolean; updatedAt: Date };

const toStored = (r: typeof ticketTemplates.$inferSelect): StoredTemplate =>
  ({ id: r.id, name: r.name, design: normalizeTemplate({ ...(r.design as Partial<TicketTemplate>), name: r.name }), isDefault: r.isDefault, updatedAt: r.updatedAt });

/** Makes sure there is exactly one default template (creates "Nepthic default" the first time). */
export async function ensureDefault(tx?: Tx) {
  const q = tx ?? db;
  const rows = await q.select().from(ticketTemplates).where(eq(ticketTemplates.isDefault, true)).limit(1);
  if (rows[0]) return toStored(rows[0]);
  const any = await q.select().from(ticketTemplates).orderBy(asc(ticketTemplates.createdAt)).limit(1);
  if (any[0]) {
    await q.update(ticketTemplates).set({ isDefault: true }).where(eq(ticketTemplates.id, any[0].id));
    return toStored({ ...any[0], isDefault: true });
  }
  const [created] = await q.insert(ticketTemplates).values({ name: DEFAULT_TEMPLATE.name, design: DEFAULT_TEMPLATE, isDefault: true }).returning();
  return toStored(created);
}

export async function listTemplates() {
  await ensureDefault();
  const rows = await db.select().from(ticketTemplates).orderBy(asc(ticketTemplates.createdAt));
  return rows.map(toStored);
}

/** The event's chosen template, or the default. */
export async function templateFor(templateId: string | null | undefined) {
  if (templateId) {
    const r = await db.select().from(ticketTemplates).where(eq(ticketTemplates.id, templateId)).limit(1);
    if (r[0]) return toStored(r[0]).design;
  }
  return (await ensureDefault()).design;
}

type TicketRow = {
  code: string; qrId: string; holderName: string; status: TicketData["status"];
  ticketType: { name: string; priceCents: number };
  event: { name: string; startsAt: Date; venue: string; city: string; ticketTemplateId: string | null };
  ticketOrder?: { number?: number | null } | null;
};

export function ticketData(t: TicketRow): TicketData {
  return {
    eventName: t.event.name, dateText: ticketDate(t.event.startsAt), doorsText: time(t.event.startsAt),
    venue: t.event.venue, city: t.event.city, typeName: t.ticketType.name, priceText: aud(t.ticketType.priceCents),
    holder: t.holderName, code: t.code, orderText: t.ticketOrder?.number ? `TO-${t.ticketOrder.number}` : "", status: t.status,
  };
}

/** The ticket in its event's design, as SVG. Refunded and void tickets get no QR. */
export async function renderTicket(t: TicketRow) {
  const dead = t.status === "REFUNDED" || t.status === "VOID";
  const qr = dead ? null : await qrDataUrl(t.qrId, 480);
  return ticketSvg(await templateFor(t.event.ticketTemplateId), ticketData(t), qr);
}
