// "Who pays most?": Card Kingdom's cash buy prices for Magic singles (src/lib/buylist.ts). GitHub Actions only (card-prices.yml,
// after the import; the cloud container cannot reach either host). Two reads a day, both public files meant to be read whole:
//   1. Scryfall's bulk "default_cards" file (the printing -> TCGplayer id map), streamed, never held whole. Scryfall publishes it
//      for exactly this and asks for an honest User-Agent and Accept header.
//   2. Card Kingdom's price list through polite-http (its api host's robots.txt allows every path): one request.
// Writes data/buylist/magic/<set>.json and data/buylist/meta.json. A failed read keeps yesterday's files (rows are dropped
// after BUY_MAX_AGE_DAYS) and never fails the release.
import fs from "node:fs";
import path from "node:path";
import type { SetFile } from "../src/lib/cards";
import { JsonArraySplitter, matchCk, sortBuyRows, type BuyCard, type BuylistFile, type BuyRow, type CkRow } from "../src/lib/buylist";
import { RequestBudget, StopStore, StoreSession, USER_AGENT } from "../src/lib/stores/polite-http";

const DATA = process.env.TSDB_DATA_DIR || path.join(process.cwd(), "data");
const OUT = path.join(DATA, "buylist");
const GAME = "magic";
export const BUY_MAX_AGE_DAYS = 3;

const readJson = <T>(f: string, fb: T): T => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as T;
  } catch {
    return fb;
  }
};
const writeJson = (f: string, v: unknown) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(v) + "\n");
};

/** data/buylist/top.json: the best cash offers today, for /sell. */
export interface BuyTop {
  set: string;
  setName: string;
  slug: string;
  n: string;
  no?: string;
  id: number;
  row: BuyRow;
  market: number;
}

export interface BuylistMeta {
  at: string;
  buyers: Record<string, { readAt: string; listedAt: string; rows: number; buying: number; matched: number; refused: Record<string, number> }>;
}

const names = new Map<string, { n: string; no?: string; id: number }>();
function catalogue(): Map<number, BuyCard> {
  const m = new Map<number, BuyCard>();
  const dir = path.join(DATA, "cards", GAME, "sets");
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!f.endsWith(".json")) continue;
    const set = f.slice(0, -5);
    for (const c of readJson<SetFile>(path.join(dir, f), { slug: set, cards: [] }).cards) {
      m.set(c.id, { set, slug: c.s, p: c.p });
      names.set(`${set}/${c.s}`, { n: c.n, no: c.no, id: c.id });
    }
  }
  return m;
}

