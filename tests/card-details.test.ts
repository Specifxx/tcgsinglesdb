import { test } from "node:test";
import assert from "node:assert/strict";
import { cardStats, detailLabel, detailsOfGroup, plainDetail, reprintsOf, setRank, type CardRow, type SearchRow } from "../src/lib/cards";
import { cardInsights } from "../src/lib/insights";

test("details: TCGplayer's fields as plain text, number and rarity left out, only cards kept", () => {
  const d = detailsOfGroup(
    [
      { productId: 1, name: "Charizard", extendedData: [{ name: "Number", value: "4/102" }, { name: "Rarity", value: "Holo Rare" }, { name: "HP", value: "120" }, { name: "CardText", value: "<strong>Energy Burn</strong><br>Attach &amp; discard" }, { name: "Artist", value: " " }] },
      { productId: 2, name: "Booster Box", extendedData: [{ name: "Description", value: "36 packs" }] },
    ],
    new Set([1]),
  );
  assert.deepEqual(d, { "1": [["HP", "120"], ["Card text", "Energy Burn · Attach & discard"]] });
  assert.equal(detailLabel("RetreatCost"), "Retreat cost");
  assert.ok(plainDetail("x ".repeat(500)).length <= 600);
});

test("stats: tracked high, low and changes only as far back as the history goes", () => {
  const s = cardStats([[100, 1000], [110, 1500], [125, 1200]], 1300, 131);
  assert.deepEqual(s.high, { v: 1500, d: 110 });
  assert.deepEqual(s.low, { v: 1000, d: 100 });
  assert.equal(s.ch7, -13.3); // day 124 reads 1500
  assert.equal(s.ch30, 30);
});

test("rank in set, share of value and reprints by exact name", () => {
  const card = (id: number, v: number): CardRow => ({ id, s: `c${id}`, n: "x", no: "", r: null, p: v ? { Normal: v } : {} }) as CardRow;
  assert.deepEqual(setRank([card(1, 100), card(2, 300), card(3, 0)], 1), { rank: 2, of: 2, share: 25, total: 400 });
  const rows: SearchRow[] = [["a", "pika", "Pikachu", "1", 50, 1, 10], ["b", "pika", "pikachu ", "2", 900, 0, 11], ["c", "pika-ex", "Pikachu ex", "3", 5000, 1, 12]];
  assert.deepEqual(reprintsOf(rows, "Pikachu", 10).map((r) => r[6]), [11]);
});

test("insights say only what the numbers show", () => {
  const t = cardInsights({
    name: "Pikachu", setName: "Base Set", value: 5000, printings: [["Holofoil", 5000], ["Normal", 1000]],
    stats: { high: { v: 5000, d: 300 }, low: { v: 2000, d: 290 }, since: 290, ch7: 2, ch30: 40 },
    rank: { rank: 1, of: 102, share: 12.5 }, reprints: { count: 2, cheapest: 100, dearest: 900 }, storeLow: 4000, buyTop: null,
  });
  assert.ok(t.some((x) => x.startsWith("The most valuable card in Base Set")));
  assert.ok(t.some((x) => x.startsWith("At its highest price")));
  assert.ok(t.some((x) => x.includes("5.0× the Normal")));
  assert.ok(t.some((x) => x.includes("most valuable printing of Pikachu")));
  assert.ok(t.some((x) => x.includes("20% under")));
  assert.ok(!t.some((x) => /\b(buy|sell) now\b|will rise|invest/i.test(x)));
});
