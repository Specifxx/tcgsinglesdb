// Card scanner, the match (DECISIONS.md 2026-11-20 "Card scanner"). Pure: no fs, no network, so the tests and the accuracy
// eval (TCGEmpire's scripts/scan-eval/singles.ts, which checks this repository out) run exactly what production runs.
//
// Rift's scanner READS the photo (one small model call: name, set code, collector number, 1st Edition and promo stamps); this
// file turns that reading into TCGplayer products of OUR catalogue. The model never picks an id. The printed number is the key,
// the name must agree with it, and printings that share both (a One Piece parallel, a Yu-Gi-Oh! rarity, a stamped Pokémon promo,
// a pre-release copy) are NEVER guessed between: they come back as `pick`, shown with their pictures, and the visitor taps one.
// A wrong card shown as the answer is worse than asking.

export interface ScanRow {
  /** TCGplayer product id. */
  id: number;
  set: string;
  setName: string;
  setAbbr: string | null;
  /** Card slug inside its set. */
  s: string;
  n: string;
  no: string;
  /** TCGplayer market value in cents, 0 when unpriced. */
  v: number;
}

export interface ScanReading {
  isTradingCard: boolean;
  game: string | null;
  name: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  promoStamp: boolean;
  language: string | null;
  firstEdition: boolean;
}

export type ScanResult =
  | { kind: "match"; ids: [number]; why: string }
  | { kind: "pick"; ids: number[]; why: string }
  | { kind: "none"; ids: []; why: string };

export const MAX_PICK = 12;

export function normName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** The card's own name, without the printing notes TCGplayer adds: "Charizard (Black Dot Error)", "Uta - OP09-002 (Alt Art)". */
export function baseName(n: string): string {
  return n
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+-\s+.*$/, "")
    .trim();
}

/**
 * One key for a printed number however it is written: case, spaces and leading zeros dropped, and Yu-Gi-Oh!'s English
 * region letters ("LOB-EN001", "LOB-E001" and the first print's "LOB-001" are the same English card). "058/107" -> "58/107",
 * "TG05/TG30" -> "TG5/TG30", "OP01-001" -> "OP1-1", "SVP 045" -> "SVP45".
 */
export function numberKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.toUpperCase().replace(/[\s·•]+/g, "").replace(/[‐‑–—]/g, "-");
  s = s.replace(/(?<=\d)O|O(?=\d)/g, "0"); // a model reads 0 as O now and then
  s = s.replace(/-(EN|E)(?=[A-Z]?\d)/, "-");
  s = s.replace(/\d+/g, (d) => String(Number(d)));
  return /\d/.test(s) ? s : null;
}

/** "58/107" -> "58": the number without its set total, for a total the photo cut off or misread. */
const numerator = (k: string) => (k.includes("/") ? k.split("/")[0] : k);

export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

const nameAgrees = (read: string, row: ScanRow, min: number) => {
  const base = normName(baseName(row.n));
  return nameSimilarity(read, base) >= min || (base.length >= 5 && read.startsWith(base)) || (read.length >= 5 && base.startsWith(read));
};

const PROMO_SET = /promo|pre-?release|release event|championship|tournament|regional|staff|prize|judge|event|league|jumbo|oversize/i;
const PROMO_NAME = /stamp|promo|pre-?release|staff|prize|winner|judge|event|championship|regional|treasure cup|playmat/i;

