import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, DEFAULT_TEMPLATE, LAYOUTS, normalizeTemplate, PRESETS, SAMPLE_DATA, ticketSvg } from "../../core/ticket-design";

test("templates from forms are cleaned: bad colours, layouts and long text fall back or are cut", () => {
  const t = normalizeTemplate({ name: "  X  ", layout: "nope" as never, bg: "red", ink: "#ffffff", brand: "B".repeat(99), fields: { price: true } as never });
  assert.equal(t.name, "X");
  assert.equal(t.layout, DEFAULT_TEMPLATE.layout);
  assert.equal(t.bg, DEFAULT_TEMPLATE.bg);
  assert.equal(t.ink, "#ffffff");
  assert.equal(t.brand.length, 30);
  assert.equal(t.fields.price, true);
  assert.equal(t.fields.date, DEFAULT_TEMPLATE.fields.date);
});

test("every layout and preset renders, with the QR on a white panel", () => {
  for (const l of LAYOUTS) {
    const svg = ticketSvg({ ...DEFAULT_TEMPLATE, layout: l.key }, SAMPLE_DATA, "data:image/png;base64,AAAA");
    assert.match(svg, new RegExp(`viewBox="0 0 ${l.w} ${l.h}"`));
    assert.match(svg, /fill="#FFFFFF"/);
    assert.match(svg, /<image href="data:image\/png;base64,AAAA"/);
  }
  for (const p of PRESETS) assert.ok(contrast(p.design.ink, p.design.bg) >= 4.5, `${p.label} text contrast`);
});

test("ticket details are escaped (names can't inject markup)", () => {
  const svg = ticketSvg(DEFAULT_TEMPLATE, { ...SAMPLE_DATA, holder: `<script>alert(1)</script>`, eventName: `"><img src=x onerror=alert(1)>` }, null);
  assert.ok(!svg.includes("<script>") && !svg.includes("<img"));
  assert.ok(svg.includes("&lt;script&gt;"));
});

test("refunded tickets have no QR and are stamped; used tickets are stamped", () => {
  const refunded = ticketSvg(DEFAULT_TEMPLATE, { ...SAMPLE_DATA, status: "REFUNDED" }, null);
  assert.ok(!refunded.includes("<image") && refunded.includes("REFUNDED") && refunded.includes("No longer valid"));
  assert.ok(ticketSvg(DEFAULT_TEMPLATE, { ...SAMPLE_DATA, status: "USED" }, "data:x").includes("CHECKED IN"));
});

test("contrast", () => {
  assert.equal(Math.round(contrast("#000000", "#FFFFFF")), 21);
  assert.equal(contrast("#777777", "#777777"), 1);
});

/* ---- Canva artwork ---- */
import { ART_QR_MIN, defaultArtSide, normalizeArt, printTicketSvg } from "../../core/ticket-design";
const ID = "11111111-2222-4333-8444-555555555555";

test("artwork: bad ids, tiny QRs and off-canvas positions are cleaned; the code is always shown", () => {
  assert.deepEqual(normalizeArt({ eticket: { uploadId: "../etc/passwd", w: 1080, h: 1920 } }), { eticket: null, stub: null });
  const a = normalizeArt({
    eticket: { ...defaultArtSide("eticket", ID, 1080, 1920), qr: { x: 5, y: -2, size: 0.05 }, text: { code: { on: false }, holder: { color: "red", x: 9 } } },
    stub: { ...defaultArtSide("stub", ID, 1725, 675), qr: { x: 0.99, y: 0.99, size: 0.1 } },
  });
  assert.equal(a.eticket!.qr.size, ART_QR_MIN.eticket);
  assert.ok(a.eticket!.qr.x <= 1 && a.eticket!.qr.y === 0);
  assert.equal(a.eticket!.text.code.on, true);
  assert.equal(a.eticket!.text.holder.color, "#FFFFFF");
  assert.equal(a.eticket!.text.holder.x, 1);
  assert.equal(a.stub!.qr.size, ART_QR_MIN.stub);
  // QR stays fully on the ticket: 0.375 × 144 pt = 54 pt square on a 396 × 144 pt stub
  assert.ok(a.stub!.qr.x * 396 + 54 <= 396.01 && a.stub!.qr.y * 144 + 54 <= 144.01);
});

test("artwork e-ticket: uses the artwork, keeps the QR on white, escapes details; falls back without an image", () => {
  const tpl = normalizeTemplate({ ...DEFAULT_TEMPLATE, art: { eticket: defaultArtSide("eticket", ID, 1080, 1920), stub: null } });
  const svg = ticketSvg(tpl, { ...SAMPLE_DATA, holder: `<script>x</script>` }, "data:image/png;base64,QR", { art: () => "/api/uploads/" + ID });
  assert.ok(svg.includes(`href="/api/uploads/${ID}"`) && svg.includes('fill="#FFFFFF"') && svg.includes("data:image/png;base64,QR"));
  assert.ok(svg.includes(SAMPLE_DATA.code) && !svg.includes("<script>"));
  assert.ok(/viewBox="0 0 1000 1778"/.test(svg));
  // No resolver (or a missing image) → the generated design
  assert.ok(!ticketSvg(tpl, SAMPLE_DATA, "data:x").includes("/api/uploads/"));
  assert.ok(!ticketSvg(tpl, SAMPLE_DATA, "data:x", { art: () => null }).includes("/api/uploads/"));
});

test("artwork stub: vector QR + serial + partner over the artwork; PDF mode leaves the image out", () => {
  const tpl = normalizeTemplate({ ...DEFAULT_TEMPLATE, art: { eticket: null, stub: defaultArtSide("stub", ID, 1725, 675) } });
  const m = [[true, false], [false, true]];
  const d = { ...SAMPLE_DATA, serial: "000457", partnerLabel: "Sold by: Halftone / P012" };
  const preview = printTicketSvg(tpl, d, m, { format: "stub", seed: "e1", art: (id) => `/files/events/${id}` });
  assert.ok(preview.includes(`/files/events/${ID}`) && preview.includes("No. 000457") && preview.includes("P012") && preview.includes("<path d=\"M"));
  const pdf = printTicketSvg(tpl, d, m, { format: "stub", seed: "e1", art: () => "", artLayer: false });
  assert.ok(!pdf.includes("<image") && pdf.includes(SAMPLE_DATA.code));
  // Thermal is always generated (black only)
  assert.ok(!printTicketSvg(tpl, d, m, { format: "thermal", seed: "e1", art: () => "x" }).includes("<image"));
});
