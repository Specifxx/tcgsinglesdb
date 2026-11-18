// Store prices for single cards: the rules, pure (no fs, no network). A store listing is a card ONLY by the TCGplayer product id
// the listing itself carries (its photo's file name, a SKU, its handle), exactly one id, one we have; never by its title.
// Then the title and variant decide which printing and condition, and refuse on doubt (owner, 2026-11-18: "get all these stores
// in"; the backlog's "refuse on doubt"). A wrong price on a card is worse than no store row.
//
// - Near Mint only: a played, damaged or graded copy is another product.
// - The printing must be clear: a card with one printing takes any listing that names no other; a card with several needs the
//   listing to name exactly one of them.
// - The price must be 40% to 250% of that printing's TCGplayer market price (US$, the stores are US stores charging US$).
// - Only cards worth US$1 or more get store rows: bulk is not worth a comparison and would swell data/.

export interface ShopifyVariant {
  id: number;
  title?: string | null;
  price?: string | number | null;
  available?: boolean;
  sku?: string | null;
  featured_image?: { src?: string | null } | null;
}
export interface ShopifyProduct {
  id: number;
  handle: string;
  title: string;
  product_type?: string | null;
  variants: ShopifyVariant[];
  images?: { src?: string | null }[];
}

export const MIN_CARD_CENTS = 100;
export const BAND_LOW = 0.4;
export const BAND_HIGH = 2.5;
/** A store row is shown for at most this long after the store's last good read of that listing. */
export const OFFER_MAX_AGE_DAYS = 4;
/** Store rows kept per card: in stock first, then by price. */
export const OFFERS_PER_CARD = 8;

// ── Ids inside a listing (TCG Prices' lib/import/crawl.ts) ─────────────────

const HANDLE_ID = /-(\d{5,7})$/;
const SKU_ID = /^(?:tcg(?:player)?[-_ ]?)?(\d{5,7})(?:[-_ ].*)?$/i;
const IMAGE_IDS = [/\/(\d{5,7})_in_\d+x\d+[^/]*$/, /tcgplayer-cdn\.tcgplayer\.com\/product\/(\d{5,7})_/];

/** Every distinct TCGplayer-shaped product id in the listing's handle, SKUs and photos. */
export function idsInListing(p: Pick<ShopifyProduct, "handle" | "variants" | "images">): number[] {
  const out = new Set<number>();
  const h = HANDLE_ID.exec(p.handle ?? "");
  if (h) out.add(Number(h[1]));
  for (const v of p.variants ?? []) {
    const s = SKU_ID.exec((v.sku ?? "").trim());
    if (s) out.add(Number(s[1]));
  }
  const srcs = [...(p.images ?? []).map((i) => i?.src), ...(p.variants ?? []).map((v) => v.featured_image?.src)];
  for (const src of srcs) {
    if (!src) continue;
    const file = src.split(/[?#]/)[0];
    for (const re of IMAGE_IDS) {
      const m = re.exec(file);
      if (m) out.add(Number(m[1]));
    }
  }
  return [...out].filter((n) => n > 0);
}

// ── What the listing is ─────────────────────────────────────────────────────

const NOT_A_SINGLE = /\b(psa|bgs|cgc|sgc|beckett|graded|slab(bed)?|proxy|custom|replica|lot|bundle|playset|bulk|mystery|repack|sealed|booster|\bbox\b|\bpack\b|sleeves?|binder|deck box|code card|online code|digital)\b|\bx\s?[2-9]\b|\b[2-9]\s?x\b/i;
const PLAYED = /lightly|moderately|heavily|\bplayed\b|\blp\b|\bmp\b|\bhp\b|damaged|\bdmg\b|poor|excellent|\bex\b(?!\s*[a-z])|good|\bvg\b/i;
const NEAR_MINT = /near\s*mint|\bnm\b|^mint$|\bmint\b/i;
// A variant title that names nothing but the single copy.
const PLAIN = /^(default title|default|single|english|en|standard|regular|normal|1)$/i;

// Printing words. "holo" and "holofoil" are one word; "rev" is "reverse"; "1st" is "first".
const ALIASES: Record<string, string> = { holofoil: "holo", holographic: "holo", rev: "reverse", "1st": "first", foiled: "foil", nonfoil: "normal", "non-foil": "normal" };
const PRINT_WORDS = new Set(["holo", "foil", "reverse", "first", "edition", "unlimited", "etched", "cold", "rainbow", "gold", "shadowless", "normal", "galaxy", "cosmos", "cracked", "ice", "textured", "surge", "showcase", "extended", "borderless", "alternate", "alt", "art"]);
const FOILISH = new Set(["holo", "foil", "reverse", "etched", "cold", "rainbow", "galaxy", "cosmos", "cracked", "surge"]);

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/non[- ]foil/g, "nonfoil")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => ALIASES[w] ?? w);

