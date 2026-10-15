import { asc, db, eq, ticketTemplates, type Tx } from "@/db";
import { DEFAULT_TEMPLATE, normalizeTemplate, ticketSvg, type TicketData, type TicketTemplate } from "./ticket-design";
import { qrDataUrl } from "./tickets";
import { publicImage } from "./uploads";
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
  ticketType: { name: string; priceCents: number; zone?: string | null };
  event: { name: string; startsAt: Date; venue: string; city: string; ticketTemplateId: string | null };
  ticketOrder?: { number?: number | null } | null;
};

export function ticketData(t: TicketRow): TicketData {
  return {
    eventName: t.event.name, dateText: ticketDate(t.event.startsAt), doorsText: time(t.event.startsAt),
    venue: t.event.venue, city: t.event.city, typeName: t.ticketType.name, priceText: aud(t.ticketType.priceCents),
    holder: t.holderName, code: t.code, orderText: t.ticketOrder?.number ? `TO-${t.ticketOrder.number}` : "", status: t.status,
    zone: t.ticketType.zone || undefined,
  };
}

/** Artwork as a self-contained data: URL (for PNG/PDF rendering), cached per upload. */
const artCache = new Map<string, string | null>();
export async function artDataUrl(uploadId: string) {
  if (!artCache.has(uploadId)) {
    const u = await publicImage(uploadId);
    if (artCache.size > 20) artCache.delete(artCache.keys().next().value!);
    artCache.set(uploadId, u ? `data:${u.mime};base64,${Buffer.from(u.data).toString("base64")}` : null);
  }
  return artCache.get(uploadId)!;
}

/** The ticket in its event's design, as SVG. Refunded and void tickets get no QR.
    `embed`: put the artwork inside the SVG (needed to turn it into a PNG); otherwise the page
    links to the image, which the browser caches. */
export async function renderTicket(t: TicketRow, opts: { embed?: boolean } = {}) {
  const dead = t.status === "REFUNDED" || t.status === "VOID";
  const qr = dead ? null : await qrDataUrl(t.qrId, 480);
  const tpl = await templateFor(t.event.ticketTemplateId);
  const art = tpl.art.eticket;
  const href = !art ? null : opts.embed ? await artDataUrl(art.uploadId) : (await publicImage(art.uploadId)) ? `/api/uploads/${art.uploadId}` : null;
  return ticketSvg(tpl, ticketData(t), qr, { art: () => href });
}
