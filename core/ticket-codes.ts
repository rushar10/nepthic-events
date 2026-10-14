import crypto from "node:crypto";

/* Ticket codes and signatures. Kept free of database imports so they can be unit tested.
   The QR payload is NPT1:<code>:<signature>. The signature is an HMAC of the code,
   so a forged or edited code fails before the database is even checked. */

const ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679"; // no 0/O, 1/I/L, 2/Z, 5/S, 8/B

export function newTicketCode() {
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `NPT-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function signCode(code: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(code).digest("base64url").slice(0, 22);
}

export function ticketPayload(code: string, secret: string) {
  return `NPT1:${code}:${signCode(code, secret)}`;
}

export type ParsedPayload = { code: string; signed: boolean; signatureOk: boolean };

/** Accepts a scanned QR payload, or a code typed by door staff. */
export function parsePayload(raw: string, secret: string): ParsedPayload {
  const input = raw.trim();
  if (input.startsWith("NPT1:")) {
    const [, code = "", sig = ""] = input.split(":");
    const expected = signCode(code, secret);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    const signatureOk = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { code: code.toUpperCase(), signed: true, signatureOk };
  }
  return { code: input.toUpperCase().replace(/\s+/g, ""), signed: false, signatureOk: false };
}
