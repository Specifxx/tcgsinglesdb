"use client";
// The phone ad strip (owner, 2026-11-19: "those strip ads that we have on mobile phone … I want it for all the sites, so people have
// like an ad on their phone right there"). The sister sites' dock, in this site's plain look: a slim bar along the foot of a phone
// screen with a tagged eBay search and a TCGplayer link (through /out/tcgplayer), both labelled Ad, rel sponsored, claiming no price.
//
//   • Browser only (nothing in the server HTML: SEO and the first paint are untouched), phones only (below 720px).
//   • Never on the first screen: only once the visitor has scrolled ARM of a screen.
//   • Hidden while the footer, the card page's own buy rows (.rows) or anything marked [data-dock-yield] is in view or near it,
//     and while a text field has focus (the keyboard). Never a pop-up, never covers a buy button.
//   • On a card page it searches that card ([data-strip-q], [data-strip-tcg] on the page); elsewhere the game in the path, or
//     trading cards in general.
//   • ✕ hides it for the visit (sessionStorage). Fixed, moved on transform only (CLS 0). Never Amazon.
import { useEffect, useRef, useState } from "react";
import { ebayCardSearchUrl, REL_SPONSORED, tcgplayerOutUrl } from "@/lib/affiliate";

export const ARM = 0.6;
export const MAX_WIDTH = 719;
const OFF_KEY = "strip-off";

export interface StripState {
  narrow: boolean;
  scrolled: number;
  screen: number;
  blockers: number;
  typing: boolean;
}

/** Whether the strip shows. Pure, for the tests. */
export function stripShows(s: StripState): boolean {
  return s.narrow && s.scrolled >= s.screen * ARM && s.blockers === 0 && !s.typing;
}

/** The two links for a page: the card's own query, else the game's, else trading cards. Pure. */
export function stripLinks(path: string, games: Record<string, string>, cardQ?: string | null, cardTcg?: string | null) {
  const game = games[path.split("/")[1] ?? ""];
  const q = cardQ || (game ? `${game} cards` : "trading cards");
  const tcg = cardTcg || `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(game ?? "")}`;
  return { q, ebay: ebayCardSearchUrl(q, "dock-ebay"), tcgplayer: tcgplayerOutUrl(tcg, "dock-tcgplayer"), label: cardQ ? "this card" : game ? `${game} singles` : "singles" };
}

export function PhoneStrip({ games }: { games: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<ReturnType<typeof stripLinks> | null>(null);
  const [shown, setShown] = useState(false);
  const [off, setOff] = useState(true);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(OFF_KEY) === "1") return;
    } catch {}
    setOff(false);
  }, []);

  useEffect(() => {
    if (off || typeof IntersectionObserver === "undefined") return;
    const narrow = window.matchMedia(`(max-width: ${MAX_WIDTH}px)`);
    const blockers = new Set<Element>();
    let typing = false;
    const read = () => {
      const card = document.querySelector<HTMLElement>("[data-strip-q]");
      setLinks(stripLinks(location.pathname, games, card?.dataset.stripQ, card?.dataset.stripTcg));
    };
    const update = () => setShown(stripShows({ narrow: narrow.matches, scrolled: window.scrollY, screen: window.innerHeight, blockers: blockers.size, typing }));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) blockers.add(e.target);
          else blockers.delete(e.target);
        }
        update();
      },
      { rootMargin: "120px 0px 120px 0px" },
    );
    document.querySelectorAll("footer, .rows, [data-dock-yield]").forEach((el) => io.observe(el));
    read();
    update();
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      typing = !!t?.matches?.("input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable='true']");
      update();
    };
    const onBlur = () => ((typing = false), update());
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
    };
  }, [off, games]);

  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = !shown;
  }, [shown]);

  if (off || !links) return null;
  function hide() {
    setOff(true);
    try {
      sessionStorage.setItem(OFF_KEY, "1");
    } catch {}
  }
  return (
    <div ref={ref} className="strip" data-shown={shown ? "" : undefined} role="region" aria-label="Ads" aria-hidden={shown ? undefined : true}>
      <span className="strip-ad">Ad</span>
      <span className="strip-t">Buy {links.label}</span>
      <a className="btn primary strip-b" href={links.ebay} rel={REL_SPONSORED} target="_blank" data-kind="dock">
        eBay ↗
      </a>
      <a className="btn strip-b" href={links.tcgplayer} rel={REL_SPONSORED} target="_blank" data-kind="dock">
        TCGplayer ↗
      </a>
      <button type="button" className="strip-x" onClick={hide} aria-label="Hide these ads for this visit">
        ✕
      </button>
    </div>
  );
}
