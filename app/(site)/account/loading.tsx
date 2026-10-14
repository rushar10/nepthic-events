import { SkRows } from "@/ui/ux/Skeleton";

/* Account: profile card, then order rows. */
export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading your account" style={{ maxWidth: 720 }}>
      <div className="sk" style={{ height: 78, borderRadius: "var(--r-md)" }} />
      <div className="sk sk-line" style={{ width: 90 }} />
      <SkRows count={4} />
    </div>
  );
}
