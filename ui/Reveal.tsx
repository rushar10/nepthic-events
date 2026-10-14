"use client";
import { useEffect } from "react";
import type { RevealStop } from "./reveal/engine";

/** The knitted background that lights up in colour around the cursor (see reveal/engine.ts).
    Off when the site's proximity effects are switched off in admin settings. */
export function Reveal({ palette, strength = 0.7, enabled = true }: { palette: RevealStop[]; strength?: number; enabled?: boolean }) {
  const key = JSON.stringify(palette);
  useEffect(() => {
    if (!enabled) return;
    // Loaded as a separate chunk after hydration: decoration never delays content.
    let stop: (() => void) | null = null, cancelled = false;
    import("./reveal/engine").then(({ startReveal }) => { if (!cancelled) stop = startReveal({ palette: JSON.parse(key) as RevealStop[], strength }); });
    return () => { cancelled = true; stop?.(); };
  }, [key, strength, enabled]);
  return null;
}
