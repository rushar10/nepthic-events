/* Skeleton loaders shaped like the real content (cards, rows, text), shimmer while loading. */
export function SkLine({ size }: { size?: "lg" | "sm" }) { return <div className={`sk sk-line${size ? ` ${size}` : ""}`} />; }

export function SkCard({ poster = false }: { poster?: boolean }) {
  return (
    <div className="sk-card" aria-hidden="true">
      <div className={`sk ${poster ? "sk-poster" : "sk-img"}`} />
      <div className="sk-body"><SkLine size="lg" /><SkLine size="sm" /><SkLine /></div>
    </div>
  );
}

export function SkGrid({ count = 6, poster = false }: { count?: number; poster?: boolean }) {
  return <div className="sk-grid">{Array.from({ length: count }, (_, i) => <SkCard key={i} poster={poster} />)}</div>;
}

export function SkRows({ count = 5 }: { count?: number }) {
  return <div className="sk-rows" aria-hidden="true">{Array.from({ length: count }, (_, i) => <div key={i} className="sk sk-row" />)}</div>;
}

/** Page-level loading state: a heading bar, then the given body. Announced once to screen readers. */
export function SkPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="stack" role="status" aria-label="Loading">
      <div className="stack-sm"><div className="sk sk-line" style={{ width: 120 }} /><div className="sk sk-line lg" style={{ width: "45%", height: 34 }} /></div>
      {children}
    </div>
  );
}
