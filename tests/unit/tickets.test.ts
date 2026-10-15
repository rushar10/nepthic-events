import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { newQrId, newTicketCode, parsePayload, signCode, ticketPayload } from "../../core/ticket-codes";
import {
  checkCharFor, checkCharOk, codeKey, composeCode, defaultFormat, formatProblems, formatWarnings, normalizeFormat, prefixFor, scopeKey,
} from "../../core/ticket-code-format";

const SECRET = "test-secret";

test("legacy readable codes are unique", () => {
  assert.equal(new Set(Array.from({ length: 5000 }, newTicketCode)).size, 5000);
});

test("QR ids are random and the signed payload round-trips", () => {
  assert.equal(new Set(Array.from({ length: 5000 }, newQrId)).size, 5000);
  const id = newQrId();
  assert.deepEqual(parsePayload(ticketPayload(id, SECRET), SECRET), { kind: "qr", qrId: id, signatureOk: true });
});

test("edited QR ids, wrong secrets and v1 signatures replayed as v2 all fail", () => {
  const id = "ABCDEFGHJKLMNPQRSTUV";
  const p = ticketPayload(id, SECRET);
  assert.equal((parsePayload(p.replace("ABCD", "ABCE"), SECRET) as { signatureOk: boolean }).signatureOk, false);
  assert.equal((parsePayload(p, "other-secret") as { signatureOk: boolean }).signatureOk, false);
  assert.equal((parsePayload(`NPT2:${id}:${signCode(id, SECRET)}`, SECRET) as { signatureOk: boolean }).signatureOk, false);
});

test("earlier NPT1 tickets still verify", () => {
  const code = "NPT-ACDE-FGHJ";
  const legacy = `NPT1:${code}:${crypto.createHmac("sha256", SECRET).update(code).digest("base64url").slice(0, 22)}`;
  assert.deepEqual(parsePayload(legacy, SECRET), { kind: "legacy", code, signatureOk: true });
});

test("typed codes are normalised", () => {
  assert.deepEqual(parsePayload(" nep-vip-000123 ", SECRET), { kind: "typed", code: "NEP-VIP-000123" });
  assert.equal(codeKey("nep-vip / 000 123"), "NEPV1P000123");
  assert.equal(codeKey("NEP-V1P-OOO123"), codeKey("nep vip 000123"), "O/0 and I/1 fold together");
});

test("codes follow the format: parts, separator, padding", () => {
  const f = normalizeFormat({ ...defaultFormat("NEP"), parts: ["brand", "type"], separator: "-", padding: 6 });
  assert.equal(composeCode(f, { typePrefix: "VIP" }, 123), "NEP-VIP-000123");
  const g = normalizeFormat({ parts: ["brand", "partner"], brand: "NYE26", separator: "/", padding: 4, avoidAmbiguous: false });
  assert.equal(composeCode(g, { partnerCode: "P012" }, 457), "NYE26/P012/0457");
  const h = normalizeFormat({ parts: ["type"], brand: "", separator: "", padding: 5 });
  assert.equal(composeCode(h, { typePrefix: "GA" }, 89), "GA00089");
  assert.equal(prefixFor(normalizeFormat({ parts: ["brand", "date"], brand: "NEP", dateStyle: "MMDD" }), { date: new Date("2026-12-31T05:00:00Z") }), "NEP-1231");
});

test("per-type and per-partner overrides win", () => {
  const f = normalizeFormat({ parts: ["brand", "type", "partner"], brand: "NEP", typePrefixes: { t1: "EB" }, partnerPrefixes: { p1: "TKTEK" } });
  assert.equal(composeCode(f, { typeId: "t1", typePrefix: "GA", partnerId: "p1", partnerCode: "P012" }, 1), "NEP-EB-TKTEK-000001");
  assert.equal(composeCode(f, { typeId: "t2", typePrefix: "GA" }, 1), "NEP-GA-000001");
});

test("check character catches single typos and swaps", () => {
  const f = normalizeFormat({ ...defaultFormat("NEP"), checkChar: true });
  const code = composeCode(f, { typePrefix: "VIP" }, 1001);
  assert.ok(checkCharOk(code));
  assert.ok(!checkCharOk(code.slice(0, -2) + (code.at(-2) === "1" ? "2" : "1") + code.at(-1)));
  assert.ok(!checkCharOk(code.replace("1001", "1010")));
  for (let i = 0; i < 2000; i++) assert.ok(!/[OI]/.test(checkCharFor(`NEP${i}`)));
});

test("scopes and problems", () => {
  const f = normalizeFormat({ scope: "PARTNER" });
  assert.equal(scopeKey(f, { partnerId: "p1" }), "partner:p1");
  assert.equal(scopeKey(normalizeFormat({ scope: "TYPE" }), { typeId: "t" }), "type:t");
  assert.deepEqual(formatProblems(normalizeFormat({ brand: "BOOM", avoidAmbiguous: true })), [], "O/I is advice, not a blocker");
  assert.ok(formatWarnings(normalizeFormat({ brand: "BOOM", avoidAmbiguous: true })).length === 1);
  assert.ok(formatWarnings(normalizeFormat({ brand: "BOOM", avoidAmbiguous: false })).length === 0);
  assert.ok(formatProblems(normalizeFormat({ brand: "ABCDEFGHJKLMNPQRSTUVWXYZ" })).some((p) => p.includes("up to 20")));
  assert.ok(formatProblems(normalizeFormat({ mode: "RANDOM", padding: 3 })).some((p) => p.includes("Random")));
  assert.deepEqual(formatProblems(defaultFormat("NEP")), []);
});
