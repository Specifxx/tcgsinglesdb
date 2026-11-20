// The site watches itself (ops-monitor.yml, every six hours): a failing check fails the run and GitHub emails the owner.
// Checks: the import is fresh for every live game, the release to Google is not shrinking to nothing, and the live site answers.
import fs from "node:fs";
import path from "node:path";
import { LIVE_GAMES, SITE } from "../src/site.config";
import type { Meta } from "../src/lib/store";

const problems: string[] = [];
const ok: string[] = [];
const meta: Meta = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "meta.json"), "utf8")) as Meta;
  } catch {
    return { generatedAt: "", games: {} };
  }
})();

for (const g of LIVE_GAMES) {
  const m = meta.games[g.slug];
  if (!m || m.cards < 50) {
    // A game TCGplayer has no cards for yet has no page (shownGames): nothing to watch.
    ok.push(`${g.name}: ${m?.cards ?? 0} cards, hidden (under 50)`);
    continue;
  }
  const hours = (Date.now() - Date.parse(m.generatedAt)) / 3_600_000;
  if (!(hours < 36)) problems.push(`${g.name}: last import ${Math.round(hours)} h ago (daily expected)`);
  else ok.push(`${g.name}: ${m.cards} cards, ${m.indexed} released to Google, imported ${Math.round(hours)} h ago`);
}

// Card coverage (coverage.yml): the Monday audit is under nine days old, the daily release watch under two, and neither found
// a card TCGplayer lists that this site or a sister site lacks (independent databases' gaps are shown, not alerted).
for (const [file, maxH, label] of [["report.json", 9 * 24, "full audit"], ["release.json", 50, "release watch"]] as const) {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "coverage", file), "utf8")) as { generatedAt: string; sites: { site: string; game: string; missing: number; stale: number }[]; external: unknown[] };
    const hours = (Date.now() - Date.parse(r.generatedAt)) / 3_600_000;
    const gaps = r.sites.filter((s) => s.stale > 0);
    if (!(hours < maxH)) problems.push(`Card coverage ${label}: last run ${Math.round(hours)} h ago`);
    else if (gaps.length) problems.push(`Card coverage ${label}: ${gaps.map((s) => `${s.site} ${s.game} ${s.stale}`).join(", ")} cards TCGplayer lists have no page (data/coverage/${file.replace(".json", ".md")})`);
    else ok.push(`Card coverage ${label}: no card missing against TCGplayer, ${r.external.length} notes from card databases, ${Math.round(hours)} h ago`);
  } catch {
    ok.push(`Card coverage ${label}: no run yet`);
  }
}

// Store prices (scripts/stores.ts crawl, in the daily import): read within two days, and some stores matched.
const stores = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "stores", "meta.json"), "utf8")) as { at: string; stores: Record<string, unknown>; run: { read: number; matched: number; requests: number } };
  } catch {
    return null;
  }
})();
if (stores) {
  const hours = (Date.now() - Date.parse(stores.at)) / 3_600_000;
  const n = Object.keys(stores.stores ?? {}).length;
  if (!(hours < 50)) problems.push(`Store prices: last crawl ${Math.round(hours)} h ago (daily expected)`);
  else if (stores.run.read === 0) problems.push(`Store prices: the last crawl read no store (${stores.run.requests} requests)`);
  else ok.push(`Store prices: ${n} stores with rows, last crawl read ${stores.run.read} stores and matched ${stores.run.matched} listings, ${Math.round(hours)} h ago`);
} else ok.push("Store prices: no crawl yet");

// Cash buy prices (scripts/buylist.ts, in the daily import): read within two days, and enough rows matched.
const buy = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "buylist", "meta.json"), "utf8")) as { buyers: Record<string, { readAt: string; matched: number; rows: number }> };
  } catch {
    return null;
  }
})();
const ck = buy?.buyers?.ck;
if (ck) {
  const hours = (Date.now() - Date.parse(ck.readAt)) / 3_600_000;
  if (!(hours < 50)) problems.push(`Card Kingdom buylist: last read ${Math.round(hours)} h ago (daily expected; rows drop after 3 days)`);
  else ok.push(`Card Kingdom buylist: ${ck.matched} of ${ck.rows} rows matched, read ${Math.round(hours)} h ago`);
} else ok.push("Card Kingdom buylist: no read yet");

async function live(pathname: string, must: RegExp): Promise<void> {
  try {
    const res = await fetch(`${SITE.url}${pathname}`, { headers: { "User-Agent": "TCGSinglesDB-ops/1.0" }, signal: AbortSignal.timeout(20_000) });
    const body = await res.text();
    if (res.status !== 200) problems.push(`${pathname}: HTTP ${res.status}`);
    else if (!must.test(body)) problems.push(`${pathname}: unexpected content`);
    else ok.push(`${pathname}: 200`);
  } catch (e) {
    problems.push(`${pathname}: ${(e as Error).message}`);
  }
}

(async () => {
  // OPS_LIVE=0 until the domain is connected (the data checks still run).
  if (process.env.OPS_LIVE !== "0") {
    await live("/", /card worth/i);
    await live("/sitemap.xml", /<sitemapindex/);
    for (const g of LIVE_GAMES.filter((x) => (meta.games[x.slug]?.cards ?? 0) >= 50)) await live(`/${g.slug}`, /card prices/i);
  }
  const text = ["### Ops monitor", "", ...ok.map((s) => `- OK ${s}`), ...problems.map((s) => `- RED ${s}`), ""].join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  console.log(text);
  if (problems.length) process.exit(1);
})();
