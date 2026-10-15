/* ---------------------------------------------------------------------------
   Ticket designs. One pure function turns a ticket template + a ticket's details + its QR
   image into an SVG. The same file is copied into the Admin Portal (portal/core/ticket-design.ts), so the template editor's
   live preview is exactly what customers get in My Tickets and in the downloaded ticket.

   The QR always sits on a white panel with a quiet zone, whatever colours the template uses,
   so every design scans.
--------------------------------------------------------------------------- */

export type TicketLayout = "stub" | "poster" | "minimal";
export type TicketPattern = "none" | "grid" | "rays" | "dots" | "waves";
export type TicketFields = { date: boolean; doors: boolean; venue: boolean; type: boolean; price: boolean; holder: boolean; order: boolean };
export type TicketTemplate = {
  name: string;
  layout: TicketLayout;
  bg: string; bg2: string; ink: string; accent: string;
  pattern: TicketPattern;
  /** Small wordmark at the top, e.g. "NEPTHIC". */
  brand: string;
  /** Replaces the event name as the big title when set. */
  headline: string;
  fields: TicketFields;
  finePrint: string;
};
export type TicketData = {
  eventName: string; dateText: string; doorsText: string; venue: string; city: string;
  typeName: string; priceText: string; holder: string; code: string; orderText: string;
  status?: "VALID" | "USED" | "REFUND_REQUESTED" | "REFUNDED" | "VOID";
};

export const LAYOUTS: { key: TicketLayout; label: string; w: number; h: number }[] = [
  { key: "stub", label: "Classic stub (landscape)", w: 1000, h: 380 },
  { key: "poster", label: "Poster (portrait)", w: 600, h: 960 },
  { key: "minimal", label: "Minimal (big QR)", w: 600, h: 880 },
];
export const PATTERNS: { key: TicketPattern; label: string }[] = [
  { key: "none", label: "None" }, { key: "grid", label: "Grid" }, { key: "rays", label: "Rays" }, { key: "dots", label: "Dots" }, { key: "waves", label: "Waves" },
];
export const FIELD_LABELS: Record<keyof TicketFields, string> = {
  date: "Date", doors: "Doors", venue: "Venue", type: "Ticket type", price: "Price", holder: "Name", order: "Order",
};

export const DEFAULT_TEMPLATE: TicketTemplate = {
  name: "Nepthic default", layout: "stub", bg: "#14101F", bg2: "#3B0F2E", ink: "#F4F1FA", accent: "#EC4899", pattern: "rays",
  brand: "NEPTHIC EVENTS", headline: "",
  fields: { date: true, doors: true, venue: true, type: true, price: false, holder: true, order: false },
  finePrint: "One entry per ticket. Each code admits one person, once. Bring photo ID. No re-entry.",
};

/** Starting points in the template editor. */
export const PRESETS: { key: string; label: string; design: Omit<TicketTemplate, "name"> }[] = [
  { key: "midnight", label: "Midnight stub", design: { ...DEFAULT_TEMPLATE } },
  { key: "neon", label: "Neon poster", design: { ...DEFAULT_TEMPLATE, layout: "poster", bg: "#0B0420", bg2: "#2A0B4F", ink: "#F5F3FF", accent: "#22D3EE", pattern: "grid", brand: "NEPTHIC" } },
  { key: "sunset", label: "Sunset poster", design: { ...DEFAULT_TEMPLATE, layout: "poster", bg: "#2B0A12", bg2: "#7C2D12", ink: "#FFF7ED", accent: "#FBBF24", pattern: "waves", brand: "NEPTHIC EVENTS" } },
  { key: "paper", label: "Paper (light)", design: { ...DEFAULT_TEMPLATE, layout: "stub", bg: "#FAF7F2", bg2: "#EDE6DA", ink: "#1C1917", accent: "#BE185D", pattern: "dots", brand: "NEPTHIC EVENTS" } },
  { key: "door", label: "Door-friendly (big QR)", design: { ...DEFAULT_TEMPLATE, layout: "minimal", bg: "#111827", bg2: "#1F2937", ink: "#F9FAFB", accent: "#EC4899", pattern: "none", brand: "NEPTHIC" } },
];

