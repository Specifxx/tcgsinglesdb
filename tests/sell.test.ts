// The Sell desk (DECISIONS.md 2026-11-24): fees match each marketplace's own worked numbers, a list is read the way sellers
// write and export it, a product id from a CSV is trusted only with its name, and nothing a seller sends is stored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bestRoute, csvRows, ebayNet, idAgrees, MAX_LINES, parseLine, parseList, pickPrinting, tcgplayerNet, toCsv } from "../src/lib/sell";

test("TCGplayer fees: 10.75% capped at $75, plus 2.5% + $0.30", () => {
  // TCGplayer's own example: a $65.31 item pays $7.02 commission; processing on the item alone is $1.63 + $0.30.
  assert.equal(tcgplayerNet(6531), 6531 - 702 - 163 - 30);
  assert.equal(tcgplayerNet(100000), 100000 - 7500 - 2500 - 30); // commission capped
});

test("eBay fees: 13.25% to $7,500, 2.35% above, $0.30 or $0.40 an order", () => {
  assert.equal(ebayNet(1000), 1000 - 133 - 30);
  assert.equal(ebayNet(2000), 2000 - 265 - 40);
  assert.equal(ebayNet(1000000), 1000000 - Math.round(750000 * 0.1325 + 250000 * 0.0235) - 40);
});

test("best route: the most kept, cash when it pays more, bulk when fees take half", () => {
  assert.equal(bestRoute(2000, 100, null).route, "tcgplayer");
  assert.equal(bestRoute(2000, 130, null).route, "ebay");
  assert.equal(bestRoute(2000, 100, 1800).route, "cash");
  assert.equal(bestRoute(40, 100, null).route, "bulk");
});

test("a pasted line: quantity first or last, finish words become hints", () => {
  assert.deepEqual(parseLine("4x Lightning Bolt (M10) 146 foil"), { qty: 4, q: "Lightning Bolt M10 146", hint: "foil" });
  assert.deepEqual(parseLine("Charizard ex 199/165 x3"), { qty: 3, q: "Charizard ex 199/165", hint: "" });
  assert.deepEqual(parseLine("1 Pikachu 025/165 reverse holo"), { qty: 1, q: "Pikachu 025/165", hint: "reverse" });
  assert.equal(parseLine("Sideboard:"), null);
  assert.equal(parseLine("   "), null);
  assert.equal(parseLine("9999 Opt")?.qty, 1); // not a quantity we read: the number stays in the search
});

test("CSV exports: ManaBox-style columns, quoted commas, and the free cap", () => {
  const csv = 'Name,Set code,Collector number,Foil,Quantity\n"Sheoldred, the Apocalypse",DMU,107,foil,2\nOpt,ELD,59,normal,1\n';
  const { lines, format } = parseList(csv);
  assert.equal(format, "csv");
  assert.deepEqual(lines[0], { qty: 2, q: "Sheoldred, the Apocalypse DMU 107", name: "Sheoldred, the Apocalypse", hint: "foil" });
  assert.equal(lines[1].hint, "");
  assert.deepEqual(csvRows('a,"b ""c""",d'), [["a", 'b "c"', "d"]]);
  const many = parseList(Array.from({ length: MAX_LINES + 7 }, (_, i) => `1 Card ${i}`).join("\n"));
  assert.equal(many.lines.length, MAX_LINES);
  assert.equal(many.cut, 7);
});

test("only a PRODUCT id column is read, and only when its name agrees", () => {
  assert.equal(parseList("Name,TCGplayer Id\nOpt,123\n").lines[0].id, undefined); // TCGplayer's seller export: a SKU, not ours
  assert.equal(parseList("Name,Product ID\nOpt,123\n").lines[0].id, 123);
  assert.ok(idAgrees("Opt", "Opt"));
  assert.ok(!idAgrees("Lightning Bolt", "Opt"));
});

test("printing: the hint, else the plain one", () => {
  const p = { Normal: 100, Foil: 400, "Reverse Holofoil": 300 };
  assert.equal(pickPrinting(p, ""), "Normal");
  assert.equal(pickPrinting(p, "foil"), "Foil");
  assert.equal(pickPrinting(p, "reverse"), "Reverse Holofoil");
  assert.equal(pickPrinting({ Holofoil: 900, "1st Edition Holofoil": 5000 }, ""), "Holofoil");
});

test("the spreadsheet: dollars, quoted names, no formula injection", () => {
  const csv = toCsv([{ qty: 1, name: "=HYPERLINK(1)", set: "Set, One", number: "1", printing: "Normal", id: 5, market: 1234, tcgplayerNet: 1000, ebayNet: 990, cash: null, route: "tcgplayer" }]);
  assert.match(csv, /^Quantity,Name,/);
  assert.match(csv, /"'=HYPERLINK\(1\)"/);
  assert.match(csv, /"Set, One"/);
  assert.match(csv, /12\.34,10\.00,9\.90,,TCGplayer/);
});

test("the lookup stores nothing and calls no one", () => {
  const route = readFileSync(new URL("../src/app/api/sell/price/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /fetch\(|writeFile|appendFile|console\.log|anthropic|ebay\.com/i);
  assert.match(route, /no-store/);
  const desk = readFileSync(new URL("../src/components/SellDesk.tsx", import.meta.url), "utf8");
  // Analytics get counts and buckets, never the seller's text.
  for (const m of desk.matchAll(/track\("[a-z_]+", \{([^}]*)\}/g)) assert.doesNotMatch(m[1], /\btext\b|\.q\b|\.name\b|line\.|r\.line/, m[1]);
});
