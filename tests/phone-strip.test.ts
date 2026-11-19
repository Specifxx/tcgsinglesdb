// The phone ad strip (components/PhoneStrip.tsx, owner 2026-11-19): phones only, after a scroll, never beside the buy rows or the
// footer, never while typing; tagged eBay and TCGplayer links with their own placements, never Amazon, never a price.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripLinks, stripShows } from "../src/components/PhoneStrip";

const base = { narrow: true, scrolled: 1000, screen: 800, blockers: 0, typing: false };

test("shows on a phone after a scroll, and only then", () => {
  assert.equal(stripShows(base), true);
  assert.equal(stripShows({ ...base, narrow: false }), false);
  assert.equal(stripShows({ ...base, scrolled: 100 }), false);
  assert.equal(stripShows({ ...base, blockers: 1 }), false);
  assert.equal(stripShows({ ...base, typing: true }), false);
});

test("links are tagged with the dock placements", () => {
  const card = stripLinks("/pokemon/base/charizard", { pokemon: "Pokemon" }, "Pokemon Charizard Base 4", "https://www.tcgplayer.com/product/42");
  assert.match(card.ebay, /customid=tcgsdb-us-dock-ebay/);
  assert.match(card.ebay, /Charizard/);
  assert.match(card.tcgplayer, /^\/out\/tcgplayer\?u=https%3A%2F%2Fwww\.tcgplayer\.com%2Fproduct%2F42&sharedid=tcgsdb-us-dock-tcgplayer$/);
  const game = stripLinks("/pokemon", { pokemon: "Pokemon" });
  assert.equal(game.label, "Pokemon singles");
  assert.equal(stripLinks("/", {}).label, "singles");
});

test("never Amazon, never a price", () => {
  const src = readFileSync(new URL("../src/components/PhoneStrip.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /amazon\.(com|co|ca)|amzn\.to/i);
  assert.doesNotMatch(src, /\$\{?usd|\bprice=/);
});
