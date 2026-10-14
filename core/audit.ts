import { auditLog, db, type Tx } from "@/db";

export async function audit(actorId: string | null, action: string, entity: string, entityId: string, data?: unknown, tx?: Tx) {
  await (tx ?? db).insert(auditLog).values({ actorId, action, entity, entityId, data: data ?? null });
}
