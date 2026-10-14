/**
 * Plain-JS build for sites without React (bundled to packages/ui/dist/nepthic-glow.js).
 *
 *   <link rel="stylesheet" href="nepthic-glow.css">
 *   <script src="nepthic-glow.js" data-radius="150" data-intensity="1"></script>
 *   <div class="card" data-glow>…</div>
 *
 * The script starts itself using data-* settings on its own <script> tag
 * (radius, intensity, curve, fade, hue-shift, touch, mode). Add data-manual to start
 * it yourself with NepthicGlow.createGlow({...}).
 */
import { createGlow, GLOW_DEFAULTS, CURVES, edgeDistance, intensityAt, type GlowOptions } from "./engine";

declare global {
  interface Window { NepthicGlow: typeof api }
}

const api = { createGlow, GLOW_DEFAULTS, CURVES, edgeDistance, intensityAt, instance: null as ReturnType<typeof createGlow> | null };
window.NepthicGlow = api;

const tag = document.currentScript as HTMLScriptElement | null;
if (tag && !tag.hasAttribute("data-manual")) {
  const d = tag.dataset;
  const opts: Partial<GlowOptions> = {};
  if (d.radius) opts.radius = Number(d.radius);
  if (d.intensity) opts.intensity = Number(d.intensity);
  if (d.curve) opts.curve = d.curve as GlowOptions["curve"];
  if (d.fade) opts.fade = Number(d.fade);
  if (d.hueShift) opts.hueShift = Number(d.hueShift);
  if (d.touch) opts.touch = d.touch as GlowOptions["touch"];
  if (d.mode) opts.mode = d.mode as GlowOptions["mode"];
  const start = () => { api.instance = createGlow(opts); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
