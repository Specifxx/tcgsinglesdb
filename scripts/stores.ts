// Store prices for singles (owner, 2026-11-18: "get all these singles and stores in"). Two modes, both GitHub Actions only (the
// cloud container cannot reach the stores), both through src/lib/stores/polite-http.ts (robots.txt, an honest User-Agent, one
// request a second per store, a 401/403/429 or challenge stops that store, never worked around):
//
//   probe  (stores-probe.yml, weekly): for each US store in data/stores/candidates.json (TCG Prices' US store list, minus its
//          blocklist and refused stores), robots.txt, /meta.json (must charge USD) and /collections.json (3 pages at most),
//          and keep the store's singles collections (singlesCollections) in data/stores/singles.json. No product is read.
//   crawl  (card-prices.yml, after the import): reads those collections' products.json, least recently read stores first,
//          PAGES_PER_STORE pages a store a run, continuing where the last run stopped (data/stores/cursor.json), matches each
//          listing by the TCGplayer id it carries (matchListing), keeps each store's matches in data/stores/state/<key>.json
//          for OFFER_MAX_AGE_DAYS, and writes data/offers/<game>/<set>.json for the card pages.
//
// Env: STORES_BUDGET (requests, default 20000), STORES_MAX_MINUTES (default 120), STORES_PAGES (pages a store a run, 60).
import fs from "node:fs";
import path from "node:path";
import { GAMES } from "../src/site.config";
import type { SetFile } from "../src/lib/cards";
import { eachStore, RequestBudget, StopStore, StoreSession } from "../src/lib/stores/polite-http";
import {
  matchListing,
  mergeState,
  singlesCollections,
  sortRows,
  tooCheap,
  type CardRef,
  type OfferRow,
  type OffersFile,
  type ShopifyCollection,
  type ShopifyProduct,
  type StoreOffer,
  type StoreState,
} from "../src/lib/stores/match";

const DATA = process.env.TSDB_DATA_DIR || path.join(process.cwd(), "data");
const STORES = path.join(DATA, "stores");
const readJson = <T>(f: string, fb: T): T => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as T;
  } catch {
    return fb;
  }
};
const writeJson = (f: string, v: unknown, pretty = false) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(v, null, pretty ? 1 : 0) + "\n");
};
const today = () => new Date().toISOString().slice(0, 10);
const SAFE_KEY = /^[a-z0-9][a-z0-9-]*$/;

interface Candidate {
  key: string;
  name: string;
  base: string;
  market: "US";
}
export interface SinglesStore extends Candidate {
  handles: string[];
  probedAt: string;
}
interface StoresMeta {
  at: string;
  /** Store key → name and base, for the card pages. */
  stores: Record<string, { name: string; base: string }>;
  refused: { key: string; why: string }[];
  run: { stores: number; read: number; stopped: Record<string, number>; requests: number; listings: number; matched: number; refused: Record<string, number> };
  /** Store key → when its listings were last read (rotation order). */
  read: Record<string, string>;
}

