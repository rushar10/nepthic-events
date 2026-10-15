/* ---------------------------------------------------------------------------
   Readable ticket codes: the code printed under the QR and typed at the door when a QR is
   damaged, e.g. NEP-VIP-000123, NYE26/P012/0457, GA00089.

   Pure functions, no database: the Events site issues codes with them, and the same file is
   copied into the Admin Portal (portal/core/ticket-code-format.ts) for the live preview.

   The readable code is for people. The QR carries a separate signed random id, so guessing or
   typing a sequential number never produces a valid QR.
--------------------------------------------------------------------------- */

export type CodePart = "brand" | "type" | "partner" | "date";
export type CodeSeparator = "-" | "/" | "";
export type DateStyle = "YYYY" | "YY" | "MMDD" | "YYMMDD";
export type CodeScope = "EVENT" | "TYPE" | "PARTNER";
export type CodeMode = "SEQUENTIAL" | "RANDOM";

export type CodeFormat = {
  /** Prefix parts in order. Empty parts are skipped (e.g. "partner" on a non-partner ticket). */
  parts: CodePart[];
  brand: string;
  separator: CodeSeparator;
  dateStyle: DateStyle;
  start: number;
  /** Digits in the number, zero-padded. */
  padding: number;
  increment: number;
  scope: CodeScope;
  mode: CodeMode;
  /** One extra character at the end that catches typos when codes are typed in. */
  checkChar: boolean;
  /** Refuse O and I in prefixes (they're read as 0 and 1). */
  avoidAmbiguous: boolean;
  /** Per ticket type: prefix override (else the type's own prefix). */
  typePrefixes: Record<string, string>;
  /** Per partner: prefix override (else the partner code). */
  partnerPrefixes: Record<string, string>;
};

export type CodeContext = {
  typeId?: string; typePrefix?: string;
  partnerId?: string | null; partnerCode?: string | null;
  date?: Date;
};

export const PREFIX_MAX = 20;
export const PART_LABELS: Record<CodePart, string> = { brand: "Brand / event", type: "Ticket type", partner: "Partner", date: "Date" };
export const SCOPE_LABELS: Record<CodeScope, string> = { EVENT: "One sequence for the whole event", TYPE: "A sequence per ticket type", PARTNER: "A sequence per partner" };

export function defaultFormat(brand = "NEP"): CodeFormat {
  return {
    parts: ["brand", "type"], brand, separator: "-", dateStyle: "YYYY", start: 1, padding: 6, increment: 1,
    scope: "EVENT", mode: "SEQUENTIAL", checkChar: false, avoidAmbiguous: true, typePrefixes: {}, partnerPrefixes: {},
  };
}

const clean = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const int = (v: unknown, d: number) => { const n = Number.parseInt(String(v ?? ""), 10); return Number.isFinite(n) ? n : d; };
const PARTS: CodePart[] = ["brand", "type", "partner", "date"];

/** A format from a form or the database, with unknown values replaced by defaults. */
export function normalizeFormat(f: Partial<CodeFormat> | null | undefined, brand = "NEP"): CodeFormat {
  const d = defaultFormat(brand);
  if (!f) return d;
  const parts = Array.isArray(f.parts) ? f.parts.filter((p, i, a): p is CodePart => PARTS.includes(p as CodePart) && a.indexOf(p) === i) : d.parts;
  const map = (m: unknown) => Object.fromEntries(Object.entries((m ?? {}) as Record<string, unknown>).map(([k, v]) => [k, clean(v)]).filter(([, v]) => v));
  return {
    parts,
    brand: f.brand === undefined ? d.brand : clean(f.brand),
    separator: (["-", "/", ""] as const).find((x) => x === f.separator) ?? d.separator,
    dateStyle: (["YYYY", "YY", "MMDD", "YYMMDD"] as const).find((x) => x === f.dateStyle) ?? d.dateStyle,
    start: Math.max(0, int(f.start, d.start)),
    padding: Math.min(9, Math.max(1, int(f.padding, d.padding))),
    increment: Math.min(1000, Math.max(1, int(f.increment, d.increment))),
    scope: (["EVENT", "TYPE", "PARTNER"] as const).find((x) => x === f.scope) ?? d.scope,
    mode: f.mode === "RANDOM" ? "RANDOM" : "SEQUENTIAL",
    checkChar: !!f.checkChar,
    avoidAmbiguous: f.avoidAmbiguous === undefined ? d.avoidAmbiguous : !!f.avoidAmbiguous,
    typePrefixes: map(f.typePrefixes),
    partnerPrefixes: map(f.partnerPrefixes),
  };
}

function dateText(d: Date, style: DateStyle) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d).map((p) => [p.type, p.value]));
  const { year = "2026", month = "01", day = "01" } = parts as Record<string, string>;
  return style === "YYYY" ? year : style === "YY" ? year.slice(2) : style === "MMDD" ? month + day : year.slice(2) + month + day;
}

