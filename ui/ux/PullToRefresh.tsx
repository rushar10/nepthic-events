"use client";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { haptic } from "./haptics";

/* Pull down from the top of the page (touch only) to refresh the server data in place. */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLDivElement>(null);
  const s = useRef<{ y: number; d: number } | null>(null);
  const [state, setState] = useState<"idle" | "loading">("idle");
  const MAX = 90, TRIGGER = 64;

  const show = (d: number) => {
    if (!ind.current) return;
    const p = Math.min(1, d / TRIGGER);
    ind.current.style.opacity = String(p);
    ind.current.style.transform = `translateY(${Math.min(d, MAX) - 44}px)`;
    const svg = ind.current.querySelector("svg");
    if (svg) svg.style.transform = `rotate(${p * 270}deg)`;
  };
  const reset = () => { if (!ind.current) return; ind.current.style.transition = "transform 250ms cubic-bezier(.2,.8,.2,1), opacity 250ms"; show(0); setTimeout(() => { if (ind.current) ind.current.style.transition = ""; }, 260); };

  return (
    <div ref={box} className="ptr" data-ptr={state}
      onTouchStart={(e) => { if (window.scrollY <= 0 && state === "idle") s.current = { y: e.touches[0].clientY, d: 0 }; }}
      onTouchMove={(e) => {
        if (!s.current) return;
        const d = (e.touches[0].clientY - s.current.y) * 0.5;
        if (d <= 0) { s.current.d = 0; show(0); return; }
        if (s.current.d < TRIGGER && d >= TRIGGER) haptic("tap");
        s.current.d = d; show(d);
      }}
      onTouchEnd={async () => {
        const d = s.current?.d ?? 0; s.current = null;
        if (d < TRIGGER) { reset(); return; }
        setState("loading"); show(TRIGGER);
        router.refresh();
        await new Promise((r) => setTimeout(r, 700));
        setState("idle"); reset();
      }}>
      <div ref={ind} className="ptr-ind" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg>
      </div>
      {state === "loading" && <span className="sr-only" role="status">Refreshing</span>}
      {children}
    </div>
  );
}
