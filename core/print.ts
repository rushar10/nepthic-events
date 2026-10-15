import path from "node:path";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import QRCode from "qrcode";
import sharp from "sharp";
import { db, eq, inArray, tickets, uploads } from "@/db";
import { publicImage } from "./uploads";
import { env } from "./env";
import { ticketPayload } from "./ticket-codes";
import { printTicketSvg, PRINT_SIZES, type PrintData, type TicketTemplate } from "./ticket-design";
import { templateFor } from "./ticket-templates";
import { aud, time } from "@/ui/format";

/* ---------------------------------------------------------------------------
   Print-ready PDFs of physical tickets: vector artwork and QR (sharp at any resolution;
   the event banner is embedded at 300 dpi for its printed size).

     stub     one 2" × 5.5" ticket per page, with 9 pt bleed and crop marks
     a4       five stubs per A4 sheet with crop marks, for in-house printing and cutting
     thermal  one 80 mm ticket per page for receipt/thermal printers (black only)

   Colours are kept within a CMYK-friendly range by the template's contrast rules; printers can
   convert the RGB PDF with their usual profile.
--------------------------------------------------------------------------- */

export type PdfLayout = "stub" | "a4" | "thermal";
export const PDF_LAYOUTS: Record<PdfLayout, string> = { stub: 'Ticket stub 2" × 5.5" (one per page)', a4: "A4 sheet, 5 per page with crop marks", thermal: "Thermal 80 mm" };

const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource");
const FONTS: [string, string][] = [
  ["Instrument Sans", "instrument-sans/files/instrument-sans-latin-400-normal.woff"],
  ["Instrument Sans-600", "instrument-sans/files/instrument-sans-latin-600-normal.woff"],
  ["JetBrains Mono", "jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff"],
  ["JetBrains Mono-600", "jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff"],
  ["Unbounded", "unbounded/files/unbounded-latin-800-normal.woff"],
];
const fontFor = (family: string, bold: boolean) => {
  const f = family.replace(/['"]/g, "").split(",")[0].trim();
  if (f.startsWith("Unbounded")) return "Unbounded";
  if (f.startsWith("JetBrains")) return bold ? "JetBrains Mono-600" : "JetBrains Mono";
  return bold ? "Instrument Sans-600" : "Instrument Sans";
};

export function qrMatrix(qrId: string): boolean[][] {
  const q = QRCode.create(ticketPayload(qrId, env.ticketSecret), { errorCorrectionLevel: "M" });
  const n = q.modules.size;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => !!q.modules.data[r * n + c]));
}

type Row = {
  id: string; code: string; qrId: string; serial: number | null; holderName: string; status: string;
  event: { id: string; name: string; startsAt: Date; venue: string; city: string; ticketTemplateId: string | null; coverUploadId: string | null };
  ticketType: { name: string; priceCents: number; zone: string };
  partner: { name: string; code: string } | null;
  ticketOrder?: { number: number } | null;
};

