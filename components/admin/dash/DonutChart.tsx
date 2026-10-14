"use client";
import { useState } from "react";
import { aud, aud0 } from "@/ui/format";

export type Segment = { key: string; label: string; color: string; value: number };

const R = 80, C = 2 * Math.PI * R, GAP = 10;

/**
 * Revenue by Site. Segments in each site's colour draw in on load and resize smoothly when
 * the numbers change. Hovering or focusing a segment or legend row shows its exact amount in
 * the centre; with a site filter on, the other segments fade back.
 */
export function DonutChart({ segments, focus, totalLabel = "Total revenue" }: { segments: Segment[]; focus?: string; totalLabel?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  const shown = hover ?? focus ?? null;
  const cur = segments.find((s) => s.key === shown);
  let start = 0;

  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 200 200" role="img" aria-label={`${totalLabel} ${aud0(total)}: ${segments.map((s) => `${s.label} ${aud0(s.value)}`).join(", ")}`}>
          <circle cx="100" cy="100" r={R} stroke="var(--raised)" strokeWidth="16" fill="none" />
          {total > 0 && segments.map((s, i) => {
            const len = (Math.max(0, s.value) / total) * C;
            const visible = Math.max(0, len - GAP);
            const el = (
              <circle key={s.key} className={`seg${shown && shown !== s.key ? " dim" : ""}${hover === s.key ? " hot" : ""}`} cx="100" cy="100" r={R}
                stroke={s.color} strokeDasharray={`${visible} ${C - visible}`} strokeDashoffset={-start - GAP / 2}
                style={{ ["--i" as string]: i }} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
                <title>{`${s.label}: ${aud(s.value)}`}</title>
              </circle>
            );
            start += len;
            return el;
          })}
        </svg>
        <div className="donut-center" aria-hidden="true">
          <b>{aud0(cur ? cur.value : total)}</b>
          <span>{cur ? `${cur.label} · ${total ? Math.round((cur.value / total) * 100) : 0}%` : totalLabel}</span>
        </div>
      </div>
      <ul className="legend-list">
        {segments.map((s) => (
          <li key={s.key}>
            <button type="button" style={{ ["--c" as string]: s.color }} data-on={shown === s.key ? "" : undefined}
              onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(s.key)} onBlur={() => setHover(null)}
              aria-label={`${s.label}: ${aud(s.value)}, ${total ? Math.round((s.value / total) * 100) : 0}% of total`}>
              <i aria-hidden="true" />
              <span>{s.label}<span className="pct">{total ? Math.round((s.value / total) * 100) : 0}%</span></span>
              <b>{aud0(s.value)}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
