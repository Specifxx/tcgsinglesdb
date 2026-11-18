import { pageMeta } from "@/lib/seo";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";
export const metadata = pageMeta({ title: "About", description: `What ${SITE.name} is, where its prices come from and how it earns.`, path: "/about" });

export default function About() {
  return (
    <div className="page">
      <h1>About {SITE.name}</h1>
      <p className="lede">A price guide for single trading cards. One page per card, with what it has recently sold for.</p>
      <h2>Where the prices come from</h2>
      <p>Every price is TCGplayer&rsquo;s market price in US dollars: what copies of that printing recently sold for on TCGplayer, not what a seller is asking. We read TCGplayer&rsquo;s public price files once a day. A card with no recent sale shows no price.</p>
      <p>Under the TCGplayer price, a card page can list independent US stores that have the card Near Mint and in stock, cheapest first, at each store&rsquo;s own price as we last read it. A store is listed only when its listing carries TCGplayer&rsquo;s own id for that card and names the printing clearly; we never guess from a title. Store links are not paid.</p>
      <p>On Magic cards, a &ldquo;Sell it&rdquo; block shows what Card Kingdom pays in cash for a Near Mint copy, from its public buylist, matched to the card through Scryfall&rsquo;s record of TCGplayer&rsquo;s id. Those links are not paid.</p>
      <h2>Price history</h2>
      <p>We keep each card&rsquo;s price from the day this site first read it, and add a point whenever it moves. The history cannot go back further than that.</p>
      <h2>How the site earns</h2>
      <p>The eBay and TCGplayer buttons are paid links: we may earn a commission when you buy. It never changes a price shown here, and no seller pays to be listed.</p>
      <h2>Who runs it, and what it costs</h2>
      <p>{SITE.name} is run and owned by two people, Bill and George, who also run a few sealed-product price sites. No publisher, store or marketplace has a stake in it. We use AI tools to help write the code; prices are never written by them, but read by a program from TCGplayer&rsquo;s own files.</p>
      <p>Hosting, the daily imports and the tools we build with come to about A$790 a month for this site and our other price sites together (our own books, the 30 days to 15 November 2026). The paid links above are what pay for it.</p>
      <h2>Not affiliated</h2>
      <p>{SITE.disclaimer}</p>
    </div>
  );
}
