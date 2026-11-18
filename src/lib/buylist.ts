// "Who pays most?" (growth test #1, owner's go 2026-11-18): what a store pays in cash for a Magic single, beside what it sells
// for. The first buyer is Card Kingdom, whose public price list (api.cardkingdom.com/api/v2/pricelist; its robots.txt allows
// every path) carries each row's buy price, how many copies it is buying, and Scryfall's id of the printing. Scryfall's own bulk
// file gives that printing's TCGplayer id, so a row reaches a card ONLY by id: scryfall id -> TCGplayer id -> our card. Never by
// title. Rules may only refuse (etched and other finishes we cannot tell apart, a buy price out of band, a card under US$1).
// Helpers a page may import: no fs, no network.

export type BuyerKey = "ck";
export const BUYERS: Record<BuyerKey, { name: string; home: string; sellUrl: (cardName: string) => string }> = {
  ck: {
    name: "Card Kingdom",
    home: "https://www.cardkingdom.com/",
    sellUrl: (n) => `https://www.cardkingdom.com/purchasing/mtg_singles?filter%5Bsearch%5D=mtg_advanced&filter%5Bname%5D=${encodeURIComponent(n)}`,
  },
};

/** One row of Card Kingdom's price list (the fields we read). */
export interface CkRow {
  name: string;
  edition?: string;
  variation?: string;
  is_foil: string | boolean;
  price_buy: string | number;
  qty_buying: number | string;
  scryfall_id?: string | null;
}

/** [buyer, printing, cash buy price in cents, copies wanted] */
export type BuyRow = [BuyerKey, string, number, number];
/** data/buylist/<game>/<set>.json: card slug -> rows, highest price first. */
export type BuylistFile = Record<string, BuyRow[]>;

export const BUY_MIN_CARD_CENTS = 100; // the card's market price, as for store rows
export const BUY_MIN_CENTS = 25;
export const BUY_BAND_LOW = 0.1; // of the printing's TCGplayer market price
export const BUY_BAND_HIGH = 1.25;

export interface BuyCard {
  set: string;
  slug: string;
  /** printing -> TCGplayer market price in cents */
  p: Record<string, number>;
}

export type BuyMatch =
  | { set: string; slug: string; row: BuyRow }
  | { refuse: "not-buying" | "no-scryfall" | "no-tcg-id" | "not-ours" | "finish" | "no-printing" | "cheap-card" | "out-of-band" };

const ETCHED = /etched|gilded|textured|surge|galaxy|confetti|rainbow|serialized|oil slick|halo|step-and-compleat|ripple/i;

/** The printing of a row in our catalogue's words, or null when the row is a finish TCGplayer files under another id. */
export function ckPrinting(r: Pick<CkRow, "is_foil" | "variation" | "edition" | "name">): "Normal" | "Foil" | null {
  if (ETCHED.test(`${r.variation ?? ""} ${r.edition ?? ""} ${r.name}`)) return null;
  return r.is_foil === true || r.is_foil === "true" ? "Foil" : "Normal";
}

export function matchCk(r: CkRow, tcgByScryfall: ReadonlyMap<string, number>, cards: ReadonlyMap<number, BuyCard>): BuyMatch {
  const cents = Math.round(Number(r.price_buy) * 100);
  const qty = Math.floor(Number(r.qty_buying));
  if (!(qty > 0) || !(cents > 0)) return { refuse: "not-buying" };
  if (!r.scryfall_id) return { refuse: "no-scryfall" };
  const id = tcgByScryfall.get(r.scryfall_id);
  if (!id) return { refuse: "no-tcg-id" };
  const card = cards.get(id);
  if (!card) return { refuse: "not-ours" };
  const printing = ckPrinting(r);
  if (!printing) return { refuse: "finish" };
  const market = card.p[printing];
  if (!(market > 0)) return { refuse: "no-printing" };
  if (market < BUY_MIN_CARD_CENTS) return { refuse: "cheap-card" };
  if (cents < BUY_MIN_CENTS || cents < market * BUY_BAND_LOW || cents > market * BUY_BAND_HIGH) return { refuse: "out-of-band" };
  return { set: card.set, slug: card.slug, row: ["ck", printing, cents, qty] };
}

/** Highest price first, one row per buyer and printing (the highest, should a list repeat one). */
export function sortBuyRows(rows: BuyRow[]): BuyRow[] {
  const best = new Map<string, BuyRow>();
  for (const r of rows) {
    const k = `${r[0]}|${r[1]}`;
    const b = best.get(k);
    if (!b || r[2] > b[2]) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
}

/** Share of the market price a buyer pays, as a whole percent. */
export const payShare = (cents: number, market: number) => Math.round((cents / market) * 100);

/**
 * Splits a JSON array arriving in chunks into its top-level objects, without holding the whole text (Scryfall's bulk file is
 * about half a gigabyte). Feed chunks with push(); each complete object is passed to onObject as text.
 */
export class JsonArraySplitter {
  private depth = 0;
  private inString = false;
  private escaped = false;
  private buf: string[] = [];
  constructor(private readonly onObject: (text: string) => void) {}
  push(chunk: string): void {
    let start = this.depth > 0 ? 0 : -1;
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === "\\") this.escaped = true;
        else if (ch === '"') this.inString = false;
        continue;
      }
      if (ch === '"') {
        if (this.depth > 0) this.inString = true;
      } else if (ch === "{") {
        if (this.depth === 0) start = i;
        this.depth++;
      } else if (ch === "}") {
        this.depth--;
        if (this.depth === 0 && start >= 0) {
          this.buf.push(chunk.slice(start, i + 1));
          this.onObject(this.buf.join(""));
          this.buf = [];
          start = -1;
        }
      }
    }
    if (this.depth > 0 && start >= 0) this.buf.push(chunk.slice(start));
  }
}