async function probe() {
  const cands = readJson<Candidate[]>(path.join(STORES, "candidates.json"), []).filter((c) => SAFE_KEY.test(c.key));
  const blocklist = readJson<Record<string, string>>(path.join(STORES, "blocklist.json"), {});
  const prev = new Map(readJson<SinglesStore[]>(path.join(STORES, "singles.json"), []).map((s) => [s.key, s]));
  const budget = new RequestBudget(Number(process.env.STORES_BUDGET ?? 8000));
  const deadline = Date.now() + Number(process.env.STORES_MAX_MINUTES ?? 100) * 60_000;
  const out = new Map<string, SinglesStore>();
  let tried = 0;
  const why: Record<string, number> = {};
  await eachStore(
    cands.filter((c) => blocklist[new URL(c.base).hostname.replace(/^www\./, "")] == null),
    async (c) => {
      const s = new StoreSession(c.base, { budget, perStoreCap: 8, deadline });
      tried++;
      try {
        const meta = await s.getJson<{ currency?: string }>("/meta.json");
        if (!meta || meta.currency?.toUpperCase() !== "USD") {
          why[meta ? "not-usd" : "not-shopify"] = (why[meta ? "not-usd" : "not-shopify"] ?? 0) + 1;
          return;
        }
        const cols: ShopifyCollection[] = [];
        for (let page = 1; page <= 3; page++) {
          const d = await s.getJson<{ collections?: ShopifyCollection[] }>(`/collections.json?limit=250&page=${page}`);
          const list = d?.collections;
          if (!Array.isArray(list)) break;
          cols.push(...list);
          if (list.length < 250) break;
        }
        const handles = singlesCollections(cols);
        if (handles.length) out.set(c.key, { ...c, handles, probedAt: new Date().toISOString() });
        else why["no-singles"] = (why["no-singles"] ?? 0) + 1;
      } catch (e) {
        if (!(e instanceof StopStore)) throw e;
        why[e.reason] = (why[e.reason] ?? 0) + 1;
        // A store we could not read this week keeps last week's collections.
        const p = prev.get(c.key);
        if (p) out.set(c.key, p);
      }
    },
    4,
  );
  const list = [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
  writeJson(path.join(STORES, "singles.json"), list, true);
  console.log(`[stores probe] ${tried} of ${cands.length} stores tried, ${list.length} with singles collections, ${budget.used} requests; skipped: ${JSON.stringify(why)}`);
}

/** Every card we have, by TCGplayer id. */
function catalogue(): Map<number, CardRef> {
  const m = new Map<number, CardRef>();
  for (const g of GAMES) {
    const dir = path.join(DATA, "cards", g.slug, "sets");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const set = f.slice(0, -5);
      for (const c of readJson<SetFile>(path.join(dir, f), { slug: set, cards: [] }).cards) m.set(c.id, { game: g.slug, set, slug: c.s, p: c.p });
    }
  }
  return m;
}

