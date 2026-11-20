// The card scanner's matcher (src/lib/scan/match.ts; DECISIONS.md 2026-11-20 "Card scanner"), against the real catalogue.
import test from "node:test";
import assert from "node:assert/strict";
import { scanCatalog } from "../src/lib/scan/catalog";
import { matchScan, numberKey, baseName, printingFor, type ScanReading } from "../src/lib/scan/match";

const R = (r: Partial<ScanReading>): ScanReading => ({ isTradingCard: true, game: null, name: null, setCode: null, collectorNumber: null, promoStamp: false, language: "en", firstEdition: false, ...r });

test("numberKey: one key however the number is printed", () => {
  assert.equal(numberKey("058/107"), "58/107");
  assert.equal(numberKey("58/107"), "58/107");
  assert.equal(numberKey("TG05/TG30"), "TG5/TG30");
  assert.equal(numberKey("LOB-EN001"), "LOB-1");
  assert.equal(numberKey("LOB-E001"), "LOB-1");
  assert.equal(numberKey("lob-001"), "LOB-1");
  assert.equal(numberKey("SGX3-ENB05"), "SGX3-B5");
  assert.equal(numberKey("OP01-001"), "OP1-1");
  assert.equal(numberKey("SVP 045"), "SVP45");
  assert.equal(numberKey("OP0l-120".replace("l", "1")), "OP1-120");
  assert.equal(numberKey("B/RGB"), null);
  assert.equal(numberKey(""), null);
  assert.equal(baseName("Shanks (Parallel) (Manga) (Alternate Art)"), "Shanks");
  assert.equal(baseName("Uta - OP09-002 (Alt Art)"), "Uta");
});

test("One Piece: a number with parallels is never guessed, the visitor picks; the plain copy comes first", () => {
  const cat = scanCatalog("one-piece");
  const m = matchScan(R({ name: "Shanks", collectorNumber: "OP01-120" }), cat);
  assert.equal(m.kind, "pick");
  const first = cat.find((c) => c.id === m.ids[0])!;
  assert.equal(first.n, "Shanks");
  assert.ok(m.ids.length >= 4);
});

test("Pokémon: Base Set Charizard offers Shadowless and the reprints; the set code or the 1st Edition stamp moves the order", () => {
  const cat = scanCatalog("pokemon");
  const m = matchScan(R({ name: "Charizard", collectorNumber: "4/102" }), cat);
  assert.equal(m.kind, "pick");
  const names = m.ids.map((id) => cat.find((c) => c.id === id)!.setName);
  assert.ok(names.includes("Base Set") && names.includes("Base Set (Shadowless)"), names.join(", "));
  assert.ok(!/jumbo/i.test(names[0]));
  const drapion = matchScan(R({ name: "Drapion", collectorNumber: "4/102" }), cat);
  assert.equal(drapion.kind, "match");
  assert.equal(cat.find((c) => c.id === drapion.ids[0])!.n, "Drapion");
});

test("Yu-Gi-Oh!: LOB-001 and LOB-EN001 are the same English card, its reprints offered", () => {
  const cat = scanCatalog("yugioh");
  const a = matchScan(R({ name: "Blue-Eyes White Dragon", collectorNumber: "LOB-EN001" }), cat);
  const b = matchScan(R({ name: "Blue-Eyes White Dragon", collectorNumber: "LOB-001" }), cat);
  assert.deepEqual(a.ids, b.ids);
  assert.ok(a.ids.length >= 2);
  const kaiba = matchScan(R({ name: "Blue-Eyes White Dragon", collectorNumber: "SDK-001" }), cat);
  assert.equal(kaiba.kind, "match");
});

test("refuses rather than guesses", () => {
  const cat = scanCatalog("pokemon");
  assert.equal(matchScan(R({ isTradingCard: false }), cat).kind, "none");
  assert.equal(matchScan(R({ name: "Charizard", collectorNumber: "4/102", language: "ja" }), cat).kind, "none");
  assert.equal(matchScan(R({ name: "Pikachu" }), cat).kind, "none"); // hundreds of Pikachus: the number decides
  // A number read without a legible name is only ever a "check the picture" pick.
  assert.equal(matchScan(R({ collectorNumber: "4/102" }), cat).kind, "pick");
  // The name disagrees with the number: name-only, never a match.
  assert.notEqual(matchScan(R({ name: "Charizard", collectorNumber: "17/102" }), cat).kind, "match");
});

test("a perfect reading of every One Piece, Pokémon and Yu-Gi-Oh! card of US$1+ never returns a wrong card as the match", () => {
  for (const g of ["pokemon", "yugioh", "one-piece"]) {
    const cat = scanCatalog(g);
    let wrong = 0;
    for (const c of cat) {
      if (c.v < 100 || !c.no) continue;
      const m = matchScan(R({ name: baseName(c.n), collectorNumber: c.no, setCode: c.setAbbr }), cat);
      if (m.kind === "match" && m.ids[0] !== c.id) wrong++;
    }
    assert.equal(wrong, 0, g);
  }
});

test("printingFor: the 1st Edition stamp, a single printing, or ask", () => {
  assert.equal(printingFor({ Holofoil: 100 }, false), "Holofoil");
  assert.equal(printingFor({}, false), "Normal");
  assert.equal(printingFor({ "1st Edition": 900, Unlimited: 100 }, true), "1st Edition");
  assert.equal(printingFor({ "1st Edition": 900, Unlimited: 100 }, false), "Unlimited");
  assert.equal(printingFor({ Normal: 10, "Reverse Holofoil": 30 }, false), null);
});

test("a game is offered by the scanner only with a passing accuracy eval on file", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const { GAMES } = await import("../src/site.config");
  const file = "scan-eval/verdict.json";
  const v = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { games: Record<string, { pass: boolean; found: number; wrongMatch: number; images: number }> }) : { games: {} };
  for (const g of GAMES.filter((g) => g.scan)) {
    const r = v.games[g.slug];
    assert.ok(r?.pass && r.found >= 0.95 && r.wrongMatch <= 0.01 && r.images >= 100, `${g.slug} has no passing eval in ${file}`);
  }
});

test("My Collection: one item per (card, printing), copies summed, broken storage starts again", async () => {
  const { parseCollection, withItem } = await import("../src/lib/scan/collection");
  const empty = parseCollection("not json");
  assert.deepEqual(empty, { v: 1, items: [] });
  const base = { id: 42382, game: "pokemon", set: "base-set", s: "charizard-004-102", printing: "Holofoil", src: "scan" as const };
  const once = withItem(empty, base, new Date("2026-11-20T00:00:00Z"));
  const twice = withItem(once, base);
  assert.equal(twice.items.length, 1);
  assert.equal(twice.items[0].qty, 2);
  assert.equal(twice.items[0].addedAt, "2026-11-20T00:00:00.000Z");
  assert.equal(withItem(twice, { ...base, printing: "Normal" }).items.length, 2);
  assert.equal(parseCollection(JSON.stringify(twice)).items[0].qty, 2);
});

test("the scanner page reads no cookie or header, is noindex and never stores a photo", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("src/app/scan/page.tsx", "utf8");
  assert.match(page, /noindex: true/);
  assert.ok(!/cookies\(|headers\(/.test(page));
  const route = readFileSync("src/app/api/scan/match/route.ts", "utf8");
  assert.ok(!/writeFile|image/i.test(route.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));
});
