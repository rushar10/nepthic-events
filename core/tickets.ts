import QRCode from "qrcode";
import { and, db, eq, events, scans, sql, tickets, ticketTypes, type TicketLine, type Tx } from "@/db";
import { env } from "./env";
import { audit } from "./audit";
import { parsePayload, ticketPayload } from "./ticket-codes";
import { checkCharOk, codeKey } from "./ticket-code-format";
import { eventFormat } from "./issue";

export { newTicketCode } from "./ticket-codes";

/** QR image (data: URL) for a ticket's QR id. */
export function qrDataUrl(qrId: string, width = 320) {
  return QRCode.toDataURL(ticketPayload(qrId, env.ticketSecret), {
    margin: 1, width, errorCorrectionLevel: "M", color: { dark: "#0F172A", light: "#FFFFFF" },
  });
}

export function qrPng(qrId: string) {
  return QRCode.toBuffer(ticketPayload(qrId, env.ticketSecret), { margin: 2, width: 480, errorCorrectionLevel: "M" });
}

export type ScanSource = { kind: "ONLINE" | "BOX_OFFICE" | "PARTNER"; label: string; code: string | null; color: string };
export type ScanResult = {
  state: "ok" | "warn" | "bad";
  title: string;
  detail: string;
  code?: string;
  holder?: string;
  ticketType?: string;
  zone?: string;
  format?: "ETICKET" | "PHYSICAL" | "BOTH";
  source?: ScanSource;
  firstScan?: { at: string; gate: string | null };
  flags?: string[];
};

const fmtTime = (d: Date) =>
  d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Brisbane" });

const SOURCE_COLOUR = { ONLINE: "#8B5CF6", BOX_OFFICE: "#64748B" } as const;

