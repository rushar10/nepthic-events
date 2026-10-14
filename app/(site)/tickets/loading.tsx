/* Skeleton while a page loads (instead of a spinner). */
export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      <div className="skel" style={{ height: 22, width: "40%" }} />
      <div className="skel" style={{ height: 44, width: "75%" }} />
      <div className="cat">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skel" style={{ aspectRatio: "4 / 5" }} />)}
      </div>
    </div>
  );
}
