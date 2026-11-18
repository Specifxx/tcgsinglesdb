import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GRADED_TEST_GAMES, ebayCardSearchUrl } from "../src/lib/affiliate";

test("graded test: PSA 10 link is a tagged eBay search, Pokémon only", () => {
  assert.deepEqual([...GRADED_TEST_GAMES], ["pokemon"]);
  const u = new URL(ebayCardSearchUrl("Pokemon Charizard ex Obsidian Flames 125 PSA 10", "graded"));
  assert.equal(u.hostname, "www.ebay.com");
  assert.equal(u.searchParams.get("campid"), "5339155912");
  assert.equal(u.searchParams.get("customid"), "tcgsdb-us-graded");
  assert.match(u.searchParams.get("_nkw") ?? "", /PSA 10$/);
});

test("graded test: the card page draws the row only through GRADED_TEST_GAMES and claims no price", () => {
  const page = readFileSync("src/app/[game]/[set]/[card]/page.tsx", "utf8");
  assert.match(page, /GRADED_TEST_GAMES\.has\(g\.slug\)/);
  assert.match(page, /data-kind="graded"/);
});
