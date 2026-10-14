import { cache } from "react";
import { db, eq, settings } from "@/db";

/** This site's settings row (created on first use). */
export const getSettings = cache(async () => {
  const row = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.query.settings.findFirst({ where: eq(settings.id, 1) }))!;
});
