import { claimsFrom, opsEnabled } from "./token";
import { accessFor, allowed } from "./perms";
import { OpsError, type Files, type Input, type Op } from "./kit";
import { audit } from "@/core/audit";

/* POST /api/ops/v1/<op>: the one door into this site's admin functions.

   - No valid portal token: 404, as if nothing were here.
   - Valid token, but the role may not run this operation here: 403 (and the attempt is logged).
   - Otherwise the operation runs and its result goes back as JSON. */

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });

export async function handleOp(req: Request, name: string, registry: Record<string, Op>) {
  if (!opsEnabled()) return notFound();
  const claims = await claimsFrom(req);
  if (!claims) return notFound();
  const op = Object.hasOwn(registry, name) ? registry[name] : undefined;
  if (!op) return json({ error: "Unknown operation." }, 404);

  const access = accessFor(claims);
  if (!allowed(access, op.level)) {
    await audit(`portal:${claims.sub}`, "ops.denied", "Operation", name, { by: claims.email, role: claims.role });
    return json({ error: "Your role can't do that on this site." }, 403);
  }

  let input: Input = {};
  const files: Files = {};
  try {
    const type = req.headers.get("content-type") ?? "";
    if (type.startsWith("multipart/form-data")) {
      const fd = await req.formData();
      input = JSON.parse(String(fd.get("input") ?? "{}"));
      for (const [k, v] of fd.entries()) if (k !== "input" && typeof v === "object") (files[k] ??= []).push(v as File);
    } else if (type.includes("json")) {
      input = (await req.json()) ?? {};
    }
    if (typeof input !== "object" || Array.isArray(input)) throw new Error("bad input");
  } catch {
    return json({ error: "The request couldn't be read." }, 400);
  }

  try {
    const data = await op.run(input, { ...claims, access }, files);
    return json({ data });
  } catch (e) {
    if (e instanceof OpsError) return json({ error: e.message }, e.status);
    console.error(`[ops] ${name} failed`, e);
    return json({ error: e instanceof Error ? e.message : "Something went wrong on the site." }, 500);
  }
}