export const SAMPLE_DATA: TicketData = {
  eventName: "NEPTHIC Night 03", dateText: "Sat 14 Nov 2026", doorsText: "8:00 pm", venue: "The Triffid", city: "Brisbane",
  typeName: "General admission", priceText: "$45.00", holder: "Ava Nguyen", code: "NPT-SAMP-LE01", orderText: "TO-1042", status: "VALID",
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const colour = (v: string, d: string) => (HEX.test(v) ? v : d);

/** Cleans a template from a form or the database: unknown values fall back to the defaults. */
export function normalizeTemplate(t: Partial<TicketTemplate> & { fields?: Partial<TicketFields> }): TicketTemplate {
  const d = DEFAULT_TEMPLATE;
  return {
    name: String(t.name ?? d.name).trim().slice(0, 60) || d.name,
    layout: LAYOUTS.some((l) => l.key === t.layout) ? (t.layout as TicketLayout) : d.layout,
    bg: colour(String(t.bg ?? ""), d.bg), bg2: colour(String(t.bg2 ?? ""), d.bg2),
    ink: colour(String(t.ink ?? ""), d.ink), accent: colour(String(t.accent ?? ""), d.accent),
    pattern: PATTERNS.some((p) => p.key === t.pattern) ? (t.pattern as TicketPattern) : d.pattern,
    brand: String(t.brand ?? d.brand).trim().slice(0, 30),
    headline: String(t.headline ?? "").trim().slice(0, 80),
    fields: Object.fromEntries(Object.keys(d.fields).map((k) => [k, t.fields?.[k as keyof TicketFields] ?? d.fields[k as keyof TicketFields]])) as TicketFields,
    finePrint: String(t.finePrint ?? d.finePrint).trim().slice(0, 300),
  };
}

/** WCAG contrast ratio between two hex colours (1–21). The editor warns under 4.5. */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(colour(a, "#000000")), lum(colour(b, "#FFFFFF"))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Greedy word wrap by an approximate character budget. */
function wrap(text: string, perLine: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur ? cur.length + 1 : 0) + w.length <= perLine) cur = cur ? `${cur} ${w}` : w;
    else { if (cur) lines.push(cur); cur = w.length > perLine ? `${w.slice(0, perLine - 1)}…` : w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…$/, "").slice(0, perLine - 1)}…`; }
  return lines;
}

const tspans = (lines: string[], x: number, lh: number) => lines.map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join("");

function pattern(kind: TicketPattern, w: number, h: number, accent: string) {
  const s = `stroke="${accent}" fill="none"`;
  switch (kind) {
    case "grid": {
      let p = "";
      for (let x = 0; x <= w; x += 40) p += `M${x} 0V${h}`;
      for (let y = 0; y <= h; y += 40) p += `M0 ${y}H${w}`;
      return `<path d="${p}" ${s} stroke-width="1" opacity=".12"/>`;
    }
    case "rays": {
      let p = "";
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI / 2; p += `M${w} 0L${(w - Math.cos(a) * (w + h) * 1.2).toFixed(0)} ${(Math.sin(a) * (w + h) * 1.2).toFixed(0)}`; }
      return `<path d="${p}" ${s} stroke-width="14" opacity=".07"/>`;
    }
    case "dots": {
      let c = "";
      for (let x = 20; x < w; x += 28) for (let y = 20; y < h; y += 28) c += `<circle cx="${x}" cy="${y}" r="2.2"/>`;
      return `<g fill="${accent}" opacity=".18">${c}</g>`;
    }
    case "waves": {
      let p = "";
      for (let y = 30; y < h + 60; y += 34) { p += `M0 ${y}`; for (let x = 0; x < w; x += 80) p += ` q20 -16 40 0 t40 0`; }
      return `<path d="${p}" ${s} stroke-width="2" opacity=".13"/>`;
    }
    default: return "";
  }
}

function fieldList(t: TicketTemplate, d: TicketData): [string, string][] {
  const f = t.fields, out: [string, string][] = [];
  if (f.date) out.push(["DATE", d.dateText]);
  if (f.doors) out.push(["DOORS", d.doorsText]);
  if (f.venue) out.push(["VENUE", d.city && d.venue.length + d.city.length < 19 ? `${d.venue}, ${d.city}` : d.venue]);
  if (f.type) out.push(["TICKET", d.typeName]);
  if (f.price) out.push(["PRICE", d.priceText]);
  if (f.holder) out.push(["NAME", d.holder]);
  if (f.order) out.push(["ORDER", d.orderText]);
  return out;
}

function fieldsGrid(items: [string, string][], x: number, y: number, colW: number, cols: number, ink: string, accent: string, maxChars: number) {
  return items.map(([k, v], i) => {
    const cx = x + (i % cols) * colW, cy = y + Math.floor(i / cols) * 58;
    const val = v.length > maxChars ? `${v.slice(0, maxChars - 1)}…` : v;
    return `<text x="${cx}" y="${cy}" font-family="JetBrains Mono,ui-monospace,monospace" font-size="12" letter-spacing="2" fill="${accent}">${k}</text>`
      + `<text x="${cx}" y="${cy + 24}" font-family="Instrument Sans,system-ui,sans-serif" font-size="20" font-weight="600" fill="${ink}">${esc(val)}</text>`;
  }).join("");
}

function qrBlock(qr: string | null, x: number, y: number, size: number, d: TicketData) {
  const pad = Math.round(size * 0.07);
  const panel = `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${Math.round(size * 0.06)}" fill="#FFFFFF"/>`;
  if (!qr) return panel + `<text x="${x + size / 2}" y="${y + size / 2 + 6}" text-anchor="middle" font-family="Instrument Sans,system-ui,sans-serif" font-size="18" font-weight="700" fill="#64748B">${d.status === "REFUNDED" || d.status === "VOID" ? "No longer valid" : "QR code"}</text>`;
  return panel + `<image href="${esc(qr)}" x="${x + pad}" y="${y + pad}" width="${size - pad * 2}" height="${size - pad * 2}" preserveAspectRatio="xMidYMid meet" style="image-rendering:pixelated"/>`;
}

