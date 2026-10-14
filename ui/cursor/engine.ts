/**
 * Nepthic custom cursor — framework-free.
 *
 * Three layers, all `pointer-events: none`, moved only with translate3d():
 *   dot   ~8px, exactly at the pointer
 *   ring  40px, trails the dot (moves a fixed share of the remaining distance each
 *         frame), grows to 80px with a label over a target, presses and pulses on click
 *   spot  a large faint radial light behind the content that follows the pointer
 *
 * Targets opt in with attributes:
 *   data-cursor="Shop"            the label shown inside the ring while hovering
 *   data-cursor-color="#F472B6"   accent the ring and spot blend toward as the pointer nears
 *   data-cursor-magnet            ring and [data-cursor-title] lean a few px toward the pointer
 *
 * The custom cursor only replaces the native one inside [data-nc-scope] (e.g. the
 * homepage), keeps the native cursor over inputs and anything in [data-cursor-native],
 * and stays off entirely on touch / coarse pointers. Reduced motion: a plain dot,
 * no trail, no magnet, no spot.
 */

export interface CursorOptions {
  /** Where the custom cursor replaces the native one. */
  scope: string;
  /** Elements that react (colour, grow, label, magnet). */
  targets: string;
  /** Where the native cursor stays visible. */
  native: string;
  /** Share of the remaining distance the ring covers per 60fps frame (0.15–0.2 feels right). */
  trail: number;
  /** Same for the ambient light spot (slower = softer). */
  spotTrail: number;
  /** Ring diameter at rest and over a target, px. */
  ring: number;
  hoverRing: number;
  /** Ambient spot diameter, px. */
  spot: number;
  /** Distance from a target's edge where its colour starts blending in, px. */
  colorRadius: number;
  /** Max magnetic lean, px. */
  magnet: number;
  /** Colours when not near any target (hex or rgb()). */
  color: string;
  spotColor: string;
  /** Delay before following a link, so the press animation shows, ms. */
  pressDelay: number;
}

export const CURSOR_DEFAULTS: CursorOptions = {
  scope: "[data-nc-scope]",
  targets: "[data-cursor]",
  native: "input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-cursor-native]",
  trail: 0.18,
  spotTrail: 0.1,
  ring: 40,
  hoverRing: 80,
  spot: 520,
  colorRadius: 220,
  magnet: 6,
  color: "#EFECF4",
  spotColor: "#8FA7FF",
  pressDelay: 180,
};

export type RGB = [number, number, number];

/** Parses #rgb, #rrggbb or rgb()/rgba(). Unknown formats return null. */
export function parseColor(c: string): RGB | null {
  const s = c.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16)) as RGB;
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as RGB;
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

/** Frame-rate independent lerp factor: `perFrame` at 60fps, scaled to the real frame time. */
export function lerpFactor(perFrame: number, dtMs: number): number {
  if (perFrame >= 1) return 1;
  return 1 - Math.pow(1 - perFrame, dtMs / (1000 / 60));
}

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

export function edgeDistance(r: Rect, x: number, y: number): number {
  return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
}

/**
 * Blends the base colour toward nearby targets. Each target's weight eases from 0 at
 * `radius` to 1 at its edge; overlapping weights are normalised so colours never overshoot.
 */
export function blendColor(base: RGB, near: { color: RGB; distance: number }[], radius: number): RGB {
  let wsum = 0;
  const acc: RGB = [0, 0, 0];
  for (const n of near) {
    const t = Math.max(0, 1 - n.distance / radius);
    const w = 1 - (1 - t) ** 2; // ease-out
    if (w <= 0) continue;
    wsum += w;
    for (let i = 0; i < 3; i++) acc[i] += n.color[i] * w;
  }
  if (wsum === 0) return [...base] as RGB;
  const k = Math.min(1, wsum);
  return [0, 1, 2].map((i) => base[i] * (1 - k) + (acc[i] / wsum) * k) as RGB;
}

