import { CardTiles } from "@/components/CardTiles";
import { shortDate } from "@/lib/format";
import { pageMeta } from "@/lib/seo";
import { readMeta, readTop, shownGame, shownGames } from "@/lib/store";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";
export const metadata = pageMeta({
  title: `${SITE.name}: ${SITE.tagline}`,
  description:
    "What is a single card worth? TCGplayer market prices per printing, price history and the week's biggest movers, updated daily.",
  path: "/",
});

export default function Home() {
  const meta = readMeta();
  return (
    <div className="page">
      <div className="hero">
        <h1>What is that card worth?</h1>
        <p className="lede">
          Search any card by name, set or collector number. Every card shows its
          TCGplayer market price per printing and how that price has moved.
          {meta.generatedAt ? ` Updated ${shortDate(meta.generatedAt)}.` : ""}
        </p>
      </div>
      <section id="games">
        <h2>Every game</h2>
        <div className="games">
          {shownGames().map((g) => (
            <a key={g.slug} className="card" href={`/${g.slug}`}>
              <b>{g.name}</b>
              <span className="small">
                {(meta.games[g.slug]?.cards ?? 0).toLocaleString("en-US")} cards
                · {(meta.games[g.slug]?.sets ?? 0).toLocaleString("en-US")} sets
              </span>
            </a>
          ))}
        </div>
      </section>
      {shownGames()
        .slice(0, 4)
        .map((g) => {
          const top = readTop(g.slug);
          const m = meta.games[g.slug];
          return (
            <section key={g.slug}>
              <h2>
                <a href={`/${g.slug}`}>{g.name} card prices</a>
              </h2>
              {m ? (
                <p className="small">
                  {m.cards.toLocaleString("en-US")} cards in{" "}
                  {m.sets.toLocaleString("en-US")} sets
                </p>
              ) : null}
              {top.up.length > 0 && (
                <>
                  <h3 className="small">Rising this week</h3>
                  <CardTiles game={g.slug} cards={top.up.slice(0, 6)} />
                </>
              )}
              <h3 className="small">Most valuable</h3>
              <CardTiles game={g.slug} cards={top.top.slice(0, 12)} eager={6} />
              <p>
                <a className="btn" href={`/${g.slug}`}>
                  Every {g.name} set
                </a>
              </p>
            </section>
          );
        })}
    </div>
  );
}
