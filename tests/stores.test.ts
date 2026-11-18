import { test } from "node:test";
import assert from "node:assert/strict";
import { idsInListing, matchListing, mergeState, pickPrinting, singlesCollections, tooCheap, type CardRef, type ShopifyProduct } from "../src/lib/stores/match";

const cards = new Map<number, CardRef>([
  [42346, { game: "pokemon", set: "base-set", slug: "alakazam-001-102", p: { Holofoil: 7603 } }],
  [500001, { game: "pokemon", set: "sv", slug: "pikachu-025", p: { Normal: 120, "Reverse Holofoil": 300 } }],
  [500002, { game: "pokemon", set: "sv", slug: "bulk-001", p: { Normal: 20 } }],
  [500003, { game: "pokemon", set: "base-set", slug: "charizard-004", p: { "1st Edition Holofoil": 900000, "Unlimited Holofoil": 40000 } }],
]);
const img = (id: number) => [{ src: `https://cdn.shopify.com/s/files/1/0001/products/${id}_in_1000x1000.jpg?v=1` }];
const listing = (o: Partial<ShopifyProduct> & { variants: ShopifyProduct["variants"] }): ShopifyProduct => ({ id: 1, handle: "x", title: "x", ...o });

test("ids come from the photo, the SKU and the handle; two different ids are doubt", () => {
  assert.deepEqual(idsInListing(listing({ images: img(42346), variants: [{ id: 1, sku: "42346-NM" }] })), [42346]);
  assert.deepEqual(idsInListing(listing({ handle: "alakazam-base-set-42346", variants: [{ id: 1 }] })), [42346]);
  const r = matchListing(listing({ images: img(42346), variants: [{ id: 1, sku: "500001", price: "80.00", available: true, title: "Near Mint" }] }), cards);
  assert.deepEqual(r, { refuse: "ids-differ" });
});

test("a Near Mint copy in the price band is an offer on its printing", () => {
  const r = matchListing(
    listing({
      title: "Alakazam - 1/102 - Holo Rare (Unlimited)",
      handle: "alakazam-1-102",
      images: img(42346),
      variants: [
        { id: 11, title: "Lightly Played", price: "60.00", available: true },
        { id: 12, title: "Near Mint", price: "79.99", available: true },
      ],
    }),
    cards,
  );
  assert.deepEqual(r, { card: 42346, printing: "Holofoil", cents: 7999, inStock: true, handle: "alakazam-1-102", variant: 12 });
});

test("played only, graded, lots and prices out of the band are refused", () => {
  assert.deepEqual(matchListing(listing({ images: img(42346), variants: [{ id: 1, title: "Lightly Played", price: "60", available: true }] }), cards), { refuse: "no-near-mint" });
  assert.deepEqual(matchListing(listing({ title: "Alakazam PSA 9", images: img(42346), variants: [{ id: 1, title: "Default Title", price: "300", available: true }] }), cards), { refuse: "not-single" });
  assert.deepEqual(matchListing(listing({ title: "Alakazam", images: img(42346), variants: [{ id: 1, title: "Near Mint", price: "5.00", available: true }] }), cards), { refuse: "out-of-band" });
  assert.deepEqual(matchListing(listing({ title: "Bulk", images: img(500002), variants: [{ id: 1, title: "Near Mint", price: "0.25", available: true }] }), cards), { refuse: "cheap-card" });
  assert.deepEqual(matchListing(listing({ images: img(999999), variants: [{ id: 1, title: "Near Mint", price: "1", available: true }] }), cards), { refuse: "not-ours" });
});