/**
 * Which of the card's printings the listing names, or null on doubt. `text` is the listing's title and the variant's title.
 * A printing matches when every printing word of its name is in the text; "Normal" (no printing words) matches only a text that
 * names no foil. The most specific match wins; two equally specific matches are doubt. A card with one printing takes a text
 * that names no printing word outside that printing's own.
 */
export function pickPrinting(text: string, printings: readonly string[]): string | null {
  if (!printings.length) return null;
  const tw = new Set(words(text));
  const named = [...tw].filter((w) => PRINT_WORDS.has(w) && w !== "edition" && w !== "art");
  const foilNamed = named.some((w) => FOILISH.has(w));
  const own = (p: string) => words(p).filter((w) => PRINT_WORDS.has(w) && w !== "normal");
  if (printings.length === 1) {
    // The id already names the card; only a foil the printing lacks ("Reverse" on a holo-only card) or "non-foil" on a foil is doubt.
    const pw = new Set(own(printings[0]));
    if (named.some((w) => FOILISH.has(w) && !pw.has(w))) return null;
    if (tw.has("normal") && [...pw].some((w) => FOILISH.has(w))) return null;
    return printings[0];
  }
  let best: string[] = [];
  let bestScore = -1;
  for (const p of printings) {
    const pw = own(p);
    const ok = pw.length ? pw.every((w) => tw.has(w)) : !foilNamed;
    if (!ok) continue;
    // A printing that leaves a named printing word unexplained ("Holofoil" for "Reverse Holo") is not the one.
    if (named.some((w) => w !== "normal" && FOILISH.has(w) && !pw.includes(w))) continue;
    const score = pw.length;
    if (score > bestScore) {
      best = [p];
      bestScore = score;
    } else if (score === bestScore) best.push(p);
  }
  return best.length === 1 ? best[0] : null;
}

export interface CardRef {
  game: string;
  set: string;
  slug: string;
  /** Printing name → TCGplayer market price in cents. */
  p: Record<string, number>;
}

export interface StoreOffer {
  card: number;
  printing: string;
  cents: number;
  inStock: boolean;
  handle: string;
  variant: number;
}

export type MatchResult = StoreOffer | { refuse: "no-id" | "ids-differ" | "not-ours" | "cheap-card" | "not-single" | "no-near-mint" | "printing-unclear" | "no-price" | "out-of-band" };

/** One listing → one Near Mint offer on one printing of one card, or the reason it is refused. */
export function matchListing(p: ShopifyProduct, cards: ReadonlyMap<number, CardRef>): MatchResult {
  const ids = idsInListing(p);
  if (!ids.length) return { refuse: "no-id" };
  if (ids.length > 1) return { refuse: "ids-differ" };
  const c = cards.get(ids[0]);
  if (!c) return { refuse: "not-ours" };
  const printings = Object.keys(c.p).filter((k) => c.p[k] > 0);
  if (!printings.some((k) => c.p[k] >= MIN_CARD_CENTS)) return { refuse: "cheap-card" };
  if (NOT_A_SINGLE.test(p.title) || NOT_A_SINGLE.test(p.product_type ?? "")) return { refuse: "not-single" };
  const titlePlayed = PLAYED.test(p.title) && !NEAR_MINT.test(p.title);
  const vs = (p.variants ?? []).filter((v) => {
    const t = (v.title ?? "").trim();
    if (titlePlayed) return false;
    if (PLAYED.test(t) && !NEAR_MINT.test(t)) return false;
    if (NOT_A_SINGLE.test(t)) return false;
    return !t || PLAIN.test(t) || NEAR_MINT.test(t) || (p.variants.length === 1 && words(t).every((w) => PRINT_WORDS.has(w) || w === "nm" || w === "near" || w === "mint"));
  });
  if (!vs.length) return { refuse: "no-near-mint" };
  const offers: StoreOffer[] = [];
  let unclear = false;
  for (const v of vs) {
    const printing = pickPrinting(`${p.title} ${v.title ?? ""}`, printings);
    if (!printing) {
      unclear = true;
      continue;
    }
    const cents = Math.round(Number(v.price) * 100);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    offers.push({ card: ids[0], printing, cents, inStock: !!v.available, handle: p.handle, variant: v.id });
  }
  if (!offers.length) return { refuse: unclear ? "printing-unclear" : "no-price" };
  // One listing gives one row: the cheapest in-stock Near Mint variant, with the printing it names.
  offers.sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.cents - b.cents);
  const o = offers[0];
  const market = c.p[o.printing];
  if (!(market >= MIN_CARD_CENTS)) return { refuse: "cheap-card" };
  if (o.cents < market * BAND_LOW || o.cents > market * BAND_HIGH) return { refuse: "out-of-band" };
  return o;
}

