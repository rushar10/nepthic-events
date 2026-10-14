import { db, eq, tickets } from "@/db";
import { getUser } from "@/core/auth";
import { applePass, googleWalletUrl, walletConfig, type WalletTicket } from "@/core/wallet";

/* GET /api/wallet/apple/NPT-XXXX-XXXX → .pkpass download
   GET /api/wallet/google/NPT-XXXX-XXXX → redirect to Google Wallet save page */
export async function GET(_: Request, { params }: { params: Promise<{ provider: string; code: string }> }) {
  const { provider, code } = await params;
  const user = await getUser();
  const t = user && await db.query.tickets.findFirst({ where: eq(tickets.code, decodeURIComponent(code)), with: { ticketOrder: true, ticketType: true, event: true } });
  if (!t || t.ticketOrder.userId !== user!.id || t.status === "REFUNDED" || t.status === "VOID") return new Response("Not found", { status: 404 });
  const wt: WalletTicket = { code: t.code, holderName: t.holderName, typeName: t.ticketType.name, event: t.event };

  if (provider === "google" && walletConfig.google) return Response.redirect(googleWalletUrl(wt), 302);
  if (provider === "apple" && walletConfig.apple) {
    const buf = await applePass(wt);
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": "application/vnd.apple.pkpass", "content-disposition": `attachment; filename="${t.code}.pkpass"` },
    });
  }
  return new Response("Wallet passes aren't set up yet.", { status: 404 });
}
