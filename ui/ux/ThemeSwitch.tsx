"use client";
import { useEffect, useState } from "react";

/* Light / dark switch for the public site. Follows the device until someone picks; the
   choice is kept in a cookie so the server renders the right theme first time. The new
   theme grows out of the button as a circle (a plain cross-fade with reduced motion). */
type VTDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

export function ThemeSwitch({ initial, cookie = "nep_theme" }: { initial: "light" | "dark" | null; cookie?: string }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(initial);
  useEffect(() => { if (!theme) setTheme(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"); }, [theme]);
  const next = theme === "dark" ? "light" : "dark";
  const flip = (e: React.MouseEvent<HTMLButtonElement>) => {
    const root = document.documentElement;
    const apply = () => { root.dataset.theme = next; document.cookie = `${cookie}=${next}; path=/; max-age=31536000; samesite=lax`; setTheme(next); };
    const doc = document as VTDoc;
    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); return; }
    const r = e.currentTarget.getBoundingClientRect();
    root.style.setProperty("--tx", `${r.left + r.width / 2}px`);
    root.style.setProperty("--ty", `${r.top + r.height / 2}px`);
    root.dataset.themeSwitch = "";
    doc.startViewTransition(apply).finished.finally(() => delete root.dataset.themeSwitch);
  };
  const label = `Switch to ${next} mode`;
  return (
    <button type="button" className="theme-btn" onClick={flip} aria-label={label} title={label}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === "dark"
          ? <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
          : <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />}
      </svg>
    </button>
  );
}
