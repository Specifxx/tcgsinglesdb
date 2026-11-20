import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ageMissing, groupGaps, inReleaseWindow, isShort, setKey, ygoPrefix } from "../src/lib/coverage";

test("groupGaps counts what a site lacks per TCGplayer group, floor-excused cards apart", () => {
  const tcg = new Map([
    [1, { name: "Promos", released: "2024-01-01", ids: [10, 11, 12] }],
    [2, { name: "Base", released: "2024-01-01", ids: [20, 21] }],
  ]);
  const r = groupGaps(tcg, new Set([10, 20, 21]), new Set([12]));
  assert.equal(r.tcgCards, 5);
  assert.equal(r.missing, 1);
  assert.equal(r.byFloor, 1);
  assert.deepEqual(r.groups.map((g) => [g.name, g.ours, g.missing]), [["Promos", 1, [11]]]);
});

test("setKey matches TCGplayer's coded names with a card database's plain ones", () => {
  assert.equal(setKey("SV08: Surging Sparks"), setKey("Surging Sparks"));
  assert.equal(setKey("Scarlet & Violet—151"), setKey("Scarlet and Violet 151"));
  assert.equal(setKey("Pokémon GO"), setKey("Pokemon GO"));
});

test("isShort wants under 90% and three or more missing", () => {
  assert.equal(isShort(100, 89), true);
  assert.equal(isShort(100, 91), false);
  assert.equal(isShort(10, 8), false);
  assert.equal(isShort(10, 7), true);
});

test("ygoPrefix reads the set code of a Yu-Gi-Oh! number", () => {
  assert.equal(ygoPrefix("LOB-EN001"), "LOB");
  assert.equal(ygoPrefix("SDK-001"), "SDK");
  assert.equal(ygoPrefix("RA04-EN123"), "RA04");
  assert.equal(ygoPrefix("SGX1-ENA01"), "SGX1");
  assert.equal(ygoPrefix("12"), null);
});

test("the release watch covers the last 21 days and the next 45", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  assert.equal(inReleaseWindow("2026-11-01T00:00:00", now), true);
  assert.equal(inReleaseWindow("2026-12-30T00:00:00", now), true);
  assert.equal(inReleaseWindow("2026-10-01T00:00:00", now), false);
  assert.equal(inReleaseWindow(null, now), false);
});

test("the guard is read-only and files issues only from main", () => {
  const script = readFileSync("scripts/coverage.ts", "utf8");
  assert.doesNotMatch(script, /writeFileSync\([^)]*cards/);
  assert.match(readFileSync("scripts/coverage-issue.ts", "utf8"), /!== "main"/);
  assert.doesNotMatch(readFileSync(".github/workflows/coverage.yml", "utf8"), /\[deploy\]/);
});

test("ageMissing counts only cards missing two days or more, and forgets a card once it has a page", () => {
  const state: Record<string, string> = {};
  assert.equal(ageMissing(state, "S", [1, 2], [1, 2], "2026-11-20"), 0);
  assert.equal(ageMissing(state, "S", [1, 2], [1, 2], "2026-11-21"), 0);
  assert.equal(ageMissing(state, "S", [1, 2], [2], "2026-11-22"), 1);
  assert.deepEqual(Object.keys(state), ["S|2"]);
});
