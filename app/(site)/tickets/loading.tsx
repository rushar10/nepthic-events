import { SkLine } from "@/ui/ux/Skeleton";

/* My tickets: title, chips, then ticket cards (QR on the left, details on the right). */
export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading your tickets">
      <div className="stack-sm"><SkLine size="sm" /><div className="sk sk-line lg" style={{ height: 34 }} /></div>
      <div className="row">{[110, 120, 110].map((w, i) => <div key={i} className="sk" style={{ width: w, height: 36, borderRadius: 999 }} />)}</div>
      <div className="tickets">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="sk-card" style={{ gridTemplateColumns: "auto minmax(0,1fr)", gap: 16, padding: 16 }}>
            <div className="sk" style={{ width: 120, height: 120 }} />
            <div className="stack-sm"><SkLine size="lg" /><SkLine size="sm" /><SkLine /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
