import QRCode from "qrcode";
import { and, db, eq, sql, tickets, ticketTypes, type TicketLine, type Tx } from "@/db";
import { env } from "./env";
import { audit } from "./audit";
import { parsePayload, ticketPayload } from "./ticket-codes";

export { newTicketCode } from "./ticket-codes";

export function qrDataUrl(code: string, width = 320) {
  return QRCode.toDataURL(ticketPayload(code, env.ticketSecret), {
    margin: 1, width, errorCorrectionLevel: "M", color: { dark: "#0F172A", light: "#FFFFFF" },
  });
}

export function qrPng(code: string) {
  return QRCode.toBuffer(ticketPayload(code, env.ticketSecret), { margin: 2, width: 480, errorCorrectionLevel: "M" });
}

export type ScanResult = {
  state: "ok" | "warn" | "bad";
  title: string;
  detail: string;
  code?: string;
  holder?: string;
  ticketType?: string;
};

const fmtTime = (d: Date) =>
  d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Brisbane" });

/** Validates a scan and admits each ticket at most once. */
export async function checkIn(raw: string, eventId: string, staffId: string): Promise<ScanResult> {
  const p = parsePayload(raw, env.ticketSecret);
  if (!p.code) return { state: "bad", title: "Nothing to check", detail: "Scan a QR code or type the ticket code." };
  if (p.signed && !p.signatureOk) {
    await audit(staffId, "scan.forged", "Ticket", p.code, { eventId });
    return { state: "bad", title: "Invalid ticket", detail: "This QR code wasn't issued by Nepthic. Don't admit.", code: p.code };
  }
  const t = await db.query.tickets.findFirst({ where: eq(tickets.code, p.code), with: { ticketType: true, event: true } });
  if (!t) return { state: "bad", title: "Invalid ticket", detail: `${p.code} isn't a ticket we issued. Don't admit.`, code: p.code };

  const base = { code: t.code, holder: t.holderName, ticketType: t.ticketType.name };
  if (t.eventId !== eventId) return { ...base, state: "bad", title: "Wrong event", detail: `This ticket is for ${t.event.name}.` };
  if (t.status === "REFUNDED" || t.status === "VOID") return { ...base, state: "bad", title: "Not valid", detail: "This ticket was refunded or cancelled." };
  if (t.status === "REFUND_REQUESTED") return { ...base, state: "warn", title: "Refund pending", detail: "The holder has an open refund request. Ask a supervisor before admitting." };
  if (t.status === "USED") return { ...base, state: "bad", title: "Already used", detail: `Checked in at ${fmtTime(t.checkedInAt!)}. Send to a supervisor.` };

  // Atomic: only one scanner can flip VALID -> USED, even if two doors scan at once.
  const now = new Date();
  const flipped = await db.update(tickets)
    .set({ status: "USED", checkedInAt: now, checkedInById: staffId })
    .where(and(eq(tickets.id, t.id), eq(tickets.status, "VALID")))
    .returning({ id: tickets.id });
  if (flipped.length !== 1) return { ...base, state: "bad", title: "Already used", detail: "This ticket was just scanned at another door." };
  await audit(staffId, "scan.admit", "Ticket", t.id, { eventId });
  return { ...base, state: "ok", title: "Admit", detail: `${t.holderName} · ${t.ticketType.name} · ${fmtTime(now)}` };
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
