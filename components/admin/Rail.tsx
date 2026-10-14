"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/ui/Icons";
import type { RailItem } from "@/lib/admin/nav";

const isOn = (path: string, i: RailItem) =>
  i.href === "/admin" ? path === "/admin" : path === i.href || path.startsWith(`${i.href}/`) || !!i.match?.some((m) => path === m || path.startsWith(`${m}/`));

/** Floating icon sidebar. Active item is a filled circle; labels show as tooltips on hover and focus. */
export function Rail({ main, admin, logout }: { main: RailItem[]; admin: RailItem[]; logout: () => Promise<void> }) {
  const path = usePathname();
  const item = (i: RailItem) => (
    <Link key={i.href} href={i.href} className="rail-item" aria-label={i.badge ? `${i.label}, ${i.badge} waiting` : i.label} aria-current={isOn(path, i) ? "page" : undefined}>
      <Icon name={i.icon} />
      {!!i.badge && <span className="rail-badge" aria-hidden="true">{i.badge > 99 ? "99+" : i.badge}</span>}
      <span className="rail-tip" aria-hidden="true">{i.label}</span>
    </Link>
  );
  return (
    <nav className="adm-rail" aria-label="Admin sections">
      {main.map(item)}
      {admin.length > 0 && <hr />}
      {admin.map(item)}
      <span className="rail-spacer" />
      <form action={logout}>
        <button type="submit" className="rail-item" aria-label="Sign out">
          <Icon name="logout" />
          <span className="rail-tip" aria-hidden="true">Sign out</span>
        </button>
      </form>
    </nav>
  );
}