test("the printing must be clear when a card has several", () => {
  assert.equal(pickPrinting("Pikachu 025", ["Normal", "Reverse Holofoil"]), "Normal");
  assert.equal(pickPrinting("Pikachu 025 (Reverse Holo)", ["Normal", "Reverse Holofoil"]), "Reverse Holofoil");
  assert.equal(pickPrinting("Pikachu Near Mint Reverse Holofoil", ["Normal", "Reverse Holofoil"]), "Reverse Holofoil");
  assert.equal(pickPrinting("Charizard 4/102 Holo", ["1st Edition Holofoil", "Unlimited Holofoil"]), null);
  assert.equal(pickPrinting("Charizard 4/102 Holo Unlimited", ["1st Edition Holofoil", "Unlimited Holofoil"]), "Unlimited Holofoil");
  assert.equal(pickPrinting("Charizard 4/102 1st Edition Holo", ["1st Edition Holofoil", "Unlimited Holofoil"]), "1st Edition Holofoil");
  // One printing: any text that names no other printing.
  assert.equal(pickPrinting("Alakazam 1/102 Holo Rare", ["Holofoil"]), "Holofoil");
  assert.equal(pickPrinting("Alakazam 1/102", ["Holofoil"]), "Holofoil");
  assert.equal(pickPrinting("Alakazam 1/102 Reverse Holo", ["Holofoil"]), null);
  assert.equal(pickPrinting("Lightning Bolt Foil", ["Normal"]), null);
  const r = matchListing(listing({ title: "Charizard - 4/102 - Holo Rare", images: img(500003), variants: [{ id: 1, title: "Near Mint", price: "400", available: true }] }), cards);
  assert.deepEqual(r, { refuse: "printing-unclear" });
});

test("variants naming printings pick their own", () => {
  const r = matchListing(
    listing({
      title: "Pikachu - 025",
      images: img(500001),
      variants: [
        { id: 1, title: "Near Mint", price: "1.10", available: false },
        { id: 2, title: "Near Mint Reverse Holofoil", price: "2.99", available: true },
      ],
    }),
    cards,
  );
  assert.ok(!("refuse" in r) && r.printing === "Reverse Holofoil" && r.cents === 299);
});

test("singles collections: named singles, never sealed or supplies, biggest first", () => {
  const got = singlesCollections([
    { handle: "pokemon-singles", title: "Pokemon Singles", products_count: 9000 },
    { handle: "mtg-singles", title: "Magic Singles", products_count: 20000 },
    { handle: "pokemon-sealed", title: "Pokemon Sealed", products_count: 300 },
    { handle: "card-sleeves", title: "Card Sleeves", products_count: 50 },
    { handle: "graded-singles", title: "Graded Singles", products_count: 40 },
    { handle: "japanese-singles", title: "Japanese Singles", products_count: 40 },
    { handle: "empty-singles", title: "Singles", products_count: 0 },
    { handle: "audit-non-singles-in-stock", title: "Audit non singles", products_count: 400 },
    { handle: "york-pkm-singles-for-online-kiosk", title: "Kiosk", products_count: 400 },
  ]);
  assert.deepEqual(got, ["mtg-singles", "pokemon-singles"]);
});

test("too cheap to be true needs five prices with a median under 70%", () => {
  assert.equal(tooCheap([0.5, 0.5, 0.5, 0.5]), false);
  assert.equal(tooCheap([0.5, 0.6, 0.65, 0.9, 1]), true);
  assert.equal(tooCheap([0.8, 0.9, 1, 1.1, 1.2]), false);
});

test("state: a listing read today is replaced or dropped, the rest age out after four days", () => {
  const prev = { "1": [42346, "Holofoil", 7000, 1, "a", 1, "2026-11-10"], "2": [42346, "Holofoil", 7100, 1, "b", 2, "2026-11-16"], "3": [42346, "Holofoil", 7200, 1, "c", 3, "2026-11-17"] } as const;
  const today = new Map([[3, { card: 42346, printing: "Holofoil", cents: 7300, inStock: true, handle: "c", variant: 3 }]]);
  const out = mergeState(JSON.parse(JSON.stringify(prev)), new Set([2, 3]), today, "2026-11-18");
  assert.deepEqual(Object.keys(out).sort(), ["3"]);
  assert.equal(out["3"][2], 7300);
});
