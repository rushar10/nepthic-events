"use client";
import { useEffect, useRef } from "react";
import { createCursor, type CursorController, type CursorOptions } from "./cursor/engine";

/**
 * Custom cursor (dot + trailing ring + ambient light). Render once on a page, and mark
 * the area where it should replace the native cursor with `data-nc-scope`:
 *
 *   import "@/ui/cursor/cursor.css";
 *   <CustomCursor />
 *   <main data-nc-scope>
 *     <a href="/wholesale" data-cursor="Order" data-cursor-color="#8FA7FF" data-cursor-magnet>
 *       <h2 data-cursor-title>Wholesale</h2>
 *     </a>
 *     <footer data-cursor-native>…</footer>
 *   </main>
 *
 * Does nothing on touch screens; reduced motion gets a plain dot.
 */
export function CustomCursor(props: Partial<CursorOptions>) {
  const ctl = useRef<CursorController | null>(null);
  const key = JSON.stringify(props);

  useEffect(() => {
    ctl.current = createCursor(props);
    return () => { ctl.current?.destroy(); ctl.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ctl.current?.update(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

/** Attributes for a cursor target, for server components and plain JSX. */
export function cursorProps({ label, color, magnet = true }: { label?: string; color?: string; magnet?: boolean } = {}) {
  return {
    "data-cursor": label ?? "",
    ...(color && { "data-cursor-color": color }),
    ...(magnet && { "data-cursor-magnet": "" }),
  } as Record<string, string>;
}
