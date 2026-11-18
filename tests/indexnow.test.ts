import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNew, INDEXNOW_MAX } from "../src/lib/indexnow";
import { aiSourceOf } from "../src/lib/ai-referral";

test("IndexNow sends each page once, most valuable first, capped", () => {
  const c = [{ url: "a", w: 1 }, { url: "b", w: 9 }, { url: "c", w: 5 }];
  assert.deepEqual(pickNew(c, { c: "2026-11-18" }), ["b", "a"]);
  const many = Array.from({ length: INDEXNOW_MAX + 5 }, (_, i) => ({ url: String(i), w: i }));
  assert.equal(pickNew(many, {}).length, INDEXNOW_MAX);
});

test("AI referrals are read from the referrer or ChatGPT's utm_source", () => {
  assert.equal(aiSourceOf("https://www.perplexity.ai/search?q=x", null), "perplexity");
  assert.equal(aiSourceOf("", "chatgpt.com"), "chatgpt");
  assert.equal(aiSourceOf("https://www.google.com/", null), null);
});
