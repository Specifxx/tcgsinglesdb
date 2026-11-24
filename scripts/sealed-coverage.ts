// The sealed coverage check (coverage.yml, after the card audit). For each sealed site, every sealed product TCGplayer lists
// in a recent group of the site's games (src/lib/sealed-coverage.ts) that the site's public data does not name. Report only:
// writes data/coverage/sealed.{json,md} and sealed-state.json (first day each product was seen missing). Never fails the run
// on a source it cannot read: it lists it under errors. Read-only everywhere else.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { TcgcsvGroup, TcgcsvProduct } from "../src/lib/cards";
import { LIVE_GAMES, SITE } from "../src/site.config";
import { FIRST_NEW_ID, ageSealed, medianId, idsInText, isSealedProduct, recentGroup, recentProduct, slugOf } from "../src/lib/sealed-coverage";

const DATA = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SISTERS = process.env.SISTER_DIR || path.join(process.cwd(), "sisters");
const UA = { "User-Agent": `TCGSinglesDB-coverage/1.0 (+${SITE.url})`, Accept: "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errors: string[] = [];
const now = new Date();
const today = now.toISOString().slice(0, 10);

let last = 0;
async function tcgcsv<T>(cat: number, part: string): Promise<T> {
  const wait = last + 250 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  let err: unknown;
  for (const w of [0, 5_000, 20_000]) {
    if (w) await sleep(w);
    try {
      const res = await fetch(`https://tcgcsv.com/tcgplayer/${cat}/${part}`, { headers: UA, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return (await res.json()) as T;
      err = new Error(`HTTP ${res.status}`);
      if (res.status === 404 || res.status === 403) break;
    } catch (e) {
      err = e;
    }
  }
  throw new Error(`${cat}/${part}: ${(err as Error)?.message ?? err}`);
}
function read(file: string): string | null {
  try {
    const buf = fs.readFileSync(file);
    return (file.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
  } catch {
    return null;
  }
}

interface Site {
  site: string;
  /** TCGCSV categories; null: every category the site's catalogue has a set of. */
  categories: number[] | null;
  /** Files whose text names the TCGplayer product ids the site has, and the culled file (slugs the focus dropped). */
  files: string[];
  culled?: string;
  /** Catalogue JSON whose products carry the TCGplayer id as `id`. */
  catalog?: string;
  /** Leave out products under this market price (the site's own focus floor). */
  minUsd?: number;
}
const SITES: Site[] = [
  { site: "DexCompare", categories: [3], files: ["CompareEmpire/apps/dexcompare-sealed/data/public/products.json", "CompareEmpire/apps/dexcompare-sealed/data/public/tcg-market.json"], culled: "CompareEmpire/apps/dexcompare-sealed/data/public/culled.json" },
  { site: "MTG Compare", categories: [1], files: ["mtgcompare/data/public/products.json", "mtgcompare/data/public/tcg-market.json"], culled: "mtgcompare/data/public/culled.json" },
  { site: "YGO Compare", categories: [2], files: [], catalog: "ygocompare/data/public/catalog.json", culled: "ygocompare/data/public/culled.json" },
  { site: "OP Compare", categories: [68], files: [], catalog: "OpCompare-snapshot/sealed.json.gz" },
  { site: "Lorcana Compare", categories: [71], files: [], catalog: "lorcanacompare/data/public/catalog.json", culled: "lorcanacompare/data/public/culled.json" },
  { site: "Gundam Compare", categories: [86], files: [], catalog: "GundamCompare/data/public/catalog.json", culled: "GundamCompare/data/public/culled.json" },
  { site: "Cyberpunk Compare", categories: [92], files: [], catalog: "cyberpunkcompare/data/public/catalog.json", culled: "cyberpunkcompare/data/public/culled.json" },
  { site: "TCG Prices", categories: null, files: [], catalog: "tcgcompare/data/public/catalog.json", culled: "tcgcompare/data/public/culled.json", minUsd: 5 },
];

interface Product { id: number; name: string; group: string; groupId: number; published: string | null; usd: number | null; category: number }

async function recentSealed(category: number, newFrom: number): Promise<{ products: Product[]; groupIds: Set<number>; maxId: number }> {
  const groups = (await tcgcsv<{ results: TcgcsvGroup[] }>(category, "groups")).results ?? [];
  const products: Product[] = [];
  let maxId = 0;
  for (const g of groups.filter((g) => recentGroup(g, now))) {
    try {
      const ps = (await tcgcsv<{ results: TcgcsvProduct[] }>(category, `${g.groupId}/products`)).results ?? [];
      for (const p of ps) maxId = Math.max(maxId, p.productId);
      const median = medianId(ps.map((p) => p.productId));
      const sealed = ps.filter((p) => isSealedProduct(p) && recentProduct(p.productId, g, newFrom, now, 45, 120, median));
      if (!sealed.length) continue;
      const prices = (await tcgcsv<{ results: { productId: number; marketPrice: number | null }[] }>(category, `${g.groupId}/prices`)).results ?? [];
      const usd = new Map<number, number>();
      for (const p of prices) if (p.marketPrice != null) usd.set(p.productId, Math.max(usd.get(p.productId) ?? 0, p.marketPrice));
      for (const p of sealed) products.push({ id: p.productId, name: p.name, group: g.name, groupId: g.groupId, published: g.publishedOn?.slice(0, 10) ?? null, usd: usd.get(p.productId) ?? null, category });
    } catch (e) {
      errors.push(`TCGplayer ${category}/${g.groupId}: ${(e as Error).message}`);
    }
  }
  return { products, groupIds: new Set(groups.map((g) => g.groupId)), maxId };
}

async function main() {
  // "New" is above the highest id the run 14 days ago saw (sealed-ids.json keeps one per day), else FIRST_NEW_ID.
  const idsFile = path.join(DATA, "coverage/sealed-ids.json");
  const idLog = JSON.parse(read(idsFile) ?? "{}") as Record<string, number>;
  const cutoff = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const older = Object.keys(idLog).filter((d) => d <= cutoff).sort();
  const newFrom = older.length ? idLog[older[older.length - 1]] + 1 : FIRST_NEW_ID;
  const cats = new Map<number, { products: Product[]; groupIds: Set<number>; maxId: number }>();
  for (const g of LIVE_GAMES) {
    try {
      cats.set(g.category, await recentSealed(g.category, newFrom));
    } catch (e) {
      errors.push(`TCGplayer ${g.slug}: ${(e as Error).message}`);
    }
  }
  const prevState = JSON.parse(read(path.join(DATA, "coverage/sealed-state.json")) ?? "{}") as Record<string, string>;
  const missingKeys: string[] = [];
  const out: { site: string; checked: number; missing: (Product & { since?: string })[]; culled: number; unread?: boolean }[] = [];
  for (const s of SITES) {
    const have = new Set<number>();
    let setIds = new Set<number>();
    let readable = false;
    for (const f of s.files) {
      const t = read(path.join(SISTERS, f));
      if (t) {
        readable = true;
        for (const id of idsInText(t)) have.add(id);
        if (f.endsWith("tcg-market.json")) for (const k of Object.keys((JSON.parse(t) as { prices?: Record<string, number> }).prices ?? {})) have.add(Number(k));
      }
    }
    if (s.catalog) {
      const t = read(path.join(SISTERS, s.catalog));
      if (t) {
        readable = true;
        const c = JSON.parse(t) as { products?: { id: number; setId?: number }[]; sets?: { id: number }[] } | { id: number; setId?: number }[];
        const list = Array.isArray(c) ? c : c.products ?? [];
        for (const p of list) have.add(p.id);
        setIds = new Set([...(Array.isArray(c) ? [] : (c.sets ?? []).map((x) => x.id)), ...list.map((p) => p.setId ?? 0)]);
        for (const id of idsInText(t)) have.add(id);
      }
    }
    if (!readable) {
      errors.push(`${s.site}: its data is not checked out`);
      out.push({ site: s.site, checked: 0, missing: [], culled: 0, unread: true });
      continue;
    }
    const culled = new Set(Object.keys(JSON.parse((s.culled && read(path.join(SISTERS, s.culled))) || "{}") as Record<string, unknown>));
    const categories = s.categories ?? [...cats.keys()].filter((c) => [...(cats.get(c)?.groupIds ?? [])].some((g) => setIds.has(g)));
    const pool = categories.flatMap((c) => cats.get(c)?.products ?? []).filter((p) => s.minUsd == null || (p.usd ?? 0) >= s.minUsd);
    let culledN = 0;
    const missing: (Product & { since?: string })[] = [];
    for (const p of pool) {
      if (have.has(p.id)) continue;
      if (culled.has(slugOf(p.name)) || [...culled].some((k) => k.startsWith(`${slugOf(p.name)}-`))) {
        culledN++;
        continue;
      }
      const key = `${s.site}|${p.id}`;
      missingKeys.push(key);
      missing.push({ ...p, since: prevState[key] ?? today });
    }
    missing.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
    out.push({ site: s.site, checked: pool.length, missing, culled: culledN });
  }
  const state = ageSealed(prevState, missingKeys, today);
  const maxId = Math.max(0, ...[...cats.values()].map((c) => c.maxId));
  if (maxId) idLog[today] = maxId;
  const keep = Object.keys(idLog).sort().slice(-40);
  const dir = path.join(DATA, "coverage");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "sealed-state.json"), JSON.stringify(state, null, 0) + "\n");
  fs.writeFileSync(idsFile, JSON.stringify(Object.fromEntries(keep.map((k) => [k, idLog[k]])), null, 1) + "\n");
  fs.writeFileSync(path.join(dir, "sealed.json"), JSON.stringify({ generatedAt: now.toISOString(), sites: out, errors }, null, 1) + "\n");
  const days = (since?: string) => (since ? Math.round((Date.parse(today) - Date.parse(since)) / 86_400_000) : 0);
  const md: string[] = [
    `# Sealed coverage (${now.toISOString().slice(0, 16).replace("T", " ")} UTC)`,
    "",
    `Sealed products TCGplayer added lately (a group published in the last 45 or next 120 days, or a product id from ${newFrom}, the newest id of 14 days ago) that a site's public data does not name. Report only: the site's own focus rules decide what keeps a page, so each line is a lead, and a product missing for under two days is still the import's to pick up. TCG Prices is checked from US$5 (its focus floor).`,
    "",
    "| Site | Recent sealed products | Missing | Missing 2+ days | Culled by the site's focus |",
    "|---|---:|---:|---:|---:|",
    ...out.map((s) => (s.unread ? `| ${s.site} | not read | | | |` : `| ${s.site} | ${s.checked} | ${s.missing.length} | ${s.missing.filter((m) => days(m.since) >= 2).length} | ${s.culled} |`)),
    "",
  ];
  for (const s of out) {
    if (!s.missing.length) continue;
    md.push(`## ${s.site}: ${s.missing.length} missing`, "");
    for (const m of s.missing.slice(0, 80)) md.push(`- ${m.id} ${m.name} (${m.group}${m.published ? `, ${m.published}` : ""}) ${m.usd != null ? `US$${m.usd.toFixed(2)}` : "no price"}; missing since ${m.since}`);
    if (s.missing.length > 80) md.push(`- … and ${s.missing.length - 80} more (sealed.json)`);
    md.push("");
  }
  if (errors.length) md.push("## Could not read", "", ...errors.map((e) => `- ${e}`), "");
  fs.writeFileSync(path.join(dir, "sealed.md"), md.join("\n"));
  console.log(md.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(0);
});
