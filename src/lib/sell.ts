// The Sell desk (/sell/list, DECISIONS.md 2026-11-24): a seller's own card list in, each card's TCGplayer market price, what it
// nets after TCGplayer's and eBay's seller fees, any cash buylist offer, and the best route; a spreadsheet out. Pure helpers a
// page or route may import: no fs, no network. Nothing a seller types is stored anywhere.
//
// Fees are each marketplace's published US seller fees, read on FEES_READ. They change: update the numbers and the date
// together, and tests/sell.test.ts pins the worked examples.

export const FEES_READ = "2026-11-23";
export const FEE_SOURCES = {
  tcgplayer: "https://help.tcgplayer.com/hc/en-us/articles/201357836-Fees",
  ebay: "https://www.ebay.com/help/selling-fees/selling/selling-fees?id=4822",
} as const;
/** The most lines one list may hold (free). A longer list is cut, and Seller Pro (not built yet) would take it whole. */
export const MAX_LINES = 100;
export const MAX_QTY = 999;

/** TCGplayer Marketplace seller (Level 1-4): 10.75% commission capped at US$75 a card, plus 2.5% + US$0.30 a payment. */
export function tcgplayerNet(cents: number): number {
  const commission = Math.min(Math.round(cents * 0.1075), 7500);
  const processing = Math.round(cents * 0.025) + 30;
  return cents - commission - processing;
}
/** eBay US, Collectible Card Games: 13.25% of the sale up to US$7,500 and 2.35% above, plus US$0.30 an order (US$0.40 over US$10). */
export function ebayNet(cents: number): number {
  const fvf = Math.round(Math.min(cents, 750000) * 0.1325 + Math.max(0, cents - 750000) * 0.0235);
  return cents - fvf - (cents > 1000 ? 40 : 30);
}

export type Route = "tcgplayer" | "ebay" | "cash" | "bulk";
export const ROUTE_NAMES: Record<Route, string> = { tcgplayer: "TCGplayer", ebay: "eBay", cash: "Cash buylist", bulk: "Keep or sell in bulk" };

/** The route that leaves the seller the most for one copy. Fees eat the whole price below about a dollar: that card is "bulk". */
export function bestRoute(market: number, ebayPct: number, cash: number | null): { route: Route; net: number } {
  const opts: { route: Route; net: number }[] = [
    { route: "tcgplayer", net: tcgplayerNet(market) },
    { route: "ebay", net: ebayNet(Math.round((market * ebayPct) / 100)) },
  ];
  if (cash && cash > 0) opts.push({ route: "cash", net: cash });
  const best = opts.reduce((a, b) => (b.net > a.net ? b : a));
  return best.net <= Math.max(25, market * 0.5) && best.route !== "cash" ? { route: "bulk", net: Math.max(0, best.net) } : best;
}

/** One line of the seller's list, read from a paste or a CSV. */
export interface ListLine {
  qty: number;
  /** What to search for: the name with any set and number ("Charizard ex 199/165 MEW"). */
  q: string;
  /** The card name alone, when a CSV gave it in its own column. */
  name?: string;
  /** A printing hint: "foil", "reverse", "1st", or "". */
  hint: string;
  /** A TCGplayer product id from a CSV column that says so. */
  id?: number;
}

const FOIL = /\b(foil|holo(foil)?|etched)\b/i;
const REVERSE = /\breverse( holo)?\b/i;
const FIRST = /\b1st( edition)?\b/i;
function hintOf(s: string): string {
  if (REVERSE.test(s)) return "reverse";
  if (FIRST.test(s)) return "1st";
  if (FOIL.test(s)) return "foil";
  return "";
}
const clampQty = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), MAX_QTY) : 1);

