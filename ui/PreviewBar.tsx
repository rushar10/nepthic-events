import { headers } from "next/headers";
import { getPreview } from "@/core/ops/preview";
import { editLinks } from "@/core/ops/preview-links";
import { env } from "@/core/env";

/* The admin preview bar. A server component with no client code: it renders only when the
   request carries a live admin preview session, so customers never receive its markup, styles
   or the portal's address. Links go back into the Nepthic Admin Portal. */
export async function PreviewBar() {
  const preview = await getPreview();
  if (!preview) return null;
  const portal = env.portalUrl;
  const path = (await headers()).get("x-nep-path") || "/";
  const links = portal ? editLinks(path) : [];
  return (
    <div className="nep-preview" role="region" aria-label="Admin preview">
      <style>{`
        .nep-preview{position:relative;z-index:1000;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:8px 14px;
          background:#140F1E;color:#F4F1FA;font:600 13px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;border-bottom:2px solid #8B5CF6}
        .nep-preview b{font-weight:800;letter-spacing:.06em;color:#C4B5FD}
        .nep-preview a,.nep-preview button{color:#F4F1FA;background:rgb(139 92 246 / .22);border:1px solid rgb(196 181 253 / .35);border-radius:999px;
          padding:5px 12px;text-decoration:none;font:inherit;cursor:pointer}
        .nep-preview a:hover,.nep-preview button:hover{background:rgb(139 92 246 / .4)}
        .nep-preview form{margin:0 0 0 auto}
        .nep-preview .who{opacity:.8;font-weight:500}
      `}</style>
      <b>ADMIN PREVIEW</b>
      <span className="who">{preview.name} · {preview.role.replace("_", " ").toLowerCase()} · only you can see this bar</span>
      {links.map((l) => <a key={l.href} href={`${portal}${l.href}`} target="_blank" rel="noopener">{l.label} ↗</a>)}
      {portal && <a href={portal} target="_blank" rel="noopener">Portal ↗</a>}
      <form method="post" action="/api/ops/v1/preview/end"><input type="hidden" name="to" value={path} /><button type="submit">Exit preview</button></form>
    </div>
  );
}
