"use client";
import { useEffect } from "react";
import { startReveal, type RevealStop } from "./reveal/engine";

/** The knitted background that lights up in colour around the cursor (see reveal/engine.ts).
    Off when the site's proximity effects are switched off in admin settings. */
export function Reveal({ palette, strength = 0.7, enabled = true }: { palette: RevealStop[]; strength?: number; enabled?: boolean }) {
  const key = JSON.stringify(palette);
  useEffect(() => {
    if (!enabled) return;
    return startReveal({ palette: JSON.parse(key) as RevealStop[], strength });
  }, [key, strength, enabled]);
  return null;
}
