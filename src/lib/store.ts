// Reading the card files (server only). The ONE seam between pages and data/: if the catalogue outgrows a function bundle, change
// where these read from, not the pages. A missing or unreadable file gives the empty value, never an error page.
import fs from "node:fs";
import path from "node:path";
import type { CardRow, CardSet, HistoryFile, Point, SearchRow, SetFile, SetsFile, TopFile } from "./cards";
import type { OffersFile } from "./stores/match";
import type { BuylistFile } from "./buylist";
import { gameBySlug, LIVE_GAMES, type Game } from "../site.config";

const root = () => process.env.TSDB_DATA_DIR || path.join(process.cwd(), "data");
const memo = new Map<string, unknown>();
const SAFE = /^[a-z0-9-]+$/;

function read<T>(file: string, fallback: T): T {
  if (memo.has(file)) return memo.get(file) as T;
  let v: T = fallback;
  try {
    v = JSON.parse(fs.readFileSync(path.join(root(), file), "utf8")) as T;
  } catch {
    // Missing or unreadable.
  }
  memo.set(file, v);
  return v;
}

export interface Meta {
  generatedAt: string;
  games: Record<string, { sets: number; cards: number; priced: number; indexed: number; generatedAt: string }>;
}
export const readMeta = (): Meta => read<Meta>("meta.json", { generatedAt: "", games: {} });
/** Live games the import has cards for, biggest catalogue first after the config's first three. A live game with fewer than MIN_GAME_CARDS cards (none yet, or a stub like Naruto's 3 on 18 Nov) has no page. */
export const MIN_GAME_CARDS = 50;
export const shownGames = (): Game[] => LIVE_GAMES.filter((g) => (readMeta().games[g.slug]?.cards ?? 0) >= MIN_GAME_CARDS);
export const shownGame = (slug: string): Game | null => shownGames().find((g) => g.slug === slug) ?? null;
export const readSets = (game: string): SetsFile => (gameBySlug(game) ? read<SetsFile>(`cards/${game}/sets.json`, { generatedAt: "", source: "", sets: [] }) : { generatedAt: "", source: "", sets: [] });
export const readTop = (game: string): TopFile => (gameBySlug(game) ? read<TopFile>(`cards/${game}/top.json`, { top: [], up: [], down: [] }) : { top: [], up: [], down: [] });
export const readSearch = (game: string): SearchRow[] => (gameBySlug(game) ? read<SearchRow[]>(`cards/${game}/search.json`, []) : []);
export const setBySlug = (game: string, slug: string): CardSet | null => readSets(game).sets.find((s) => s.slug === slug) ?? null;
export function readSet(game: string, slug: string): CardRow[] {
  if (!gameBySlug(game) || !SAFE.test(slug)) return [];
  return read<SetFile>(`cards/${game}/sets/${slug}.json`, { slug, cards: [] }).cards;
}
// Price history is NOT bundled into the functions (next.config.js): it grows every day and would push data/ past a function's
// size. Locally (dev, tests, the import) it is read from disk; on Vercel from this repository's raw file at the deployed commit
// (the repo is public, and the page is cached a day, so a set's file is fetched about once a day per page).
const HISTORY_RAW = "https://raw.githubusercontent.com/Specifxx/tcgsinglesdb";
const historyMemo = new Map<string, Promise<HistoryFile>>();
async function historyFile(game: string, slug: string): Promise<HistoryFile> {
  const rel = `history/${game}/${slug}.json`;
  const local = path.join(root(), rel);
  if (fs.existsSync(local)) return read<HistoryFile>(rel, {});
  const key = `${process.env.VERCEL_GIT_COMMIT_SHA || "main"}/${rel}`;
  if (!historyMemo.has(key)) {
    const p = fetch(`${HISTORY_RAW}/${process.env.VERCEL_GIT_COMMIT_SHA || "main"}/data/${rel}`, { cache: "no-store", signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? (r.json() as Promise<HistoryFile>) : {}))
      .catch(() => ({}));
    if (historyMemo.size > 200) historyMemo.clear();
    historyMemo.set(key, p);
  }
  return historyMemo.get(key)!;
}
export async function readHistory(game: string, slug: string, id: number): Promise<Point[]> {
  if (!gameBySlug(game) || !SAFE.test(slug)) return [];
  return (await historyFile(game, slug))[String(id)] ?? [];
}
/** Store rows for one set (data/offers/<game>/<set>.json, written by scripts/stores.ts crawl), and who the stores are. */
export function readOffers(game: string, slug: string): OffersFile {
  if (!gameBySlug(game) || !SAFE.test(slug)) return {};
  return read<OffersFile>(`offers/${game}/${slug}.json`, {});
}
export const readStoreNames = (): Record<string, { name: string; base: string }> => read<{ stores?: Record<string, { name: string; base: string }> }>("stores/meta.json", {}).stores ?? {};
/** Cash buy prices for one set (data/buylist/<game>/<set>.json, written by scripts/buylist.ts). */
export function readBuylist(game: string, slug: string): BuylistFile {
  if (!gameBySlug(game) || !SAFE.test(slug)) return {};
  return read<BuylistFile>(`buylist/${game}/${slug}.json`, {});
}
export const readBuylistTop = () => read<{ set: string; setName: string; slug: string; n: string; no?: string; id: number; row: import("./buylist").BuyRow; market: number }[]>("buylist/top.json", []);
export const readBuylistMeta = () => read<{ at: string; buyers: Record<string, { readAt: string; matched: number }> }>("buylist/meta.json", { at: "", buyers: {} });
/** For tests: forget what was read. */
export const resetStore = () => memo.clear();
