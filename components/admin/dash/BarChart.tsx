"use client";
import { useState } from "react";
import { aud, aud0 } from "@/ui/format";

export type Bar = { key: string; label: string; long: string; value: number };

/** Rounds the axis top up to a clean step so gridlines land on round numbers. */
export function niceMax(v: number) {
  if (v <= 0) return 100_00;
  const raw = v / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
  return step * 4;
}
const short = (cents: number) => {
  const d = cents / 100;
  return d >= 1000 ? `$${(d / 1000).toFixed(d % 1000 === 0 || d >= 10000 ? 0 : 1)}k` : `$${Math.round(d)}`;
};

/**
 * Revenue Flow bars: rounded, filled with diagonal stripes in the site colour. The highlighted
 * bar (current month, or whichever is hovered or focused) is a solid gradient with a value tag
 * and a dot. Bars grow in on load and glide to new heights when the filter changes.
 */
export function BarChart({ data, color, defaultIndex = data.length - 1, label }: { data: Bar[]; color: string; defaultIndex?: number; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const on = hover ?? defaultIndex;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = [0, 1, 2, 3, 4].map((k) => (max * k) / 4);

  return (
    <div className="barchart" role="group" aria-label={label}>
      <div className="bc-axis" aria-hidden="true" style={{ paddingBottom: 28 }}>
        <div style={{ position: "relative", height: "100%" }}>
          {ticks.map((t) => <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>{short(t)}</span>)}
        </div>
      </div>
      <div className="bc-plot">
        <div aria-hidden="true" style={{ position: "absolute", inset: "0 0 28px 0" }}>
          {ticks.map((t) => <div key={t} className="bc-grid" style={{ bottom: `${(t / max) * 100}%` }} />)}
        </div>
        <div className="bc-bars" style={{ ["--n" as string]: data.length, ["--bar" as string]: color }} onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => {
            const v = Math.max(0, d.value) / max;
            return (
              <button key={d.key} type="button" className="bc-bar" data-on={i === on ? "" : undefined}
                style={{ ["--v" as string]: v, ["--i" as string]: i }}
                aria-label={`${d.long}: ${aud(d.value)}`} aria-pressed={i === on}
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                <span className="bc-track">
                  <span className="bc-fill" />
                  <span className="bc-dot" aria-hidden="true" />
                  <span className="bc-tip" aria-hidden="true">{d.value < 0 ? "−" : "+"}{aud0(Math.abs(d.value))}</span>
                </span>
                <span className="bc-label" aria-hidden="true">{d.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
