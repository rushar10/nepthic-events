import { redirect } from "next/navigation";
import { DOOR_ROLES, requireUser } from "@/core/auth";
import type { Role } from "@/db";

/* Role-based access for the Events admin.
   ADMIN: everything. STAFF: events, check-in, customers; no refund decisions, payments or settings.
   DOOR: check-in stats only (scanning happens at /door). */

export type Section = "overview" | "events" | "refunds" | "checkin" | "customers" | "payments" | "settings";

const ACCESS: Record<Section, Role[]> = {
  overview: ["STAFF", "ADMIN"],
  events: ["STAFF", "ADMIN"],
  refunds: ["STAFF", "ADMIN"],
  checkin: ["DOOR", "STAFF", "ADMIN"],
  customers: ["STAFF", "ADMIN"],
  payments: ["ADMIN"],
  settings: ["ADMIN"],
};

export const canSee = (role: Role, s: Section) => ACCESS[s].includes(role);

/** Page guard: signed in as Events staff, and allowed into this section. */
export async function guard(section: Section) {
  const user = await requireUser(DOOR_ROLES, "/admin/login");
  if (!canSee(user.role, section)) redirect(user.role === "DOOR" ? "/admin/checkin" : "/admin/forbidden");
  return user;
}

/** Action guard for decisions only admins may make (refunds, money, settings). */
export async function requireAdmin() {
  const user = await requireUser(DOOR_ROLES, "/admin/login");
  if (user.role !== "ADMIN") throw new Error("Only an admin can do that.");
  return user;
}
export async function requireStaff() {
  const user = await requireUser(DOOR_ROLES, "/admin/login");
  if (user.role !== "ADMIN" && user.role !== "STAFF") throw new Error("Only staff can do that.");
  return user;
}