/** Printings in the order a hand most likely holds them: what the stamps say, the plain booster copy, then the rest by value. */
function order(rows: ScanRow[], r: ScanReading): ScanRow[] {
  const promoish = (x: ScanRow) => PROMO_SET.test(x.setName) || PROMO_NAME.test(x.n);
  const plain = (x: ScanRow) => !/\(/.test(x.n) && !/\s-\s/.test(x.n);
  const abbr = (r.setCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return [...rows].sort((a, b) => {
    if (abbr) {
      const sa = a.setAbbr?.toUpperCase() === abbr ? 0 : 1;
      const sb = b.setAbbr?.toUpperCase() === abbr ? 0 : 1;
      if (sa !== sb) return sa - sb;
    }
    const fa = /1st edition/i.test(a.setName) === r.firstEdition ? 0 : 1; // Base Set and its 1st Edition are two sets
    const fb = /1st edition/i.test(b.setName) === r.firstEdition ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const pa = promoish(a) === r.promoStamp ? 0 : 1;
    const pb = promoish(b) === r.promoStamp ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ja = /jumbo|oversize/i.test(a.setName) ? 1 : 0; // a jumbo card does not fit in a hand
    const jb = /jumbo|oversize/i.test(b.setName) ? 1 : 0;
    if (ja !== jb) return ja - jb;
    if (plain(a) !== plain(b)) return plain(a) ? -1 : 1;
    return b.v - a.v || a.id - b.id;
  });
}

function finish(rows: ScanRow[], r: ScanReading, why: string): ScanResult {
  const ranked = order(rows, r);
  const abbr = (r.setCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // A set code we could read and that only one candidate carries settles look-alikes from different sets (Pokémon reprints).
  const inSet = abbr ? ranked.filter((x) => x.setAbbr?.toUpperCase() === abbr) : [];
  const pool = inSet.length === 1 ? inSet : ranked;
  if (pool.length === 1) return { kind: "match", ids: [pool[0].id], why: inSet.length === 1 && ranked.length > 1 ? `${why}; set code ${abbr}` : why };
  return { kind: "pick", ids: ranked.slice(0, MAX_PICK).map((x) => x.id), why: `${why}; ${rows.length} printings look alike` };
}

type Index = { byKey: Map<string, ScanRow[]>; byNumerator: Map<string, ScanRow[]> };
const indexes = new WeakMap<ScanRow[], Index>();
function indexOf(catalog: ScanRow[]): Index {
  let ix = indexes.get(catalog);
  if (!ix) {
    ix = { byKey: new Map(), byNumerator: new Map() };
    for (const x of catalog) {
      const k = numberKey(x.no);
      if (!k) continue;
      (ix.byKey.get(k) ?? ix.byKey.set(k, []).get(k)!).push(x);
      const n = numerator(k);
      (ix.byNumerator.get(n) ?? ix.byNumerator.set(n, []).get(n)!).push(x);
    }
    indexes.set(catalog, ix);
  }
  return ix;
}

/** game: the slug the visitor scanned for; `catalog` that game's rows. */
export function matchScan(r: ScanReading, catalog: ScanRow[], opts: { foreignOk?: boolean } = {}): ScanResult {
  const none = (why: string): ScanResult => ({ kind: "none", ids: [], why });
  if (!r.isTradingCard) return none("no card in the photo");
  if (!opts.foreignOk && r.language && !/^en/i.test(r.language)) return none("only English cards for now");
  const read = normName(r.name);
  const key = numberKey(r.collectorNumber);

  if (key) {
    const ix = indexOf(catalog);
    let same = ix.byKey.get(key) ?? [];
    if (!same.length && key.includes("/")) same = ix.byNumerator.get(numerator(key)) ?? [];
    if (same.length) {
      // No legible name to confirm the number: never "match", the visitor checks the picture.
      if (!read) return { kind: "pick", ids: order(same, r).slice(0, MAX_PICK).map((x) => x.id), why: "number only, the name was not legible" };
      const agree = same.filter((x) => nameAgrees(read, x, 0.75));
      if (agree.length) return finish(agree, r, "number and name agree");
    }
  }
  if (!read) return none("neither a name nor a number could be read");
  // The number was missing, or pointed at another card: go by the name, and never call that certain.
  const byName = catalog.filter((x) => nameAgrees(read, x, 0.9));
  if (!byName.length) return none("nothing in the catalogue matches what was read");
  if (byName.length > MAX_PICK * 2) return none(`${byName.length} printings carry that name; the number decides`);
  return { kind: "pick", ids: order(byName, r).slice(0, MAX_PICK).map((x) => x.id), why: "matched by name only" };
}

/**
 * The printing (a key of the card's TCGplayer prices) to save, or null when the visitor must choose. The 1st Edition stamp
 * picks a 1st Edition key; a card with one printing takes it ("Normal" when it has no price yet).
 */
export function printingFor(prices: Record<string, number>, firstEdition: boolean): string | null {
  const keys = Object.keys(prices);
  if (!keys.length) return "Normal";
  const first = keys.filter((k) => /1st edition/i.test(k));
  if (firstEdition && first.length === 1) return first[0];
  const rest = firstEdition ? keys : keys.filter((k) => !/1st edition/i.test(k));
  return rest.length === 1 ? rest[0] : null;
}
