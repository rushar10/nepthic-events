"use client";
import { useEffect, useRef } from "react";
import { acquireGlow, type GlowController, type GlowOptions } from "./glow/engine";

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

  useEffect(() => {
    ctl.current = acquireGlow(options);
    return () => { ctl.current?.release(); ctl.current = null; };
    // Started once; option changes go through update() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ctl.current?.controller.update(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

/** Back-compatible name used by the app layouts. */
export const Proximity = GlowProvider;
