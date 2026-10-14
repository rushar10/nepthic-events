import "@/ui/fonts.css";
import "@/ui/styles.css";
import "@/ui/glow/glow.css";
import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/ui/Mobile";
import { Proximity } from "@/ui/Proximity";
import { getSettings } from "@/core/settings";
import { getUser, DOOR_ROLES } from "@/core/auth";
import { logout } from "@/app/(door)/door/actions";

export const metadata: Metadata = {
  title: { default: "Nepthic Door", template: "%s · Nepthic Door" },
  description: "Ticket check-in for Nepthic door staff.",
  robots: { index: false, follow: false },
  manifest: "/door/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Nepthic Door", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0E0B14",
  viewportFit: "cover", width: "device-width", initialScale: 1,
};

/* Staff tool inside the Events project: its own layout and installable app at /door,
   never linked from the public pages. Same Events accounts (door staff and above). */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([getUser(), getSettings()]);
  const staff = !!user && DOOR_ROLES.includes(user.role);
  return (
    // Always dark: door staff use this in dim venues, and it saves battery.
    <html lang="en-AU" data-theme="dark">
      <body className="site-ev">
        <header className="top" style={{ flexWrap: "nowrap", gap: 8 }}>
          <a className="logo" href="/door" style={{ whiteSpace: "nowrap" }}>NEPTHIC<span className="logo-site">Door</span></a>
          {staff && (
            <div className="top-right" style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", fontSize: ".85rem", whiteSpace: "nowrap" }}>
              <a href="/admin/checkin">Stats</a>
              <form action={logout}><button type="submit">Sign out</button></form>
            </div>
          )}
        </header>
        <Proximity radius={settings.proximityRadius} intensity={settings.proximityIntensity} enabled={settings.proximityEnabled} />
        <RegisterSW signedIn={staff} src="/door-sw.js" scope="/door" />
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
