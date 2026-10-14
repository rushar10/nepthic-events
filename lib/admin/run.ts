import { unstable_rethrow } from "next/navigation";
import type { FormState } from "@/core/forms";

/** Runs an action body and turns thrown errors into a form message (redirects pass through). */
export async function run(fn: () => Promise<FormState>): Promise<FormState> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: e instanceof Error ? e.message : "Something went wrong. Try again." };
  }
}

/* Event times are entered and shown in Brisbane time (AEST, UTC+10, no daylight saving). */
const OFFSET_H = 10;
export const fromLocalInput = (v: string) => new Date(`${v.length === 16 ? `${v}:00` : v}+10:00`);
export const toLocalInput = (d: Date) => new Date(d.getTime() + OFFSET_H * 3600e3).toISOString().slice(0, 16);
