export default function Forbidden() {
  return (
    <div className="stack-sm">
      <p className="eyebrow">Restricted</p>
      <h1 className="page">Admins only</h1>
      <p className="dim">Your role can&apos;t open this section. Ask an admin if you need access.</p>
    </div>
  );
}
