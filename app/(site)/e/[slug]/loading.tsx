import { SkLine } from "@/ui/ux/Skeleton";

/* Event: big poster and details on the left, the ticket picker on the right. */
export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading event">
      <div className="sk" style={{ width: 120, height: 32, borderRadius: 999 }} />
      <div className="split">
        <div className="stack">
          <div className="sk" style={{ aspectRatio: "16 / 9", borderRadius: "var(--r-md)" }} />
          <div className="stack-sm"><div className="sk sk-line lg" style={{ height: 40 }} /><SkLine /><SkLine /><SkLine size="sm" /></div>
        </div>
        <div className="panel prox stack-sm">
          <SkLine size="sm" />
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="sk" style={{ height: 70, borderRadius: 12 }} />)}
          <div className="sk" style={{ height: 56, borderRadius: 16 }} />
        </div>
      </div>
    </div>
  );
}
