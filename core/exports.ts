import path from "node:path";
import PDFDocument from "pdfkit";
import { and, asc, db, eq, ne, printBatches, tickets } from "@/db";
import { aud } from "@/ui/format";
import { loadPrintRows, ticketsPdf, type PdfLayout } from "./print";
import { partnerReport } from "./ops/physical";

/* Downloads for the Admin Portal: print-ready PDFs, ticket lists (CSV) and partner reports. */

const csvCell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; // no spreadsheet formulas
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export async function batchPdf(batchId: string, layout: PdfLayout) {
  const b = await db.query.printBatches.findFirst({ where: eq(printBatches.id, batchId), with: { event: true, ticketType: true } });
  if (!b) return null;
  const ids = (await db.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.batchId, b.id), ne(tickets.status, "VOID"))).orderBy(asc(tickets.serial), asc(tickets.code))).map((r) => r.id);
  const rows = await loadPrintRows(ids);
  return { name: `PB-${b.number}-${b.event.slug}-${b.ticketType.name}-${layout}.pdf`, bytes: await ticketsPdf(rows, layout, `PB-${b.number} · ${b.event.name} · ${b.ticketType.name}`) };
}

export async function ticketsPdfById(ids: string[], layout: PdfLayout) {
  const rows = await loadPrintRows(ids);
  if (!rows.length) return null;
  return { name: `tickets-${rows[0].code}${rows.length > 1 ? `-and-${rows.length - 1}-more` : ""}-${layout}.pdf`, bytes: await ticketsPdf(rows, layout, `${rows[0].event.name} · ${rows.length} ticket${rows.length > 1 ? "s" : ""}`) };
}

export async function batchCsv(batchId: string) {
  const b = await db.query.printBatches.findFirst({ where: eq(printBatches.id, batchId), with: { event: true, ticketType: true, partner: true } });
  if (!b) return null;
  const rows = await db.query.tickets.findMany({ where: eq(tickets.batchId, b.id), orderBy: asc(tickets.serial), with: { partner: true } });
  return {
    name: `PB-${b.number}-${b.event.slug}-tickets.csv`,
    text: toCsv([["ticket_id", "code", "serial", "event", "ticket_type", "partner_code", "partner", "format", "stage", "status", "created_at"],
      ...rows.map((t) => [t.id, t.code, t.serial, b.event.name, b.ticketType.name, t.partner?.code ?? "", t.partner?.name ?? (t.source === "BOX_OFFICE" ? "Box Office" : ""), t.format, t.stage ?? "", t.status, t.createdAt])]),
  };
}

export async function reportCsv(eventId: string) {
  const r = await partnerReport(eventId);
  const money = (c: number) => (c / 100).toFixed(2);
  return {
    name: `partner-report-${r.event.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.csv`,
    text: toCsv([["source", "partner_code", "allocated", "issued", "sold", "unsold", "scanned", "no_shows", "physical", "revenue_aud", "commission_pct", "commission_aud"],
      ...r.lines.map((l) => [l.label, l.code ?? "", l.allocated, l.issued, l.sold, l.unsold, l.scanned, l.noShows ?? "", l.physical, money(l.revenueCents), l.commissionPct, money(l.commissionCents)]),
      ["TOTAL", "", "", "", r.totals.sold, "", r.totals.scanned, "", "", money(r.totals.revenueCents), "", money(r.totals.commissionCents)]]),
  };
}

const FONT = (f: string) => path.join(process.cwd(), "node_modules", "@fontsource", f);

export async function reportPdf(eventId: string) {
  const r = await partnerReport(eventId);
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40, info: { Title: `Partner report · ${r.event.name}`, Creator: "Nepthic Events" } });
  doc.registerFont("body", FONT("instrument-sans/files/instrument-sans-latin-400-normal.woff"));
  doc.registerFont("bold", FONT("instrument-sans/files/instrument-sans-latin-600-normal.woff"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  doc.font("bold").fontSize(16).fillColor("#111111").text(`Partner report · ${r.event.name}`);
  doc.font("body").fontSize(9).fillColor("#555555").text(`${r.event.startsAt.toLocaleString("en-AU", { dateStyle: "full", timeStyle: "short", timeZone: "Australia/Brisbane" })} · generated ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}`);
  doc.moveDown();
  const cols: [string, number, "left" | "right"][] = [["Source", 170, "left"], ["Code", 60, "left"], ["Allocated", 60, "right"], ["Sold", 50, "right"], ["Unsold", 50, "right"], ["Scanned", 55, "right"], ["No-shows", 60, "right"], ["Revenue", 80, "right"], ["Comm. %", 50, "right"], ["Commission", 80, "right"]];
  let y = doc.y;
  const row = (vals: string[], bold = false) => {
    let x = 40;
    doc.font(bold ? "bold" : "body").fontSize(9).fillColor("#111111");
    vals.forEach((v, i) => { doc.text(v, x, y, { width: cols[i][1] - 6, align: cols[i][2], lineBreak: false }); x += cols[i][1]; });
    y += 16;
    doc.moveTo(40, y - 4).lineTo(40 + cols.reduce((a, c) => a + c[1], 0), y - 4).lineWidth(0.3).strokeColor("#DDDDDD").stroke();
  };
  row(cols.map((c) => c[0]), true);
  for (const l of r.lines) row([l.label, l.code ?? "", String(l.allocated || ""), String(l.sold), String(l.unsold), String(l.scanned), l.noShows == null ? "—" : String(l.noShows), aud(l.revenueCents), l.commissionPct ? `${l.commissionPct}%` : "", l.commissionCents ? aud(l.commissionCents) : ""]);
  row(["Total", "", "", String(r.totals.sold), "", String(r.totals.scanned), "", aud(r.totals.revenueCents), "", aud(r.totals.commissionCents)], true);
  if (r.alerts.length) {
    y += 10;
    doc.font("bold").fontSize(11).text("Alerts", 40, y); y += 18;
    for (const a of r.alerts) { doc.font("body").fontSize(9).fillColor(a.level === "bad" ? "#B91C1C" : "#92400E").text(`• ${a.text}`, 40, y, { width: 700 }); y = doc.y + 4; }
  }
  doc.end();
  return { name: `partner-report-${r.event.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.pdf`, bytes: await done };
}



/** The door log as CSV (all matching scans, up to 50,000). Times in Brisbane time. */
export async function scansCsv(f: import("./scan-log").ScanFilters) {
  const { scanRows, scanSummary } = await import("./scan-log");
  const sum = await scanSummary(f.eventId);
  if (!sum.event) return null;
  const rows = await scanRows(f, { limit: 50000 });
  const when = (d: Date) => d.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(",", "");
  return {
    name: `door-scans-${sum.event.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.csv`,
    text: toCsv([["time_brisbane", "result", "gate", "method", "staff", "ticket_code", "typed_or_scanned", "holder", "ticket_type", "zone", "source", "partner_code", "partner_name"],
      ...rows.map((r) => [when(r.at), r.result, r.gate, r.method, r.staff ?? "", r.ticketCode ?? "", r.typed ?? "", r.holder ?? "", r.type ?? "", r.zone ?? "", r.source ?? "", r.partnerCode ?? "", r.partnerName ?? ""])]),
  };
}