async function scryfallMap(): Promise<Map<string, number>> {
  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
  const idx = (await (await fetch("https://api.scryfall.com/bulk-data/default-cards", { headers, signal: AbortSignal.timeout(30_000) })).json()) as { download_uri?: string };
  if (!idx.download_uri) throw new Error("Scryfall: no download_uri");
  const res = await fetch(idx.download_uri, { headers, signal: AbortSignal.timeout(15 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Scryfall bulk: HTTP ${res.status}`);
  const map = new Map<string, number>();
  const split = new JsonArraySplitter((text) => {
    try {
      const o = JSON.parse(text) as { id?: string; tcgplayer_id?: number };
      if (o.id && Number.isInteger(o.tcgplayer_id)) map.set(o.id, o.tcgplayer_id!);
    } catch {
      // One unreadable object is skipped, never guessed.
    }
  });
  const dec = new TextDecoder();
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) split.push(dec.decode(chunk, { stream: true }));
  split.push(dec.decode());
  return map;
}

async function main() {
  const day = new Date().toISOString();
  const metaFile = path.join(OUT, "meta.json");
  const prev = readJson<BuylistMeta>(metaFile, { at: "", buyers: {} });
  const cards = catalogue();
  if (!cards.size) throw new Error("no Magic catalogue");

  const ck = new StoreSession("https://api.cardkingdom.com", { budget: new RequestBudget(3), perStoreCap: 3, timeoutMs: 120_000 });
  let list: { meta?: { created_at?: string }; data?: CkRow[] } | null;
  try {
    list = await ck.getJson("/api/v2/pricelist");
  } catch (e) {
    if (e instanceof StopStore) throw new Error(`Card Kingdom: ${e.reason} (${e.message})`);
    throw e;
  }
  if (!list?.data?.length) throw new Error("Card Kingdom: no price list");
  const tcg = await scryfallMap();
  if (tcg.size < 50_000) throw new Error(`Scryfall: only ${tcg.size} printings with a TCGplayer id`);

  const bySet = new Map<string, Map<string, BuyRow[]>>();
  const refused: Record<string, number> = {};
  let buying = 0;
  let matched = 0;
  for (const r of list.data) {
    const m = matchCk(r, tcg, cards);
    if ("refuse" in m) {
      refused[m.refuse] = (refused[m.refuse] ?? 0) + 1;
      continue;
    }
    buying++;
    matched++;
    const s = bySet.get(m.set) ?? new Map<string, BuyRow[]>();
    s.set(m.slug, [...(s.get(m.slug) ?? []), m.row]);
    bySet.set(m.set, s);
  }
  buying += Object.entries(refused).reduce((n, [k, v]) => n + (k === "not-buying" ? 0 : v), 0);
  if (matched < 1000) throw new Error(`Card Kingdom: only ${matched} rows matched (refused ${JSON.stringify(refused)})`);

  // Today's file replaces each set's: Card Kingdom is the only buyer so far, and its list is read whole.
  const dir = path.join(OUT, GAME);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [set, rows] of bySet) {
    const file: BuylistFile = {};
    for (const [slug, r] of [...rows].sort((a, b) => a[0].localeCompare(b[0]))) file[slug] = sortBuyRows(r);
    writeJson(path.join(dir, `${set}.json`), file);
  }
  const setNames = new Map(readJson<{ sets: { slug: string; name: string }[] }>(path.join(DATA, "cards", GAME, "sets.json"), { sets: [] }).sets.map((x) => [x.slug, x.name]));
  const top: BuyTop[] = [];
  for (const [set, rows] of bySet)
    for (const [slug, r] of rows) {
      const card = names.get(`${set}/${slug}`);
      if (!card) continue;
      for (const row of sortBuyRows(r)) top.push({ set, setName: setNames.get(set) ?? set, slug, n: card.n, no: card.no, id: card.id, row, market: cards.get(card.id)?.p[row[1]] ?? 0 });
    }
  top.sort((a, b) => b.row[2] - a.row[2] || a.id - b.id);
  writeJson(path.join(OUT, "top.json"), top.slice(0, 200));
  const meta: BuylistMeta = { at: day, buyers: { ...prev.buyers, ck: { readAt: day, listedAt: list.meta?.created_at ?? "", rows: list.data.length, buying, matched, refused } } };
  writeJson(metaFile, meta);
  console.log(`[buylist] Card Kingdom: ${list.data.length} rows, ${buying} buying, ${matched} matched to ${bySet.size} sets; Scryfall ${tcg.size} ids; refused ${JSON.stringify(refused)}`);
}

/** A failed read keeps yesterday's files for BUY_MAX_AGE_DAYS, then drops them, so no stale cash price stays up. */
function expire() {
  const meta = readJson<BuylistMeta>(path.join(OUT, "meta.json"), { at: "", buyers: {} });
  const age = (Date.now() - Date.parse(meta.buyers.ck?.readAt ?? "")) / 86_400_000;
  if (!(age <= BUY_MAX_AGE_DAYS) && fs.existsSync(path.join(OUT, GAME))) {
    fs.rmSync(path.join(OUT, GAME), { recursive: true, force: true });
    fs.rmSync(path.join(OUT, "top.json"), { force: true });
    console.log(`[buylist] rows dropped: last good read ${Number.isFinite(age) ? Math.round(age) : "never"} days ago`);
  }
}

main().catch((e) => {
  console.error(`[buylist] ${(e as Error).message}`);
  expire();
  process.exit(1);
});
