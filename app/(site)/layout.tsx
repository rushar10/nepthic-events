import "@/ui/fonts.css";
import "@/ui/styles.css";
import "@/ui/glow/glow.css";
import "@/ui/ux/ux.css";
import "@/ui/ux/ux-site.css";
import type { Metadata, Viewport } from "next";
import { SiteHeader, Footer } from "@/ui/SiteHeader";
import { PreviewBar } from "@/ui/PreviewBar";
import { Proximity } from "@/ui/Proximity";
import { Reveal } from "@/ui/Reveal";
import { BottomNav, RegisterSW } from "@/ui/Mobile";
import { getUser } from "@/core/auth";
import { getSettings } from "@/core/settings";
import { env } from "@/core/env";
import { logout } from "@/app/actions/auth";
import { cookies } from "next/headers";
import { AppShell } from "@/ui/ux/AppShell";
import { ThemeSwitch } from "@/ui/ux/ThemeSwitch";

// Every page reads this site's settings and session, so nothing is prerendered at build time
// (the build never needs the database).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Nepthic Events", template: "%s · Nepthic Events" },
  description: "Concerts, launch nights and live sessions from Nepthic. Buy tickets and carry your e-ticket on your phone.",
  appleWebApp: { capable: true, title: "Nepthic Events", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F6F3FB" }, { media: "(prefers-color-scheme: dark)", color: "#0E0B14" }],
  viewportFit: "cover", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings, jar] = await Promise.all([getUser(), getSettings(), cookies()]);
  const saved = jar.get("nep_theme")?.value;
  const theme = saved === "light" || saved === "dark" ? saved : null;
  return (
    <html lang="en-AU" data-theme={theme ?? undefined}>
      <body className="site-ev has-bottom-nav">
        <PreviewBar />
        <SiteHeader
          siteName="Events"
          logoHref={env.logoHref}
          nav={<>
            <a href="/upcoming">Upcoming</a>
            <a href="/past">Past</a>
            <a href="/tickets">My tickets</a>
          </>}
          menu={<>
            <a href="/past">Past events</a>
          </>}
          account={user ? (
            <>
              <a href="/account">{user.name}</a>
              <form action={logout}><button type="submit">Sign out</button></form>
            </>
          ) : <a href="/login">Sign in</a>}
          tools={<ThemeSwitch initial={theme} />}
        />
        <Reveal enabled={settings.proximityEnabled} strength={0.5} palette={[{ color: "#EC4899", x: 0.2, y: 0.4 }, { color: "#8B5CF6", x: 0.85, y: 0.12 }, { color: "#F472B6", x: 0.72, y: 0.82 }]} />
        <Proximity radius={settings.proximityRadius} intensity={settings.proximityIntensity} enabled={settings.proximityEnabled} />
        <RegisterSW signedIn={!!user} />
        <AppShell>
        <main className="wrap">{children}</main>
        <Footer siteName="Events" />
        <BottomNav label="Events" items={[
          { href: "/", label: "Home", icon: "home" },
          { href: "/upcoming", label: "Upcoming", icon: "calendar", match: ["/e", "/past"] },
          { href: "/tickets", label: "My tickets", icon: "ticket", match: ["/checkout"] },
          { href: user ? "/account" : "/login", label: user ? "Account" : "Sign in", icon: "user", match: ["/account", "/login", "/register"] },
        ]} />
        </AppShell>
      </body>
    </html>
  );
}
