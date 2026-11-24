import { test } from "node:test";
import assert from "node:assert/strict";
import { ageSealed, idsInText, isSealedProduct, recentGroup, slugOf } from "../src/lib/sealed-coverage";

const p = (name: string, number?: string) => ({ productId: 1, name, extendedData: number ? [{ name: "Number", value: number }] : [] });

test("sealed products are told from cards and accessories", () => {
  assert.equal(isSealedProduct(p("Glorious Victors Booster Pack [1st Edition]")), true);
  assert.equal(isSealedProduct(p("Ascended Heroes Elite Trainer Box")), true);
  assert.equal(isSealedProduct(p("Legacy - Booster Display Case")), true);
  assert.equal(isSealedProduct(p("Spiritforged - Sleeved Booster Pack")), true);
  assert.equal(isSealedProduct(p("Jinx, Rebel", "202/298")), false);
  assert.equal(isSealedProduct(p("Pikachu Card Sleeves (65ct)")), false);
  assert.equal(isSealedProduct(p("Riftbound Playmat - Jinx")), false);
});

test("a group is recent when published lately or soon, or touched this fortnight", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  assert.equal(recentGroup({ publishedOn: "2026-10-01T00:00:00", modifiedOn: null }, now), true);
  assert.equal(recentGroup({ publishedOn: "2027-02-01T00:00:00", modifiedOn: null }, now), true);
  assert.equal(recentGroup({ publishedOn: "2023-07-01T00:00:00", modifiedOn: "2026-11-20T00:00:00" }, now), true);
  assert.equal(recentGroup({ publishedOn: "2023-07-01T00:00:00", modifiedOn: "2026-09-01T00:00:00" }, now), false);
});

test("ids are read from TCGplayer image and product URLs", () => {
  const ids = idsInText('{"imageUrl":"https://tcgplayer-cdn.tcgplayer.com/product/502006_in_1000x1000.jpg","u":"https://www.tcgplayer.com/product/713237/yugioh"}');
  assert.deepEqual([...ids].sort(), [502006, 713237]);
});

test("slugs match the importers' and missing days carry over", () => {
  assert.equal(slugOf("Pokémon TCG: Mega Evolution—Ascended Heroes Booster Bundle"), "pokemon-tcg-mega-evolution-ascended-heroes-booster-bundle");
  assert.deepEqual(ageSealed({ "A|1": "2026-11-20", "A|2": "2026-11-21" }, ["A|1", "A|3"], "2026-11-24"), { "A|1": "2026-11-20", "A|3": "2026-11-24" });
});
