/**
 * Nepthic proximity glow — framework-free engine.
 *
 * Elements light up as the cursor approaches, not only on hover. JavaScript only
 * writes numbers into CSS custom properties; every visual lives in glow.css.
 *
 *   --glow-intensity  0..1  eased by distance to the element's nearest edge
 *   --glow-fill       0..1  1 while the cursor is directly over the element
 *   --glow-x/--glow-y px    cursor position relative to the element
 *   --glow-u          0..1  hue position: 0 = warm side (--glow-a), 1 = cool side (--glow-b)
 *
 * Works on any element with `data-glow` (or the legacy `.prox` class). Per element:
 *   data-glow-radius="90"      activation distance in px (overrides the global radius)
 *   data-glow-intensity=".6"   strength multiplier for this element
 *   data-glow-scale=".55"      on a container: multiplies everything inside (Admin)
 *   data-glow-center="off"     exclude from the touch "card nearest the centre" glow
 *
 * Cost model: one pointermove listener for the whole document, one rAF per frame,
 * rects measured only for on-screen elements and only after scroll/resize/layout
 * changes, style writes skipped when values haven't changed, and the loop sleeps
 * as soon as every fade has settled.
 */

export type GlowCurve = "ease-out" | "smooth" | "linear" | "ease-in";
export type GlowMode = "auto" | "pointer" | "touch" | "static" | "off";
export type GlowTouch = "both" | "tap" | "center" | "none";

export interface GlowOptions {
  /** Distance in px from an element's edge where the glow starts. Default 150. */
  radius: number;
  /** Global strength 0..1. Default 1. */
  intensity: number;
  /** How intensity rises from the radius edge to the element. Default "ease-out". */
  curve: GlowCurve;
  /** Fade time in ms when intensity changes (approach, leave). Default 250. */
  fade: number;
  /** 0..1, how far the hue follows the cursor across an element (warm left, cool right). Default 0.6. */
  hueShift: number;
  /** Touch-screen behaviour. Default "both". */
  touch: GlowTouch;
  /** "auto" picks pointer / touch / static from the device and reduced-motion settings. */
  mode: GlowMode;
  /** Which elements glow. Default `[data-glow], .prox`. */
  selector: string;
}

export const GLOW_DEFAULTS: GlowOptions = {
  radius: 150,
  intensity: 1,
  curve: "ease-out",
  fade: 250,
  hueShift: 0.6,
  touch: "both",
  mode: "auto",
  selector: "[data-glow], .prox",
};

/** How long a tap holds the glow at full strength before it fades (ms). */
const TAP_HOLD = 140;

export const CURVES: Record<GlowCurve, (t: number) => number> = {
  "ease-out": (t) => 1 - (1 - t) ** 3,
  smooth: (t) => t * t * (3 - 2 * t),
  linear: (t) => t,
  "ease-in": (t) => t * t * t,
};

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** Distance from a point to the nearest edge of a rect; 0 when the point is inside. */
export function edgeDistance(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  return Math.hypot(dx, dy);
}

/** Intensity 0..1 for a distance: 0 at the radius edge, 1 on the element, eased by the curve. */
export function intensityAt(distance: number, radius: number, curve: GlowCurve = "ease-out"): number {
  if (radius <= 0) return distance === 0 ? 1 : 0;
  const t = Math.min(1, Math.max(0, 1 - distance / radius));
  return CURVES[curve](t);
}

/** Frame-rate independent approach towards a target: reaches ~95% after `fade` ms. */
export function approach(current: number, target: number, dtMs: number, fadeMs: number): number {
  if (fadeMs <= 0) return target;
  const k = 1 - Math.exp((-3 * dtMs) / fadeMs);
  const next = current + (target - current) * k;
  return Math.abs(target - next) < 0.002 ? target : next;
}

type Item = {
  el: HTMLElement;
  radius: number | null;
  k: number;
  center: boolean;
  rect: Rect | null;
  // targets
  ti: number; tf: number; tu: number;
  // displayed (smoothed)
  i: number; f: number; u: number;
  // last written
  wi: number; wf: number; wu: number; wx: number; wy: number;
  /** time of the last tap (touch mode), for the tap pulse */
  tapAt: number;
};

