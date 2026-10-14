"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/ui/Icons";

type WakeLock = { release: () => Promise<void> };

/* Full-screen, max-contrast QR for the door. Keeps the screen awake while open.
   Browsers don't let a web page change screen brightness, so we use pure white,
   ask the phone to stay awake, and remind the holder to turn brightness up. */
export function FullScreenTicket({ qr, code, eventName, holder, typeName, autoOpen }: {
  qr: string; code: string; eventName: string; holder: string; typeName: string; autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpen && window.matchMedia("(max-width: 760px)").matches) setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!open) return;
    let lock: WakeLock | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
    nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    document.documentElement.requestFullscreen?.().catch(() => {});
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => {
      lock?.release().catch(() => {});
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <>
      <button type="button" className="btn btn-primary prox" onClick={() => setOpen(true)}><Icon name="sun" /> Show at the door</button>
      {open && (
        <div className="ticket-full" role="dialog" aria-modal="true" aria-label={`Ticket ${code}`} onClick={() => setOpen(false)}>
          <b style={{ fontFamily: "var(--f-display)", fontSize: "1.3rem" }}>{eventName}</b>
          <img src={qr} alt={`QR code for ticket ${code}`} />
          <span className="code">{code}</span>
          <span>{typeName} · {holder}</span>
          <span style={{ fontSize: ".85rem", opacity: .7 }}>Turn screen brightness up · tap anywhere to close</span>
        </div>
      )}
    </>
  );
}
