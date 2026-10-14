"use client";
import { useState, useTransition } from "react";
import { setSaved } from "@/app/actions/saved";
import { toast } from "./toast";
import { haptic } from "./haptics";

/* The save heart. Fills and pops the moment it's tapped, saves in the background, and
   puts itself back (with a message) if the save didn't go through. */
export function SaveButton({ itemId, name, initial, signInHref = "/login", className = "heart card-save" }: {
  itemId: string; name: string; initial: boolean; signInHref?: string; className?: string;
}) {
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  const toggle = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();       // it sits on a card link
    const next = !on;
    setOn(next);
    haptic(next ? "success" : "tap");
    start(async () => {
      try {
        const r = await setSaved(itemId, next);
        if (!r.ok) {
          setOn(!next);
          toast({ message: r.error, tone: r.signIn ? "info" : "bad", action: r.signIn ? { label: "Sign in", href: `${signInHref}?next=${encodeURIComponent(location.pathname)}` } : undefined });
          return;
        }
        toast({ message: next ? `Saved ${name}` : `Removed ${name} from saved`, tone: "ok", action: { label: "Undo", onClick: () => { setOn(!next); void setSaved(itemId, !next); } }, duration: 3200 });
      } catch {
        setOn(!next);
        toast({ message: "Couldn't save that. Check your connection and try again.", tone: "bad" });
      }
    });
  };
  return (
    <button type="button" className={className} aria-pressed={on} aria-label={on ? `Remove ${name} from saved` : `Save ${name}`} onClick={toggle}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" strokeLinejoin="round" /></svg>
    </button>
  );
}