/** The ticket-type part: the override, else the type's own prefix, else its initials. */
export function typePart(f: CodeFormat, ctx: CodeContext) {
  return (ctx.typeId && f.typePrefixes[ctx.typeId]) || clean(ctx.typePrefix);
}

export function prefixFor(f: CodeFormat, ctx: CodeContext) {
  const pieces = f.parts.map((p) =>
    p === "brand" ? f.brand
      : p === "type" ? typePart(f, ctx)
        : p === "partner" ? (ctx.partnerId && f.partnerPrefixes[ctx.partnerId]) || clean(ctx.partnerCode)
          : dateText(ctx.date ?? new Date(), f.dateStyle),
  ).filter(Boolean);
  return pieces.join(f.separator);
}

const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Check character: weighted mod-36 over the code's letters and digits (catches single typos and most swaps). */
export function checkCharFor(body: string) {
  const chars = clean(body);
  let sum = 0;
  for (let i = 0; i < chars.length; i++) sum += ALNUM.indexOf(chars[i]) * (chars.length - i + 1);
  const c = ALNUM[sum % 36];
  return c === "O" ? "X" : c === "I" ? "Y" : c; // never print the ambiguous letters
}

/** True if a typed code's last character is the right check character. */
export function checkCharOk(code: string) {
  const c = clean(code);
  if (c.length < 2) return false;
  return checkCharFor(c.slice(0, -1)) === c.slice(-1);
}

export function composeCode(f: CodeFormat, ctx: CodeContext, n: number) {
  const prefix = prefixFor(f, ctx);
  const num = String(n).padStart(f.padding, "0");
  const body = prefix ? `${prefix}${f.separator}${num}` : num;
  return f.checkChar ? `${body}${checkCharFor(body)}` : body;
}

/** Separators and spaces removed: how codes are matched when typed. */
/** Letters O and I are read as 0 and 1, so the key folds them: "NEP-VIP-0O1" matches "nepv1p001". */
export const codeKey = (code: string) => clean(code).replace(/O/g, "0").replace(/I/g, "1");

/** Which number sequence a ticket draws from. */
export function scopeKey(f: CodeFormat, ctx: CodeContext) {
  return f.scope === "TYPE" ? `type:${ctx.typeId ?? ""}` : f.scope === "PARTNER" ? `partner:${ctx.partnerId ?? "direct"}` : "event";
}

/** Largest number the padding allows (sequences stop there rather than growing a digit). */
export const maxNumber = (f: CodeFormat) => 10 ** f.padding - 1;

/** Problems with a format, as messages for the admin (empty = fine). */
export function formatProblems(f: CodeFormat, ctx: { typePrefixes?: string[]; partnerCodes?: string[] } = {}) {
  const out: string[] = [];
  if (!f.parts.length && !f.brand) out.push("Add at least one prefix part, or a brand prefix.");
  if (f.parts.includes("brand") && !f.brand) out.push("The brand part is on but the brand prefix is empty.");
  const longest = prefixFor(f, { typePrefix: [...(ctx.typePrefixes ?? []), ...Object.values(f.typePrefixes)].sort((a, b) => b.length - a.length)[0] ?? "", partnerCode: [...(ctx.partnerCodes ?? []), ...Object.values(f.partnerPrefixes)].sort((a, b) => b.length - a.length)[0] ?? "" });
  if (longest.length > PREFIX_MAX) out.push(`The prefix can be up to ${PREFIX_MAX} characters; the longest would be ${longest.length} (${longest}).`);
  if (f.start > maxNumber(f)) out.push(`The starting number ${f.start} doesn't fit in ${f.padding} digits.`);
  if (f.mode === "RANDOM" && f.padding < 5) out.push("Random numbers need at least 5 digits, or they run out and become guessable.");
  return out;
}

/** Advice that doesn't block saving: with "avoid confusing letters" on, prefixes that use O or I
    (read as 0 and 1 when typed from a damaged ticket). Generated parts never use them. */
export function formatWarnings(f: CodeFormat, ctx: { typePrefixes?: string[]; partnerCodes?: string[] } = {}) {
  if (!f.avoidAmbiguous) return [];
  const all = [f.brand, ...Object.values(f.typePrefixes), ...Object.values(f.partnerPrefixes), ...(ctx.typePrefixes ?? []), ...(ctx.partnerCodes ?? [])];
  const bad = [...new Set(all.filter((p) => /[OI]/.test(p)))];
  return bad.length ? [`${bad.join(", ")} contain${bad.length === 1 ? "s" : ""} O or I, which people can type as 0 or 1. Typed codes are matched either way, but a letter-free prefix is clearer.`] : [];
}

/** The next few codes, for the live preview. */
export function previewCodes(f: CodeFormat, ctx: CodeContext, from: number, count = 3) {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = f.mode === "RANDOM" ? Number(String(Math.abs(hash(`${i}${f.brand}${f.padding}`))).slice(0, f.padding).padStart(f.padding, "7")) : from + i * f.increment;
    out.push(composeCode(f, ctx, Math.min(n, maxNumber(f))));
  }
  return out;
}
function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h; }
