// The cheapest in-stock US store price of each card, one change-point a day (owner, 2026-11-19: "I really really like
// opcompare's price history where you have the tcgplayer market price as well as the cheapest price locally"): the red line
// of the card page's price history, against TCGplayer's market price (data/history) as the dashed gold line.
//
// data/history/_stores/<game>/<set>.json: { "<TCGplayer id>": [[day, cents], …] }, `day` as data/history (days since
// HISTORY_EPOCH), written by scripts/stores.ts crawl from the same rows the card page's store table shows. The price is the
// cheapest in-stock Near Mint row of the card's HEADLINE printing (the one cardValue reads), so both lines price the same
// copy. A card is followed from the day a store first has it; on a day no store has it the point is 0 (a gap, never a price).
// No React and no fs: the import, the page and the tests share it.
import { cardValue, dayIndex, HISTORY_MAX_POINTS, type HistoryFile, type Point, type Prices } from "./cards";

export const STORE_HISTORY_DIR = "_stores";

/** The printing whose price is the card's headline value (cardValue), or null. */
export function headlinePrinting(p: Prices): string | null {
  const v = cardValue(p);
  if (v == null) return null;
  return Object.keys(p).find((k) => p[k] === v) ?? null;
}

/** The cheapest in-stock row of the headline printing, in cents, from a card's store rows ([store, printing, cents, inStock, …]). */
export function storeLow(p: Prices, rows: readonly (readonly [string, string, number, number | boolean, ...unknown[]])[]): number | null {
  const h = headlinePrinting(p);
  if (!h) return null;
  let best: number | null = null;
  for (const r of rows) if (r[1] === h && r[3] && r[2] > 0 && (best == null || r[2] < best)) best = r[2];
  return best;
}

/** Today's store lows folded into one set's file: a point only when the low changed; 0 when a followed card has none. */
export function addStoreLows(prev: HistoryFile, lows: ReadonlyMap<number, number>, day: string): HistoryFile {
  const d = dayIndex(day);
  const out: HistoryFile = { ...prev };
  const ids = new Set([...Object.keys(prev), ...[...lows.keys()].map(String)]);
  for (const key of ids) {
    const v = lows.get(Number(key)) ?? 0;
    const pts = out[key];
    if (!pts?.length) {
      if (v > 0) out[key] = [[d, v]];
      continue;
    }
    const [ld, lv] = pts[pts.length - 1];
    if (lv === v) continue;
    // A second run the same day replaces that day's point.
    const base = ld >= d ? pts.slice(0, -1) : pts;
    const next = base.length && base[base.length - 1][1] === v ? base : base.length || v > 0 ? [...base, [d, v] as Point] : [];
    out[key] = next.slice(-HISTORY_MAX_POINTS);
    if (!out[key].length) delete out[key];
  }
  return out;
}
