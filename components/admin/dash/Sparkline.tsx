/** Smooth line through points (Catmull-Rom → cubic Bézier), for a soft "wave". */
export function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Today's sales by hour as a gradient wave with a soft fill; the line draws in on load. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const W = 300, H = 90, pad = 6;
  const v = values.length > 1 ? values : [0, ...values, 0].slice(0, Math.max(2, values.length + 1));
  const max = Math.max(...v, 1);
  const pts = v.map((y, i) => [pad + (i * (W - pad * 2)) / (v.length - 1), H - pad - (y / max) * (H - pad * 2)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;
  const last = pts[pts.length - 1];
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id="spark-line" x1="0" x2="1"><stop offset="0" stopColor="#8B5CF6" /><stop offset="1" stopColor="#EC4899" /></linearGradient>
          <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8B5CF6" stopOpacity=".28" /><stop offset="1" stopColor="#8B5CF6" stopOpacity="0" /></linearGradient>
        </defs>
        <path d={area} fill="url(#spark-fill)" />
        <path d={line} className="line" stroke="url(#spark-line)" pathLength={1} />
        <circle cx={last[0]} cy={last[1]} r="4.5" fill="#EC4899" stroke="var(--surface-solid)" strokeWidth="2" />
      </svg>
    </div>
  );
}
