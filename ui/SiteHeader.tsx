import type { ReactNode } from "react";
import { HeaderScroll, MenuDrawer } from "./Mobile";

/**
 * This site's header. Nothing here links to other Nepthic sites: the logo goes to
 * `logoHref` (this site's home by default) and the navigation covers this site only.
 * Phone: compact bar that hides on scroll down; links and account move into a slide-out menu.
 */
export function SiteHeader({ siteName, logoHref = "/", nav, account, menu }: {
  siteName: string; logoHref?: string; nav?: ReactNode; account?: ReactNode; menu?: ReactNode;
}) {
  return (
    <header className="top">
      <HeaderScroll />
      <a className="logo" href={logoHref}>NEPTHIC<span className="logo-site">{siteName}</span></a>
      <div className="top-right desk">
        {nav}
        {account}
      </div>
      <div className="mob">
        <MenuDrawer label={`${siteName} menu`}>
          <p className="eyebrow">Nepthic {siteName}</p>
          {menu && <div className="drawer-links">{menu}</div>}
          {account && <div className="drawer-account">{account}</div>}
        </MenuDrawer>
      </div>
    </header>
  );
}

export function Footer({ siteName }: { siteName: string }) {
  return (
    <footer className="foot">
      <div className="wrap foot-inner">
        <span className="logo">NEPTHIC <span className="logo-site">{siteName}</span></span>
        <Social />
        <span className="dim small">© {new Date().getFullYear()} NEPTHIC</span>
      </div>
    </footer>
  );
}

const SOCIAL = [
  { label: "Instagram", href: "https://www.instagram.com/nepthic_/", d: "M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.25-3.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" },
  { label: "X", href: "https://x.com/nepthic_", d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
  { label: "TikTok", href: "https://www.tiktok.com/@nepthic_", d: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" },
]

/** Nepthic social links: round buttons that glow in this site's accent on hover and focus. */
export function Social() {
  return (
    <ul className="social" aria-label="Nepthic on social media">
      {SOCIAL.map((s) => (
        <li key={s.label}>
          <a href={s.href} rel="noopener" aria-label={s.label}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={s.d} /></svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
