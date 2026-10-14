"use server";
import { redirect } from "next/navigation";
import { DOOR_ROLES, destroySession, loginWithPassword, requireUser } from "@/core/auth";
import { checkIn, type ScanResult } from "@/core/tickets";
import { str, type FormState } from "@/core/forms";

/** Staff-only sign-in. Customer accounts are turned away even with the right password. */
export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const user = await loginWithPassword(str(fd, "email"), String(fd.get("password") ?? ""));
  if (!user) return { error: "That email and password don't match a staff account." };
  if (!DOOR_ROLES.includes(user.role)) {
    await destroySession();
    return { error: "This app is for Nepthic Events door staff. Ask an Events admin to give your account door access." };
  }
  redirect("/door");
}

export async function logout() {
  await destroySession();
  redirect("/door/login");
}

/** Called by the scanner for each scan, and again for scans queued while offline. */
export async function scanTicket(eventId: string, raw: string): Promise<ScanResult> {
  const staff = await requireUser(DOOR_ROLES, "/door/login");
  return checkIn(raw, eventId, staff.id);
}
