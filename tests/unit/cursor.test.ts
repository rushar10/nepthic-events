import { test } from "node:test";
import assert from "node:assert/strict";
import { blendColor, edgeDistance, lerpFactor, magnetOffset, parseColor } from "../../ui/cursor/engine";

test("colours parse from hex and rgb()", () => {
  assert.deepEqual(parseColor("#F472B6"), [244, 114, 182]);
  assert.deepEqual(parseColor("#fff"), [255, 255, 255]);
  assert.deepEqual(parseColor("rgb(1, 2, 3)"), [1, 2, 3]);
  assert.deepEqual(parseColor("rgb(10 20 30 / .5)"), [10, 20, 30]);
  assert.equal(parseColor("oklch(70% .1 200)"), null);
});

test("ring trail covers the set share per 60fps frame, independent of frame rate", () => {
  assert.ok(Math.abs(lerpFactor(0.18, 1000 / 60) - 0.18) < 1e-9);
  // two 120fps frames move as far as one 60fps frame
  const half = lerpFactor(0.18, 1000 / 120);
  assert.ok(Math.abs(1 - (1 - half) ** 2 - 0.18) < 1e-9);
  assert.equal(lerpFactor(1, 16), 1);
});

test("colour blends from base to the panel accent with distance", () => {
  const base: [number, number, number] = [0, 0, 0];
  const pink: [number, number, number] = [240, 100, 180];
  assert.deepEqual(blendColor(base, [{ color: pink, distance: 300 }], 220), base); // out of range
  assert.deepEqual(blendColor(base, [{ color: pink, distance: 0 }], 220), pink);   // on the panel
  const mid = blendColor(base, [{ color: pink, distance: 110 }], 220);
  assert.ok(mid[0] > 0 && mid[0] < 240);
  // between two panels: normalised, never brighter than either
  const both = blendColor(base, [{ color: [200, 0, 0], distance: 0 }, { color: [0, 0, 200], distance: 0 }], 220);
  assert.deepEqual(both, [100, 0, 100]);
});

test("magnet leans at most the set number of pixels, toward the pointer", () => {
  const r = { left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 };
  assert.deepEqual(magnetOffset(r, 100, 50, 6), [0, 0]);
  assert.deepEqual(magnetOffset(r, 200, 100, 6), [6, 6]);
  assert.deepEqual(magnetOffset(r, 50, 50, 6), [-3, 0]);
  assert.equal(edgeDistance(r, 250, 50), 50);
});
