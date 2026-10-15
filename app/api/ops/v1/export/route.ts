import { claimsFrom } from "@/core/ops/token";
import { accessFor, allowed } from "@/core/ops/perms";
import { audit } from "@/core/audit";
import { batchCsv, batchPdf, reportCsv, reportPdf, ticketsPdfById } from "@/core/exports";
import type { PdfLayout } from "@/core/print";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* Downloads for the Admin Portal (portal-signed token, like the rest of the admin API):
     ?kind=batch&id=…&layout=stub|a4|thermal   print-ready PDF of a batch
     ?kind=tickets&ids=a,b&layout=…            PDF of chosen tickets (e.g. a reissue)
     ?kind=batch-csv&id=…                      ticket ids and serial numbers
     ?kind=report&eventId=…&format=csv|pdf     partner report */
const notFound = () => new Response("Not found", { status: 404 });

export async function GET(req: Request) {
  const claims = await claimsFrom(req);
  if (!claims || !allowed(accessFor(claims), "view")) return notFound();
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind");
  const layout = (["stub", "a4", "thermal"] as const).find((l) => l === u.searchParams.get("layout")) ?? ("a4" as PdfLayout);
  let file: { name: string; bytes?: Buffer; text?: string } | null = null;
  if (kind === "batch") file = await batchPdf(u.searchParams.get("id") ?? "", layout);
  else if (kind === "tickets") file = await ticketsPdfById((u.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 2000), layout);
  else if (kind === "batch-csv") file = await batchCsv(u.searchParams.get("id") ?? "");
  else if (kind === "report") file = u.searchParams.get("format") === "pdf" ? await reportPdf(u.searchParams.get("eventId") ?? "") : await reportCsv(u.searchParams.get("eventId") ?? "");
  if (!file) return notFound();
  await audit(`portal:${claims.sub}`, "export.downloaded", "Export", file.name, { by: claims.email, role: claims.role, kind });
  const isPdf = file.name.endsWith(".pdf");
  return new Response(file.bytes ? new Uint8Array(file.bytes) : file.text!, {
    headers: {
      "content-type": isPdf ? "application/pdf" : "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file.name.replace(/[^A-Za-z0-9._-]/g, "-")}"`,
      "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff",
    },
  });
}