/** Validates a scan, admits each ticket at most once, and logs every attempt. */
export async function checkIn(raw: string, eventId: string, staffId: string, opts: { gate?: string; method?: "CAMERA" | "MANUAL" | "OFFLINE" } = {}): Promise<ScanResult> {
  const gate = (opts.gate || "Main").slice(0, 40);
  const method = opts.method ?? "CAMERA";
  const log = (result: string, extra: { ticketId?: string; code?: string; partnerId?: string | null } = {}) =>
    db.insert(scans).values({ eventId, gate, method, result, staff: staffId, ticketId: extra.ticketId ?? null, code: extra.code ?? null, partnerId: extra.partnerId ?? null });

  const p = parsePayload(raw, env.ticketSecret);
  if (p.kind !== "qr" && !("code" in p && p.code)) return { state: "bad", title: "Nothing to check", detail: "Scan a QR code or type the ticket code." };
  if (p.kind !== "typed" && !p.signatureOk) {
    await log("FORGED");
    await audit(staffId, "scan.forged", "Ticket", p.kind === "qr" ? p.qrId : p.code, { eventId, gate });
    return { state: "bad", title: "Invalid ticket", detail: "This QR code wasn't issued by Nepthic. Don't admit." };
  }
  const where = p.kind === "qr" ? eq(tickets.qrId, p.qrId) : p.kind === "legacy" ? eq(tickets.code, p.code) : eq(tickets.codeKey, codeKey(p.code));
  const t = await db.query.tickets.findFirst({ where, with: { ticketType: true, event: true, partner: true, allocation: true } });

  if (p.kind === "typed" && !t && method === "CAMERA") {
    await log("INVALID", { code: p.code.slice(0, 60) });
    return { state: "bad", title: "Invalid ticket", detail: "This QR code isn't a Nepthic ticket. Don't admit." };
  }
  if (p.kind === "typed" && !t) {
    const ev = await db.query.events.findFirst({ where: eq(events.id, eventId), columns: { id: true, slug: true, codeFormat: true } });
    const f = ev ? eventFormat(ev) : null;
    await log("INVALID", { code: p.code });
    if (f?.checkChar && !checkCharOk(p.code)) return { state: "bad", title: "Check the code", detail: `${p.code} fails its check character, so it was probably mistyped. Type it again.`, code: p.code };
    return { state: "bad", title: "Invalid ticket", detail: `${p.code} isn't a ticket we issued. Don't admit.`, code: p.code };
  }
  if (!t) { await log("INVALID"); return { state: "bad", title: "Invalid ticket", detail: "This ticket isn't in our system. Don't admit." }; }

  const source: ScanSource = t.source === "PARTNER" && t.partner
    ? { kind: "PARTNER", label: t.partner.name, code: t.partner.code, color: t.partner.color }
    : t.source === "BOX_OFFICE" ? { kind: "BOX_OFFICE", label: "Box Office", code: null, color: SOURCE_COLOUR.BOX_OFFICE }
      : { kind: "ONLINE", label: "Nepthic Online", code: null, color: SOURCE_COLOUR.ONLINE };
  const holder = t.holderName === "Physical ticket" ? "" : t.holderName; // unsold-stock placeholder name
  const base = { code: t.code, holder: holder || undefined, ticketType: t.ticketType.name, zone: t.ticketType.zone || undefined, format: t.format, source };
  const L = (r: string) => log(r, { ticketId: t.id, partnerId: t.partnerId });

  if (t.eventId !== eventId) { await L("WRONG_EVENT"); return { ...base, state: "bad", title: "Wrong event", detail: `This ticket is for ${t.event.name}.` }; }
  if (t.status === "VOID") {
    const next = await db.query.tickets.findFirst({ where: eq(tickets.reissuedFromId, t.id), columns: { code: true } });
    await L("VOID");
    return { ...base, state: "bad", title: "Void ticket", detail: next ? `This ticket was replaced by ${next.code}. Don't admit; the holder should have the new one.` : `This ticket was voided${t.voidReason ? ` (${t.voidReason})` : ""}. Don't admit.` };
  }
  if (t.status === "REFUNDED") { await L("REFUNDED"); return { ...base, state: "bad", title: "Not valid", detail: "This ticket was refunded." }; }
  if (t.status === "USED") {
    await L("ALREADY_USED");
    return { ...base, state: "bad", title: "Already used", detail: `Checked in at ${fmtTime(t.checkedInAt!)}${t.checkedInGate ? ` at ${t.checkedInGate}` : ""}. Send to a supervisor.`, firstScan: { at: t.checkedInAt!.toISOString(), gate: t.checkedInGate } };
  }
  const flags: string[] = [];
  if (t.partner?.status === "SUSPENDED") flags.push(`Partner ${t.partner.code} is suspended`);
  if (t.allocation?.revokedAt) flags.push("This partner allocation was revoked");
  if (t.stage && t.stage !== "SOLD" && t.source !== "ONLINE") flags.push(`Physical stock not marked sold (${t.stage.toLowerCase()})`);
  if (t.status === "REFUND_REQUESTED") flags.push("The holder has an open refund request");
  if (flags.length) {
    await L("FLAGGED");
    return { ...base, state: "warn", title: "Check with a supervisor", detail: `${flags.join(". ")}. Don't admit until a supervisor approves.`, flags };
  }

  // Atomic: only one scanner can flip VALID -> USED, even if two gates scan at once.
  const now = new Date();
  const flipped = await db.update(tickets)
    .set({ status: "USED", checkedInAt: now, checkedInById: staffId, checkedInGate: gate })
    .where(and(eq(tickets.id, t.id), eq(tickets.status, "VALID")))
    .returning({ id: tickets.id });
  if (flipped.length !== 1) {
    const again = await db.query.tickets.findFirst({ where: eq(tickets.id, t.id), columns: { checkedInAt: true, checkedInGate: true } });
    await L("ALREADY_USED");
    return { ...base, state: "bad", title: "Already used", detail: `Just scanned${again?.checkedInGate ? ` at ${again.checkedInGate}` : " at another gate"}.`, firstScan: again?.checkedInAt ? { at: again.checkedInAt.toISOString(), gate: again.checkedInGate } : undefined };
  }
  await L("ADMIT");
  await audit(staffId, "scan.admit", "Ticket", t.id, { eventId, gate, method });
  return { ...base, state: "ok", title: "Admit", detail: `${holder ? `${holder} · ` : ""}${t.ticketType.name}${t.ticketType.zone ? ` · ${t.ticketType.zone}` : ""} · ${fmtTime(now)}` };
}

/** Holds seats for an unpaid checkout. Throws if any type would go over capacity. */
export async function reserveSeats(tx: Tx, lines: TicketLine[]) {
  for (const l of lines) {
    const rows = await tx.update(ticketTypes)
      .set({ sold: sql`${ticketTypes.sold} + ${l.quantity}` })
      .where(and(eq(ticketTypes.id, l.typeId), sql`${ticketTypes.sold} + ${l.quantity} <= ${ticketTypes.capacity}`))
      .returning({ id: ticketTypes.id });
    if (rows.length !== 1) throw new SoldOutError(`Not enough ${l.name} tickets left.`);
  }
}

export async function releaseSeats(tx: Tx, lines: { typeId: string; quantity: number }[]) {
  for (const l of lines) {
    await tx.update(ticketTypes)
      .set({ sold: sql`GREATEST(${ticketTypes.sold} - ${l.quantity}, 0)` })
      .where(eq(ticketTypes.id, l.typeId));
  }
}

export class SoldOutError extends Error {}
