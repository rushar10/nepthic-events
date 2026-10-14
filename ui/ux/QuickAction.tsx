"use client";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "./toast";
import { haptic } from "./haptics";

/* One-tap action (Approve, Reject…) that shows its result straight away. The server
   action runs in the background; if it fails the button comes back and a toast says why. */
export function QuickAction({ action, fields, children, done, className = "btn btn-sm" }: {
  action: (fd: FormData) => Promise<unknown>;
  fields: Record<string, string>;
  children: ReactNode;
  /** what to show once pressed, e.g. "Approved" */
  done: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "done">("idle");
  const [, start] = useTransition();
  const run = () => {
    setState("done");
    haptic("success");
    start(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      try {
        await action(fd);
        toast({ message: done, tone: "ok" });
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
        setState("idle");
        toast({ message: e instanceof Error && e.message ? e.message : "That didn't save. Try again.", tone: "bad" });
      }
    });
  };
  return state === "done"
    ? <span className="pill ok opt-badge-inline" role="status">{done}</span>
    : <button type="button" className={className} onClick={run}>{children}</button>;
}
