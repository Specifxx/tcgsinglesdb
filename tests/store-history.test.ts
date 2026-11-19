// The cheapest in-stock store price history (lib/store-history.ts): the red line of the card page's price history.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dayIndex } from "../src/lib/cards";
import { addStoreLows, headlinePrinting, storeLow } from "../src/lib/store-history";

const D = "2026-11-20";
const d = dayIndex(D);
const next = (n: number) => new Date(Date.parse(`${D}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

test("the store low prices the headline printing only, in stock only", () => {
  const p = { Normal: 150, Foil: 900 };
  assert.equal(headlinePrinting(p), "Foil");
  const rows = [
    ["a", "Normal", 120, 1],
    ["b", "Foil", 950, 1],
    ["c", "Foil", 880, 0],
    ["d", "Foil", 990, 1],
  ] as const;
  assert.equal(storeLow(p, rows), 950);
  assert.equal(storeLow(p, [["a", "Normal", 120, 1]]), null);
});

test("a point only when the low moves; 0 on a day no store has a followed card; a same-day rerun replaces the day", () => {
  let h = addStoreLows({}, new Map([[1, 500]]), D);
  assert.deepEqual(h, { "1": [[d, 500]] });
  h = addStoreLows(h, new Map([[1, 500]]), next(1));
  assert.deepEqual(h["1"], [[d, 500]]);
  h = addStoreLows(h, new Map(), next(2));
  assert.deepEqual(h["1"], [[d, 500], [d + 2, 0]]);
  h = addStoreLows(h, new Map([[1, 450]]), next(2));
  assert.deepEqual(h["1"], [[d, 500], [d + 2, 450]]);
  h = addStoreLows(h, new Map([[1, 500]]), next(2));
  assert.deepEqual(h["1"], [[d, 500]]);
  assert.deepEqual(addStoreLows({}, new Map(), D), {}, "a card no store has is not followed");
});

test("the crawl writes the store-low history, and the page draws both lines", () => {
  assert.match(readFileSync("scripts/stores.ts", "utf8"), /addStoreLows\(readJson<HistoryFile>\(file, \{\}\), lows, day\)/);
  const page = readFileSync("src/app/[game]/[set]/[card]/page.tsx", "utf8");
  assert.match(page, /<PriceHistory tcg=\{pts\} lows=\{lows\}/);
});
