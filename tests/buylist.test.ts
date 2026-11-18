// "Who pays most?" (lib/buylist.ts): a Card Kingdom row reaches a card only through Scryfall's TCGplayer id, rules only refuse,
// and Scryfall's bulk file is split without being held whole.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUYERS, ckPrinting, JsonArraySplitter, matchCk, payShare, sortBuyRows, type BuyCard, type CkRow } from "../src/lib/buylist";

const tcg = new Map([
  ["sf-ragavan", 239906],
  ["sf-bolt", 5001],
  ["sf-nottcg", 9999999],
]);
const cards = new Map<number, BuyCard>([
  [239906, { set: "modern-horizons-2", slug: "ragavan-nimble-pilferer-138", p: { Normal: 5500, Foil: 8000 } }],
  [5001, { set: "m10", slug: "lightning-bolt-146", p: { Normal: 90 } }],
]);
const row = (o: Partial<CkRow>): CkRow => ({ name: "Ragavan, Nimble Pilferer", is_foil: "false", price_buy: "38.00", qty_buying: 12, scryfall_id: "sf-ragavan", ...o });

test("a buying row is an offer on its printing, by id", () => {
  assert.deepEqual(matchCk(row({}), tcg, cards), { set: "modern-horizons-2", slug: "ragavan-nimble-pilferer-138", row: ["ck", "Normal", 3800, 12] });
  assert.deepEqual(matchCk(row({ is_foil: "true", price_buy: "52.5" }), tcg, cards), { set: "modern-horizons-2", slug: "ragavan-nimble-pilferer-138", row: ["ck", "Foil", 5250, 12] });
});

test("rules only refuse: not buying, no id, not ours, finishes, cheap cards, out of band", () => {
  assert.deepEqual(matchCk(row({ qty_buying: 0 }), tcg, cards), { refuse: "not-buying" });
  assert.deepEqual(matchCk(row({ price_buy: "0.00" }), tcg, cards), { refuse: "not-buying" });
  assert.deepEqual(matchCk(row({ scryfall_id: null }), tcg, cards), { refuse: "no-scryfall" });
  assert.deepEqual(matchCk(row({ scryfall_id: "sf-unknown" }), tcg, cards), { refuse: "no-tcg-id" });
  assert.deepEqual(matchCk(row({ scryfall_id: "sf-nottcg" }), tcg, cards), { refuse: "not-ours" });
  assert.deepEqual(matchCk(row({ is_foil: "true", variation: "Foil Etched" }), tcg, cards), { refuse: "finish" });
  assert.deepEqual(matchCk(row({ scryfall_id: "sf-bolt", price_buy: "0.50" }), tcg, cards), { refuse: "cheap-card" });
  assert.deepEqual(matchCk(row({ price_buy: "4.00" }), tcg, cards), { refuse: "out-of-band" }, "under a tenth of market: a mismatch");
  assert.deepEqual(matchCk(row({ price_buy: "80.00" }), tcg, cards), { refuse: "out-of-band" }, "over 125% of market: a mismatch");
  // The title never decides: a row with our card's name but another printing's id is that printing or nothing.
  assert.deepEqual(matchCk(row({ name: "Lightning Bolt", scryfall_id: "sf-unknown" }), tcg, cards), { refuse: "no-tcg-id" });
});

test("printings and order", () => {
  assert.equal(ckPrinting({ name: "X", is_foil: true }), "Foil");
  assert.equal(ckPrinting({ name: "X", is_foil: "false", variation: "Borderless" }), "Normal");
  assert.equal(ckPrinting({ name: "X", is_foil: "true", variation: "Serialized" }), null);
  assert.deepEqual(sortBuyRows([["ck", "Normal", 100, 1], ["ck", "Foil", 300, 2], ["ck", "Normal", 150, 3]]), [["ck", "Foil", 300, 2], ["ck", "Normal", 150, 3]]);
  assert.equal(payShare(3800, 5500), 69);
  assert.match(BUYERS.ck.sellUrl("Ragavan, Nimble Pilferer"), /^https:\/\/www\.cardkingdom\.com\/purchasing\/mtg_singles\?.*Ragavan%2C%20Nimble%20Pilferer$/);
});

test("the bulk file is split into objects across any chunk boundary, braces in strings included", () => {
  const text = `[\n{"id":"a","tcgplayer_id":1,"oracle_text":"{T}: Add {G}. \\"quote}\\""},\n{"id":"b","card_faces":[{"name":"x"}],"tcgplayer_id":2}\n]`;
  for (const size of [1, 3, 7, 1000]) {
    const got: string[] = [];
    const s = new JsonArraySplitter((t) => got.push(t));
    for (let i = 0; i < text.length; i += size) s.push(text.slice(i, i + size));
    assert.deepEqual(got.map((t) => JSON.parse(t).tcgplayer_id), [1, 2], `chunk ${size}`);
  }
});

test("wired in: the daily import reads it without stopping the release, the monitor watches it, the page reads it", () => {
  const wf = readFileSync(".github/workflows/card-prices.yml", "utf8");
  assert.match(wf, /npx tsx scripts\/buylist\.ts \|\| echo/);
  assert.match(readFileSync("scripts/ops-monitor.ts", "utf8"), /Card Kingdom buylist/);
  assert.match(readFileSync("next.config.js", "utf8"), /data\/buylist/);
  const page = readFileSync("src/app/[game]/[set]/[card]/page.tsx", "utf8");
  assert.match(page, /readBuylist\(g\.slug, set\.slug\)\[c\.s\]/);
  // Card Kingdom is reached only through polite-http (robots.txt, honest User-Agent), never a bare fetch.
  const script = readFileSync("scripts/buylist.ts", "utf8");
  assert.match(script, /new StoreSession\("https:\/\/api\.cardkingdom\.com"/);
  assert.doesNotMatch(script, /fetch\(["'`]https:\/\/api\.cardkingdom/);
});
