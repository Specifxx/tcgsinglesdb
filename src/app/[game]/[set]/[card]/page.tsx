import { ShareButton } from "@/components/ShareButton";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { CardTiles } from "@/components/CardTiles";
import { PriceHistory } from "@/components/PriceHistory";
import { historyLines } from "@/lib/history-chart";
import { AFFILIATE_NOTE, GRADED_TEST_GAMES, REL_SPONSORED, ebayCardSearchUrl, storeProductUrl, tcgplayerOutUrl } from "@/lib/affiliate";
import { cardIndexable, cardLinkRel, cardStats, cardTitle, cardValue, dayIndex, dayOfIndex, reprintsOf, setRank, tcgplayerCardUrl, type CardRow, type CardSet } from "@/lib/cards";
import { cardInsights } from "@/lib/insights";
import { cardImage, cardPath, shortDate, usd } from "@/lib/format";
import { breadcrumbLd, jsonLd, pageMeta } from "@/lib/seo";
import { readBuylist, readBuylistMeta, readDetails, readHistory, readSearch, readOffers, readStoreHistory, readSet, readSets, readStoreNames, setBySlug, shownGame, shownGames } from "@/lib/store";
import { SITE, type Game } from "@/site.config";
import { BUYERS, payShare } from "@/lib/buylist";

// One card's price page. The price is TCGplayer's market price only (recent sales, US$), never a seller's ask. Rows: "Check on
// eBay" first (a tagged search; no eBay API call and no price claimed), TCGplayer second. Indexable once the import has released
// the card to Google (lib/cards.ts); every other card is live and noindex. A card that left TCGplayer's list redirects to its set.
export const dynamic = "force-dynamic";

type Loaded = { g: Game; set: CardSet; c: CardRow; cards: CardRow[] };
function load(params: { game: string; set: string; card: string }): Loaded | "set" | null {
  const g = shownGame(params.game);
  const set = g && setBySlug(g.slug, params.set);
  if (!g || !set) return null;
  const cards = readSet(g.slug, set.slug);
  const c = cards.find((x) => x.s === params.card);
  return c ? { g, set, c, cards } : "set";
}
const printings = (c: CardRow) => Object.entries(c.p).sort((a, b) => b[1] - a[1]);

function describe(g: Game, set: CardSet, c: CardRow): string {
  const parts = printings(c).slice(0, 3).map(([k, v]) => `${usd(v)} ${k.toLowerCase()}`);
  const where = `${g.name} ${set.name}${c.no ? ` #${c.no}` : ""}`;
  const d = parts.length ? `${c.n} (${where}) price: ${parts.join(", ")} at TCGplayer's market price, updated daily, with price history.` : `${c.n} (${where}): no recent TCGplayer sales. Check eBay and TCGplayer listings for this card.`;
  return d.length <= 160 ? d : d.slice(0, 157).replace(/\s+\S*$/, "") + "…";
}

export function generateMetadata({ params }: { params: { game: string; set: string; card: string } }): Metadata {
  const x = load(params);
  if (!x || x === "set") return {};
  const { g, set, c } = x;
  return pageMeta({ title: cardTitle(c, set, SITE.name), description: describe(g, set, c), path: cardPath(g.slug, set.slug, c.s), image: cardImage(c.id, 1000), noindex: !cardIndexable(c) });
}

