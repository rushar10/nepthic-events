import crypto from "node:crypto";

/* QR payloads and signatures. Kept free of database imports so they can be unit tested.

   NPT2:<qrId>:<signature>  current. qrId is a random id stored on the ticket and never printed;
                            the signature is an HMAC of it, so an edited or invented QR fails
                            before the database is even checked. Event, partner and status are
                            looked up on the server, never read from the QR.
   NPT1:<code>:<signature>  earlier tickets (signed readable code); still accepted.
   anything else            a code typed by door staff (matched without separators). */

const ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679"; // no 0/O, 1/I/L, 2/Z, 5/S, 8/B

function randomFrom(alphabet: string, n: number) {
  const bytes = crypto.randomBytes(n);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

/** Legacy random readable code (used when an event has no code format yet in tests). */
export function newTicketCode() {
  const s = randomFrom(ALPHABET, 8);
  return `NPT-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** The QR's random id (20 chars, ~93 bits). */
export const newQrId = () => randomFrom("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 20);

export function signCode(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url").slice(0, 22);
}

/** QR payload for a ticket's qrId. */
export function ticketPayload(qrId: string, secret: string) {
  return `NPT2:${qrId}:${signCode(`v2|${qrId}`, secret)}`;
}

export type ParsedPayload =
  | { kind: "qr"; qrId: string; signatureOk: boolean }
  | { kind: "legacy"; code: string; signatureOk: boolean }
  | { kind: "typed"; code: string };

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Accepts a scanned QR payload, or a code typed by door staff. */
export function parsePayload(raw: string, secret: string): ParsedPayload {
  const input = raw.trim();
  if (input.startsWith("NPT2:")) {
    const [, qrId = "", sig = ""] = input.split(":");
    return { kind: "qr", qrId, signatureOk: safeEqual(sig, signCode(`v2|${qrId}`, secret)) };
  }
  if (input.startsWith("NPT1:")) {
    const [, code = "", sig = ""] = input.split(":");
    return { kind: "legacy", code: code.toUpperCase(), signatureOk: safeEqual(sig, signCode(code, secret)) };
  }
  return { kind: "typed", code: input.toUpperCase().replace(/\s+/g, "") };
}
