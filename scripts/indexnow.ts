// After each import: tell IndexNow about pages Google may now see and that were never sent: a game hub and set page once its
// game has released cards, and each card the import released to Google (`ix`), most valuable first, 1,000 a run at most.
// Never unreleased cards, never a page twice. The record is data/state/indexnow.json (URLs and the day sent; public).
import fs from "node:fs";
import path from "node:path";
import {
  cardIndexable,
  cardValue,
  type SetFile,
  type SetsFile,
} from "../src/lib/cards";
import { INDEXNOW_KEY, pickNew } from "../src/lib/indexnow";
import { LIVE_GAMES, SITE } from "../src/site.config";

const DATA = process.env.DATA_DIR || path.join(process.cwd(), "data");
const read = <T>(f: string, d: T): T => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as T;
  } catch {
    return d;
  }
};

async function main() {
  const stateFile = path.join(DATA, "state", "indexnow.json");
  const state = read<{ sent: Record<string, string> }>(stateFile, { sent: {} });
  const cands: { url: string; w: number }[] = [];
  for (const g of LIVE_GAMES) {
    if (g.index === false) continue;
    const sets = read<SetsFile>(path.join(DATA, "cards", g.slug, "sets.json"), {
      generatedAt: "",
      source: "",
      sets: [],
    }).sets;
    if (!sets.some((s) => s.indexed > 0)) continue;
    cands.push({ url: `${SITE.url}/${g.slug}`, w: Number.MAX_SAFE_INTEGER });
    for (const s of sets) {
      if (!s.indexed) continue;
      cands.push({
        url: `${SITE.url}/${g.slug}/${s.slug}`,
        w: Number.MAX_SAFE_INTEGER / 2,
      });
      for (const c of read<SetFile>(
        path.join(DATA, "cards", g.slug, "sets", `${s.slug}.json`),
        { slug: s.slug, cards: [] },
      ).cards)
        if (cardIndexable(c))
          cands.push({
            url: `${SITE.url}/${g.slug}/${s.slug}/${c.s}`,
            w: cardValue(c.p) ?? 0,
          });
    }
  }
  const urls = pickNew(cands, state.sent);
  if (!urls.length) return console.log("[indexnow] nothing new");
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE.url).host,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE.url}/indexnow-key.txt`,
      urlList: urls,
    }),
  });
  console.log(`[indexnow] HTTP ${res.status} for ${urls.length} URLs`);
  if (res.ok) {
    const day = new Date().toISOString().slice(0, 10);
    for (const u of urls) state.sent[u] = day;
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state));
  }
}
main().catch((e) => console.log(`[indexnow] skipped: ${(e as Error).message}`));
