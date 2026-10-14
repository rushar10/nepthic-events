import { DOOR_ROLES, requireUser } from "@/core/auth";
import { canSee, type Section } from "./guard";
import { pendingCounts } from "./counts";

export type AdminNavItem = { href: string; label: string; badge?: number; section: Section; icon: string };
export type RailItem = { href: string; label: string; icon: string; badge?: number; match?: string[] };

const ALL = (p: Awaited<ReturnType<typeof pendingCounts>>): AdminNavItem[] => [
  { section: "overview", href: "/admin", label: "Overview", icon: "chart" },
  { section: "events", href: "/admin/events", label: "Events", icon: "ticket" },
  { section: "refunds", href: "/admin/refunds", label: "Refunds", icon: "undo", badge: p.refunds },
  { section: "checkin", href: "/admin/checkin", label: "Check-in", icon: "scan" },
  { section: "customers", href: "/admin/customers", label: "Customers", icon: "users" },
  { section: "payments", href: "/admin/payments", label: "Payments", icon: "card" },
  { section: "settings", href: "/admin/settings", label: "Settings", icon: "cog" },
];

/** Every section the role can open (the phone "More" menu lists these). */
export async function adminNav() {
  const user = await requireUser(DOOR_ROLES, "/admin/login");
  const p = await pendingCounts();
  return { user, p, items: ALL(p).filter((i) => canSee(user.role, i.section)) };
}

/** The floating icon rail and the phone bottom bar. Events only. */
export async function railNav() {
  const { user, p, items } = await adminNav();
  const pick = (s: Section) => items.find((i) => i.section === s);
  const toRail = (i?: AdminNavItem): RailItem | null => (i ? { href: i.href, label: i.label, icon: i.icon, badge: i.badge, match: i.section === "events" ? ["/admin/events"] : undefined } : null);
  const main = (["overview", "events", "checkin", "customers", "payments"] as Section[]).map((s) => toRail(pick(s))).filter(Boolean) as RailItem[];
  const admin = (["refunds", "settings"] as Section[]).map((s) => toRail(pick(s))).filter(Boolean) as RailItem[];
  const bottom = user.role === "DOOR"
    ? [{ href: "/admin/checkin", label: "Check-in", icon: "scan" }, { href: "/door", label: "Scanner", icon: "ticket" }, { href: "/admin/more", label: "More", icon: "menu" }]
    : [
        { href: "/admin", label: "Overview", icon: "chart" },
        { href: "/admin/events", label: "Events", icon: "ticket", match: ["/admin/events"] },
        { href: "/admin/refunds", label: "Refunds", icon: "undo", badge: p.refunds },
        { href: "/admin/checkin", label: "Check-in", icon: "scan" },
        { href: "/admin/more", label: "More", icon: "menu" },
      ];
  return { user, p, main, admin, bottom };
}