export default async function CardPage({ params }: { params: { game: string; set: string; card: string } }) {
  const x = load(params);
  if (x === "set") permanentRedirect(`/${params.game}/${params.set}`);
  if (!x) notFound();
  const { g, set, c, cards } = x;
  const { generatedAt } = readSets(g.slug);
  const day = generatedAt.slice(0, 10);
  const value = cardValue(c.p);
  const rows = printings(c);
  const [pts, lows, details] = await Promise.all([readHistory(g.slug, set.slug, c.id), readStoreHistory(g.slug, set.slug, c.id), readDetails(g.slug, set.slug, c.id)]);
  const through = day ? dayIndex(day) : 0;
  const chart = day ? historyLines(pts, lows, 1, through) != null : false;
  const ebay = ebayCardSearchUrl(`${g.short} ${c.n} ${set.name}${c.no ? ` ${c.no}` : ""}`, "card-ebay");
  const psa10 = GRADED_TEST_GAMES.has(g.slug) ? ebayCardSearchUrl(`${g.short} ${c.n} ${set.name}${c.no ? ` ${c.no}` : ""} PSA 10`, "graded") : null;
  const tcg = tcgplayerOutUrl(tcgplayerCardUrl(c.id), "card-tcgplayer");
  // Store rows: independent US stores that list this card Near Mint and in stock, cheapest first (scripts/stores.ts). Unpaid.
  const names = readStoreNames();
  const storeRows = (readOffers(g.slug, set.slug)[c.s] ?? []).filter((r) => names[r[0]]);
  // "Who pays most?": cash buy prices (scripts/buylist.ts), matched to this card by TCGplayer id only. Unpaid links.
  const buyRows = readBuylist(g.slug, set.slug)[c.s] ?? [];
  const buyDay = readBuylistMeta().buyers.ck?.readAt?.slice(0, 10) ?? "";
  const i = cards.indexOf(c);
  const prev = i > 0 ? cards[i - 1] : null;
  const next = i < cards.length - 1 ? cards[i + 1] : null;
  const others = cards
    .filter((o) => o.id !== c.id && (cardValue(o.p) ?? 0) > 0)
    .sort((a, b) => (cardValue(b.p) ?? 0) - (cardValue(a.p) ?? 0) || a.id - b.id)
    .slice(0, 12);
  // Card facts and insights: our own history since we began reading the card, its place in its set, and the same name elsewhere.
  const stats = cardStats(pts, value, through);
  const rank = setRank(cards, c.id);
  const setNames = new Map(readSets(g.slug).sets.map((x) => [x.slug, x.name]));
  const reprints = reprintsOf(readSearch(g.slug), c.n, c.id).filter((r) => r[0] !== set.slug || r[3] !== c.no);
  const rpv = reprints.map((r) => r[4]).filter((v) => v > 0);
  const insights = cardInsights({
    name: c.n,
    setName: set.name,
    value,
    printings: rows,
    stats,
    rank,
    reprints: { count: reprints.length, cheapest: rpv.length ? Math.min(...rpv) : null, dearest: rpv.length ? Math.max(...rpv) : null },
    storeLow: storeRows.length ? Math.min(...storeRows.map((r) => r[2])) : null,
    buyTop: buyRows.length ? ((b) => ({ name: BUYERS[b[0]].name, cents: b[2] }))(buyRows.reduce((a, b) => (b[2] > a[2] ? b : a))) : null,
  });
  const change = (n: number | null) => (n == null ? "–" : `${n > 0 ? "+" : ""}${Math.abs(n) < 10 ? n.toFixed(1) : Math.round(n)}%`);
  const moved = !!(stats.high && stats.low && stats.high.v !== stats.low.v);
  const facts: [string, string, string?][] = [
    ...(moved && stats.high ? [["Tracked high", usd(stats.high.v), shortDate(dayOfIndex(stats.high.d))] as [string, string, string]] : []),
    ...(moved && stats.low ? [["Tracked low", usd(stats.low.v), shortDate(dayOfIndex(stats.low.d))] as [string, string, string]] : []),
    ...(stats.ch7 != null ? [["7 days", change(stats.ch7)] as [string, string]] : []),
    ...(stats.ch30 != null ? [["30 days", change(stats.ch30)] as [string, string]] : []),
    ...(rank ? [["Rank in set", `#${rank.rank}`, `of ${rank.of} priced`] as [string, string, string], ["Share of set value", `${rank.share}%`, `set total ${usd(rank.total)}`] as [string, string, string]] : []),
  ];
  const detailRows: [string, string][] = [
    ["Game", g.name],
    ["Set", `${set.name}${set.abbr ? ` (${set.abbr})` : ""}`],
    ...(c.no ? [["Number", c.no] as [string, string]] : []),
    ...(c.r ? [["Rarity", c.r] as [string, string]] : []),
    ...(set.released ? [["Set released", shortDate(set.released)] as [string, string]] : []),
    ...(rows.length ? [["Printings", rows.map(([k]) => k).join(", ")] as [string, string]] : []),
    ...details,
  ];
  const crumbs = [{ label: SITE.name, href: "/" }, { label: g.name, href: `/${g.slug}` }, { label: set.name, href: `/${g.slug}/${set.slug}` }, { label: c.n }];
  const url = `${SITE.url}${cardPath(g.slug, set.slug, c.s)}`;
  // What an answer engine can quote: the card, the figure, the source and the date. No Offer: we do not sell the card.
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${c.n}${c.no ? ` #${c.no}` : ""} (${g.name}, ${set.name})`,
    image: cardImage(c.id, 1000),
    url,
    category: `${g.name} trading card`,
    sku: String(c.id),
    additionalProperty: [
      ...rows.map(([k, v]) => ({ "@type": "PropertyValue", name: `TCGplayer market price (${k})`, value: (v / 100).toFixed(2), unitCode: "USD", ...(day ? { dateModified: day } : {}) })),
      ...(c.r ? [{ "@type": "PropertyValue", name: "Rarity", value: c.r }] : []),
      ...(c.no ? [{ "@type": "PropertyValue", name: "Collector number", value: c.no }] : []),
    ],
  };
  return (
    <div className="page" data-strip-q={`${g.short} ${c.n} ${set.name}${c.no ? ` ${c.no}` : ""}`} data-strip-tcg={tcgplayerCardUrl(c.id)}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd(crumbs)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/">{SITE.name}</a> <span>›</span> <a href={`/${g.slug}`}>{g.name}</a> <span>›</span> <a href={`/${g.slug}/${set.slug}`}>{set.name}</a> <span>›</span> <span>{c.n}</span>
      </nav>
      <div className="cardgrid">
        <div className="art">
          <img src={cardImage(c.id, 1000)} alt={`${c.n}, ${set.name}${c.no ? ` #${c.no}` : ""}`} width={488} height={680} fetchPriority="high" decoding="async" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            {g.name} · {set.name}
            {c.no ? ` · #${c.no}` : ""}
            {c.r ? ` · ${c.r}` : ""}
          </div>
          <h1>{c.n} price</h1>
          <ShareButton path={cardPath(g.slug, set.slug, c.s)} title={`${c.n} price`} medium="card" text={value != null ? `${c.n} (${g.short} ${set.name}): ${usd(value)} TCGplayer market price, with price history, on ${SITE.name}` : `${c.n} (${g.short} ${set.name}) on ${SITE.name}`} />
          {value != null ? (
            <p style={{ margin: "12px 0 0" }}>
              <span className="price">{usd(value)}</span> <span className="small">TCGplayer market price{rows.length > 1 ? ` (${rows[0][0].toLowerCase()})` : ""}</span>
            </p>
          ) : (
            <p className="lede">No recent TCGplayer sales of this card. Check the listings below.</p>
          )}
          {rows.length > 0 && (
            <table className="list" style={{ maxWidth: "30rem", marginTop: 12 }}>
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td className="r">
                      <b>{usd(v)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <ul className="rows">
            <li className="card">
              <span>
                <b>eBay</b>
                <span className="small" style={{ display: "block" }}>
                  Search listings for this card
                </span>
              </span>
              <a className="btn primary" href={ebay} rel={REL_SPONSORED} target="_blank">
                Check on eBay ↗
              </a>
            </li>
            {psa10 && (
              <li className="card">
                <span>
                  <b>Graded PSA 10</b>
                  <span className="small" style={{ display: "block" }}>
                    Search graded copies on eBay
                  </span>
                </span>
                <a className="btn" href={psa10} rel={REL_SPONSORED} target="_blank" data-kind="graded">
                  PSA 10 on eBay ↗
                </a>
              </li>
            )}
            <li className="card">
              <span>
                <b>TCGplayer</b>
                <span className="small" style={{ display: "block" }}>
                  {value != null ? `Market price ${usd(value)}` : "See listings"}
                </span>
              </span>
              <a className="btn" href={tcg} rel={REL_SPONSORED} target="_blank">
                View on TCGplayer ↗
              </a>
            </li>
            {storeRows.map(([key, printing, cents, , productPath, seen]) => (
              <li className="card" key={`${key}|${printing}`}>
                <span>
                  <b>{names[key].name}</b>
                  <span className="small" style={{ display: "block" }}>
                    {usd(cents)} · Near Mint{rows.length > 1 ? ` · ${printing}` : ""} · in stock, checked {shortDate(seen)}
                  </span>
                </span>
                <a className="btn" href={storeProductUrl(names[key].base, productPath)} rel="nofollow noopener" target="_blank">
                  View at store ↗
                </a>
              </li>
            ))}
          </ul>
          <p className="small">
            {AFFILIATE_NOTE}
            {storeRows.length > 0 ? " Store prices are each store's own Near Mint price in US$, as last read; check the store for the current price and shipping." : ""}
          </p>

          {buyRows.length > 0 && (
            <section>
              <h2>Sell it: who pays most?</h2>
              <ul className="rows">
                {buyRows.map(([b, printing, cents, qty]) => (
                  <li className="card" key={`${b}|${printing}`}>
                    <span>
                      <b>{BUYERS[b].name} pays {usd(cents)}</b>
                      <span className="small" style={{ display: "block" }}>
                        Cash, Near Mint{rows.length > 1 ? ` · ${printing}` : ""}
                        {c.p[printing] ? ` · ${payShare(cents, c.p[printing])}% of market` : ""} · buying up to {qty}
                        {buyDay ? `, checked ${shortDate(buyDay)}` : ""}
                      </span>
                    </span>
                    <a className="btn" href={BUYERS[b].sellUrl(c.n)} rel="nofollow noopener" target="_blank">
                      Sell to {BUYERS[b].name} ↗
                    </a>
                  </li>
                ))}
              </ul>
              <p className="small">
                The store&apos;s own buylist price for a Near Mint copy, as last read; store credit usually pays more, and the store grades what arrives. <a href="/sell">Best cash offers today</a>
              </p>
            </section>
          )}

          {(insights.length > 0 || facts.length > 0) && (
            <section>
              <h2>{c.n} at a glance</h2>
              {facts.length > 0 && (
                <dl className="facts">
                  {facts.map(([k, v, sub]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>
                        <b className={k.endsWith("days") ? (v.startsWith("+") ? "up" : v.startsWith("-") ? "down" : "") : ""}>{v}</b>
                        {sub ? <span className="small">{sub}</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {insights.length > 0 && (
                <ul className="insights">
                  {insights.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
              {stats.since != null && <p className="small">Highs, lows and changes are TCGplayer&apos;s market price as we have read it each day since {shortDate(dayOfIndex(stats.since))}; we do not backfill older prices.</p>}
            </section>
          )}

          {chart && (
            <section>
              <h2>Price history</h2>
              <PriceHistory tcg={pts} lows={lows} through={through} />
            </section>
          )}

          <p className="lede" style={{ marginTop: 22 }}>
            {c.n} is {c.no ? `card #${c.no} in ` : "a card from "}the {g.name} set {set.name}
            {set.abbr ? ` (${set.abbr})` : ""}
            {c.r ? `, rarity ${c.r}` : ""}.{" "}
            {value != null ? `Its TCGplayer market price is ${usd(value)}${day ? ` as of ${shortDate(day)}` : ""}: what copies have recently sold for on TCGplayer, in US dollars.` : "It has no recent sales on TCGplayer."}
          </p>

          <section>
            <h2>Card details</h2>
            <table className="list details">
              <tbody>
                {detailRows.map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {details.length > 0 && <p className="small">Card details as TCGplayer lists them.</p>}
          </section>

          {reprints.length > 0 && (
            <section>
              <h2>Other printings of {c.n}</h2>
              <table className="list">
                <tbody>
                  {reprints.map((r) => (
                    <tr key={r[6]}>
                      <th scope="row">
                        <a href={cardPath(g.slug, r[0], r[1])} rel={r[5] ? undefined : "nofollow"}>{setNames.get(r[0]) ?? r[0]}</a>
                        {r[3] ? <span className="small"> #{r[3]}</span> : null}
                      </th>
                      <td className="r">{r[4] > 0 ? <b>{usd(r[4])}</b> : <span className="small">no recent sales</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {(prev || next) && (
            <nav aria-label="Next and previous card" className="pager">
              {prev && (
                <a className="btn" href={cardPath(g.slug, set.slug, prev.s)} rel={cardLinkRel(prev)}>
                  ← {prev.no ? `#${prev.no} ` : ""}
                  {prev.n}
                </a>
              )}
              {next && (
                <a className="btn" href={cardPath(g.slug, set.slug, next.s)} rel={cardLinkRel(next)}>
                  {next.no ? `#${next.no} ` : ""}
                  {next.n} →
                </a>
              )}
            </nav>
          )}
        </div>
      </div>
      {others.length > 0 && (
        <section>
          <h2>
            More <a href={`/${g.slug}/${set.slug}`}>{set.name}</a> card prices
          </h2>
          <CardTiles game={g.slug} cards={others.map((o) => ({ set: set.slug, s: o.s, n: o.n, no: o.no, r: o.r, id: o.id, v: cardValue(o.p) ?? 0, rel: cardLinkRel(o) }))} />
        </section>
      )}
    </div>
  );
}
