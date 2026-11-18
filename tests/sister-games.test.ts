import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAMES } from "../src/site.config";

// A game whose cards a sister site serves in search is never released to Google here (DECISIONS.md, 2026-11-18).
const SISTER_SERVED = ["magic", "one-piece", "lorcana", "riftbound", "gundam", "cyberpunk"];

test("sister-served games are noindex", () => {
  for (const slug of SISTER_SERVED) {
    const g = GAMES.find((x) => x.slug === slug);
    assert.ok(g, slug);
    assert.equal((g as { index?: boolean }).index, false, `${slug} must be index: false`);
  }
});

test("the import takes back cards a noindex game released earlier", () => {
  const src = fs.readFileSync("scripts/import.ts", "utf8");
  assert.match(src, /if \(game\.index === false\) for \(const c of flat\) c\.ix = 0;/);
});
