/**
 * Plain-JS build (packages/ui/dist/nepthic-cursor.js).
 *
 *   <link rel="stylesheet" href="nepthic-cursor.css">
 *   <script src="nepthic-cursor.js" data-color="#EFECF4" data-spot-color="#8FA7FF"></script>
 *   <main data-nc-scope> … <a data-cursor="Shop" data-cursor-color="#F472B6" data-cursor-magnet>…</a> … </main>
 *
 * Starts itself with data-* settings on its <script> tag (trail, ring, hover-ring, spot,
 * color-radius, magnet, color, spot-color, press-delay). Add data-manual to start it with
 * NepthicCursor.createCursor({...}) instead.
 */
import { createCursor, CURSOR_DEFAULTS, type CursorOptions } from "./engine";

declare global {
  interface Window { NepthicCursor: typeof api }
}

const api = { createCursor, CURSOR_DEFAULTS, instance: null as ReturnType<typeof createCursor> | null };
window.NepthicCursor = api;

const tag = document.currentScript as HTMLScriptElement | null;
if (tag && !tag.hasAttribute("data-manual")) {
  const d = tag.dataset;
  const o: Partial<CursorOptions> = {};
  const n = (v?: string) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
  if (n(d.trail) != null) o.trail = n(d.trail);
  if (n(d.ring) != null) o.ring = n(d.ring);
  if (n(d.hoverRing) != null) o.hoverRing = n(d.hoverRing);
  if (n(d.spot) != null) o.spot = n(d.spot);
  if (n(d.colorRadius) != null) o.colorRadius = n(d.colorRadius);
  if (n(d.magnet) != null) o.magnet = n(d.magnet);
  if (n(d.pressDelay) != null) o.pressDelay = n(d.pressDelay);
  if (d.color) o.color = d.color;
  if (d.spotColor) o.spotColor = d.spotColor;
  const start = () => { api.instance = createCursor(o); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
