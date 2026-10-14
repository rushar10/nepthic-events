import "@/ui/fonts.css";
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@/ui/styles.css";
import "@/ui/glow/glow.css";
import "./admin.css";
import "@/ui/ux/ux.css";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Proximity } from "@/ui/Proximity";
import { RegisterSW } from "@/ui/Mobile";
import { Icon } from "@/ui/Icons";
import { DOOR_ROLES, getUser } from "@/core/auth";
import { getSettings } from "@/core/settings";
import { pendingCounts } from "@/lib/admin/counts";
import { ThemeToggle } from "@/components/admin/ThemeToggle";
import { AppShell } from "@/ui/ux/AppShell";

export const metadata: Metadata = {
  title: { default: "Nepthic Events Admin", template: "%s · Nepthic Events Admin" },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Events Admin", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F6F3FB" }, { media: "(prefers-color-scheme: dark)", color: "#0E0B14" }],
  viewportFit: "cover", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings, jar] = await Promise.all([getUser(), getSettings(), cookies()]);
  const staff = !!user && DOOR_ROLES.includes(user.role);
  const saved = jar.get("nep_admin_theme")?.value;
  const theme = saved === "light" || saved === "dark" ? saved : null;
  const waiting = staff && user!.role !== "DOOR" ? (await pendingCounts()).total : 0;
  const first = user?.name.split(" ")[0] ?? "";

  return (
    <html lang="en-AU" data-theme={theme ?? undefined}>
      <body className={`site-adm site-ev${staff ? " has-bottom-nav" : ""}`}>
        <header className="adm-top">
          <Link className="adm-logo" href="/admin" aria-label="Nepthic Events admin home">
            <span className="mark" aria-hidden="true">N</span>
            <span>NEPTHIC</span>
            <span className="tag">EVENTS ADMIN</span>
          </Link>
          <div className="adm-actions" style={{ marginLeft: "auto" }}>
            {staff && user!.role !== "DOOR" && (
              <>
                <Link className="round" href="/admin/refunds" aria-label={waiting ? `Notifications: ${waiting} refund requests waiting` : "Notifications: nothing waiting"}>
                  <Icon name="bell" size={20} />
                  {waiting > 0 && <span className="dot" aria-hidden="true" />}
                </Link>
              </>
            )}
            <ThemeToggle initial={theme} />
            {staff && (
              <span className="hello">
                <span className="hi">Hi {first}!</span>
                <span className="avatar-g" aria-hidden="true">{first[0]}</span>
              </span>
            )}
          </div>
        </header>
        {/* Half strength in Admin so numbers stay easy to read. */}
        <Proximity radius={settings.proximityRadius} intensity={settings.proximityIntensity} scale={0.55} enabled={settings.proximityEnabled} />
        <RegisterSW signedIn={!!user} />
        <AppShell><main className={staff ? undefined : "wrap"}>{children}</main></AppShell>
      </body>
    </html>
  );
}
