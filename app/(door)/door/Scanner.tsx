"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import type { ScanResult } from "@/core/tickets";
import { Icon } from "@/ui/Icons";
import { scanTicket } from "@/app/(door)/door/actions";

type Logged = ScanResult & { at: string; offline?: boolean };
type MTicket = { code: string; status: string; holder: string; type: string };
type Queued = { raw: string; code: string; at: string };

const mKey = (id: string) => `nepthic.scan.manifest.${id}`;
const qKey = (id: string) => `nepthic.scan.queue.${id}`;
const load = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full */ } };
const now = () => new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/* Door scanner, mobile first:
   - full-screen camera with a big green/amber/red result, sound and vibration
   - torch toggle for dark venues
   - keeps working offline: checks codes against a downloaded ticket list, queues the
     check-ins and syncs them (re-validated on the server) when signal returns. */
export function Scanner({ eventId, eventName, issued, admitted: initialAdmitted }: { eventId: string; eventName: string; issued: number; admitted: number }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [flash, setFlash] = useState<ScanResult | null>(null);
  const [log, setLog] = useState<Logged[]>([]);
  const [admitted, setAdmitted] = useState(initialAdmitted);
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "error">("off");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [manual, setManual] = useState("");
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [listAt, setListAt] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ text: string; t: number }>({ text: "", t: 0 });
  const busy = useRef(false);

  // Offline ticket list
  const refreshList = useCallback(async () => {
    try {
      const r = await fetch(`/api/door/tickets?event=${eventId}`, { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      save(mKey(eventId), data);
      setListAt(new Date(data.at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }));
    } catch { /* offline: keep the last list */ }
  }, [eventId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setQueued(load<Queued[]>(qKey(eventId), []).length);
    const cached = load<{ at: string } | null>(mKey(eventId), null);
    if (cached) setListAt(new Date(cached.at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }));
    refreshList();
    const t = setInterval(refreshList, 60_000);
    const on = () => { setOnline(true); sync(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const sync = useCallback(async () => {
    const q = load<Queued[]>(qKey(eventId), []);
    if (!q.length) return;
    const left: Queued[] = [];
    for (const item of q) {
      try {
        const r = await scanTicket(eventId, item.raw);
        if (r.state !== "ok") setLog((l) => [{ ...r, title: `Sync: ${r.title}`, at: item.at }, ...l]);
      } catch { left.push(item); }
    }
    save(qKey(eventId), left);
    setQueued(left.length);
    if (left.length < q.length) refreshList();
  }, [eventId, refreshList]);

  const offlineCheck = (raw: string): ScanResult => {
    const code = (raw.startsWith("NPT1:") ? raw.split(":")[1] : raw).trim().toUpperCase();
    const list = load<{ tickets: MTicket[] } | null>(mKey(eventId), null);
    if (!list) return { state: "bad", title: "Offline, no ticket list", detail: "Reconnect once to download this event's tickets.", code };
    const q = load<Queued[]>(qKey(eventId), []);
    const t = list.tickets.find((x) => x.code === code);
    const base = { code, holder: t?.holder, ticketType: t?.type };
    if (!t) return { ...base, state: "bad", title: "Invalid ticket", detail: "Not on this event's ticket list." };
    if (t.status === "USED" || q.some((x) => x.code === code)) return { ...base, state: "bad", title: "Already used", detail: "Already checked in. Send to a supervisor." };
    if (t.status === "REFUNDED" || t.status === "VOID") return { ...base, state: "bad", title: "Not valid", detail: "Refunded or cancelled." };
    if (t.status === "REFUND_REQUESTED") return { ...base, state: "warn", title: "Refund pending", detail: "Ask a supervisor before admitting." };
    q.push({ raw, code, at: now() });
    save(qKey(eventId), q);
    setQueued(q.length);
    return { ...base, state: "ok", title: "Admit", detail: `${t.holder} · ${t.type} · saved offline, will sync` };
  };

  const feedback = (state: ScanResult["state"]) => {
    try {
      navigator.vibrate?.(state === "ok" ? 90 : [70, 60, 70, 60, 70]);
      const ctx = new AudioContext();
      const tone = (f: number, t0: number, d: number) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; g.gain.value = 0.12; o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + d);
      };
      if (state === "ok") { tone(880, 0, 0.09); tone(1320, 0.1, 0.12); } else tone(200, 0, 0.4);
    } catch { /* sound is optional */ }
  };

  const submit = useCallback(async (raw: string) => {
    const t = Date.now();
    if (busy.current || (raw === lastRef.current.text && t - lastRef.current.t < 3000)) return;
    lastRef.current = { text: raw, t };
    busy.current = true;
    let r: ScanResult, offline = false;
    try {
      if (!navigator.onLine) throw new Error("offline");
      r = await scanTicket(eventId, raw);
    } catch {
      offline = true;
      setOnline(false);
      r = offlineCheck(raw);
    }
    busy.current = false;
    setResult(r);
    setFlash(r);
    setTimeout(() => setFlash(null), r.state === "ok" ? 1100 : 2200);
    feedback(r.state);
    if (r.state === "ok") setAdmitted((n) => n + 1);
    setLog((l) => [{ ...r, at: now(), offline }, ...l].slice(0, 40));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const stop = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setTorch(null);
    setCamera("off");
  };

  const startCamera = async () => {
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean; focusMode?: string[] };
      if (caps.focusMode?.includes("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
      setTorch(caps.torch ? false : null);
      setCamera("on");
    } catch {
      setCamera("error");
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }).catch(() => {});
    setTorch(!torch);
  };

  // Attach the stream once the full-screen video element exists, then decode frames.
  useEffect(() => {
    if (camera !== "on") return;
    const video = videoRef.current!;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = BD ? new BD({ formats: ["qr_code"] }) : null;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (video.readyState >= 2) {
        let text: string | null = null;
        if (detector) {
          text = (await detector.detect(video).catch(() => []))[0]?.rawValue ?? null;
        } else {
          const w = (canvas.width = Math.min(720, video.videoWidth));
          const h = (canvas.height = Math.round((video.videoHeight / video.videoWidth) * w));
          ctx.drawImage(video, 0, 0, w, h);
          // inversionAttempts helps with dim, low-contrast screens at night
          text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" })?.data ?? null;
        }
        if (text) submit(text);
      }
      setTimeout(tick, 160);
    };
    tick();
    return () => { alive = false; };
  }, [camera, submit]);

  useEffect(() => stop, []);

  const status = (
    <span className={`pill ${online ? "ok" : "warn"}`}>{online ? "Online" : "Offline"}{queued > 0 ? ` · ${queued} to sync` : ""}</span>
  );

  return (
    <div className="split-even">
      <div className="stack">
        <div className="panel prox">
          <div className="spread"><b>{eventName}</b><span className="pill info">{admitted} / {issued} in</span></div>
          <div className="row">{status}<span className="small dim">{listAt ? `Offline list from ${listAt}` : "Downloading offline list…"}</span></div>

          {(camera === "on" || camera === "starting") && (
            <div className="scan-full">
              <div style={{ position: "relative", minHeight: 0 }}>
                <video ref={videoRef} playsInline muted />
                <div className="frame" aria-hidden="true" />
                {flash && (
                  <div className={`scan-flash ${flash.state}`} role="status" aria-live="assertive">
                    <b>{flash.title}</b><span>{flash.detail}</span>
                  </div>
                )}
              </div>
              <div className="scan-bar">
                <span className="small" style={{ color: "#fff" }}>{admitted} / {issued} in · {status}</span>
                <span className="row" style={{ flexWrap: "nowrap" }}>
                  {torch !== null && <button className="menu-btn" onClick={toggleTorch} aria-pressed={torch} aria-label="Torch"><Icon name="bolt" /></button>}
                  <button className="btn" onClick={stop}>Done</button>
                </span>
              </div>
            </div>
          )}

          {camera !== "on" && camera !== "starting" && (
            <button className="btn btn-primary prox" style={{ minHeight: 64, fontSize: "1.05rem" }} onClick={startCamera}><Icon name="scan" /> Scan with camera</button>
          )}
          {camera === "error" && <p className="note bad">Camera blocked. Allow camera access in the browser settings, or type codes below.</p>}

          <form className="row" style={{ flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { lastRef.current = { text: "", t: 0 }; submit(manual.trim()); setManual(""); } }}>
            <label htmlFor="manual-code" className="sr-only">Ticket code</label>
            <input id="manual-code" className="big-input" style={{ flex: 1, minWidth: 0, width: 0 }} placeholder="NPT-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="go"
              value={manual} onChange={(e) => setManual(e.target.value)} />
            <button className="btn prox">Check</button>
          </form>
          {queued > 0 && online && <button className="btn btn-sm" onClick={sync}>Sync {queued} offline check-in{queued > 1 ? "s" : ""} now</button>}
        </div>
      </div>
      <div className="stack">
        <div className={`result ${result?.state ?? ""}`} aria-live="polite">
          {result ? (<><b>{result.title}</b><span>{result.detail}</span>{result.code && <span className="code dim">{result.code}</span>}</>)
            : (<><b style={{ color: "var(--muted)" }}>Ready</b><span className="dim">Scan a ticket to check it in.</span></>)}
        </div>
        {log.length > 0 && (
          <div className="panel prox">
            <h2 className="h3">This session</h2>
            <div className="scroll"><table className="tbl"><tbody>
              {log.map((l, i) => (
                <tr key={i}><td className="mono small">{l.at}</td>
                  <td><span className={`pill ${l.state === "ok" ? "ok" : l.state === "warn" ? "warn" : "bad"}`}>{l.title}</span>{l.offline && <span className="small dim"> offline</span>}</td>
                  <td className="small">{l.holder ?? l.code ?? ""}</td></tr>
              ))}
            </tbody></table></div>
          </div>
        )}
      </div>
    </div>
  );
}
