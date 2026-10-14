"use client";
import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";

/* Instant search over a list that's already on the page: results filter as you type, with
   recent searches and a few suggestions. Each child must carry a `data-search` string
   (passed as the `terms` prop on <SearchItem>). Nothing is sent anywhere. */
export function SearchItem({ terms, children }: { terms: string; children: ReactNode }) {
  void terms;
  return <>{children}</>;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function SearchList({ id, placeholder, suggestions = [], children, className, empty }: {
  id: string; placeholder: string; suggestions?: string[]; children: ReactNode; className?: string; empty: string;
}) {
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const key = `recent:${id}`;
  useEffect(() => { try { setRecent(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { /* ignore */ } }, [key]);
  const remember = (term: string) => {
    const t = term.trim();
    if (t.length < 2) return;
    const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 5);
    setRecent(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const items = Children.toArray(children).filter(isValidElement) as { props: { terms: string } }[];
  const words = norm(q).split(/\s+/).filter(Boolean);
  const shown = useMemo(() => items.map((c) => words.every((w) => norm(c.props.terms).includes(w))), [items, words]);
  const count = shown.filter(Boolean).length;
  const chips = q ? [] : (recent.length ? recent : suggestions);

  return (
    <div className="stack-sm">
      <div className="search" role="search">
        <svg className="s-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
        <input id={`search-${id}`} type="search" value={q} placeholder={placeholder} aria-label={placeholder} autoComplete="off" enterKeyHint="search"
          onChange={(e) => setQ(e.target.value)} onBlur={() => remember(q)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); remember(q); (e.target as HTMLInputElement).blur(); } }} />
        {chips.length > 0 && (
          <div className="search-recents">
            <span className="small dim">{recent.length ? "Recent" : "Try"}</span>
            {chips.map((c) => <button type="button" key={c} className="chip" onClick={() => setQ(c)}>{c}</button>)}
            {recent.length > 0 && <button type="button" className="link" onClick={() => { setRecent([]); try { localStorage.removeItem(key); } catch { /* ignore */ } }}>Clear</button>}
          </div>
        )}
        {q && <p className="small dim" aria-live="polite">{count} result{count === 1 ? "" : "s"} for “{q}”</p>}
      </div>
      <div className={className}>
        {items.map((c, i) => <div className="li" key={i} hidden={!shown[i]}>{c as unknown as ReactNode}</div>)}
      </div>
      {q && count === 0 && <div className="empty">{empty} <button type="button" className="link" onClick={() => setQ("")}>Clear search</button></div>}
    </div>
  );
}
