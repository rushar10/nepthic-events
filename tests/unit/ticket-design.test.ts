import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, DEFAULT_TEMPLATE, LAYOUTS, normalizeTemplate, PRESETS, SAMPLE_DATA, ticketSvg } from "../../core/ticket-design";

test("templates from forms are cleaned: bad colours, layouts and long text fall back or are cut", () => {
  const t = normalizeTemplate({ name: "  X  ", layout: "nope" as never, bg: "red", ink: "#ffffff", brand: "B".repeat(99), fields: { price: true } });
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
