"use server";
import { and, db, eq, events, savedItems } from "@/db";
import { getUser } from "@/core/auth";

export type SaveResult = { ok: true; saved: boolean } | { ok: false; error: string; signIn?: boolean };

/** Saves or unsaves a event for the signed-in person. Called optimistically by <SaveButton>. */
export async function setSaved(itemId: string, saved: boolean): Promise<SaveResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in to save events.", signIn: true };
  if (typeof itemId !== "string" || itemId.length > 64) return { ok: false, error: "That event isn't available." };
  const exists = await db.query.events.findFirst({ where: eq(events.id, itemId), columns: { id: true } });
  if (!exists) return { ok: false, error: "That event isn't available any more." };
  if (saved) await db.insert(savedItems).values({ userId: user.id, itemId }).onConflictDoNothing();
  else await db.delete(savedItems).where(and(eq(savedItems.userId, user.id), eq(savedItems.itemId, itemId)));
  return { ok: true, saved };
}
