import { cache } from "react";
import { db, eq, savedItems } from "@/db";
import { getUser } from "@/core/auth";

/** IDs of the events the signed-in person has saved (empty when signed out). */
export const savedIds = cache(async (): Promise<Set<string>> => {
  const user = await getUser();
  if (!user) return new Set();
  const rows = await db.select({ id: savedItems.itemId }).from(savedItems).where(eq(savedItems.userId, user.id));
  return new Set(rows.map((r) => r.id));
});
