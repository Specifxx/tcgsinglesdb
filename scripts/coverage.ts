// The card coverage guard (coverage.yml). Compares, per game:
//   1. TCGplayer's catalogue (TCGCSV groups + products, cards by cardsOfGroup's rule) with this site's cards,
//   2. the same with the sister site that covers the game (checked out beside this repo under SISTER_DIR, public data only),
//   3. independent card databases with what we have: Scryfall (Magic, set sizes by TCGplayer group id), YGOPRODeck
//      (Yu-Gi-Oh!, set codes), pokemontcg.io (Pokémon, set sizes by name), Lorcast (Lorcana, cards by TCGplayer id) and
//      OPTCG API (One Piece, card numbers incl. promos).
// COVERAGE_MODE=full (Mondays) reads every group and every source; release (daily) reads only the groups TCGplayer
// published in the last 21 days or dates in the next 45 (the release calendar), so a new set is checked the day it lands.
// Writes data/coverage/{report,release}.json and .md. Never fails on a source it cannot read: that source is listed in
// `errors` and the ops monitor shows it. Read-only everywhere: it changes no card file.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { cardsOfGroup, skipGroup, type SetFile, type SetsFile, type TcgcsvGroup, type TcgcsvPrice, type TcgcsvProduct } from "../src/lib/cards";
import { LIVE_GAMES, SITE, type Game } from "../src/site.config";
import { groupGaps, inReleaseWindow, isShort, setKey, ygoPrefix, type ExternalGap, type SiteGaps } from "../src/lib/coverage";

