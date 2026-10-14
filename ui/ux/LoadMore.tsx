"use client";
import { Children, useEffect, useState, type ReactNode } from "react";

/* Shows the first `step` items and a "Load more" button. How many are shown is remembered
   for this page in the tab session, so Back returns to the same spot with the same items. */
export function LoadMore({ children, step = 9, id, className, label = "Load more" }: { children: ReactNode; step?: number; id: string; className?: string; label?: string }) {
  const all = Children.toArray(children);
  const [n, setN] = useState(step);
  const [prev, setPrev] = useState(step);
  useEffect(() => {
    try { const saved = Number(sessionStorage.getItem(`more:${location.pathname}:${id}`)); if (saved > step) { setN(saved); setPrev(saved); } } catch { /* ignore */ }
  }, [id, step]);
  const more = () => {
    const next = n + step;
    setPrev(n);
    setN(next);
    try { sessionStorage.setItem(`more:${location.pathname}:${id}`, String(next)); } catch { /* ignore */ }
  };
  return (
    <>
      <div className={className}>
        {all.slice(0, n).map((c, i) => <div className="li" key={i} data-new={i >= prev || undefined} style={{ ["--i" as string]: Math.max(0, i - prev) }}>{c}</div>)}
      </div>
      {all.length > n && (
        <div className="more-wrap">
          <button type="button" className="btn prox" onClick={more}>{label}</button>
          <span className="small dim">Showing {n} of {all.length}</span>
        </div>
      )}
    </>
  );
}