export async function loadPrintRows(ids: string[]) {
  const rows = await db.query.tickets.findMany({ where: inArray(tickets.id, ids), with: { event: true, ticketType: true, partner: true, ticketOrder: true } });
  const order = new Map(ids.map((id, i) => [id, i]));
  return (rows as unknown as Row[]).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

async function bannerFor(uploadId: string | null) {
  if (!uploadId) return null;
  const u = await db.query.uploads.findFirst({ where: eq(uploads.id, uploadId) });
  if (!u) return null;
  // 80 pt wide × 144 pt tall at 300 dpi
  const png = await sharp(u.data).resize(333, 600, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${png.toString("base64")}`;
}

const pad = (n: number | null, w = 6) => (n == null ? "" : String(n).padStart(w, "0"));

export function printData(r: Row): PrintData {
  return {
    eventName: r.event.name,
    dateText: r.event.startsAt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" }).replace(/,/g, ""),
    doorsText: time(r.event.startsAt), venue: r.event.venue, city: r.event.city,
    typeName: r.ticketType.name, zone: r.ticketType.zone || undefined, priceText: aud(r.ticketType.priceCents),
    holder: /^physical ticket$/i.test(r.holderName) ? "" : r.holderName, code: r.code, orderText: r.ticketOrder?.number ? `TO-${r.ticketOrder.number}` : "",
    serial: pad(r.serial), partnerLabel: r.partner ? `Sold by: ${r.partner.name} / ${r.partner.code}` : undefined,
    status: "VALID",
  };
}

/** Stub artwork at print resolution, with its bleed: 414 × 162 pt (the 396 × 144 pt ticket plus
    9 pt on every side) at 300 dpi. Artwork made without bleed is scaled up slightly to fill it. */
const artBuffers = new Map<string, Buffer | null>();
async function stubArt(uploadId: string) {
  if (!artBuffers.has(uploadId)) {
    const u = await publicImage(uploadId);
    if (artBuffers.size > 10) artBuffers.delete(artBuffers.keys().next().value!);
    artBuffers.set(uploadId, u ? await sharp(u.data).resize(1725, 675, { fit: "cover" }).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer() : null);
  }
  return artBuffers.get(uploadId)!;
}

/** SVGs for the given tickets in one print format. `art` is the stub artwork (drawn under the SVG). */
export async function ticketSvgs(rows: Row[], format: "stub" | "thermal") {
  const templates = new Map<string, TicketTemplate>();
  const banners = new Map<string, string | null>();
  const out: { svg: string; bg: string; art: Buffer | null }[] = [];
  for (const r of rows) {
    const key = r.event.ticketTemplateId ?? "";
    if (!templates.has(key)) templates.set(key, await templateFor(r.event.ticketTemplateId));
    const t = templates.get(key)!;
    const art = format === "stub" && t.art.stub ? await stubArt(t.art.stub.uploadId) : null;
    if (!banners.has(r.event.id)) banners.set(r.event.id, format === "stub" && !art ? await bannerFor(r.event.coverUploadId) : null);
    const svg = printTicketSvg(t, printData(r), qrMatrix(r.qrId), { format, seed: r.event.id, banner: banners.get(r.event.id), art: art ? () => "" : undefined, artLayer: false });
    out.push({ svg, bg: art ? "#FFFFFF" : t.bg, art });
  }
  return out;
}

function cropMarks(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, gap = 4, len = 10) {
  doc.save().lineWidth(0.3).strokeColor("#000000");
  for (const [cx, cy, dx, dy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]] as const) {
    doc.moveTo(cx + dx * gap, cy).lineTo(cx + dx * (gap + len), cy).stroke();
    doc.moveTo(cx, cy + dy * gap).lineTo(cx, cy + dy * (gap + len)).stroke();
  }
  doc.restore();
}

/** Builds the PDF. Returns its bytes. */
export async function ticketsPdf(rows: Row[], layout: PdfLayout, title: string): Promise<Buffer> {
  const format = layout === "thermal" ? "thermal" : "stub";
  const items = await ticketSvgs(rows, format);
  const { w, h } = PRINT_SIZES[format];
  const M = 27, BLEED = 9; // stub page: 9 pt bleed + room for crop marks
  const A4 = { w: 595.28, h: 841.89 }, GAP = 18, PER = 5;
  const firstSize: [number, number] = layout === "stub" ? [w + 2 * M, h + 2 * M] : layout === "a4" ? [A4.w, A4.h] : [w, h];
  const doc = new PDFDocument({ size: firstSize, margin: 0, autoFirstPage: false, info: { Title: title, Creator: "Nepthic Events", Producer: "Nepthic Events" } });
  for (const [name, file] of FONTS) doc.registerFont(name, path.join(FONT_DIR, file));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const draw = (svg: string, x: number, y: number) =>
    SVGtoPDF(doc, svg, x, y, { width: w, height: h, assumePt: true, fontCallback: (family: string, bold: boolean) => fontFor(family, bold) });

  // Artwork runs into the bleed on single stubs; on A4 sheets it is cut at the trim line.
  const art = (it: { art: Buffer | null }, x: number, y: number, bleed: boolean) => {
    if (!it.art) return;
    doc.save();
    if (!bleed) doc.rect(x, y, w, h).clip();
    doc.image(it.art, x - BLEED, y - BLEED, { width: w + 2 * BLEED, height: h + 2 * BLEED });
    doc.restore();
  };

  if (layout === "stub") {
    for (const it of items) {
      doc.addPage({ size: firstSize, margin: 0 });
      doc.rect(M - BLEED, M - BLEED, w + 2 * BLEED, h + 2 * BLEED).fill(it.bg); // bleed in the background colour
      art(it, M, M, true);
      draw(it.svg, M, M);
      cropMarks(doc, M, M, w, h, BLEED + 2);
    }
  } else if (layout === "a4") {
    const x0 = (A4.w - w) / 2, y0 = (A4.h - (PER * h + (PER - 1) * GAP)) / 2;
    items.forEach((it, i) => {
      if (i % PER === 0) {
        doc.addPage({ size: [A4.w, A4.h], margin: 0 });
        doc.font("JetBrains Mono").fontSize(6).fillColor("#666666").text(`${title} · sheet ${Math.floor(i / PER) + 1} of ${Math.ceil(items.length / PER)}`, 20, 10, { lineBreak: false });
      }
      const y = y0 + (i % PER) * (h + GAP);
      art(it, x0, y, false);
      draw(it.svg, x0, y);
      cropMarks(doc, x0, y, w, h, 3, 8);
    });
  } else {
    for (const it of items) { doc.addPage({ size: [w, h], margin: 0 }); draw(it.svg, 0, 0); }
  }
  doc.end();
  return done;
}
