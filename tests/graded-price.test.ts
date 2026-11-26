import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateGraded, peerMultiple, splitOutliers, weightedQuantile, type Sale } from "../src/lib/graded-price";

const now = new Date("2026-11-26T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const psa10 = (priceCents: number, d: number, extra: Partial<Sale> = {}): Sale => ({ priceCents, date: daysAgo(d), grader: "PSA", grade: "10", source: "ebay", ...extra });

test("no sales, no asks, no peer multiple: no price at all (never a guess)", () => {
  assert.equal(estimateGraded({ grader: "PSA", grade: "10", sales: [], rawCents: 5000, now }), null);
  // A raw price alone is not enough: a multiple must be measured from 3+ similar cards.
  assert.equal(estimateGraded({ grader: "PSA", grade: "10", sales: [], rawCents: 5000, peer: { value: 6, cards: 2 }, now }), null);
});

test("sold prices lead: with plenty of recent sales the estimate sits on them, not on the asks", () => {
  const sales = [psa10(30000, 2), psa10(31000, 5), psa10(29500, 8), psa10(30500, 12), psa10(30000, 20), psa10(32000, 25)];
  const e = estimateGraded({ grader: "PSA", grade: "10", sales, asks: [{ priceCents: 45000, grader: "PSA", grade: "10", source: "ebay" }], now })!;
  const sold = e.signals.find((s) => s.key === "sold")!;
  assert.ok(sold.weight > 0.8, `sold weight ${sold.weight}`);
  assert.ok(e.cents >= 30000 && e.cents <= 33500, `estimate ${e.cents}`);
  assert.equal(e.confidence, "high");
  assert.ok(e.lowCents < e.cents && e.cents < e.highCents);
});

test("only other grades and graders are ignored", () => {
  const sales = [psa10(5000, 3, { grade: "9" }), psa10(9000, 3, { grader: "CGC" }), psa10(20000, 4)];
  const e = estimateGraded({ grader: "PSA", grade: "10", sales, now })!;
  assert.equal(e.salesUsed, 1);
  assert.equal(e.cents, 20000);
  assert.match(e.working[0], /other grades and graders left out: 2/);
});

test("sales older than 90 days or in the future are left out", () => {
  const sales = [psa10(10000, 120), psa10(20000, 10), psa10(99999, -3)];
  const e = estimateGraded({ grader: "PSA", grade: "10", sales, now })!;
  assert.equal(e.salesUsed, 1);
  assert.equal(e.cents, 20000);
});

test("an outlier is dropped and named in the working", () => {
  const sales = [psa10(20000, 1), psa10(21000, 3), psa10(19500, 6), psa10(20500, 9), psa10(2000, 4)];
  const e = estimateGraded({ grader: "PSA", grade: "10", sales, now })!;
  assert.equal(e.salesDropped.length, 1);
  assert.equal(e.salesDropped[0].priceCents, 2000);
  assert.ok(e.working.some((w) => /outlier/.test(w) && /\$20(?!,)/.test(w)));
  assert.ok(e.cents > 19000);
});

test("fewer than four sales are never judged outliers", () => {
  const { dropped } = splitOutliers([{ priceCents: 100 }, { priceCents: 10000 }, { priceCents: 10100 }]);
  assert.equal(dropped.length, 0);
});

test("newer sales count more: a recent jump moves the estimate up", () => {
  const old = [psa10(10000, 80), psa10(10000, 75), psa10(10000, 70)];
  const fresh = [psa10(16000, 2), psa10(16000, 4), psa10(16000, 6)];
  const e = estimateGraded({ grader: "PSA", grade: "10", sales: [...old, ...fresh], now })!;
  assert.ok(e.cents >= 15000, `estimate ${e.cents}`);
});

test("accepted Best Offers count half", () => {
  const sales = [psa10(10000, 5), psa10(30000, 5, { bestOffer: true }), psa10(10000, 6), psa10(30000, 6, { bestOffer: true })];
  const e = estimateGraded({ grader: "PSA", grade: "10", sales, now })!;
  assert.ok(e.cents < 20000, `estimate ${e.cents}`);
});

test("the cheapest live copy caps the estimate and the range", () => {
  const sales = [psa10(50000, 40), psa10(52000, 45)];
  const e = estimateGraded({ grader: "PSA", grade: "10", sales, asks: [{ priceCents: 40000, grader: "PSA", grade: "10", source: "ebay" }], now })!;
  assert.equal(e.cents, 40000);
  assert.ok(e.highCents <= 40000);
  assert.ok(e.working.some((w) => /Capped at the cheapest copy/.test(w)));
});

test("asks alone give a low-confidence answer, discounted, with a wide range", () => {
  const asks = [30000, 32000, 35000, 60000].map((priceCents) => ({ priceCents, grader: "PSA" as const, grade: "10", source: "ebay" }));
  const e = estimateGraded({ grader: "PSA", grade: "10", sales: [], asks, now })!;
  assert.equal(e.confidence, "low");
  assert.equal(e.cents, 28800); // median of cheapest three (32,000) less 10%
  assert.ok(e.highCents - e.lowCents > e.cents * 0.4);
});

test("a measured peer multiple can stand in, never outweighing sales", () => {
  const e = estimateGraded({ grader: "PSA", grade: "10", sales: [psa10(20000, 3), psa10(21000, 6), psa10(20500, 9)], rawCents: 1000, peer: { value: 40, cards: 12 }, now })!;
  const peer = e.signals.find((s) => s.key === "peer")!;
  assert.ok(peer.weight < 0.15, `peer weight ${peer.weight}`);
  assert.ok(e.cents < 25000);
  assert.equal(e.rawMultiple, Math.round((e.cents / 1000) * 10) / 10);
});

test("population is context only: gem rate is reported, the price does not move", () => {
  const sales = [psa10(20000, 3), psa10(21000, 6), psa10(20500, 9)];
  const a = estimateGraded({ grader: "PSA", grade: "10", sales, now })!;
  const b = estimateGraded({ grader: "PSA", grade: "10", sales, population: { grade10: 250, total: 1000, asOf: "2026-11-20" }, now })!;
  assert.equal(a.cents, b.cents);
  assert.equal(b.gemRate, 0.25);
});

test("grades compare as numbers ('10' and '10.0' are the same grade)", () => {
  const e = estimateGraded({ grader: "PSA", grade: "10", sales: [psa10(20000, 3, { grade: "10.0" })], now })!;
  assert.equal(e.salesUsed, 1);
});

test("peerMultiple needs three cards and uses the median", () => {
  assert.equal(peerMultiple([{ gradedCents: 100, rawCents: 10 }, { gradedCents: 100, rawCents: 10 }]), null);
  assert.deepEqual(peerMultiple([
    { gradedCents: 100, rawCents: 10 },
    { gradedCents: 600, rawCents: 100 },
    { gradedCents: 8000, rawCents: 100 },
  ]), { value: 10, cards: 3 });
});

test("weightedQuantile: equal weights give the plain median", () => {
  assert.equal(weightedQuantile([1, 2, 3], [1, 1, 1], 0.5), 2);
  assert.equal(weightedQuantile([1, 3], [1, 1], 0.5), 2);
});

test("open API shape: integer cents, sales count, confidence, date; grade keys like 'PSA 10' / 'BGS 9.5'", async () => {
  const { toOpenGraded, gradeKey } = await import("../src/lib/graded-price");
  const e = estimateGraded({ grader: "PSA", grade: "10", sales: [psa10(20000, 3), psa10(21000, 6), psa10(20500, 9)], now })!;
  const o = toOpenGraded(e, "2026-11-26");
  assert.deepEqual(Object.keys(o), ["c", "lo", "hi", "n", "conf", "at"]);
  for (const v of [o.c, o.lo, o.hi]) assert.ok(Number.isInteger(v));
  assert.equal(o.n, 3);
  assert.equal(gradeKey("PSA", "10.0"), "PSA 10");
  assert.equal(gradeKey("BGS", "9.5"), "BGS 9.5");
});
