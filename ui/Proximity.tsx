"use client";
import { useEffect, useRef } from "react";
import type { GlowController, GlowOptions } from "./glow/engine";

export type GlowProviderProps = Partial<GlowOptions> & {
  /** false turns the effect off (Admin → Settings). */
  enabled?: boolean;
  /** Extra strength multiplier for the whole page (Admin uses ~0.55 so tables stay calm). */
  scale?: number;
};

/**
 * Starts the proximity glow engine for the page. Render once, in the root layout.
 * Every element with `data-glow` (or the legacy `.prox` class) then glows as the
 * cursor approaches. Settings can change at runtime; the engine updates in place.
 *
 *   <GlowProvider radius={150} intensity={0.9} curve="ease-out" fade={250} />
 */
export function GlowProvider({ enabled = true, scale = 1, intensity = 1, mode, ...rest }: GlowProviderProps) {
  const ctl = useRef<{ controller: GlowController; release: () => void } | null>(null);
  const options: Partial<GlowOptions> = { ...rest, intensity: intensity * scale, mode: enabled ? (mode ?? "auto") : "off" };
  const key = JSON.stringify(options);

  const latest = useRef(options);
  latest.current = options;

  /* Started once the page has loaded and the browser is idle, so it never competes with
     the first paint or hydration. Option changes go through update() below. */
  useEffect(() => {
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
      // The engine is its own chunk, fetched only now, so it costs nothing on the critical path.
      const go = () => import("./glow/engine").then(({ acquireGlow }) => { if (!cancelled && !ctl.current) ctl.current = acquireGlow(latest.current); });
      if (ric) ric(go, { timeout: 2000 }); else setTimeout(go, 200);
    };
    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
    return () => { cancelled = true; window.removeEventListener("load", start); ctl.current?.release(); ctl.current = null; };
  }, []);

  useEffect(() => {
    ctl.current?.controller.update(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

/** Back-compatible name used by the app layouts. */
export const Proximity = GlowProvider;