async function crawl() {
  const stores = readJson<SinglesStore[]>(path.join(STORES, "singles.json"), []).filter((s) => SAFE_KEY.test(s.key));
  const blocklist = readJson<Record<string, string>>(path.join(STORES, "blocklist.json"), {});
  const metaFile = path.join(STORES, "meta.json");
  const prevMeta = readJson<Partial<StoresMeta>>(metaFile, {});
  const cursor = readJson<Record<string, { h: number; page: number }>>(path.join(STORES, "cursor.json"), {});
  const cards = catalogue();
  const day = today();
  const pages = Number(process.env.STORES_PAGES ?? 60);
  const budget = new RequestBudget(Number(process.env.STORES_BUDGET ?? 20000));
  const deadline = Date.now() + Number(process.env.STORES_MAX_MINUTES ?? 120) * 60_000;
  const readAt: Record<string, string> = { ...(prevMeta.read ?? {}) };
  const run: StoresMeta["run"] = { stores: stores.length, read: 0, stopped: {}, requests: 0, listings: 0, matched: 0, refused: {} };
  const live = stores.filter((s) => blocklist[new URL(s.base).hostname.replace(/^www\./, "")] == null);
  const order = [...live].sort((a, b) => (Date.parse(readAt[a.key] ?? "") || 0) - (Date.parse(readAt[b.key] ?? "") || 0) || a.key.localeCompare(b.key));
  console.log(`[stores crawl] ${order.length} stores, ${cards.size} cards in the catalogue`);
  await eachStore(
    order,
    async (st) => {
      const s = new StoreSession(st.base, { budget, perStoreCap: pages + 3, deadline });
      const seen = new Set<number>();
      const matched = new Map<number, StoreOffer>();
      let at = cursor[st.key] ?? { h: 0, page: 1 };
      if (at.h >= st.handles.length) at = { h: 0, page: 1 };
      let read = 0;
      let reason = "";
      try {
        while (read < pages) {
          const handle = st.handles[at.h];
          const d = await s.getJson<{ products?: ShopifyProduct[] }>(`/collections/${encodeURIComponent(handle)}/products.json?limit=250&page=${at.page}`);
          read++;
          const list = Array.isArray(d?.products) ? d!.products! : [];
          for (const p of list) {
            if (!p || typeof p.id !== "number" || !Array.isArray(p.variants) || seen.has(p.id)) continue;
            seen.add(p.id);
            run.listings++;
            const r = matchListing(p, cards);
            if ("refuse" in r) run.refused[r.refuse] = (run.refused[r.refuse] ?? 0) + 1;
            else matched.set(p.id, r);
          }
          if (list.length < 250) {
            // This collection is done: the next one, or back to the first after the last.
            at = { h: at.h + 1, page: 1 };
            if (at.h >= st.handles.length) {
              at = { h: 0, page: 1 };
              break;
            }
          } else at = { h: at.h, page: at.page + 1 };
        }
      } catch (e) {
        if (!(e instanceof StopStore)) throw e;
        reason = e.reason;
        run.stopped[e.reason] = (run.stopped[e.reason] ?? 0) + 1;
      }
      cursor[st.key] = at;
      if (seen.size) {
        run.read++;
        readAt[st.key] = new Date().toISOString();
      }
      run.matched += matched.size;
      const file = path.join(STORES, "state", `${st.key}.json`);
      writeJson(file, mergeState(readJson<StoreState>(file, {}), seen, matched, day));
      console.log(`[stores crawl] ${st.key}: ${seen.size} listings, ${matched.size} matched, ${s.requests} requests${reason ? `, stopped: ${reason}` : ""}`);
    },
    6,
  );
  run.requests = budget.used;

  // Every store's matches → one offers file per set. A store too cheap to be true is left out whole.
  const byFile = new Map<string, OffersFile>();
  const refused: StoresMeta["refused"] = [];
  const shown: StoresMeta["stores"] = {};
  for (const st of live) {
    const state = readJson<StoreState>(path.join(STORES, "state", `${st.key}.json`), {});
    const rows = Object.values(state).filter(([card]) => cards.has(card));
    const ratios = rows.filter((r) => r[3]).map(([card, printing, cents]) => cents / (cards.get(card)!.p[printing] || Infinity));
    if (tooCheap(ratios)) {
      refused.push({ key: st.key, why: "too cheap to be true: half its in-stock singles under 70% of TCGplayer's market" });
      continue;
    }
    for (const [card, printing, cents, inStock, handle, variant, seenDay] of rows) {
      const c = cards.get(card)!;
      if (!(c.p[printing] > 0) || !inStock) continue; // the card pages show stores that have it
      const key = `${c.game}/${c.set}`;
      if (!byFile.has(key)) byFile.set(key, {});
      const f = byFile.get(key)!;
      (f[c.slug] ??= []).push([st.key, printing, cents, inStock, `${handle}?variant=${variant}`, seenDay] as OfferRow);
      shown[st.key] = { name: st.name, base: st.base };
    }
  }
  fs.rmSync(path.join(DATA, "offers"), { recursive: true, force: true });
  let cardsWithRows = 0;
  for (const [key, f] of byFile) {
    for (const k of Object.keys(f)) {
      // One row per store and printing: its cheapest.
      const best = new Map<string, OfferRow>();
      for (const r of f[k].slice().sort((a, b) => b[3] - a[3] || a[2] - b[2])) if (!best.has(`${r[0]}|${r[1]}`)) best.set(`${r[0]}|${r[1]}`, r);
      f[k] = sortRows([...best.values()]);
      cardsWithRows++;
    }
    writeJson(path.join(DATA, "offers", `${key}.json`), f);
  }
  writeJson(path.join(STORES, "cursor.json"), cursor, true);
  writeJson(metaFile, { at: new Date().toISOString(), stores: shown, refused, run, read: readAt } satisfies StoresMeta, true);
  console.log(`[stores crawl] ${run.read} stores read, ${run.listings} listings, ${run.matched} matched, ${run.requests} requests; ${cardsWithRows} cards have store rows from ${Object.keys(shown).length} stores; refused ${JSON.stringify(run.refused)}; stopped ${JSON.stringify(run.stopped)}`);
}

const mode = process.argv[2];
if (process.argv[1] && /stores\.ts$/.test(process.argv[1])) {
  (mode === "probe" ? probe() : mode === "crawl" ? crawl() : Promise.reject(new Error("usage: stores.ts probe|crawl"))).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