// ── Which collections hold singles ──────────────────────────────────────────

const SINGLES = /single|\bcards?\b(?!\s*(sleeve|box|binder|storage))/i;
const NOT_SINGLES = /sealed|booster|accessor|suppl|sleeve|binder|deck ?box|playmat|graded|slab|psa|bgs|cgc|lot|bulk|bundle|pre-?order|preorder|merch|apparel|figure|toy|board ?game|dice|new arrival|sale|clearance|gift|japan(ese)?\b|chinese|korean/i;
/** Most collections read per store, biggest first. A store's own "all singles" collection is usually one of them. */
export const MAX_SINGLES_COLLECTIONS = 6;

export interface ShopifyCollection {
  handle: string;
  title?: string | null;
  products_count?: number | null;
}

/** The store's singles collections worth reading: named singles, not sealed or supplies, with products, biggest first. */
export function singlesCollections(cs: readonly ShopifyCollection[]): string[] {
  return cs
    .filter((c) => c && typeof c.handle === "string")
    .filter((c) => {
      const t = `${c.handle} ${c.title ?? ""}`.replace(/-/g, " ");
      return /single/i.test(t) && SINGLES.test(t) && !NOT_SINGLES.test(t) && (c.products_count == null || c.products_count > 0);
    })
    .sort((a, b) => (b.products_count ?? 0) - (a.products_count ?? 0) || a.handle.localeCompare(b.handle))
    .slice(0, MAX_SINGLES_COLLECTIONS)
    .map((c) => c.handle);
}

// ── Vetting and the offers file ─────────────────────────────────────────────

/** A store whose in-stock prices sit under 70% of TCGplayer's market across five or more cards is too cheap to be true. */
export function tooCheap(ratios: readonly number[]): boolean {
  if (ratios.length < 5) return false;
  const s = [...ratios].sort((a, b) => a - b);
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return mid < 0.7;
}

/** One stored match: [cardId, printing, cents, inStock 0|1, handle, variantId, seen day]. */
export type SeenOffer = [number, string, number, 0 | 1, string, number, string];
/** data/stores/state/<store key>.json: the store's matched listings by Shopify product id. */
export type StoreState = Record<string, SeenOffer>;

/** Day number for age checks. */
const dayNo = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

/** Yesterday's matches updated with today's: a listing read today is replaced (or dropped if it no longer matches); the rest age out. */
export function mergeState(prev: StoreState, readIds: ReadonlySet<number>, today: ReadonlyMap<number, StoreOffer>, day: string): StoreState {
  const out: StoreState = {};
  for (const [k, v] of Object.entries(prev)) {
    if (readIds.has(Number(k))) continue;
    if (dayNo(day) - dayNo(v[6]) > OFFER_MAX_AGE_DAYS) continue;
    out[k] = v;
  }
  for (const [pid, o] of today) out[String(pid)] = [o.card, o.printing, o.cents, o.inStock ? 1 : 0, o.handle, o.variant, day];
  return out;
}

/** A row of data/offers/<game>/<set>.json: [store key, printing, cents, inStock 0|1, product path with variant, seen day]. */
export type OfferRow = [string, string, number, 0 | 1, string, string];
/** data/offers/<game>/<set>.json: card slug → its store rows, in stock first, then cheapest. */
export type OffersFile = Record<string, OfferRow[]>;

export function sortRows(rows: OfferRow[]): OfferRow[] {
  return rows.sort((a, b) => b[3] - a[3] || a[2] - b[2] || a[0].localeCompare(b[0])).slice(0, OFFERS_PER_CARD);
}
