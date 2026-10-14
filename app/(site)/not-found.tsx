import Link from "next/link";

export default function NotFound() {
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <p className="eyebrow">404</p>
      <h1 className="page">That page doesn&apos;t exist</h1>
      <p className="dim">It may have moved, or the link is wrong.</p>
      <Link className="btn prox" href="/" style={{ justifySelf: "start" }}>Go home</Link>
    </div>
  );
}