function stamp(d: TicketData, w: number, h: number) {
  const text = d.status === "USED" ? "CHECKED IN" : d.status === "REFUNDED" ? "REFUNDED" : d.status === "VOID" ? "VOID" : d.status === "REFUND_REQUESTED" ? "REFUND PENDING" : "";
  if (!text) return "";
  const colourFor = d.status === "USED" ? "#38BDF8" : d.status === "REFUND_REQUESTED" ? "#FBBF24" : "#F87171";
  return `<g transform="translate(${w / 2} ${h / 2}) rotate(-14)" opacity=".9"><rect x="-210" y="-42" width="420" height="84" rx="12" fill="none" stroke="${colourFor}" stroke-width="6"/>`
    + `<text y="16" text-anchor="middle" font-family="Unbounded,Arial Black,sans-serif" font-weight="800" font-size="40" letter-spacing="4" fill="${colourFor}">${text}</text></g>`;
}

/** The ticket as an SVG string. `qr` is a data: URL of the ticket's QR (null hides it). */
export function ticketSvg(template: TicketTemplate, d: TicketData, qr: string | null, opts: { title?: string } = {}) {
  const t = normalizeTemplate(template);
  const L = LAYOUTS.find((l) => l.key === t.layout)!;
  const { w, h } = L;
  const id = `t${Math.abs([...d.code + t.layout].reduce((n, c) => (n * 33 + c.charCodeAt(0)) | 0, 5381))}`;
  const title = esc(opts.title ?? `Ticket ${d.code} for ${d.eventName}`);
  const headline = t.headline || d.eventName;
  const items = fieldList(t, d);
  const display = `font-family="Unbounded,Arial Black,sans-serif" font-weight="800"`;
  const mono = `font-family="JetBrains Mono,ui-monospace,monospace"`;
  const body = `font-family="Instrument Sans,system-ui,sans-serif"`;
  const fine = t.finePrint ? wrap(t.finePrint, t.layout === "stub" ? 90 : 62, 2) : [];
  let inner = "";
  let mask = "";

  if (t.layout === "stub") {
    const cut = 720;
    mask = `<mask id="${id}m"><rect width="${w}" height="${h}" rx="28" fill="#fff"/><circle cx="${cut}" cy="0" r="22" fill="#000"/><circle cx="${cut}" cy="${h}" r="22" fill="#000"/></mask>`;
    const lines = wrap(headline, 22, 2);
    inner = `<text x="48" y="64" ${mono} font-size="14" letter-spacing="5" fill="${t.accent}">${esc(t.brand.toUpperCase())}</text>`
      + `<text x="48" y="${lines.length > 1 ? 122 : 140}" ${display} font-size="44" fill="${t.ink}">${tspans(lines, 48, 52)}</text>`
      + fieldsGrid(items.slice(0, 6), 48, 236, 224, 3, t.ink, t.accent, 21)
      + (fine.length ? `<text x="48" y="${h - 22 - (fine.length - 1) * 15}" ${body} font-size="11.5" fill="${t.ink}" opacity=".6">${tspans(fine, 48, 15)}</text>` : "")
      + `<path d="M${cut} 30V${h - 30}" stroke="${t.ink}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="2 10" stroke-linecap="round"/>`
      + `<rect x="${cut}" y="0" width="${w - cut}" height="${h}" fill="#000" opacity=".18"/>`
      + qrBlock(qr, cut + 50, 48, 180, d)
      + `<text x="${cut + 140}" y="262" text-anchor="middle" ${mono} font-size="17" font-weight="600" letter-spacing="1" fill="${t.ink}">${esc(d.code)}</text>`
      + `<text x="${cut + 140}" y="292" text-anchor="middle" ${body} font-size="15" fill="${t.ink}" opacity=".75">${esc(d.typeName.slice(0, 26))}</text>`
      + `<text x="${cut + 140}" y="${h - 34}" text-anchor="middle" ${mono} font-size="11" letter-spacing="3" fill="${t.accent}">ADMIT ONE</text>`;
  } else if (t.layout === "poster") {
    const cut = 620;
    mask = `<mask id="${id}m"><rect width="${w}" height="${h}" rx="30" fill="#fff"/><circle cx="0" cy="${cut}" r="22" fill="#000"/><circle cx="${w}" cy="${cut}" r="22" fill="#000"/></mask>`;
    const lines = wrap(headline, 15, 3);
    inner = `<text x="44" y="70" ${mono} font-size="14" letter-spacing="5" fill="${t.accent}">${esc(t.brand.toUpperCase())}</text>`
      + `<text x="44" y="160" ${display} font-size="54" fill="${t.ink}">${tspans(lines, 44, 62)}</text>`
      + `<rect x="44" y="${180 + (lines.length - 1) * 62}" width="80" height="6" rx="3" fill="${t.accent}"/>`
      + fieldsGrid(items.slice(0, 6), 44, 260 + (lines.length - 1) * 62, 260, 2, t.ink, t.accent, 20)
      + `<path d="M30 ${cut}H${w - 30}" stroke="${t.ink}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="2 10" stroke-linecap="round"/>`
      + qrBlock(qr, 44, cut + 40, 220, d)
      + `<text x="290" y="${cut + 80}" ${mono} font-size="12" letter-spacing="3" fill="${t.accent}">ADMIT ONE</text>`
      + `<text x="290" y="${cut + 116}" ${mono} font-size="20" font-weight="600" fill="${t.ink}">${esc(d.code)}</text>`
      + `<text x="290" y="${cut + 148}" ${body} font-size="16" fill="${t.ink}" opacity=".8">${esc(d.typeName.slice(0, 24))}</text>`
      + (fine.length ? `<text x="290" y="${cut + 196}" ${body} font-size="11.5" fill="${t.ink}" opacity=".6">${tspans(wrap(t.finePrint, 34, 4), 290, 15)}</text>` : "");
  } else {
    mask = `<mask id="${id}m"><rect width="${w}" height="${h}" rx="30" fill="#fff"/></mask>`;
    const lines = wrap(headline, 20, 2);
    inner = `<text x="${w / 2}" y="62" text-anchor="middle" ${mono} font-size="14" letter-spacing="5" fill="${t.accent}">${esc(t.brand.toUpperCase())}</text>`
      + qrBlock(qr, (w - 340) / 2, 92, 340, d)
      + `<text x="${w / 2}" y="474" text-anchor="middle" ${mono} font-size="22" font-weight="600" letter-spacing="1" fill="${t.ink}">${esc(d.code)}</text>`
      + `<text x="${w / 2}" y="540" text-anchor="middle" ${display} font-size="36" fill="${t.ink}">${lines.map((l, i) => `<tspan x="${w / 2}" dy="${i ? 44 : 0}">${esc(l)}</tspan>`).join("")}</text>`
      + fieldsGrid(items.slice(0, 6), 60, 610 + (lines.length - 1) * 44, 250, 2, t.ink, t.accent, 20)
      + (fine.length ? `<text x="${w / 2}" y="${h - 30 - (fine.length - 1) * 15}" text-anchor="middle" ${body} font-size="11.5" fill="${t.ink}" opacity=".6">${fine.map((l, i) => `<tspan x="${w / 2}" dy="${i ? 15 : 0}">${esc(l)}</tspan>`).join("")}</text>` : "");
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">`
    + `<title>${title}</title><defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient>${mask}</defs>`
    + `<g mask="url(#${id}m)"><rect width="${w}" height="${h}" fill="url(#${id}g)"/>${t.layout === "minimal" ? "" : pattern(t.pattern, w, h, t.accent)}${inner}${stamp(d, w, h)}</g></svg>`;
}

/* ---------------------------------------------------------------------------
   Printed tickets. Same template (colours, wording, fields), laid out for paper:
     stub     2" × 5.5" (396 × 144 pt), full colour, perforated stub with the QR
     thermal  80 mm roll (227 pt wide), black on white for receipt printers
   Units are points, so the SVG drops straight into a PDF at any resolution (vector).
   Security extras: a background pattern unique to each event (seeded from its id), a line of
   microtext, a serial number, and a placeholder area for a holographic sticker.
--------------------------------------------------------------------------- */

export type PrintFormat = "stub" | "thermal";
export type PrintData = TicketData & { zone?: string; serial?: string; partnerLabel?: string };
export type PrintOptions = { format: PrintFormat; seed: string; banner?: string | null; hologram?: boolean; microtext?: boolean; pattern?: boolean };
export const PRINT_SIZES: Record<PrintFormat, { w: number; h: number; label: string }> = {
  stub: { w: 396, h: 144, label: 'Ticket stub 2" × 5.5"' },
  thermal: { w: 226.77, h: 410, label: "Thermal roll 80 mm" },
};

function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

/** Guilloche-style rosette unique to the event: hard to reproduce by hand, cheap to print. */
function guilloche(seed: string, w: number, h: number, colour: string, opacity: number) {
  const r = seeded(seed);
  const cx = w * (0.55 + r() * 0.3), cy = h * (0.3 + r() * 0.4);
  const k1 = 3 + Math.floor(r() * 5), k2 = 7 + Math.floor(r() * 9);
  let paths = "";
  for (let ring = 0; ring < 6; ring++) {
    const R = Math.max(w, h) * (0.18 + ring * 0.09), a = 6 + r() * 10;
    let d = "";
    for (let i = 0; i <= 360; i += 3) {
      const t = (i * Math.PI) / 180;
      const rad = R + a * Math.sin(k1 * t + ring) + (a / 2) * Math.cos(k2 * t);
      d += `${i ? "L" : "M"}${(cx + rad * Math.cos(t)).toFixed(1)} ${(cy + rad * Math.sin(t)).toFixed(1)}`;
    }
    paths += `<path d="${d}Z" fill="none" stroke="${colour}" stroke-width="0.35" opacity="${opacity}"/>`;
  }
  return paths;
}

/** QR modules as one vector path on a white panel with a quiet zone. */
function qrVector(qr: boolean[][] | null, x: number, y: number, size: number, dark = "#000000") {
  const panel = `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.05}" fill="#FFFFFF"/>`;
  if (!qr || !qr.length) return panel + `<text x="${x + size / 2}" y="${y + size / 2 + 3}" text-anchor="middle" font-family="Instrument Sans" font-size="8" fill="#64748B">QR code</text>`;
  const n = qr.length, quiet = 2, cell = size / (n + quiet * 2);
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr[r][c]) d += `M${(x + (c + quiet) * cell).toFixed(2)} ${(y + (r + quiet) * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
  return panel + `<path d="${d}" fill="${dark}"/>`;
}

const MONO = `font-family="JetBrains Mono"`;
const SANS = `font-family="Instrument Sans"`;
const DISP = `font-family="Unbounded" font-weight="800"`;

function printFields(t: TicketTemplate, d: PrintData): [string, string][] {
  const out: [string, string][] = [];
  if (t.fields.date) out.push(["DATE", d.dateText]);
  if (t.fields.doors) out.push(["DOORS", d.doorsText]);
  if (t.fields.venue) out.push(["VENUE", d.city && d.venue.length + d.city.length < 24 ? `${d.venue}, ${d.city}` : d.venue]);
  if (t.fields.type) out.push(["TICKET", d.typeName]);
  if (d.zone) out.push(["ZONE", d.zone]);
  if (t.fields.price) out.push(["PRICE", d.priceText]);
  if (t.fields.holder && d.holder) out.push(["NAME", d.holder]);
  if (t.fields.order && d.orderText) out.push(["ORDER", d.orderText]);
  return out;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A printed ticket as SVG in points. `qr` is the QR module matrix (true = dark). */
export function printTicketSvg(template: TicketTemplate, d: PrintData, qr: boolean[][] | null, o: PrintOptions) {
  const t = normalizeTemplate(template);
  const { w, h } = PRINT_SIZES[o.format];
  const micro = `${t.brand || "NEPTHIC"} · ${d.eventName} · ${d.code} · `.toUpperCase();
  const fine = t.finePrint;
  const fields = printFields(t, d);
  const head = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;

  if (o.format === "thermal") {
    // Receipt printers are black only: no fills, generous contrast.
    const lines = wrap(t.headline || d.eventName, 18, 2);
    let y = 30;
    let s = `${head}<rect width="${w}" height="${h}" fill="#FFFFFF"/>`
      + `<text x="${w / 2}" y="${y}" text-anchor="middle" ${MONO} font-size="8" letter-spacing="2" fill="#000">${esc(t.brand.toUpperCase())}</text>`;
    y += 24;
    s += `<text x="${w / 2}" y="${y}" text-anchor="middle" ${DISP} font-size="15" fill="#000">${lines.map((l, i) => `<tspan x="${w / 2}" dy="${i ? 18 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
    y += 18 * (lines.length - 1) + 14;
    s += `<path d="M14 ${y}H${w - 14}" stroke="#000" stroke-width="0.6" stroke-dasharray="2 2"/>`;
    y += 16;
    for (const [k, v] of fields.slice(0, 6)) {
      s += `<text x="16" y="${y}" ${MONO} font-size="6.5" fill="#000">${k}</text><text x="${w - 16}" y="${y}" text-anchor="end" ${SANS} font-size="9" font-weight="600" fill="#000">${esc(cut(v, 30))}</text>`;
      y += 15;
    }
    y += 4;
    s += qrVector(qr, (w - 150) / 2, y, 150);
    y += 150 + 14;
    s += `<text x="${w / 2}" y="${y}" text-anchor="middle" ${MONO} font-size="11" font-weight="600" fill="#000">${esc(d.code)}</text>`;
    y += 13;
    if (d.serial) { s += `<text x="${w / 2}" y="${y}" text-anchor="middle" ${MONO} font-size="7" fill="#000">No. ${esc(d.serial)} · ADMIT ONE</text>`; y += 11; }
    if (d.partnerLabel) { s += `<text x="${w / 2}" y="${y}" text-anchor="middle" ${SANS} font-size="7" fill="#000">${esc(d.partnerLabel)}</text>`; y += 11; }
    if (fine) s += `<text x="${w / 2}" y="${y + 4}" text-anchor="middle" ${SANS} font-size="5.5" fill="#000">${wrap(fine, 62, 3).map((l, i) => `<tspan x="${w / 2}" dy="${i ? 7 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
    if (o.microtext !== false) s += `<text x="${w / 2}" y="${h - 8}" text-anchor="middle" ${MONO} font-size="2" fill="#000">${esc(micro.repeat(4).slice(0, 150))}</text>`;
    return s + "</svg>";
  }

  // Stub: 396 × 144 pt. Main panel on the left, perforated stub with the QR on the right.
  const perf = 262;
  const left = o.banner ? 92 : 14;
  const lines = wrap(t.headline || d.eventName, o.banner ? 17 : 22, 2);
  let s = `${head}<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient>`
    + `<clipPath id="ban"><rect x="0" y="0" width="80" height="${h}"/></clipPath></defs>`
    + `<rect width="${w}" height="${h}" fill="url(#g)"/>`
    + (o.pattern !== false ? guilloche(o.seed, w, h, t.accent, 0.5) : "")
    + (o.banner ? `<image href="${esc(o.banner)}" xlink:href="${esc(o.banner)}" x="0" y="0" width="80" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ban)"/>` : "")
    + `<text x="${left}" y="20" ${MONO} font-size="6" letter-spacing="1.6" fill="${t.accent}">${esc(t.brand.toUpperCase())}</text>`
    + `<text x="${left}" y="${lines.length > 1 ? 36 : 40}" ${DISP} font-size="${lines.length > 1 ? 13 : 15}" fill="${t.ink}">${lines.map((l, i) => `<tspan x="${left}" dy="${i ? 15 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
  const colW = (perf - 10 - left) / 2;
  fields.slice(0, 6).forEach(([k, v], i) => {
    const x = left + (i % 2) * colW, y = 66 + Math.floor(i / 2) * 20;
    s += `<text x="${x}" y="${y}" ${MONO} font-size="4.6" letter-spacing="0.8" fill="${t.accent}">${k}</text>`
      + `<text x="${x}" y="${y + 9}" ${SANS} font-size="7.6" font-weight="600" fill="${t.ink}">${esc(cut(v, o.banner ? 21 : 26))}</text>`;
  });
  if (fine) s += `<text x="${left}" y="${h - 14}" ${SANS} font-size="4.2" fill="${t.ink}" opacity="0.75">${wrap(fine, o.banner ? 70 : 90, 2).map((l, i) => `<tspan x="${left}" dy="${i ? 5 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
  if (o.hologram !== false) s += `<rect x="${perf - 50}" y="${h - 44}" width="40" height="24" rx="3" fill="none" stroke="${t.ink}" stroke-opacity="0.6" stroke-width="0.6" stroke-dasharray="1.5 1.5"/>`
    + `<text x="${perf - 30}" y="${h - 30}" text-anchor="middle" ${MONO} font-size="3.6" fill="${t.ink}" opacity="0.7">HOLOGRAM</text>`;
  if (o.microtext !== false) s += `<text x="${left}" y="${h - 3}" ${MONO} font-size="1.6" fill="${t.ink}" opacity="0.7">${esc(micro.repeat(6).slice(0, 260))}</text>`;
  s += `<path d="M${perf} 4V${h - 4}" stroke="${t.ink}" stroke-opacity="0.5" stroke-width="0.7" stroke-dasharray="1 3"/>`
    + `<rect x="${perf}" y="0" width="${w - perf}" height="${h}" fill="#000000" opacity="0.18"/>`
    + qrVector(qr, perf + 19, 8, 96)
    + `<text x="${perf + 67}" y="116" text-anchor="middle" ${MONO} font-size="7" font-weight="600" fill="${t.ink}">${esc(d.code)}</text>`
    + `<text x="${perf + 67}" y="126" text-anchor="middle" ${MONO} font-size="5" letter-spacing="0.6" fill="${t.accent}">${d.serial ? `No. ${esc(d.serial)} · ` : ""}ADMIT ONE</text>`
    + (d.partnerLabel ? `<text x="${perf + 67}" y="136" text-anchor="middle" ${SANS} font-size="4.8" fill="${t.ink}" opacity="0.85">${esc(cut(d.partnerLabel, 40))}</text>` : "");
  return s + "</svg>";
}
