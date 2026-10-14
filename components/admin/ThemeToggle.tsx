"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/ui/Icons";

/** Light / dark switch. Saved in a cookie so the server renders the right theme first time. */
export function ThemeToggle({ initial }: { initial: "light" | "dark" | null }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(initial);
  useEffect(() => {
    if (theme) return;
    setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, [theme]);
  const next = theme === "dark" ? "light" : "dark";
  const flip = () => {
    document.documentElement.dataset.theme = next;
    document.cookie = `nep_admin_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  };
  return (
    <button type="button" className="round" onClick={flip} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      <Icon name={theme === "dark" ? "sun" : "moon"} size={20} />
    </button>
  );
}
