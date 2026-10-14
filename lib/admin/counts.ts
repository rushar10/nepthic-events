import { count, db, eq, refundRequests } from "@/db";

/** Things waiting on the Events team, for the rail badge, bell and overview. */
export async function pendingCounts() {
  const [r] = await db.select({ n: count() }).from(refundRequests).where(eq(refundRequests.status, "PENDING"));
  const refunds = r?.n ?? 0;
  return { refunds, total: refunds };
}
