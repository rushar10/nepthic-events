export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function Offline() {
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <p className="eyebrow">No connection</p>
      <h1 className="page">You&apos;re offline</h1>
      <p className="dim">Pages you&apos;ve opened before, like your e-tickets, still work. Everything else comes back when you reconnect.</p>
    </div>
  );
}
