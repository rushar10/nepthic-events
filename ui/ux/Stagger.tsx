"use client";
import { Children, useEffect, useState, type ReactNode } from "react";

/* Animates its children in with a small stagger the first time this list is shown in the
   tab session only. Coming back (Back button, revisiting) shows it instantly. Each child is
   wrapped in a grid cell (.li) so the stagger works for server and client components alike. */
const seen = new Set<string>();

export function Stagger({ children, className, id }: { children: ReactNode; className?: string; id: string }) {
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    const key = `${location.pathname}#${id}`;
    let first = !seen.has(key);
    try { first = first && !sessionStorage.getItem(`seen:${key}`); sessionStorage.setItem(`seen:${key}`, "1"); } catch { /* ignore */ }
    seen.add(key);
    if (first) setEnter(true);
  }, [id]);
  return (
    <div className={className} data-enter={enter || undefined}>
      {Children.toArray(children).map((c, i) => <div className="li" key={i} style={{ ["--i" as string]: i }}>{c}</div>)}
    </div>
  );
}
