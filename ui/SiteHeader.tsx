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
        <span className="dim small">© {new Date().getFullYear()} NEPTHIC</span>
      </div>
    </footer>
  );
}
