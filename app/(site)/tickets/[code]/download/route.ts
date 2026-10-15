import sharp from "sharp";
import { db, eq, tickets } from "@/db";
import { getUser } from "@/core/auth";
import { renderTicket } from "@/core/ticket-templates";

export const dynamic = "force-dynamic";

/* "Download ticket": the ticket in its event's design as a PNG, for the camera roll or printing.
   Only the account that bought it can download it; anyone else gets 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getUser();
  const code = decodeURIComponent((await params).code);
  const t = user ? await db.query.tickets.findFirst({ where: eq(tickets.code, code), with: { ticketOrder: true, ticketType: true, event: true } }) : null;
  if (!user || !t || t.ticketOrder.userId !== user.id) return new Response("Not found", { status: 404 });
  const svg = await renderTicket(t);
  const png = await sharp(Buffer.from(svg), { density: 192 }).png().toBuffer();
  const name = `${t.event.slug}-${t.code}.png`.replace(/[^a-zA-Z0-9._-]/g, "");
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" },
  });
}
