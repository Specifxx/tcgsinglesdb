import { SellDesk } from "@/components/SellDesk";
import { pageMeta } from "@/lib/seo";
import { shownGames } from "@/lib/store";
import { FEE_SOURCES, FEES_READ, MAX_LINES } from "@/lib/sell";
import { shortDate } from "@/lib/format";
import { SITE } from "@/site.config";

// The Sell desk (DECISIONS.md 2026-11-24): a seller's card list in, where each card nets the most out. The page is a static
// shell (CDN-cached a day); the list is priced in the browser through /api/sell/price, which stores nothing.
export const dynamic = "force-dynamic";
export const metadata = pageMeta({
  title: "Price your card list: where to sell each card for the most",
  description: `Paste or upload up to ${MAX_LINES} trading cards and see each one's TCGplayer market price, what it nets after TCGplayer and eBay fees, and the best place to sell it. Free, no sign-up.`,
  path: "/sell/list",
});

export default function SellList() {
  const games = shownGames().map((g) => ({ slug: g.slug, name: g.name }));
  return (
    <div className="page">
      <p className="crumbs">
        <a href="/">Home</a> / <a href="/sell">Sell your cards</a> / Price a list
      </p>
      <h1>Price your card list</h1>
      <p className="lede">
        Paste your cards or upload a CSV, up to {MAX_LINES}. For each card you get today&rsquo;s TCGplayer market price, what you
        keep after TCGplayer&rsquo;s and eBay&rsquo;s seller fees, any cash buylist offer, and the best place to sell it. Then
        download it as a spreadsheet. Free, no sign-up, and your list never leaves this page except to look the cards up.
      </p>
      <SellDesk games={games} />

      <h2>How the numbers are worked out</h2>
      <ul className="insights">
        <li>
          <b>Market</b> is TCGplayer&rsquo;s market price for that printing, from recent sales, read once a day. It is what a Near
          Mint copy has been selling for, not a promise of what yours will sell for.
        </li>
        <li>
          <b>TCGplayer net</b> takes off a 10.75% commission (at most US$75 a card) and 2.5% + US$0.30 payment processing, the fees
          for a standard Level 1-4 seller (<a href={FEE_SOURCES.tcgplayer} rel="nofollow noopener">TCGplayer&rsquo;s fee page</a>).
        </li>
        <li>
          <b>eBay net</b> takes off 13.25% of the sale (2.35% of any part over US$7,500) and US$0.40 an order (US$0.30 at US$10 or
          less), eBay&rsquo;s US fee for collectible card games (<a href={FEE_SOURCES.ebay} rel="nofollow noopener">eBay&rsquo;s fee page</a>). Set
          &ldquo;My eBay price&rdquo; if you list above or below the TCGplayer market.
        </li>
        <li>
          <b>Cash offer</b> is a store&rsquo;s buylist price for a Near Mint copy, where we have one (Card Kingdom, Magic only for
          now). It is paid with no fees, but the store grades what arrives.
        </li>
        <li>
          Every card is worked out as if sold on its own. Shipping, sales tax and any store or promoted-listing fees are left out, so
          selling several cards in one order keeps a little more of each.
        </li>
        <li>
          <b>Keep or sell in bulk</b> means fees would take half the price or more: such cards usually sell better as a lot or to a
          bulk buyer.
        </li>
      </ul>
      <p className="small">
        Fees read on {shortDate(FEES_READ)}. {SITE.name} is not affiliated with TCGplayer, eBay or any buylist store, and nothing on
        this page is a paid link.
      </p>
    </div>
  );
}