/** "2x Lightning Bolt (M10) 146 foil", "Charizard ex 199/165 x3", "1 Pikachu": quantity first or last, the rest is the search. */
export function parseLine(raw: string): ListLine | null {
  let s = raw.replace(/\t/g, " ").replace(/\s+/g, " ").trim();
  if (!s || /^(\/\/|#)/.test(s) || /^(deck|sideboard|commander|main ?deck)\s*:?$/i.test(s)) return null;
  let qty = 1;
  const lead = s.match(/^(\d{1,3})\s*x?\s+(?=\S)/i);
  const trail = s.match(/\s+x\s*(\d{1,3})$/i) || s.match(/\s+(\d{1,3})x$/i);
  if (lead) {
    qty = Number(lead[1]);
    s = s.slice(lead[0].length);
  } else if (trail) {
    qty = Number(trail[1]);
    s = s.slice(0, trail.index);
  }
  const hint = hintOf(s);
  // A finish word, an Arena/MTGO "*F*" mark and brackets are not part of the card's name; the set code inside brackets is kept.
  const q = s
    .replace(/\*f\*|\*e\*/gi, " ")
    .replace(REVERSE, " ")
    .replace(FIRST, " ")
    .replace(FOIL, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (q.length < 2) return null;
  return { qty: clampQty(qty), q, hint };
}

/** RFC 4180 rows: quoted fields, doubled quotes, commas, semicolons or tabs. */
export function csvRows(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') quoted = false;
      else f += c;
    } else if (c === '"' && f === "") quoted = true;
    else if (c === sep) {
      row.push(f);
      f = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      f = "";
    } else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

// Column names of the exports sellers have: ManaBox, TCGplayer's app, Collectr, Dragon Shield, Moxfield, Deckbox and plain sheets.
const COL = {
  name: /^(name|card ?name|product ?name|card)$/i,
  qty: /^(qty|quantity|count|total quantity|add to quantity|amount)$/i,
  set: /^(set|set ?name|set ?code|edition|expansion|set_code|set_name)$/i,
  number: /^(number|no\.?|collector ?number|card ?number|collector_number|#)$/i,
  finish: /^(foil|finish|printing|variance|variant|treatment|is ?foil)$/i,
  // Only a column that says it is a PRODUCT id: TCGplayer's seller export calls its SKU "TCGplayer Id", which is not ours.
  id: /^(tcgplayer ?product ?id|product ?id|productid|tcgplayer_product_id)$/i,
};

/** A whole list: a CSV with a header we recognise, else one card a line. Cut at MAX_LINES; `cut` says how many were left out. */
export function parseList(text: string): { lines: ListLine[]; cut: number; format: "csv" | "lines" } {
  const rows = csvRows(text.slice(0, 400_000));
  const head = (rows[0] ?? []).map((h) => h.trim().replace(/^﻿/, ""));
  const idx = (re: RegExp) => head.findIndex((h) => re.test(h));
  const nameCol = idx(COL.name);
  let lines: ListLine[] = [];
  let format: "csv" | "lines" = "lines";
  if (rows.length > 1 && head.length > 1 && nameCol >= 0) {
    format = "csv";
    const [qc, sc, nc, fc, ic] = [idx(COL.qty), idx(COL.set), idx(COL.number), idx(COL.finish), idx(COL.id)];
    for (const r of rows.slice(1)) {
      const name = (r[nameCol] ?? "").trim();
      if (name.length < 2) continue;
      const finish = fc >= 0 ? (r[fc] ?? "").trim() : "";
      const finishHint = /^(true|yes|1|foil)$/i.test(finish) ? "foil" : hintOf(finish);
      const idNum = ic >= 0 ? Number((r[ic] ?? "").trim()) : NaN;
      const q = [name, sc >= 0 ? r[sc] : "", nc >= 0 ? r[nc] : ""].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
      lines.push({ qty: clampQty(qc >= 0 ? Number((r[qc] ?? "").trim()) : 1), q: q.replace(/[()[\]{}]/g, " ").replace(/\s+/g, " ").trim(), name, hint: finishHint, ...(Number.isInteger(idNum) && idNum > 0 ? { id: idNum } : {}) });
    }
  } else {
    lines = text.split(/\r?\n/).map(parseLine).filter((l): l is ListLine => l !== null);
  }
  return { lines: lines.slice(0, MAX_LINES), cut: Math.max(0, lines.length - MAX_LINES), format };
}

/** The printing a line means, among the card's priced printings: its hint, else the plain one, else the cheapest. */
export function pickPrinting(prices: Record<string, number>, hint: string): string | null {
  const keys = Object.keys(prices);
  if (!keys.length) return null;
  const find = (re: RegExp) => keys.find((k) => re.test(k));
  if (hint === "reverse") return find(/reverse/i) ?? find(/foil|holo/i) ?? keys[0];
  if (hint === "1st") return find(/1st/i) ?? keys[0];
  if (hint === "foil") return find(/^(foil|holofoil)$/i) ?? find(/foil|holo/i) ?? keys[0];
  const plain = find(/^normal$/i) ?? find(/unlimited/i) ?? keys.find((k) => !/foil|holo|reverse|1st/i.test(k));
  return plain ?? keys.reduce((a, b) => (prices[b] < prices[a] ? b : a));
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
/** A product id from a CSV is trusted only when the card it finds carries the name the row gave (an id from another export is not ours). */
export const idAgrees = (cardName: string, rowName: string | undefined) => !rowName || norm(cardName).includes(norm(rowName).split(" (")[0]) || norm(rowName).includes(norm(cardName));

export interface SoldRow {
  qty: number;
  name: string;
  set: string;
  number: string;
  printing: string;
  id: number;
  market: number;
  tcgplayerNet: number;
  ebayNet: number;
  cash: number | null;
  route: Route;
}
const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
};
const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
/** The spreadsheet a seller downloads: one row per card, prices in US dollars, the TCGplayer product id for any lister that takes it. */
export function toCsv(rows: SoldRow[]): string {
  const head = ["Quantity", "Name", "Set", "Number", "Printing", "Condition", "TCGplayer Product ID", "TCGplayer Market", "Net on TCGplayer", "Net on eBay", "Cash offer", "Best route"];
  const body = rows.map((r) => [r.qty, r.name, r.set, r.number, r.printing, "Near Mint", r.id, dollars(r.market), dollars(r.tcgplayerNet), dollars(r.ebayNet), dollars(r.cash), ROUTE_NAMES[r.route]].map(cell).join(","));
  return [head.join(","), ...body].join("\r\n") + "\r\n";
}
