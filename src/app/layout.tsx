import { shownGame, shownGames } from "@/lib/store";
import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SearchBox } from "@/components/SearchBox";
import { Trackers } from "@/components/Trackers";
import { SITE } from "@/site.config";
import "./globals.css";
import { ReturnBeacon } from "@/components/ReturnBeacon";
import { PhoneStrip } from "@/components/PhoneStrip";
import { christmasOn } from "@/lib/season";
import { TabBar } from "@/components/TabBar";
import { shortName } from "@/lib/format";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name}: ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description:
    "Look up what a single trading card is worth: TCGplayer market price per printing, price history and the week's biggest movers, updated daily.",
  openGraph: { siteName: SITE.name, type: "website" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const xmas = christmasOn();
  return (
    <html lang="en" data-season={xmas ? "christmas" : undefined} data-festive={xmas ? "" : undefined}>
      <body>
        <header className="hdr xmas-garland">
          <div className="hdr-in">
            <a className="logo xmas-cap" href="/" aria-label={SITE.name}>
              <img src="/logo.svg" alt="" width={30} height={30} />
              <span className="w">
                TCG <b>Singles</b> DB
              </span>
            </a>
            <nav className="nav" aria-label="Games">
              {shownGames()
                .slice(0, 5)
                .map((g) => (
                  <a key={g.slug} href={`/${g.slug}`}>
                    {shortName(g.name)}
                  </a>
                ))}
              <a href="/#games">All {shownGames().length} games</a>
            </nav>
            <SearchBox />
          </div>
        </header>
        <main>{children}</main>
        <footer className="ftr">
          <div className="page">
            <a className="logo" href="/">
              <img src="/logo.svg" alt="" width={24} height={24} />
              <span>
                TCG <b>Singles</b> DB
              </span>
            </a>
            <nav aria-label="Site">
              <a href="/sell">Sell your cards</a>
              <a href="/about">About</a>
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
            </nav>
            <p>
              Prices are TCGplayer market prices in US dollars, updated once a
              day. We may earn a commission when you buy through eBay or
              TCGplayer links.
            </p>
            <p>{SITE.disclaimer}</p>
          </div>
        </footer>
        <TabBar />
        <Analytics />
        <Trackers />
        <ReturnBeacon />
        {/* The phone ad strip (owner, 2026-11-19): browser only, phones only, after a scroll; components/PhoneStrip.tsx. */}
        <PhoneStrip games={Object.fromEntries(shownGames().map((g) => [g.slug, g.short]))} />
      </body>
    </html>
  );
}