export interface GlowController {
  /** Change settings at runtime (e.g. from Admin → Settings or a slider). */
  update(options: Partial<GlowOptions>): void;
  /** Re-scan the DOM and re-measure; call after big layout changes the observers can't see. */
  refresh(): void;
  /** Current settings. */
  readonly options: GlowOptions;
  /** The mode actually in use after "auto" is resolved. */
  readonly activeMode: Exclude<GlowMode, "auto">;
  destroy(): void;
}

const NOOP: GlowController = {
  update() {}, refresh() {}, destroy() {},
  options: GLOW_DEFAULTS,
  activeMode: "off",
};

const num = (v: string | null | undefined, fallback: number) => {
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function createGlow(initial: Partial<GlowOptions> = {}): GlowController {
  if (typeof window === "undefined" || typeof document === "undefined") return NOOP;

  let o: GlowOptions = { ...GLOW_DEFAULTS, ...initial };
  const root = document.documentElement;
  const items = new Map<Element, Item>();
  const visible = new Set<Item>();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const noHover = window.matchMedia("(hover: none)");

  let mx = -1e5, my = -1e5, hasPointer = false;
  let raf = 0, last = 0;
  let measure = true, rescan = true;
  let centred: Item | null = null;

  const mode = (): Exclude<GlowMode, "auto"> => {
    if (o.mode !== "auto") return o.mode;
    if (reduce.matches) return "static";
    return noHover.matches ? "touch" : "pointer";
  };
  let current = mode();

  const sizeFor = (radius: number) => `${Math.round(radius * 1.2 + 140)}px`;

  function applyRoot() {
    root.dataset.glowMode = current;
    root.style.setProperty("--glow-size", sizeFor(o.radius));
  }

  // ── registry ──────────────────────────────────────────────────────────
  let io: IntersectionObserver | null = null;
  let ioMargin = -1;
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { measure = true; kick(); }) : null;

  function maxRadius() {
    let m = o.radius;
    items.forEach((it) => { if (it.radius != null && it.radius > m) m = it.radius; });
    return Math.ceil(m);
  }

  function onIntersect(entries: IntersectionObserverEntry[]) {
    for (const e of entries) {
      const it = items.get(e.target);
      if (!it) continue;
      if (e.isIntersecting) visible.add(it);
      else { visible.delete(it); it.ti = 0; it.tf = 0; it.i = 0; it.f = 0; write(it, true); }
    }
    measure = true;
    kick();
  }

  function buildIO() {
    const m = maxRadius();
    if (io && m === ioMargin) return;
    io?.disconnect();
    ioMargin = m;
    const opts: IntersectionObserverInit = { rootMargin: `${m}px` };
    // An explicit document root keeps rootMargin working inside iframes too.
    try { io = new IntersectionObserver(onIntersect, { ...opts, root: document }); }
    catch { io = new IntersectionObserver(onIntersect, opts); }
    items.forEach((it) => io!.observe(it.el));
  }

  function readItem(it: Item) {
    const el = it.el;
    const r = el.dataset.glowRadius;
    it.radius = r ? num(r, o.radius) : null;
    const scope = el.closest<HTMLElement>("[data-glow-scale]");
    it.k = num(el.dataset.glowIntensity, 1) * (scope ? num(scope.dataset.glowScale, 1) : 1);
    it.center = el.dataset.glowCenter !== "off";
    if (it.radius != null) el.style.setProperty("--glow-size", sizeFor(it.radius));
    else el.style.removeProperty("--glow-size");
  }

  function register(el: HTMLElement) {
    if (items.has(el)) return;
    const it: Item = { el, radius: null, k: 1, center: true, rect: null, ti: 0, tf: 0, tu: 0.5, i: 0, f: 0, u: 0.5, wi: -1, wf: -1, wu: -1, wx: NaN, wy: NaN, tapAt: 0 };
    readItem(it);
    items.set(el, it);
    io?.observe(el);
    ro?.observe(el);
  }

  function unregister(it: Item) {
    io?.unobserve(it.el);
    ro?.unobserve(it.el);
    visible.delete(it);
    items.delete(it.el);
    if (centred === it) centred = null;
  }

  function scan() {
    rescan = false;
    items.forEach((it) => { if (!it.el.isConnected || !it.el.matches(o.selector)) unregister(it); });
    document.querySelectorAll<HTMLElement>(o.selector).forEach(register);
    buildIO();
    measure = true;
  }

  // Only react to changes that matter: nodes added/removed, an element starting or
  // stopping to match the selector, or a data-glow-* setting changing.
  const mo = new MutationObserver((records) => {
    let touched = false;
    for (const r of records) {
      if (r.type === "childList") {
        if (r.addedNodes.length || r.removedNodes.length) { rescan = true; touched = true; }
        continue;
      }
      const t = r.target as HTMLElement;
      if (r.attributeName === "data-glow-scale") { items.forEach(readItem); touched = true; continue; }
      const it = items.get(t);
      if (it ? !t.matches(o.selector) : t.matches?.(o.selector)) { rescan = true; touched = true; continue; }
      if (it && r.attributeName !== "class") { readItem(it); buildIO(); touched = true; }
    }
    if (touched) { measure = true; kick(); }
  });

  // ── writing ───────────────────────────────────────────────────────────
  function write(it: Item, force = false) {
    const s = it.el.style;
    if (force || Math.abs(it.i - it.wi) > 0.003 || (it.i === 0 && it.wi !== 0)) { s.setProperty("--glow-intensity", it.i.toFixed(3)); it.wi = it.i; }
    if (force || Math.abs(it.f - it.wf) > 0.003 || (it.f === 0 && it.wf !== 0)) { s.setProperty("--glow-fill", it.f.toFixed(3)); it.wf = it.f; }
    if (force || Math.abs(it.u - it.wu) > 0.004) { s.setProperty("--glow-u", it.u.toFixed(3)); it.wu = it.u; }
  }

  function writePos(it: Item, x: number, y: number) {
    if (Math.abs(x - it.wx) < 0.5 && Math.abs(y - it.wy) < 0.5) return;
    it.el.style.setProperty("--glow-x", `${x.toFixed(1)}px`);
    it.el.style.setProperty("--glow-y", `${y.toFixed(1)}px`);
    it.wx = x; it.wy = y;
  }

  function clearAll() {
    items.forEach((it) => {
      it.ti = it.tf = it.i = it.f = 0; it.tu = it.u = 0.5;
      for (const p of ["--glow-intensity", "--glow-fill", "--glow-u", "--glow-x", "--glow-y"]) it.el.style.removeProperty(p);
      it.wi = it.wf = it.wu = -1; it.wx = it.wy = NaN;
    });
    centred = null;
  }

  // ── frame loop ────────────────────────────────────────────────────────
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function frame(now: number) {
    raf = 0;
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    if (rescan) scan();

    const m = mode();
    if (m !== current) { current = m; clearAll(); applyRoot(); }
    if (m === "off" || m === "static") { last = 0; return; }

    // Read phase: measure every on-screen element in one batch (no writes in between).
    if (measure) {
      measure = false;
      visible.forEach((it) => { const r = it.el.getBoundingClientRect(); it.rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; });
    }

    // Targets.
    let holding = false;
    if (m === "pointer") {
      visible.forEach((it) => {
        const r = it.rect;
        if (!r || !hasPointer) { it.ti = 0; it.tf = 0; return; }
        const d = edgeDistance(r, mx, my);
        it.ti = intensityAt(d, it.radius ?? o.radius, o.curve) * o.intensity * it.k;
        it.tf = d === 0 ? 1 : 0;
        if (it.ti > 0) {
          const rel = r.width > 0 ? (mx - r.left) / r.width : 0.5;
          it.tu = Math.min(1, Math.max(0, 0.5 + (rel - 0.5) * o.hueShift));
          writePos(it, mx - r.left, my - r.top);
        }
      });
    } else if (m === "touch") {
      let best: Item | null = null;
      if (o.touch === "both" || o.touch === "center") {
        const mid = window.innerHeight / 2;
        let bestD = Infinity;
        visible.forEach((it) => {
          const r = it.rect;
          if (!r || !it.center || r.height < 72 || r.bottom < 0 || r.top > window.innerHeight) return;
          const d = Math.abs(r.top + r.height / 2 - mid);
          if (d < bestD) { bestD = d; best = it; }
        });
      }
      visible.forEach((it) => {
        if (it.tapAt && now - it.tapAt < TAP_HOLD) { it.ti = o.intensity * it.k; it.tf = 1; holding = true; return; }
        it.tapAt = 0;
        it.tf = 0;
        it.ti = it === best ? 0.55 * o.intensity * it.k : 0;
        if (it === best && it.rect) { it.tu = 0.5; writePos(it, it.rect.width / 2, it.rect.height * 0.35); }
      });
      centred = best;
    }

    // Smooth towards targets, then write only what changed.
    let moving = false;
    visible.forEach((it) => {
      it.i = approach(it.i, it.ti, dt, o.fade);
      it.f = approach(it.f, it.tf, dt, o.fade * 1.3);
      it.u = approach(it.u, it.tu, dt, o.fade);
      if (it.i !== it.ti || it.f !== it.tf || it.u !== it.tu) moving = true;
      write(it);
    });

    if (moving || holding) kick(); else last = 0;
  }

  // ── input ─────────────────────────────────────────────────────────────
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    mx = e.clientX; my = e.clientY; hasPointer = true;
    kick();
  };
  const onLeave = () => { hasPointer = false; kick(); };
  const onOut = (e: MouseEvent) => { if (!e.relatedTarget) onLeave(); };
  const onScroll = () => { measure = true; kick(); };

  // Touch: the glow blooms from the exact tap point (ring + surface), then fades.
  // It uses the element's own layers, so it never spills outside rounded corners.
  const onDown = (e: PointerEvent) => {
    if (current !== "touch" || (o.touch !== "both" && o.touch !== "tap")) return;
    if (e.pointerType === "mouse" && o.mode !== "touch") return;
    const host = (e.target as Element | null)?.closest<HTMLElement>(o.selector);
    const it = host && items.get(host);
    if (!it) return;
    const r = host.getBoundingClientRect();
    writePos(it, e.clientX - r.left, e.clientY - r.top);
    it.tu = r.width > 0 ? Math.min(1, Math.max(0, 0.5 + ((e.clientX - r.left) / r.width - 0.5) * o.hueShift)) : 0.5;
    it.tapAt = performance.now();
    visible.add(it);
    kick();
  };

  const onMedia = () => kick();

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("resize", onScroll, { passive: true });
  window.addEventListener("blur", onLeave);
  document.addEventListener("mouseout", onOut);
  reduce.addEventListener?.("change", onMedia);
  noHover.addEventListener?.("change", onMedia);
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-glow", "data-glow-radius", "data-glow-intensity", "data-glow-scale", "data-glow-center", "class"] });

  applyRoot();
  scan();
  kick();

  return {
    get options() { return o; },
    get activeMode() { return current; },
    update(next) {
      const selectorChanged = next.selector != null && next.selector !== o.selector;
      o = { ...o, ...next };
      if (selectorChanged) { clearAll(); items.forEach(unregister); }
      items.forEach(readItem);
      buildIO();
      const m = mode();
      if (m !== current) { current = m; clearAll(); }
      applyRoot();
      rescan = true; measure = true;
      kick();
    },
    refresh() { rescan = true; measure = true; kick(); },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("mouseout", onOut);
      reduce.removeEventListener?.("change", onMedia);
      noHover.removeEventListener?.("change", onMedia);
      mo.disconnect(); io?.disconnect(); ro?.disconnect();
      clearAll();
      items.clear(); visible.clear();
      delete root.dataset.glowMode;
      root.style.removeProperty("--glow-size");
    },
  };
}

// ── shared instance ─────────────────────────────────────────────────────
let shared: GlowController | null = null;
let users = 0;

/** One engine per page, however many components ask for it. Returns a release function. */
export function acquireGlow(options: Partial<GlowOptions>): { controller: GlowController; release: () => void } {
  if (!shared) shared = createGlow(options);
  else shared.update(options);
  users++;
  let released = false;
  return {
    controller: shared,
    release() {
      if (released) return;
      released = true;
      users--;
      if (users <= 0 && shared) { shared.destroy(); shared = null; users = 0; }
    },
  };
}
