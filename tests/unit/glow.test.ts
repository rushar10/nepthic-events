import { test } from "node:test";
import assert from "node:assert/strict";
import { approach, CURVES, edgeDistance, intensityAt } from "../../ui/glow/engine";

const card = { left: 100, top: 100, right: 300, bottom: 200, width: 200, height: 100 };

test("distance is measured to the nearest edge, 0 inside", () => {
  assert.equal(edgeDistance(card, 150, 150), 0);
  assert.equal(edgeDistance(card, 50, 150), 50);         // left of the card
  assert.equal(edgeDistance(card, 200, 260), 60);        // below
  assert.equal(edgeDistance(card, 330, 240), 50);        // corner: 30-40-50 triangle
});

test("intensity is 0 at the radius edge and 1 on the element", () => {
  assert.equal(intensityAt(150, 150), 0);
  assert.equal(intensityAt(400, 150), 0);
  assert.equal(intensityAt(0, 150), 1);
});

test("ease-out rises quickly then softens; every curve stays in 0..1 and increases", () => {
  assert.ok(intensityAt(75, 150, "ease-out") > intensityAt(75, 150, "linear"));
  assert.ok(intensityAt(75, 150, "ease-in") < intensityAt(75, 150, "linear"));
  for (const c of Object.keys(CURVES) as (keyof typeof CURVES)[]) {
    let prev = -1;
    for (let d = 150; d >= 0; d -= 5) {
      const v = intensityAt(d, 150, c);
      assert.ok(v >= 0 && v <= 1, `${c} out of range at ${d}`);
      assert.ok(v >= prev, `${c} not increasing at ${d}`);
      prev = v;
    }
  }
});

test("fade reaches ~95% of the target after the fade time, and settles exactly", () => {
  let v = 0;
  for (let t = 0; t < 250; t += 16) v = approach(v, 1, 16, 250);
  assert.ok(v > 0.93 && v <= 1, String(v));
  for (let i = 0; i < 60; i++) v = approach(v, 1, 16, 250);
  assert.equal(v, 1);
  assert.equal(approach(0.3, 1, 16, 0), 1); // fade 0 = instant
});
