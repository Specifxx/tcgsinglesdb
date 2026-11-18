import { BUYERS, payShare } from "@/lib/buylist";
import { cardImage, cardPath, shortDate, usd } from "@/lib/format";
import { pageMeta } from "@/lib/seo";
import { readBuylistMeta, readBuylistTop } from "@/lib/store";
import { SITE } from "@/site.config";

// "Who pays most?" (growth test #1, 2026-11-18): the best cash buylist offers for Magic singles today, from scripts/buylist.ts.
// Each row reached its card by TCGplayer id only. Links to the buyer are unpaid.
export const dynamic = "force-dynamic";
export const metadata = pageMeta({
  title: "Sell your Magic cards: today's best cash buylist prices",
  description: "What Card Kingdom pays in cash for Magic: The Gathering singles today, beside TCGplayer's market price, updated daily.",
  path: "/sell",
});

export default function Sell() {
  const top = readBuylistTop().slice(0, 100);
  const day = readBuylistMeta().buyers.ck?.readAt?.slice(0, 10) ?? "";
  return (
    <div className="page">
      <h1>Sell your Magic cards: who pays most?</h1>
      <p className="lede">
        The highest cash offers for Magic: The Gathering singles today, from {BUYERS.ck.name}&rsquo;s buylist, beside each card&rsquo;s TCGplayer market price.
        {day ? ` Checked ${shortDate(day)}.` : ""} Open a card to see its offer next to its price history.
      </p>
      {top.length === 0 ? (
        <p>No buylist prices yet: they appear after the next daily update.</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th scope="col">Card</th>
              <th scope="col" className="r">Cash offer</th>
              <th scope="col" className="r">Market</th>
              <th scope="col" className="r">Share</th>
            </tr>
          </thead>
          <tbody>
            {top.map((t) => (
              <tr key={`${t.id}|${t.row[1]}`}>
                <td>
                  <a href={cardPath("magic", t.set, t.slug)} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <img src={cardImage(t.id)} alt="" width={36} height={50} loading="lazy" decoding="async" />
                    <span>
                      {t.n}
                      {t.no ? ` #${t.no}` : ""}
                      <span className="small" style={{ display: "block" }}>
                        {t.setName}
                        {t.row[1] !== "Normal" ? ` · ${t.row[1]}` : ""}
                      </span>
                    </span>
                  </a>
                </td>
                <td className="r">
                  <b>{usd(t.row[2])}</b>
                </td>
                <td className="r">{t.market ? usd(t.market) : "–"}</td>
                <td className="r">{t.market ? `${payShare(t.row[2], t.market)}%` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small" style={{ marginTop: 16 }}>
        A cash offer is the store&rsquo;s own buylist price for a Near Mint copy, as last read; store credit usually pays more, and the store grades what arrives. We match each offer to its card by TCGplayer&rsquo;s id, never by name. {SITE.name} is not affiliated with {BUYERS.ck.name}, and these links are not paid.
      </p>
    </div>
  );
}
