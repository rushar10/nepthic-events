import { Icon } from "@/ui/Icons";
import { aud } from "@/ui/format";

export type ActivityItem = { id: string; who: string; detail: string; amount: number | null; at: Date; icon: string; color: string; label: string };

export function ago(d: Date, now = Date.now()) {
  const m = Math.round((now - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Brisbane" });
}

/** Latest activity, each row with a round icon in its colour, name, type, amount and time. */
export function ActivityList({ items, empty = "No activity yet." }: { items: ActivityItem[]; empty?: string }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="act">
      {items.map((a) => (
        <li key={a.id} style={{ ["--c" as string]: a.color }}>
          <span className="act-ico" aria-label={a.label} role="img"><Icon name={a.icon} size={19} /></span>
          <span style={{ minWidth: 0 }}>
            <span className="act-name" style={{ display: "block" }}>{a.who}</span>
            <span className="act-type" style={{ display: "block" }}>{a.detail}</span>
          </span>
          <span className="act-amt">{a.amount == null ? <span>Awaiting price</span> : aud(a.amount)}<span>{ago(a.at)}</span></span>
        </li>
      ))}
    </ul>
  );
}
