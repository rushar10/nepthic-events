"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ToastProvider } from "./toast";
import { haptic } from "./haptics";

/* ---------------------------------------------------------------------------
   App shell: the behaviour that makes the site feel like an app.
   - Internal links navigate client-side inside a View Transition (soft fade/slide,
     shared-element morphs for anything with the same view-transition-name).
   - Links are prefetched when hovered, touched, focused or scrolled into view.
   - Sliding indicator under tabs and filter chips.
   - Forms marked data-persist keep what was typed if you leave and come back.
   - Steppers nudge and tap feedback fires on key controls.
   Plain <a href> everywhere, so every link still works without JavaScript.
--------------------------------------------------------------------------- */

type VTDoc = Document & { startViewTransition?: (cb: () => Promise<void> | void) => { finished: Promise<void> } };


function internalHref(a: HTMLAnchorElement): URL | null {
  if (!a.href || a.target && a.target !== "_self" || a.hasAttribute("download") || a.dataset.native !== undefined) return null;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return null;
  if (url.pathname.startsWith("/api/") || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return null;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return null; // in-page anchor
  return url;
}

function waitForUrl(href: string, ms = 4000) {
  return new Promise<void>((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (location.href === href || performance.now() - t0 > ms) requestAnimationFrame(() => resolve());
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();

  /* page transitions + prefetch */
  useEffect(() => {
    const doc = document as VTDoc;
    const prefetched = new Set<string>();
    const prefetch = (url: URL) => {
      const key = url.pathname + url.search;
      if (prefetched.has(key)) return;
      prefetched.add(key);
      try { router.prefetch(key); } catch { /* ignore */ }
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const url = internalHref(a as HTMLAnchorElement);
      if (!url) return;
      e.preventDefault();
      const href = url.href;
      const go = () => router.push(url.pathname + url.search + url.hash);
      if (href === location.href) return;
      if (!doc.startViewTransition) { go(); return; }
      doc.documentElement.dataset.nav = "forward";
      doc.startViewTransition(async () => { go(); await waitForUrl(href); });
    };

    const onIntent = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const url = internalHref(a as HTMLAnchorElement);
      if (url) prefetch(url);
    };

    // Prefetch links that scroll into view, a few at a time when the browser is idle.
    const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
      const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        io?.unobserve(en.target);
        idle(() => { const url = internalHref(en.target as HTMLAnchorElement); if (url) prefetch(url); });
      }
    }, { rootMargin: "120px" }) : null;
    const observeLinks = () => {
      if (!io || (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData) return;
      document.querySelectorAll("main a[href]").forEach((a) => io.observe(a));
    };
    observeLinks();
    const mo = new MutationObserver(() => observeLinks());
    mo.observe(document.body, { childList: true, subtree: true });

    // Capture phase: runs before Next <Link>, which then sees defaultPrevented and stands down.
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerenter", onIntent, true);
    document.addEventListener("touchstart", onIntent, { capture: true, passive: true });
    document.addEventListener("focusin", onIntent);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerenter", onIntent, true);
      document.removeEventListener("touchstart", onIntent, true);
      document.removeEventListener("focusin", onIntent);
      io?.disconnect(); mo.disconnect();
    };
  }, [router]);

  /* sliding indicator under tabs: drawn by CSS (.tabs::after) from custom properties,
     so nothing is inserted into markup React may still be hydrating */
  useEffect(() => {
    const place = () => {
      document.querySelectorAll<HTMLElement>(".tabs").forEach((bar) => {
        const active = bar.querySelector<HTMLElement>('.tab[aria-current="page"], .tab[aria-selected="true"]');
        if (!active) { bar.style.removeProperty("--ink-w"); return; }
        const b = bar.getBoundingClientRect(), r = active.getBoundingClientRect();
        if (!bar.style.getPropertyValue("--ink-w")) bar.dataset.inkInit = "";        // first placement: no slide
        bar.style.setProperty("--ink-x", `${r.left - b.left + bar.scrollLeft + 12}px`);
        bar.style.setProperty("--ink-y", `${r.bottom - b.top - 3}px`);
        bar.style.setProperty("--ink-w", `${Math.max(8, r.width - 24)}`);
        requestAnimationFrame(() => requestAnimationFrame(() => delete bar.dataset.inkInit));
      });
    };
    place();
    const mo = new MutationObserver(() => requestAnimationFrame(place));
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-current", "aria-selected"] });
    window.addEventListener("resize", place, { passive: true });
    document.fonts?.ready.then(place);
    return () => { mo.disconnect(); window.removeEventListener("resize", place); };
  }, []);

  /* keep drafts: forms with data-persist remember typed values for this tab session */
  useEffect(() => {
    const key = (f: HTMLFormElement) => `draft:${location.pathname}:${f.dataset.persist}`;
    const fields = (f: HTMLFormElement) => [...f.elements].filter((el): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      (el instanceof HTMLInputElement && !["password", "hidden", "file", "submit", "button"].includes(el.type)) || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement);
    const restore = () => document.querySelectorAll<HTMLFormElement>("form[data-persist]:not([data-restored])").forEach((f) => {
      f.dataset.restored = "1";
      try {
        const saved = JSON.parse(sessionStorage.getItem(key(f)) ?? "{}") as Record<string, string | boolean>;
        for (const el of fields(f)) {
          if (!el.name || !(el.name in saved)) continue;
          if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) { if (el.type === "checkbox") el.checked = !!saved[el.name]; else el.checked = saved[el.name] === el.value; }
          else if (!el.value) el.value = String(saved[el.name]);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } catch { /* storage blocked */ }
    });
    const save = (e: Event) => {
      const f = (e.target as Element).closest?.("form[data-persist]") as HTMLFormElement | null;
      if (!f) return;
      const out: Record<string, string | boolean> = {};
      for (const el of fields(f)) {
        if (!el.name) continue;
        if (el instanceof HTMLInputElement && el.type === "checkbox") out[el.name] = el.checked;
        else if (el instanceof HTMLInputElement && el.type === "radio") { if (el.checked) out[el.name] = el.value; }
        else out[el.name] = el.value;
      }
      try { sessionStorage.setItem(key(f), JSON.stringify(out)); } catch { /* ignore */ }
    };
    const clear = (e: Event) => { const f = e.target as HTMLFormElement; if (f.dataset?.persist) setTimeout(() => { try { sessionStorage.removeItem(key(f)); } catch { /* ignore */ } }, 0); };
    restore();
    const mo = new MutationObserver(restore);
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", save);
    document.addEventListener("change", save);
    document.addEventListener("submit", clear);
    return () => { mo.disconnect(); document.removeEventListener("input", save); document.removeEventListener("change", save); document.removeEventListener("submit", clear); };
  }, []);

  /* stepper nudge + tap feedback */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const b = (e.target as Element).closest?.(".stepper button");
      if (!b) return;
      const input = b.parentElement?.querySelector<HTMLElement>("input, output");
      if (input) { input.dataset.nudge = ""; setTimeout(() => delete input.dataset.nudge, 150); }
      haptic("tap");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return <ToastProvider>{children}</ToastProvider>;
}
