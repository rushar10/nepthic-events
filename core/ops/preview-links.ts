/** What the admin preview bar offers for the page being viewed: a portal link per page type. */
export function editLinks(path: string): { label: string; href: string }[] {
  const p = path.split("?")[0];
  const m = /^\/e\/([^/]+)/.exec(p);
  if (m) return [{ label: "Edit this event", href: `/events/events/slug/${encodeURIComponent(m[1])}` }, { label: "Refunds", href: "/events/refunds" }];
  if (p === "/" || p === "/upcoming" || p === "/past") return [{ label: "Edit events", href: "/events/events" }, { label: "New event", href: "/events/events/new" }];
  if (p.startsWith("/tickets") || p.startsWith("/account")) return [{ label: "Customers", href: "/events/customers" }, { label: "Refunds", href: "/events/refunds" }];
  return [{ label: "Edit this page", href: "/events" }];
}
