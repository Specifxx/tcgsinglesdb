import { CardTiles } from "@/components/CardTiles";
import { SearchBox } from "@/components/SearchBox";
import { cardImage, cardPath, shortDate, shortName, usd } from "@/lib/format";
import { pageMeta } from "@/lib/seo";
import { readMeta, readStoreNames, readTop, shownGames } from "@/lib/store";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";
export const metadata = pageMeta({
  title: `${SITE.name}: ${SITE.tagline}`,
  description:
    "What is a single card worth? TCGplayer market prices per printing, price history and the week's biggest movers for every trading card game, updated daily.",
  path: "/",
});

const n = (x: number) => x.toLocaleString("en-US");

export default function Home() {
  const meta = readMeta();
  const games = shownGames();
  const cards = games.reduce((t, g) => t + (meta.games[g.slug]?.cards ?? 0), 0);
  const stores = Object.keys(readStoreNames()).length;
  const lead = games[0];
  const fan = lead ? readTop(lead.slug).top.slice(0, 5) : [];
  const byCards = [...games].sort((a, b) => Number(b === lead) - Number(a === lead) || (meta.games[b.slug]?.cards ?? 0) - (meta.games[a.slug]?.cards ?? 0));
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">The single-card price database</p>
            <h1>
              Every trading card, <em>priced daily.</em>
            </h1>
            <p className="lede">
              Look up any single by name, set or collector number. Every printing&rsquo;s TCGplayer market price, how it has moved, and
              which stores have it in stock.
            </p>
            <div className="hero-search">
              <SearchBox />
            </div>
            <ul className="stats">
              <li>
                <b>{n(cards)}</b> cards
              </li>
              <li>
                <b>{games.length}</b> games
              </li>
              {stores > 0 && (
                <li>
                  <b>{stores}</b> stores checked
                </li>
              )}
              {meta.generatedAt && <li>Updated {shortDate(meta.generatedAt)}</li>}
            </ul>
            <div className="chips">
              {byCards.slice(0, 7).map((g) => (
                <a key={g.slug} className="chip" href={`/${g.slug}`}>
                  {shortName(g.name)}
                </a>
              ))}
              <a className="chip" href="#games">
                All {games.length} games →
              </a>
            </div>
          </div>
          {fan.length === 5 && lead && (
            <div>
              <div className="fan">
                {fan.map((c, i) => (
                  <a key={c.id} href={cardPath(lead.slug, c.set, c.s)} title={`${c.n}: ${usd(c.v)}`}>
                    <img src={cardImage(c.id, i === 2 ? 1000 : 200)} alt={`${c.n}, ${usd(c.v)}`} width={200} height={280} fetchPriority={i === 2 ? "high" : undefined} decoding="async" />
                  </a>
                ))}
              </div>
              <p className="fan-cap">
                The five most valuable {lead.name} cards today, from {usd(fan[4].v)} to {usd(fan[0].v)}
              </p>
            </div>
          )}
        </div>
      </section>

      <section id="games">
        <div className="sect-head">
          <h2>Every game</h2>
          <span className="small">{n(cards)} cards</span>
        </div>
        <div className="games">
          {games.map((g) => (
            <a key={g.slug} className="card" href={`/${g.slug}`}>
              <b>{g.name}</b>
              <span className="small">
                {n(meta.games[g.slug]?.cards ?? 0)} cards · {n(meta.games[g.slug]?.sets ?? 0)} sets
              </span>
            </a>
          ))}
        </div>
      </section>
      {games.slice(0, 4).map((g) => {
        const top = readTop(g.slug);
        return (
          <section key={g.slug}>
            <div className="sect-head">
              <h2>
                <a href={`/${g.slug}`}>{g.name} card prices</a>
              </h2>
              <a className="more" href={`/${g.slug}`}>
                Every set →
              </a>
            </div>
            {top.up.length > 0 && (
              <>
                <h3>Rising this week</h3>
                <CardTiles game={g.slug} cards={top.up.slice(0, 6)} />
              </>
            )}
            <h3>Most valuable</h3>
            <CardTiles game={g.slug} cards={top.top.slice(0, 12)} eager={6} />
          </section>
        );
      })}
    </div>
  );
}
