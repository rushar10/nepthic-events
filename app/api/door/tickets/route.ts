import { db, eq, events, tickets } from "@/db";
import { DOOR_ROLES, getUser } from "@/core/auth";

/* Ticket list for one event, so the door scanner can keep working when the venue's
   signal drops. Door staff only; scans made offline are synced and re-checked later. */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user || !DOOR_ROLES.includes(user.role)) return new Response("Not found", { status: 404 });
  const eventId = new URL(req.url).searchParams.get("event") ?? "";
  const e = await db.query.events.findFirst({ where: eq(events.id, eventId), columns: { id: true, name: true } });
  if (!e) return new Response("Not found", { status: 404 });
  const rows = await db.query.tickets.findMany({ where: eq(tickets.eventId, e.id), with: { ticketType: { columns: { name: true } } }, columns: { code: true, status: true, holderName: true, checkedInAt: true } });
  return Response.json(
    { event: e, at: new Date().toISOString(), tickets: rows.map((t) => ({ code: t.code, status: t.status, holder: t.holderName, type: t.ticketType.name, checkedInAt: t.checkedInAt })) },
    { headers: { "cache-control": "no-store" } },
  );
}
