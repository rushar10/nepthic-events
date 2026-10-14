import { SkCard, SkLine } from "@/ui/ux/Skeleton";

/* Home: headline, the big "next up" poster, then a row of event cards. */
export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading">
      <div className="stack-sm"><SkLine size="sm" /><div className="sk sk-line lg" style={{ height: 44, width: "70%" }} /></div>
      <div className="sk-card"><div className="sk" style={{ aspectRatio: "16 / 9", borderRadius: "var(--r-md) var(--r-md) 0 0" }} /><div className="sk-body"><SkLine size="sm" /><SkLine /></div></div>
      <div className="carousel">{Array.from({ length: 3 }, (_, i) => <SkCard key={i} poster />)}</div>
    </div>
  );
}
