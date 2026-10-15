/* Nepthic colour reveal — framework-free, shared by every Nepthic site (each keeps a copy).
 *
 * The page sits on a dim knitted-fabric texture. A soft circle that trails the pointer
 * reveals the same fabric in colour; the colour depends on where you are (palette anchors).
 * Two layers are painted once per resize; each frame only composites the colour layer
 * through a radial mask, and the loop sleeps once the circle settles. Touch: follows the
 * finger and fades on release. Reduced motion: no trailing.
 *
 * Blending: the colour is mixed toward the page's own background first, and the canvas is
 * composited with the page (screen on dark pages, multiply on light ones), so the reveal reads
 * as light falling on the page rather than coloured lines laid over it. A soft wash of the same
 * colour sits under the stitches so there are no hard edges around text.
 *
 *   const stop = startReveal({ palette: [{ color: "#2DD4BF", x: .2, y: .4 }, …] });
 */
export type RevealStop = { color: string; x: number; y: number };
export interface RevealOptions {
  /** Colour anchors, x/y as fractions of the viewport. */
  palette: RevealStop[];
  /** Max reveal radius, px. */
  radius: number;
  /** Colour layer strength, 0..1 (lower on text-heavy pages). */
  strength: number;
  /** How visible the dim base texture is (stroke alpha). */
  base: number;
}
export const REVEAL_DEFAULTS: RevealOptions = {
  palette: [
    { color: "#F5A524", x: 0.15, y: 0.3 },   // Clothing
    { color: "#2DD4BF", x: 0.5, y: 0.55 },   // Wholesale
    { color: "#EC4899", x: 0.85, y: 0.85 },  // Events
    { color: "#8B5CF6", x: 0.5, y: 0.02 },   // Nepthic violet
  ],
  radius: 300,
  strength: 1,
  base: 0.055,
};
/** "#rrggbb", "rgb(…)" or a CSS colour the browser resolved, to [r, g, b]. */
function cssRgb(v: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const r = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
  return r ? [Number(r[1]), Number(r[2]), Number(r[3])] : null;
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? parseInt(m[1], 16) : 0x8b5cf6;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function startReveal(opts: Partial<RevealOptions> = {}): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const o = { ...REVEAL_DEFAULTS, ...opts };
  const canvas = document.createElement("canvas");
  canvas.className = "reveal";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const maybe = canvas.getContext("2d");
  if (!maybe) { canvas.remove(); return () => {}; }
  const ctx: CanvasRenderingContext2D = maybe;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const base = document.createElement("canvas"), vivid = document.createElement("canvas"), mask = document.createElement("canvas");
  let W = 0, H = 0, dpr = 1;
  let tx = -9999, ty = -9999, x = -9999, y = -9999;   // target and smoothed position
  let on = 0, onTarget = 0;                            // reveal strength 0..1
  let raf = 0, lastT = 0, fadeTimer = 0;
  const R = () => Math.max(o.radius * 0.6, Math.min(o.radius, Math.min(W, H) * 0.32)); // reveal radius

  /* Colour anchors across the page; each stitch blends them by distance. */
  const SITES = o.palette.map((p) => ({ c: hex(p.color), fx: p.x, fy: p.y }));
  function colourAt(px: number, py: number) {
    let r = 0, g = 0, b = 0, sum = 0;
    for (const s of SITES) {
      const dx = px / W - s.fx, dy = (py / H - s.fy) * 0.8;
      const w = 1 / Math.pow(dx * dx + dy * dy + 0.012, 1.6);
      r += s.c[0] * w; g += s.c[1] * w; b += s.c[2] * w; sum += w;
    }
    return [r / sum, g / sum, b / sum];
  }

  // Large soft "folds" so the fabric isn't flat: a few slow light/shade bands.
  function shade(px: number, py: number) {
    const u = px / W, v = py / H;
    return 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(u * 5.2 + v * 3.1 + Math.sin(v * 4.0) * 1.3)) * (0.55 + 0.45 * Math.cos(u * 2.3 - v * 6.1));
  }

  /* Paint both layers: rows of V-shaped knit stitches. */
  /* Light theme: dark stitches on a light page, and a slightly stronger colour layer. */
  const isLight = () => getComputedStyle(document.documentElement).colorScheme.includes("light") && !getComputedStyle(document.documentElement).colorScheme.includes("dark");
  /* Painting thousands of stitches is split into ~6ms slices across frames, so it never
     blocks input or the first paint. The texture fades in when it's ready. */
  let paintToken = 0;
  let painted = false;
  /* The page's background colour (the --bg token, else the body's computed background). */
  function pageBg(light: boolean): number[] {
    const cs = getComputedStyle(document.documentElement);
    return cssRgb(cs.getPropertyValue("--bg")) ?? cssRgb(getComputedStyle(document.body).backgroundColor) ?? (light ? [246, 243, 251] : [14, 11, 20]);
  }
  function paint() {
    const token = ++paintToken;
    const light = isLight();
    const bg = pageBg(light);
    // Blend with the page rather than sit on top of it.
    canvas.style.mixBlendMode = light ? "multiply" : "screen";
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    for (const c of [base, vivid, mask]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const b = base.getContext("2d")!, v = vivid.getContext("2d")!;
    for (const g of [b, v]) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.lineCap = "round"; g.lineJoin = "round"; }
    // A soft wash of the local colour under the stitches, in coarse tiles blurred together.
    const tile = 48;
    v.save(); v.filter = "blur(24px)";
    for (let wy = -tile; wy < H + tile; wy += tile) for (let wx = -tile; wx < W + tile; wx += tile) {
      const c = mix(colourAt(wx + tile / 2, wy + tile / 2), bg, light ? 0.35 : 0.25);
      v.fillStyle = `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${(light ? 0.16 : 0.12) * o.strength})`;
      v.fillRect(wx, wy, tile, tile);
    }
    v.restore();

    const cw = 13, ch = 11;                 // stitch size, px
    let py = -ch;
    const row = () => {
      for (let px = -cw; px < W + cw; px += cw) {
        // tiny irregularity so it reads as fabric, not a grid
        const j = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453, n = j - Math.floor(j);
        const cx = px + cw / 2, top = py + (n - 0.5) * 1.2, bot = py + ch * 1.15;
        const lum = shade(cx, py) * (0.85 + n * 0.3);
        // the stitch: two legs of a V
        b.strokeStyle = light ? `rgba(40, 28, 64, ${o.base * 0.6 * lum})` : `rgba(214, 206, 230, ${o.base * lum})`;
        b.lineWidth = 2.1;
        b.beginPath(); b.moveTo(px + 1.5, top); b.quadraticCurveTo(cx - 2, bot - 3, cx, bot); b.quadraticCurveTo(cx + 2, bot - 3, px + cw - 1.5, top); b.stroke();
        // Site colour, pulled toward the page background so it belongs to the page:
        // softer pastel on light pages, a little deeper on dark ones.
        const k = 0.8 + 0.35 * lum;
        const [r, g, bl] = mix(colourAt(cx, py).map((c) => Math.min(255, c * k)), bg, light ? 0.3 : 0.18);
        v.strokeStyle = `rgba(${r | 0}, ${g | 0}, ${bl | 0}, ${(0.38 + 0.3 * lum) * o.strength})`;
        v.lineWidth = 2.1;
        v.beginPath(); v.moveTo(px + 1.5, top); v.quadraticCurveTo(cx - 2, bot - 3, cx, bot); v.quadraticCurveTo(cx + 2, bot - 3, px + cw - 1.5, top); v.stroke();
        // a fine highlight on each leg, so the colour layer shimmers like yarn
        v.strokeStyle = light ? `rgba(255, 255, 255, 0)` : `rgba(255, 255, 255, ${(0.05 + 0.08 * lum) * o.strength})`;
        v.lineWidth = 0.7;
        v.beginPath(); v.moveTo(px + 2.4, top + 0.6); v.quadraticCurveTo(cx - 2.6, bot - 3.6, cx - 0.6, bot - 0.8); v.stroke();
      }
      py += ch;
    };
    const slice = () => {
      if (token !== paintToken) return;                 // a newer paint (resize, theme) took over
      const t0 = performance.now();
      while (py < H + ch && performance.now() - t0 < 6) row();
      if (py < H + ch) { requestAnimationFrame(slice); return; }
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      draw();
      canvas.style.opacity = "1";
    };
    requestAnimationFrame(slice);
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    if (on < 0.005) return;
    const m = mask.getContext("2d")!, r = R() * dpr, mx = x * dpr, my = y * dpr;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = "source-over";
    m.clearRect(0, 0, mask.width, mask.height);
    const g = m.createRadialGradient(mx, my, 0, mx, my, r);   // soft-edged circle…
    g.addColorStop(0, `rgba(0,0,0,${on})`);
    g.addColorStop(0.45, `rgba(0,0,0,${0.75 * on})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    m.fillStyle = g;
    m.fillRect(mx - r, my - r, r * 2, r * 2);
    m.globalCompositeOperation = "source-in";                  // …filled with the colour layer
    m.drawImage(vivid, 0, 0);
    ctx.drawImage(mask, 0, 0);
  }

  function frame(t: number) {
    raf = 0;
    const dt = lastT ? Math.min(50, t - lastT) : 16; lastT = t;
    const follow = reduce.matches ? 1 : 1 - Math.pow(1 - 0.14, dt / 16.7);   // soft trail
    const fade = 1 - Math.pow(1 - 0.12, dt / 16.7);
    x += (tx - x) * follow; y += (ty - y) * follow;
    on += (onTarget - on) * fade;
    draw();
    const settled = Math.abs(tx - x) < 0.3 && Math.abs(ty - y) < 0.3 && Math.abs(onTarget - on) < 0.004;
    if (!settled) raf = requestAnimationFrame(frame); else lastT = 0;
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  const onMove = (e: PointerEvent) => {
    tx = e.clientX; ty = e.clientY;
    if (on < 0.02) { x = tx; y = ty; }        // appear where the pointer is, not slide in
    onTarget = 1;
    clearTimeout(fadeTimer);
    if (e.pointerType === "touch") fadeTimer = window.setTimeout(() => { onTarget = 0; wake(); }, 700);
    wake();
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    tx = x = e.clientX; ty = y = e.clientY; onTarget = 1; wake();
  };
  const leave = () => { onTarget = 0; wake(); };
  const onOut = (e: MouseEvent) => { if (!e.relatedTarget) leave(); };
  let rt = 0;
  const onResize = () => { if (!painted) return; clearTimeout(rt); rt = window.setTimeout(paint, 150); };
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("mouseout", onOut);
  window.addEventListener("blur", leave);
  window.addEventListener("resize", onResize, { passive: true });
  canvas.style.opacity = "0";
  canvas.style.transition = "opacity 600ms ease";
  // repaint when the theme changes (toggle or device setting)
  const themeMo = new MutationObserver(() => onResize());
  themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener?.("change", onResize);
  // First paint waits until the page has loaded and the browser is idle (never competes with content).
  const idle = (f: () => void) => ((window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((g: () => void) => setTimeout(g, 200)))(f, { timeout: 2500 });
  // On touch screens nothing is revealed until a finger lands, so the texture is only painted
  // then: phones never spend start-up time (or battery) on it.
  const touchOnly = window.matchMedia("(hover: none)").matches;
  const firstTouch = () => { if (!painted) { painted = true; paint(); } };
  const kick = () => idle(() => { painted = true; paint(); });
  if (touchOnly) window.addEventListener("pointerdown", firstTouch, { once: true, passive: true });
  else if (document.readyState === "complete") kick(); else window.addEventListener("load", kick, { once: true });
  return () => {
    paintToken++;
    window.removeEventListener("load", kick);
    window.removeEventListener("pointerdown", firstTouch);
    cancelAnimationFrame(raf); clearTimeout(rt); clearTimeout(fadeTimer);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    document.removeEventListener("mouseout", onOut);
    window.removeEventListener("blur", leave);
    window.removeEventListener("resize", onResize);
    themeMo.disconnect(); mq.removeEventListener?.("change", onResize);
    canvas.remove();
  };
}
