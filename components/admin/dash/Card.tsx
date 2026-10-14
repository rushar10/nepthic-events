import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/ui/Icons";

/** "brand" (violet → magenta) or any CSS colour, e.g. "var(--site)" or "#2DD4BF". */
export type Accent = "brand" | (string & {});

/** Glow colours for a card: brand violet → magenta, or the given accent colour. */
export function accentVars(accent: Accent = "brand"): CSSProperties {
  if (accent === "brand") return {};
  const c = accent;
  return { ["--glow-a" as string]: c, ["--glow-b" as string]: `color-mix(in oklch, ${c} 70%, #8B5CF6)`, ["--c" as string]: c };
}

/** Glass card with an optional title row and action. Lights up as the cursor approaches. */
export function Card({ title, id, action, accent, className, style, children }: {
  title?: string; id?: string; action?: ReactNode; accent?: Accent; className?: string; style?: CSSProperties; children: ReactNode;
}) {
  return (
    <section className={`dcard${className ? ` ${className}` : ""}`} data-glow aria-labelledby={title && id ? id : undefined} style={{ ...accentVars(accent), ...style }}>
      {(title || action) && <div className="dcard-head">{title && <h2 id={id}>{title}</h2>}{action}</div>}
      {children}
    </section>
  );
}

/** Change pill: green when up; violet when flat or down (not alarming red, it's a weekly swing). */
export function Change({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="change up" title="No sales in the previous 7 days">New</span>;
  const up = pct > 0;
  return <span className={`change ${up ? "up" : "flat"}`} aria-label={`${up ? "Up" : pct < 0 ? "Down" : "No change"} ${Math.abs(pct)}% on the previous 7 days`}>{up ? "+" : pct < 0 ? "−" : "±"}{Math.abs(pct)}%</span>;
}

/** Small number card: label, big value, change pill and a short note. */
export function StatCard({ label, value, pct, note, icon, accent = "brand", href, unavailable }: {
  label: string; value: string; pct?: number | null; note: string; icon: string; accent?: Accent; href?: string; unavailable?: string;
}) {
  const body = (
    <>
      <div className="stat-top"><span className="stat-label">{label}</span><span className="stat-ico"><Icon name={icon} size={20} /></span></div>
      {unavailable ? <p className="muted small">{unavailable}</p> : (
        <>
          <span className="big">{value}</span>
          <div className="stat-foot">{pct !== undefined && <Change pct={pct} />}<span>{note}</span></div>
        </>
      )}
    </>
  );
  const cls = `dcard o-stat${unavailable ? " is-na" : ""}`;
  return href && !unavailable
    ? <a className={cls} href={href} data-glow style={{ ...accentVars(accent), textDecoration: "none", color: "inherit" }} aria-label={`${label}: ${value}. ${note}`}>{body}</a>
    : <section className={cls} data-glow style={accentVars(accent)}>{body}</section>;
}
