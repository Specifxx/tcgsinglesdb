import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { shareUrl } from "../src/components/ShareButton";
import robots from "../src/app/robots";

// Word of mouth (owner, 2026-11-18; DECISIONS.md).
test("a shared link is the canonical path plus the share tags", () => {
  assert.equal(shareUrl("https://example.com", "/pokemon/base-set/charizard", "card"), "https://example.com/pokemon/base-set/charizard?utm_source=share&utm_medium=card");
});
test("preview fetchers may read a shared link, and its visit is counted", () => {
  const all = [robots().rules].flat().find((r) => r.userAgent === "*")!;
  assert.ok([all.allow].flat().includes("/*utm_source=share"));
  assert.match(fs.readFileSync("src/components/Trackers.tsx", "utf8"), /track\("share_visit"/);
  assert.match(fs.readFileSync("src/app/[game]/[set]/[card]/page.tsx", "utf8"), /<ShareButton /);
});