/** Lean of `magnet` px max toward the pointer, by how far it is from the centre. */
export function magnetOffset(r: Rect, x: number, y: number, magnet: number): [number, number] {
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const nx = Math.max(-1, Math.min(1, (x - cx) / (r.width / 2 || 1)));
  const ny = Math.max(-1, Math.min(1, (y - cy) / (r.height / 2 || 1)));
  return [nx * magnet, ny * magnet];
}

export interface CursorController {
  update(options: Partial<CursorOptions>): void;
  refresh(): void;
  readonly enabled: boolean;
  destroy(): void;
}

const NOOP: CursorController = { update() {}, refresh() {}, destroy() {}, enabled: false };

type Target = { el: HTMLElement; title: HTMLElement | null; rect: Rect | null; color: RGB | null; label: string; magnet: boolean; tx: number; ty: number };

export function createCursor(initial: Partial<CursorOptions> = {}): CursorController {
  if (typeof window === "undefined" || typeof document === "undefined") return NOOP;
  let o: CursorOptions = { ...CURSOR_DEFAULTS, ...initial };

  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;

  // ── DOM ───────────────────────────────────────────────────────────────
  const layer = document.createElement("div");
  layer.className = "nc-layer is-out";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = '<div class="nc-ring"><div class="nc-ring-fill"></div><span class="nc-label"></span><div class="nc-pulse"></div></div><div class="nc-dot"></div>';
  const ringEl = layer.querySelector<HTMLElement>(".nc-ring")!;
  const labelEl = layer.querySelector<HTMLElement>(".nc-label")!;
  const dotEl = layer.querySelector<HTMLElement>(".nc-dot")!;
  const spotEl = document.createElement("div");
  spotEl.className = "nc-spot is-out";
  spotEl.setAttribute("aria-hidden", "true");

  // ── state ─────────────────────────────────────────────────────────────
  let px = -1e4, py = -1e4;              // pointer
  let rx = px, ry = py, rs = o.ring;     // ring position + size
  let sx = px, sy = py;                  // spot position
  let base = parseColor(o.color) ?? [239, 236, 244];
  let spotBase = parseColor(o.spotColor) ?? [143, 167, 255];
  let col: RGB = [...base] as RGB, spotCol: RGB = [...spotBase] as RGB;
  let inScope = false, native = false, out = true, pressedAt = 0;
  let hovered: Target | null = null;
  let raf = 0, last = 0, measure = true, rescan = true, active = false;
  let lastCol = "", lastSpot = "";
  const targets = new Map<Element, Target>();
  const easing = new Set<Target>();       // titles springing back

  const reduced = () => reduce.matches;

  function scan() {
    rescan = false;
    targets.forEach((t, el) => { if (!el.isConnected) { if (t.title) t.title.style.transform = ""; targets.delete(el); easing.delete(t); } });
    document.querySelectorAll<HTMLElement>(o.targets).forEach((el) => {
      const prev = targets.get(el);
      const t: Target = prev ?? { el, title: null, rect: null, color: null, label: "", magnet: false, tx: 0, ty: 0 };
      t.title = el.querySelector<HTMLElement>("[data-cursor-title]");
      t.color = el.dataset.cursorColor ? parseColor(el.dataset.cursorColor) : null;
      t.label = el.dataset.cursor ?? "";
      t.magnet = el.hasAttribute("data-cursor-magnet");
      if (!prev) ro?.observe(el);
      targets.set(el, t);
    });
    measure = true;
  }

  function measureAll() {
    measure = false;
    targets.forEach((t) => {
      const r = t.el.getBoundingClientRect();
      t.rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    });
  }

  const mo = new MutationObserver((recs) => {
    for (const r of recs) if (r.type === "childList" || (r.type === "attributes" && (r.target as Element).matches?.(o.targets))) { rescan = true; break; }
    if (rescan) kick();
  });
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { measure = true; kick(); }) : null;

  // ── frame ─────────────────────────────────────────────────────────────
  const rgb = (c: RGB) => `${c[0] | 0} ${c[1] | 0} ${c[2] | 0}`;
  const close = (a: number, b: number, eps = 0.15) => Math.abs(a - b) < eps;

  function kick() { if (active && !raf) raf = requestAnimationFrame(frame); }

  function frame(now: number) {
    raf = 0;
    const dt = last ? Math.min(50, now - last) : 16.7;
    last = now;
    if (rescan) scan();
    if (measure) measureAll();
    const red = reduced();

    // Which target is under the pointer, and how near the others are.
    let over: Target | null = null;
    const near: { color: RGB; distance: number }[] = [];
    if (inScope && !out) {
      targets.forEach((t) => {
        if (!t.rect) return;
        const d = edgeDistance(t.rect, px, py);
        if (d === 0 && !over) over = t;
        if (t.color && d < o.colorRadius) near.push({ color: t.color, distance: d });
      });
    }
    const h = over as Target | null;
    if (h !== hovered) {
      if (hovered && hovered.title) easing.add(hovered);
      hovered = h;
      layer.classList.toggle("is-hover", !!h);
      labelEl.textContent = h?.label ?? "";
    }

    // Targets for the ring: magnet pulls it a few px toward the panel's centre.
    let tx = px, ty = py;
    if (h && h.magnet && h.rect && !red) {
      const [mx, my] = magnetOffset(h.rect, px, py, o.magnet);
      tx -= mx; ty -= my;
      if (h.title) { h.tx += (mx - h.tx) * lerpFactor(0.2, dt); h.ty += (my - h.ty) * lerpFactor(0.2, dt); h.title.style.transform = `translate3d(${h.tx.toFixed(2)}px, ${h.ty.toFixed(2)}px, 0)`; }
    }
    // Titles spring back once the pointer leaves their panel.
    easing.forEach((t) => {
      if (t === hovered && t.magnet) { easing.delete(t); return; }
      t.tx += -t.tx * lerpFactor(0.18, dt); t.ty += -t.ty * lerpFactor(0.18, dt);
      if (Math.abs(t.tx) < 0.05 && Math.abs(t.ty) < 0.05) { t.tx = t.ty = 0; t.title!.style.transform = ""; easing.delete(t); }
      else t.title!.style.transform = `translate3d(${t.tx.toFixed(2)}px, ${t.ty.toFixed(2)}px, 0)`;
    });

    const pressing = now - pressedAt < 130;
    const size = (h ? o.hoverRing : o.ring) * (pressing ? 0.72 : 1);
    const kr = red ? 1 : lerpFactor(o.trail, dt);
    rx += (tx - rx) * kr; ry += (ty - ry) * kr; rs += (size - rs) * (red ? 1 : lerpFactor(0.22, dt));
    const ks = red ? 1 : lerpFactor(o.spotTrail, dt);
    sx += (px - sx) * ks; sy += (py - sy) * ks;

    // Over a panel, that panel's colour wins outright; nearby, colours blend by distance.
    const blendFrom = h && h.color ? [{ color: h.color, distance: 0 }] : near;
    const targetCol = blendColor(base, blendFrom, o.colorRadius);
    const targetSpot = blendColor(spotBase, blendFrom, o.colorRadius);
    const kc = red ? 1 : lerpFactor(0.14, dt);
    for (let i = 0; i < 3; i++) { col[i] += (targetCol[i] - col[i]) * kc; spotCol[i] += (targetSpot[i] - spotCol[i]) * kc; }

    // Write: transforms and two colour variables, nothing that triggers layout.
    const half = o.hoverRing / 2;
    dotEl.style.transform = `translate3d(${(px - 4).toFixed(1)}px, ${(py - 4).toFixed(1)}px, 0)`;
    ringEl.style.transform = `translate3d(${(rx - half).toFixed(2)}px, ${(ry - half).toFixed(2)}px, 0) scale(${(rs / o.hoverRing).toFixed(4)})`;
    spotEl.style.transform = `translate3d(${(sx - o.spot / 2).toFixed(1)}px, ${(sy - o.spot / 2).toFixed(1)}px, 0)`;
    const c1 = rgb(col), c2 = rgb(spotCol);
    if (c1 !== lastCol) { layer.style.setProperty("--nc-rgb", c1); lastCol = c1; }
    if (c2 !== lastSpot) { spotEl.style.setProperty("--nc-spot-rgb", c2); lastSpot = c2; }

    const settled = close(rx, tx) && close(ry, ty) && close(rs, size) && close(sx, px, 0.5) && close(sy, py, 0.5)
      && col.every((v, i) => close(v, targetCol[i], 0.5)) && spotCol.every((v, i) => close(v, targetSpot[i], 0.5))
      && easing.size === 0 && !pressing && (!h || !h.magnet || (close(h.tx, magnetOffset(h.rect!, px, py, o.magnet)[0], 0.05)));
    if (!settled) kick(); else last = 0;
  }

  // ── input ─────────────────────────────────────────────────────────────
  function setVisible() {
    const hidden = out || !inScope || native;
    layer.classList.toggle("is-out", hidden);
    spotEl.classList.toggle("is-out", out || !inScope);
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const t = e.target as Element | null;
    const wasHidden = out || !inScope;
    px = e.clientX; py = e.clientY;
    inScope = !!t?.closest?.(o.scope);
    native = !!t?.closest?.(o.native);
    if (out) out = false;
    if (wasHidden && inScope) { rx = px; ry = py; sx = px; sy = py; } // appear in place, don't sweep in
    setVisible();
    kick();
  };
  const onLeaveWindow = (e: MouseEvent) => { if (!e.relatedTarget) { out = true; setVisible(); kick(); } };
  const onBlur = () => { out = true; setVisible(); };
  const onScroll = () => { measure = true; kick(); };

  // Press: the ring shrinks, then pulses; links wait a moment so the press is seen.
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "touch" || e.button !== 0 || !inScope || native) return;
    pressedAt = performance.now();
    if (!reduced()) { ringEl.classList.remove("is-pulse"); void ringEl.offsetWidth; ringEl.classList.add("is-pulse"); }
    kick();
  };
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || reduced()) return;
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || !a.closest(o.targets) || !a.closest(o.scope) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    e.preventDefault();
    root.classList.add("nc-leaving");
    window.setTimeout(() => { root.classList.remove("nc-leaving"); window.location.assign(a.href); }, o.pressDelay);
  };

  function enable() {
    if (active) return;
    active = true;
    root.classList.add("nc-on");
    document.body.appendChild(layer);
    document.body.appendChild(spotEl);
    root.classList.toggle("nc-reduced", reduced());
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("click", onClick);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("blur", onBlur);
    document.addEventListener("mouseout", onLeaveWindow);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-cursor", "data-cursor-color", "data-cursor-magnet"] });
    if (ro) targets.forEach((t) => ro.observe(t.el));
    rescan = true;
    kick();
  }

  function disable() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf); raf = 0;
    root.classList.remove("nc-on", "nc-reduced", "nc-leaving");
    layer.remove(); spotEl.remove();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    document.removeEventListener("click", onClick);
    window.removeEventListener("scroll", onScroll, { capture: true });
    window.removeEventListener("resize", onScroll);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("mouseout", onLeaveWindow);
    mo.disconnect(); ro?.disconnect();
    targets.forEach((t) => { if (t.title) t.title.style.transform = ""; });
    out = true;
  }

  // Touch screens and coarse pointers keep the native behaviour.
  const onMedia = () => {
    if (fine.matches) { enable(); root.classList.toggle("nc-reduced", reduced()); } else disable();
  };
  fine.addEventListener?.("change", onMedia);
  reduce.addEventListener?.("change", onMedia);
  if (fine.matches) enable();

  function applyStyleVars() {
    layer.style.setProperty("--nc-hover", `${o.hoverRing}px`);
    spotEl.style.setProperty("--nc-spot", `${o.spot}px`);
  }
  applyStyleVars();

  return {
    get enabled() { return active; },
    update(next) {
      o = { ...o, ...next };
      base = parseColor(o.color) ?? base;
      spotBase = parseColor(o.spotColor) ?? spotBase;
      applyStyleVars();
      rescan = true;
      kick();
    },
    refresh() { rescan = true; measure = true; kick(); },
    destroy() {
      disable();
      fine.removeEventListener?.("change", onMedia);
      reduce.removeEventListener?.("change", onMedia);
    },
  };
}