const MODE = process.env.COVERAGE_MODE === "release" || process.env.COVERAGE_MODE === "full" ? process.env.COVERAGE_MODE : new Date().getUTCDay() === 1 ? "full" : "release";
const DATA = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SISTERS = process.env.SISTER_DIR || path.join(process.cwd(), "sisters");
const UA = { "User-Agent": `TCGSinglesDB-coverage/1.0 (+${SITE.url})`, Accept: "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errors: string[] = [];
const now = new Date();

let lastTcgcsv = 0;
async function getJson<T>(url: string, gap = 0): Promise<T> {
  if (gap) {
    const wait = lastTcgcsv + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastTcgcsv = Date.now();
  }
  let last: unknown;
  for (const wait of [0, 5_000, 20_000]) {
    if (wait) await sleep(wait);
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return (await res.json()) as T;
      last = new Error(`HTTP ${res.status}`);
      if (res.status === 404 || res.status === 403) break;
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`${url}: ${(last as Error)?.message ?? last}`);
}
const tcgcsv = <T>(cat: number, part: string) => getJson<T>(`https://tcgcsv.com/tcgplayer/${cat}/${part}`, 250);
const readJson = <T>(file: string, fallback: T): T => {
  try {
    const buf = fs.readFileSync(file);
    return JSON.parse((file.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8")) as T;
  } catch {
    return fallback;
  }
};

// ─── Our cards and the sisters' ───────────────────────────────────────────────

interface Ours {
  ids: Set<number>;
  byGroup: Map<number, Set<number>>;
  numbers: Map<string, number>;
}
function ourCards(game: Game): Ours {
  const dir = path.join(DATA, "cards", game.slug);
  const sets = readJson<SetsFile>(path.join(dir, "sets.json"), { sets: [] } as unknown as SetsFile).sets ?? [];
  const ids = new Set<number>();
  const byGroup = new Map<number, Set<number>>();
  const numbers = new Map<string, number>();
  for (const s of sets) {
    const file = readJson<SetFile>(path.join(dir, "sets", `${s.slug}.json`), { slug: s.slug, cards: [] });
    const g = new Set<number>();
    for (const c of file.cards) {
      ids.add(c.id);
      g.add(c.id);
      if (c.no) numbers.set(c.no.toUpperCase(), (numbers.get(c.no.toUpperCase()) ?? 0) + 1);
    }
    byGroup.set(s.groupId, g);
  }
  return { ids, byGroup, numbers };
}

/** The sister site covering a game, its card ids (null: its data is not checked out), and its price floor. */
interface Sister {
  site: string;
  ids: () => Set<number> | null;
  floorCents?: number;
}
const catalogIds = (repo: string) => () => {
  const c = readJson<{ products: { id: number; kind: string }[] } | null>(path.join(SISTERS, repo, "data/public/catalog.json"), null);
  return c ? new Set(c.products.filter((p) => p.kind === "card").map((p) => p.id)) : null;
};
const SISTER_OF: Record<string, Sister> = {
  "one-piece": {
    site: "OP Compare",
    ids: () => {
      const c = readJson<Record<string, { id: number }> | null>(path.join(SISTERS, "OpCompare-snapshot/cards.json.gz"), null);
      return c ? new Set(Object.values(c).map((x) => x.id)) : null;
    },
  },
  magic: {
    site: "MTG Compare",
    ids: () => {
      const dir = path.join(SISTERS, "mtgcompare/data/cards/sets");
      if (!fs.existsSync(dir)) return null;
      const out = new Set<number>();
      for (const f of fs.readdirSync(dir)) for (const c of readJson<SetFile>(path.join(dir, f), { slug: "", cards: [] }).cards) out.add(c.id);
      return out;
    },
  },
  lorcana: { site: "Lorcana Compare", ids: catalogIds("lorcanacompare"), floorCents: 100 },
  gundam: { site: "Gundam Compare", ids: catalogIds("GundamCompare"), floorCents: 100 },
  cyberpunk: { site: "Cyberpunk Compare", ids: catalogIds("cyberpunkcompare"), floorCents: 100 },
};

// ─── TCGplayer ────────────────────────────────────────────────────────────────

interface TcgGroupCards {
  name: string;
  abbr: string | null;
  released: string | null;
  ids: number[];
  numbers: string[];
  skipped: boolean;
}
async function tcgCards(game: Game, withPrices: boolean): Promise<{ groups: Map<number, TcgGroupCards>; cheap: Set<number>; all: TcgcsvGroup[] }> {
  const all = (await tcgcsv<{ results: TcgcsvGroup[] }>(game.category, "groups")).results ?? [];
  const ours = new Set(readJson<SetsFile>(path.join(DATA, "cards", game.slug, "sets.json"), { sets: [] } as unknown as SetsFile).sets?.map((s) => s.groupId) ?? []);
  const pick = MODE === "full" ? all : all.filter((g) => inReleaseWindow(g.publishedOn, now) || !ours.has(g.groupId));
  const groups = new Map<number, TcgGroupCards>();
  const cheap = new Set<number>();
  for (const g of pick) {
    try {
      const products = (await tcgcsv<{ results: TcgcsvProduct[] }>(game.category, `${g.groupId}/products`)).results ?? [];
      const prices = withPrices ? (await tcgcsv<{ results: (TcgcsvPrice & { lowPrice?: number | null; midPrice?: number | null })[] }>(game.category, `${g.groupId}/prices`)).results ?? [] : [];
      const cards = cardsOfGroup(products, []);
      if (withPrices) {
        const best = new Map<number, number>();
        for (const p of prices) best.set(p.productId, Math.max(best.get(p.productId) ?? 0, Math.round(100 * (p.marketPrice ?? p.midPrice ?? p.lowPrice ?? 0))));
        for (const c of cards) if ((best.get(c.id) ?? 0) < 100) cheap.add(c.id);
      }
      groups.set(g.groupId, {
        name: g.name,
        abbr: g.abbreviation ?? null,
        released: g.publishedOn ? g.publishedOn.slice(0, 10) : null,
        ids: cards.map((c) => c.id),
        numbers: cards.map((c) => c.no.toUpperCase()).filter(Boolean),
        skipped: skipGroup(g),
      });
    } catch (e) {
      errors.push(`${game.name} / ${g.name}: ${(e as Error).message}`);
    }
  }
  return { groups, cheap, all };
}

/** Cards a sister's US$1 floor leaves out by design: under the floor in a group older than 120 days. */
function floorExcused(groups: Map<number, TcgGroupCards>, cheap: Set<number>): Set<number> {
  const out = new Set<number>();
  for (const g of groups.values()) {
    const fresh = !g.released || now.getTime() - Date.parse(g.released) < 120 * 86_400_000;
    if (!fresh) for (const id of g.ids) if (cheap.has(id)) out.add(id);
  }
  return out;
}

// ─── Independent card databases (full mode) ───────────────────────────────────

async function scryfall(groups: Map<number, TcgGroupCards>, ours: Ours): Promise<ExternalGap[]> {
  const out: ExternalGap[] = [];
  const sets = (await getJson<{ data: { code: string; name: string; set_type: string; card_count: number; digital: boolean; released_at?: string; tcgplayer_id?: number; parent_set_code?: string }[] }>("https://api.scryfall.com/sets")).data;
  const IGNORE = new Set(["token", "memorabilia", "minigame", "alchemy", "treasure_chest", "vanguard"]);
  for (const s of sets) {
    if (s.digital || IGNORE.has(s.set_type) || s.card_count < 1) continue;
    if (s.released_at && Date.parse(s.released_at) > now.getTime() + 45 * 86_400_000) continue;
    const have = s.tcgplayer_id ? ours.byGroup.get(s.tcgplayer_id)?.size ?? 0 : 0;
    const tcgHas = s.tcgplayer_id ? groups.get(s.tcgplayer_id)?.ids.length ?? null : null;
    if (!s.tcgplayer_id) {
      out.push({ source: "Scryfall", game: "magic", set: s.name, code: s.code.toUpperCase(), released: s.released_at ?? null, expected: s.card_count, ours: 0, note: `no TCGplayer group (${s.set_type})` });
    } else if (isShort(s.card_count, have)) {
      out.push({ source: "Scryfall", game: "magic", set: s.name, code: s.code.toUpperCase(), released: s.released_at ?? null, expected: s.card_count, ours: have, note: tcgHas == null ? "TCGplayer group not read" : `TCGplayer lists ${tcgHas}` });
    }
  }
  return out;
}

async function ygoprodeck(ours: Ours, groups: Map<number, TcgGroupCards>): Promise<ExternalGap[]> {
  const sets = await getJson<{ set_name: string; set_code: string; num_of_cards: number; tcg_date?: string }[]>("https://db.ygoprodeck.com/api/v7/cardsets.php");
  const have = new Map<string, number>();
  for (const [no, n] of ours.numbers) {
    const p = ygoPrefix(no);
    if (p) have.set(p, (have.get(p) ?? 0) + n);
  }
  const tcgHave = new Map<string, number>();
  for (const g of groups.values()) for (const no of g.numbers) {
    const p = ygoPrefix(no);
    if (p) tcgHave.set(p, (tcgHave.get(p) ?? 0) + 1);
  }
  const out: ExternalGap[] = [];
  for (const s of sets) {
    if (!s.set_code || !(s.num_of_cards > 0)) continue;
    if (s.tcg_date && Date.parse(s.tcg_date) > now.getTime() + 45 * 86_400_000) continue;
    const code = s.set_code.toUpperCase();
    const n = have.get(code) ?? 0;
    if (isShort(s.num_of_cards, n)) out.push({ source: "YGOPRODeck", game: "yugioh", set: s.set_name, code, released: s.tcg_date ?? null, expected: s.num_of_cards, ours: n, note: `TCGplayer lists ${tcgHave.get(code) ?? 0}` });
  }
  return out;
}

async function pokemontcg(groups: Map<number, TcgGroupCards>, ours: Ours): Promise<ExternalGap[]> {
  const sets = (await getJson<{ data: { id: string; name: string; series: string; total: number; printedTotal: number; releaseDate?: string; ptcgoCode?: string }[] }>("https://api.pokemontcg.io/v2/sets?pageSize=250")).data;
  const byKey = new Map<string, number[]>();
  for (const [id, g] of groups) {
    const k = setKey(g.name);
    byKey.set(k, [...(byKey.get(k) ?? []), id]);
  }
  const out: ExternalGap[] = [];
  for (const s of sets) {
    const ids = byKey.get(setKey(s.name)) ?? [];
    const n = ids.reduce((sum, id) => sum + (ours.byGroup.get(id)?.size ?? 0), 0);
    const tcgN = ids.reduce((sum, id) => sum + (groups.get(id)?.ids.length ?? 0), 0);
    const released = s.releaseDate ? s.releaseDate.replace(/\//g, "-") : null;
    if (!ids.length) out.push({ source: "pokemontcg.io", game: "pokemon", set: s.name, code: s.ptcgoCode ?? s.id, released, expected: s.total, ours: 0, note: `no TCGplayer group of the same name (${s.series})` });
    else if (isShort(s.total, n)) out.push({ source: "pokemontcg.io", game: "pokemon", set: s.name, code: s.ptcgoCode ?? s.id, released, expected: s.total, ours: n, note: `TCGplayer lists ${tcgN}` });
  }
  return out;
}

async function lorcast(ours: Ours, groups: Map<number, TcgGroupCards>): Promise<{ gaps: ExternalGap[]; notOnTcgplayer: number }> {
  const sets = (await getJson<{ results: { id: string; code: string; name: string; released_at?: string }[] }>("https://api.lorcast.com/v0/sets")).results;
  const tcgIds = new Set([...groups.values()].flatMap((g) => g.ids));
  const out: ExternalGap[] = [];
  let notOnTcgplayer = 0;
  for (const s of sets) {
    await sleep(120);
    let cards: { tcgplayer_id?: number | null; name: string; collector_number: string }[];
    try {
      cards = await getJson(`https://api.lorcast.com/v0/sets/${encodeURIComponent(s.id)}/cards`);
    } catch (e) {
      errors.push(`Lorcast ${s.name}: ${(e as Error).message}`);
      continue;
    }
    const withId = cards.filter((c) => c.tcgplayer_id);
    const lack = withId.filter((c) => !ours.ids.has(c.tcgplayer_id!));
    notOnTcgplayer += cards.length - withId.length;
    if (lack.length || cards.length - withId.length >= 3)
      out.push({
        source: "Lorcast",
        game: "lorcana",
        set: s.name,
        code: s.code,
        released: s.released_at ?? null,
        expected: cards.length,
        ours: withId.length - lack.length,
        note: `${lack.length} with a TCGplayer id we lack${lack.length ? ` (${lack.slice(0, 8).map((c) => `${c.collector_number} ${c.name}${tcgIds.has(c.tcgplayer_id!) ? "" : " [not in TCGCSV]"}`).join("; ")})` : ""}; ${cards.length - withId.length} with no TCGplayer id`,
      });
  }
  return { gaps: out, notOnTcgplayer };
}

async function optcg(ours: Ours): Promise<ExternalGap[]> {
  const urls = ["allSetCards", "allSTCards", "allPromoCards"].map((u) => `https://optcgapi.com/api/${u}/`);
  const cards: { card_set_id?: string; card_image_id?: string; set_name?: string; set_id?: string }[] = [];
  for (const u of urls) {
    try {
      const got = await getJson<unknown>(u);
      if (Array.isArray(got)) cards.push(...(got as typeof cards));
      else errors.push(`OPTCG API ${u}: not a list`);
    } catch (e) {
      errors.push(`OPTCG API ${u}: ${(e as Error).message}`);
    }
    await sleep(500);
  }
  // Per set: card numbers (and printings: one image id each) the source lists vs the printings we have of those numbers.
  const bySet = new Map<string, { name: string; numbers: Map<string, number> }>();
  for (const c of cards) {
    const no = (c.card_set_id ?? "").trim().toUpperCase();
    if (!no) continue;
    const key = no.replace(/-\d+$/, "") || "?";
    const s = bySet.get(key) ?? { name: c.set_name ?? key, numbers: new Map() };
    s.numbers.set(no, (s.numbers.get(no) ?? 0) + 1);
    bySet.set(key, s);
  }
  const out: ExternalGap[] = [];
  for (const [code, s] of bySet) {
    let expected = 0;
    let have = 0;
    const lackNumbers: string[] = [];
    for (const [no, n] of s.numbers) {
      expected += n;
      const ourN = ours.numbers.get(no) ?? 0;
      have += Math.min(n, ourN);
      if (!ourN) lackNumbers.push(no);
    }
    if (lackNumbers.length || isShort(expected, have))
      out.push({ source: "OPTCG API", game: "one-piece", set: s.name, code, released: null, expected, ours: have, note: lackNumbers.length ? `numbers we lack: ${lackNumbers.slice(0, 15).join(", ")}${lackNumbers.length > 15 ? ` (+${lackNumbers.length - 15})` : ""}` : "fewer printings than listed" });
  }
  return out;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const only = (process.env.COVERAGE_GAMES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const games = LIVE_GAMES.filter((g) => !only.length || only.includes(g.slug));
  const sites: SiteGaps[] = [];
  const external: ExternalGap[] = [];
  const skippedGroups: { game: string; group: string; cards: number }[] = [];
  const counts: Record<string, { tcg: number; ours: number; sister?: { site: string; cards: number } }> = {};

  for (const game of games) {
    const sister = SISTER_OF[game.slug];
    let tcg: Awaited<ReturnType<typeof tcgCards>>;
    try {
      tcg = await tcgCards(game, !!sister?.floorCents);
    } catch (e) {
      errors.push(`${game.name}: groups list: ${(e as Error).message}`);
      continue;
    }
    const kept = new Map([...tcg.groups].filter(([, g]) => !g.skipped && g.ids.length));
    for (const g of tcg.groups.values()) if (g.skipped && g.ids.length) skippedGroups.push({ game: game.slug, group: g.name, cards: g.ids.length });
    const ours = ourCards(game);
    const mine = groupGaps(kept, ours.ids);
    sites.push({ site: SITE.name, game: game.slug, tcgCards: mine.tcgCards, ourCards: ours.ids.size, missing: mine.missing, byFloor: 0, groups: mine.groups });
    counts[game.slug] = { tcg: mine.tcgCards, ours: ours.ids.size };
    if (sister) {
      const ids = sister.ids();
      if (!ids) errors.push(`${sister.site}: data not checked out`);
      else {
        const s = groupGaps(kept, ids, sister.floorCents ? floorExcused(kept, tcg.cheap) : new Set());
        sites.push({ site: sister.site, game: game.slug, tcgCards: s.tcgCards, ourCards: ids.size, missing: s.missing, byFloor: s.byFloor, groups: s.groups });
        counts[game.slug].sister = { site: sister.site, cards: ids.size };
      }
    }
    if (MODE !== "full") continue;
    const ext: Record<string, () => Promise<ExternalGap[]>> = {
      magic: () => scryfall(tcg.groups, ours),
      yugioh: () => ygoprodeck(ours, tcg.groups),
      pokemon: () => pokemontcg(tcg.groups, ours),
      lorcana: async () => (await lorcast(ours, tcg.groups)).gaps,
      "one-piece": () => optcg(ours),
    };
    if (ext[game.slug])
      try {
        external.push(...(await ext[game.slug]()));
      } catch (e) {
        errors.push(`${game.name} independent list: ${(e as Error).message}`);
      }
    console.log(`${game.name}: TCGplayer ${mine.tcgCards}, ours ${ours.ids.size}, missing ${mine.missing}`);
  }

  const report = { generatedAt: now.toISOString(), mode: MODE, counts, sites, external, skippedGroups, errors };
  const dir = path.join(DATA, "coverage");
  fs.mkdirSync(dir, { recursive: true });
  const base = MODE === "full" ? "report" : "release";
  fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify(report, null, 1) + "\n");
  const md = markdown(report);
  fs.writeFileSync(path.join(dir, `${base}.md`), md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);
}

function markdown(r: { generatedAt: string; mode: string; sites: SiteGaps[]; external: ExternalGap[]; skippedGroups: { game: string; group: string; cards: number }[]; errors: string[] }): string {
  const L: string[] = [`# Card coverage (${r.mode}, ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC)`, ""];
  L.push("## Against TCGplayer's catalogue", "", "| Site | Game | TCGplayer cards | Our cards | Missing | Left out by the US$1 floor |", "|---|---|---:|---:|---:|---:|");
  for (const s of r.sites) L.push(`| ${s.site} | ${s.game} | ${s.tcgCards} | ${s.ourCards} | ${s.missing} | ${s.byFloor || ""} |`);
  L.push("");
  for (const s of r.sites.filter((x) => x.missing))
    L.push(`### ${s.site} / ${s.game}: ${s.missing} missing`, "", ...s.groups.slice(0, 25).map((g) => `- ${g.name} (${g.released ?? "no date"}): ${g.ours} of ${g.tcg}; e.g. ${g.missing.slice(0, 6).join(", ")}`), "");
  if (r.external.length) {
    L.push("## Against independent card databases", "", "| Source | Game | Set | Code | Released | Listed | Ours | Note |", "|---|---|---|---|---|---:|---:|---|");
    for (const e of r.external) L.push(`| ${e.source} | ${e.game} | ${e.set} | ${e.code ?? ""} | ${e.released ?? ""} | ${e.expected} | ${e.ours} | ${e.note.replace(/\|/g, "/")} |`);
    L.push("");
  }
  if (r.skippedGroups.length) L.push("## Groups skipped on purpose (tokens, art series, supplies)", "", ...r.skippedGroups.map((g) => `- ${g.game}: ${g.group} (${g.cards})`), "");
  if (r.errors.length) L.push("## Could not read", "", ...r.errors.slice(0, 50).map((e) => `- ${e}`), "");
  return L.join("\n") + "\n";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
