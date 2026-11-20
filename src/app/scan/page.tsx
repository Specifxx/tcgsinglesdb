import { CardScanner } from "@/components/scan/CardScanner";
import "@/components/scan/scan.css";
import { pageMeta } from "@/lib/seo";
import { shownGames } from "@/lib/store";
import { SITE } from "@/site.config";

// The card scanner (DECISIONS.md 2026-11-20 "Card scanner"). An app screen, not a page for search: noindex and in no sitemap.
// It reads no cookie, header or session; Rift Compare's reader decides who may scan (5 free a day per visitor). Only games
// whose accuracy eval passed (Game.scan) are offered.
export const dynamic = "force-dynamic";
export const metadata = pageMeta({
  title: "Scan a card",
  description: "Point your phone at a trading card: we find the exact printing and its price today, then one tap adds it to your collection.",
  path: "/scan",
  noindex: true,
});

const STEPS = [
  ["Point", "One card in view, front up."],
  ["Hold steady", "It finds the card and snaps on its own."],
  ["See the price", "The exact printing, then one tap to your collection."],
];

export default function ScanPage() {
  const games = shownGames().filter((g) => g.scan).map((g) => ({ slug: g.slug, name: g.name }));
  return (
    <div className="page">
      <p className="eyebrow">New · Beta</p>
      <h1>Scan a card</h1>
      <p className="lede">
        Point your phone at a {games.length ? games.map((g) => g.name).join(", ").replace(/, ([^,]*)$/, " or $1") : "trading"} card: the exact printing and
        today&rsquo;s price, then one tap to your collection. Where printings look alike, you pick yours from the pictures.
      </p>
      <CardScanner games={games} readUrl={SITE.scanReadUrl} />
      <h2>How it works</h2>
      <ol className="sc-steps">
        {STEPS.map(([t, s]) => (
          <li key={t} className="card">
            <b>{t}</b>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <p className="lede" style={{ fontSize: ".85rem" }}>
        Free: 5 scans a day. Your photo is read once to find the card and is never stored. Your collection stays in this browser.
      </p>
    </div>
  );
}
