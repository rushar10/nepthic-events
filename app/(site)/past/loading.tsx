import { SkGrid, SkLine } from "@/ui/ux/Skeleton";

/* Event list: title, the three section chips, then poster cards in the same grid. */
export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading events">
      <div className="stack-sm"><SkLine size="sm" /><div className="sk sk-line lg" style={{ height: 34 }} /></div>
      <div className="row">{[110, 120, 110].map((w, i) => <div key={i} className="sk" style={{ width: w, height: 36, borderRadius: 999 }} />)}</div>
      <SkGrid count={6} poster />
    </div>
  );
}
