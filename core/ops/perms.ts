import type { Claims } from "./token";
import { SITE_KEY } from "./site";

/* ---------------------------------------------------------------------------
   What each portal role may do on this site. The portal applies the same rules before it
   calls, but this site checks every operation again itself: hiding a button in the portal
   is never what keeps someone out.

     SUPER       manage   everything on every site
     SITE_ADMIN  manage   everything on the sites they're assigned to
     STAFF       operate  day-to-day work on their sites (answer quotes, process orders,
                          edit stock); no approvals, refunds, payments, pricing or settings
     DOOR        door     Events ticket scanning only

   Operations declare the lowest level that may run them:
     view     read-only screens (STAFF and up)
     operate  day-to-day actions (STAFF and up)
     manage   approvals, money, pricing, settings (SITE_ADMIN and SUPER)
     door     ticket scanning (DOOR, STAFF and up)
--------------------------------------------------------------------------- */

export type Level = "view" | "operate" | "manage" | "door";
export type Access = "manage" | "operate" | "door" | "none";

export function accessFor(c: Pick<Claims, "role" | "sites">): Access {
  if (c.role === "SUPER") return "manage";
  if (!c.sites.includes(SITE_KEY)) return "none";
  if (c.role === "SITE_ADMIN") return "manage";
  if (c.role === "STAFF") return "operate";
  if (c.role === "DOOR") return SITE_KEY === "events" ? "door" : "none";
  return "none";
}

export function allowed(access: Access, level: Level) {
  if (access === "manage") return true;
  if (access === "operate") return level !== "manage";
  if (access === "door") return level === "door";
  return false;
}
