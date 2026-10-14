"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Icon } from "./Icons";

/* ---------------------------------------------------------------------------
   Mobile chrome shared by every site: hide-on-scroll header, slide-out menu,
   bottom navigation and bottom sheets. All of it is CSS-gated to small screens;
   on desktop the regular header and sidebars take over.
--------------------------------------------------------------------------- */

/** Hides the sticky header while scrolling down, shows it again on scroll up. */
export function HeaderScroll() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".top");
    if (!header) return;
    let last = window.scrollY, raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const down = y > last + 4 && y > 64;
        const up = y < last - 4 || y < 64;
        if (down) header.dataset.hidden = "true";
        else if (up) delete header.dataset.hidden;
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return null;
}

export type NavItem = { href: string; label: string; icon: string; badge?: number; match?: string[] };

function isActive(path: string, item: NavItem) {
  const targets = [item.href, ...(item.match ?? [])];
  return targets.some((h) => (h === "/" ? path === "/" : path === h || path.startsWith(`${h}/`)));
}

/** Fixed bottom tab bar for phones. */
export function BottomNav({ items, label = "Main" }: { items: NavItem[]; label?: string }) {
  const path = usePathname();
  const best = items.filter((i) => isActive(path, i)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="bottom-nav" aria-label={label}>
      {items.map((i) => (
        <a key={i.href} href={i.href} aria-current={best === i.href ? "page" : undefined}>
          <span className="bn-icon"><Icon name={i.icon} filled={best === i.href} />{!!i.badge && <span className="bn-badge">{i.badge}</span>}</span>
          <span className="bn-label">{i.label}</span>
        </a>
      ))}
    </nav>
  );
}

/** Slide-out menu (right edge). Swipe right or tap outside to close. */
export function MenuDrawer({ children, label = "Menu" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    document.documentElement.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => { document.removeEventListener("keydown", esc); document.documentElement.style.overflow = ""; };
  }, [open]);
  // Rendered at the end of <body>: inside the header, a transformed (hidden) header
  // would become the drawer's containing block and disturb page scrolling.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const layer = (
    <>
      <div className={`drawer-scrim${open ? " open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        id="menu-drawer" ref={panel} role="dialog" aria-modal="true" aria-label={label}
        className={`drawer${open ? " open" : ""}`}
        onPointerDown={(e) => { start.current = e.clientX; }}
        onPointerUp={(e) => { if (start.current != null && e.clientX - start.current > 70) setOpen(false); start.current = null; }}
        inert={!open}
      >
        <div className="spread"><span className="logo">NEPTHIC</span>
          <button className="menu-btn" aria-label="Close menu" onClick={() => setOpen(false)}><Icon name="close" /></button></div>
        {children}
      </div>
    </>
  );
  return (
    <>
      <button className="menu-btn" aria-expanded={open} aria-controls="menu-drawer" aria-label="Open menu" onClick={() => setOpen(true)}>
        <Icon name="menu" />
      </button>
      {mounted && createPortal(layer, document.body)}
    </>
  );
}

/** Bottom sheet built on <dialog>. Drag the handle down (or tap the backdrop) to dismiss. */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const end = () => {
    if (!ref.current) return;
    const far = (drag.current?.dy ?? 0) > 90;
    ref.current.style.transform = "";
    drag.current = null;
    if (far) onClose();
  };
  return (
    <dialog ref={ref} className="sheet" aria-label={title} onClose={onClose} onCancel={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="sheet-handle" onPointerDown={(e) => { drag.current = { y: e.clientY, dy: 0 }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-hidden="true"><span /></div>
      <div className="sheet-body">
        <div className="spread"><h2 className="h3">{title}</h2><button type="button" className="menu-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        {children}
      </div>
    </dialog>
  );
}

/**
 * Swipe a card right to approve or left to reject. A bottom sheet asks for confirmation,
 * then clicks the matching submit button inside the card (data-swipe="approve|reject").
 * Buttons stay visible, so swiping is a shortcut, never the only way.
 */
export function Swipeable({ children, approveLabel, rejectLabel }: { children: ReactNode; approveLabel: string; rejectLabel: string }) {
  const el = useRef<HTMLDivElement>(null);
  const s = useRef<{ x: number; y: number; dx: number; lock?: "x" | "y" } | null>(null);
  const [ask, setAsk] = useState<null | "approve" | "reject">(null);
  const down = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("input,textarea,select,button,a")) return;
    s.current = { x: e.clientX, y: e.clientY, dx: 0 };
  };
  const move = (e: React.PointerEvent) => {
    const st = s.current; if (!st || !el.current) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.lock) st.lock = Math.abs(dx) > Math.abs(dy) + 6 ? "x" : Math.abs(dy) > 10 ? "y" : undefined;
    if (st.lock !== "x") return;
    st.dx = dx;
    el.current.style.transform = `translateX(${dx * 0.6}px)`;
    el.current.dataset.swipe = dx > 0 ? "approve" : "reject";
  };
  const up = () => {
    const st = s.current; s.current = null;
    if (!el.current) return;
    el.current.style.transform = "";
    delete el.current.dataset.swipe;
    if (st?.lock === "x" && Math.abs(st.dx) > 110) setAsk(st.dx > 0 ? "approve" : "reject");
  };
  const confirm = () => {
    el.current?.querySelector<HTMLButtonElement>(`[data-swipe="${ask}"]`)?.click();
    setAsk(null);
  };
  return (
    <div className="swipe-wrap">
      <div className="swipe-hint approve" aria-hidden="true"><Icon name="check" /> {approveLabel}</div>
      <div className="swipe-hint reject" aria-hidden="true">{rejectLabel} <Icon name="close" /></div>
      <div ref={el} className="swipe" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>{children}</div>
      <BottomSheet open={!!ask} onClose={() => setAsk(null)} title={ask === "approve" ? approveLabel : rejectLabel}>
        <p className="dim">{ask === "approve" ? "This is final and the customer is emailed straight away." : "The customer is emailed with your note."}</p>
        <div className="row">
          <button type="button" className={`btn ${ask === "approve" ? "btn-ok" : "btn-bad"}`} onClick={confirm}>{ask === "approve" ? approveLabel : rejectLabel}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>Cancel</button>
        </div>
      </BottomSheet>
    </div>
  );
}

/** Registers the service worker (PWA install + offline fallback). */
export function RegisterSW({ signedIn = true, src = "/sw.js", scope = "/" }: { signedIn?: boolean; src?: string; scope?: string }) {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(src, { scope }).then((reg) => {
        // Signed out: drop any tickets/account pages cached for offline use on this device.
        if (!signedIn) (reg.active ?? navigator.serviceWorker.controller)?.postMessage("clear-private");
      }).catch(() => {});
    }
    const c = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (c?.saveData) document.documentElement.dataset.lite = "true";
  }, [signedIn, src, scope]);
  return null;
}
