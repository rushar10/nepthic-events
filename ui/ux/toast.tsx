"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { haptic } from "./haptics";

/* Toasts: slide in from the bottom on phones (above the tab bar) and top-right on desktop,
   dismiss themselves, can carry one action ("Undo", "View order") and can be swiped away. */

export type ToastInput = {
  message: string;
  tone?: "ok" | "bad" | "info";
  action?: { label: string; onClick?: () => void; href?: string };
  /** ms before it leaves on its own; 0 keeps it until dismissed */
  duration?: number;
};
type Toast = ToastInput & { id: number; leaving?: boolean };

const Ctx = createContext<(t: ToastInput) => void>(() => {});
let external: ((t: ToastInput) => void) | null = null;

/** Show a toast from anywhere, including outside React (e.g. after a fetch). */
export function toast(t: ToastInput) { external?.(t); }
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const leave = useCallback((id: number) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 260);
  }, []);
  const push = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { ...t, id }]);
    if (t.tone === "bad") haptic("error");
    const ms = t.duration ?? (t.action ? 6000 : 3800);
    if (ms > 0) setTimeout(() => leave(id), ms);
  }, [leave]);
  useEffect(() => { external = push; return () => { if (external === push) external = null; }; }, [push]);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {items.map((t) => <ToastItem key={t.id} t={t} onClose={() => leave(t.id)} />)}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ t, onClose }: { t: Toast; onClose: () => void }) {
  const start = useRef<number | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const icon = t.tone === "bad" ? "!" : t.tone === "info" ? "i" : "✓";
  return (
    <div ref={el} className="toast" role={t.tone === "bad" ? "alert" : "status"} data-tone={t.tone ?? "ok"} data-leaving={t.leaving || undefined}
      onPointerDown={(e) => { start.current = e.clientX; }}
      onPointerMove={(e) => { if (start.current != null && el.current) el.current.style.transform = `translateX(${e.clientX - start.current}px)`; }}
      onPointerUp={(e) => { const dx = start.current == null ? 0 : e.clientX - start.current; start.current = null; if (el.current) el.current.style.transform = ""; if (Math.abs(dx) > 80) onClose(); }}>
      <span className="t-ico" aria-hidden="true">{icon}</span>
      <span className="t-msg">{t.message}</span>
      {t.action && (t.action.href
        ? <a className="t-act" href={t.action.href} onClick={onClose}>{t.action.label}</a>
        : <button type="button" className="t-act" onClick={() => { t.action?.onClick?.(); onClose(); }}>{t.action.label}</button>)}
    </div>
  );
}
