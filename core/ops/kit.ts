import type { Claims } from "./token";
import type { Access, Level } from "./perms";

/* Small toolkit shared by the admin API operations. */

export type Input = Record<string, unknown>;
export type Actor = Claims & { access: Access };
export type Files = Record<string, File[]>;
export type Op = { level: Level; run: (input: Input, actor: Actor, files: Files) => Promise<unknown> };

/** An expected problem with the request ("already answered", "enter an amount"). Shown to the admin as is. */
export class OpsError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Who did it, as stored in this site's audit log (the portal keeps its own full log too). */
export const actorId = (a: Actor) => `portal:${a.sub}`;
export const actorNote = (a: Actor) => ({ by: a.email, role: a.role });

export const s = (i: Input, k: string) => (i[k] == null ? "" : String(i[k]).trim());
export const n = (i: Input, k: string) => {
  const v = parseInt(String(i[k] ?? ""), 10);
  return Number.isFinite(v) ? v : 0;
};
export const b = (i: Input, k: string) => i[k] === true || i[k] === "on" || i[k] === "true";
/** Dollars ("1,234.50" or 1234.5) to integer cents. */
export const money = (i: Input, k: string) => {
  const v = parseFloat(String(i[k] ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
};
export const ok = (message: string, extra: Record<string, unknown> = {}) => ({ ok: message, ...extra });
