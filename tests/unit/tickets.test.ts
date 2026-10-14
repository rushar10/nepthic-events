import { test } from "node:test";
import assert from "node:assert/strict";
import { newTicketCode, parsePayload, ticketPayload } from "../../core/ticket-codes";

const SECRET = "test-secret";

test("ticket codes are readable and unique", () => {
  const codes = new Set(Array.from({ length: 5000 }, newTicketCode));
  assert.equal(codes.size, 5000);
  for (const c of codes) assert.match(c, /^NPT-[ACDEFGHJKMNPQRTUVWXY34679]{4}-[ACDEFGHJKMNPQRTUVWXY34679]{4}$/);
});

test("signed payload round-trips", () => {
  const code = newTicketCode();
  const p = parsePayload(ticketPayload(code, SECRET), SECRET);
  assert.deepEqual(p, { code, signed: true, signatureOk: true });
});

test("edited codes and wrong secrets fail the signature", () => {
  const code = "NPT-ACDE-FGHJ";
  const payload = ticketPayload(code, SECRET);
  assert.equal(parsePayload(payload.replace("ACDE", "ACDF"), SECRET).signatureOk, false);
  assert.equal(parsePayload(payload, "other-secret").signatureOk, false);
});

test("typed codes are accepted unsigned and normalised", () => {
  assert.deepEqual(parsePayload(" npt-acde-fghj ", SECRET), { code: "NPT-ACDE-FGHJ", signed: false, signatureOk: false });
});
