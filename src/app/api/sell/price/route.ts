import { gameBySlug } from "@/site.config";
import { readBuylist, readSearch, readSet, readSets } from "@/lib/store";
import { searchCards, type SearchRow } from "@/lib/cards";
import { idAgrees, MAX_LINES, MAX_QTY } from "@/lib/sell";

export const dynamic = "force-dynamic";

// The Sell desk's lookup (DECISIONS.md 2026-11-24): POST { game, lines: [{ q, name?, id? }] } -> for each line the card it
// names (sure), the printings it could be (pick: the seller chooses), or nothing. Reads only the committed card and buylist
// files; nothing a seller sends is stored or logged. Fees and routes are worked out in the browser (lib/sell.ts).
const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
const PICK_MAX = 6;

const numberTokens = (q: string) => q.split(" ").filter((t) => /\d/.test(t) && /^[a-z0-9/-]+$/i.test(t));
/** "002/102" and "2/102" read alike: each part loses its leading zeros. */
const numKey = (no: string) => no.toLowerCase().split(/([/-])/).map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p)).join("");
function numberVariants(q: string): string[] {
  const out = [q];
  for (const t of numberTokens(q)) {
    const m = t.match(/^(\d+)\/(\d+)$/);
    if (!m) continue;
    const width = m[2].length;
    const padded = `${m[1].padStart(width, "0")}/${m[2]}`;
    const bare = `${Number(m[1])}/${m[2]}`;
    for (const v of [padded, bare]) if (v !== t) out.push(q.replace(t, v));
  }
  return out;
}

const byId = new Map<string, Map<number, SearchRow>>();
function idIndex(game: string): Map<number, SearchRow> {
  let m = byId.get(game);
  if (!m) {
    m = new Map(readSearch(game).map((r) => [r[6], r]));
    byId.set(game, m);
  }
  return m;
}

function card(game: string, setNames: Map<string, string>, row: SearchRow) {
  const [set, s, n, no, , , id] = row;
  const full = readSet(game, set).find((c) => c.id === id);
  const cash: Record<string, number> = {};
  for (const [, printing, cents] of readBuylist(game, set)[s] ?? []) if (!(printing in cash)) cash[printing] = cents;
  return { id, set, setName: setNames.get(set) ?? set, s, n, no, prices: full?.p ?? {}, cash };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { game?: unknown; lines?: unknown } | null;
  const game = typeof body?.game === "string" ? gameBySlug(body.game) : null;
  const lines = Array.isArray(body?.lines) ? body.lines.slice(0, MAX_LINES) : null;
  if (!game || !lines) return Response.json({ error: "Pick a game and paste your list again." }, { status: 400, headers: NO_STORE });
  const sets = readSets(game.slug).sets;
  const setInfo = new Map(sets.map((s) => [s.slug, { name: s.name, abbr: s.abbr }]));
  const setNames = new Map(sets.map((s) => [s.slug, s.name]));
  const rows = readSearch(game.slug);
  const results = lines.map((raw) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const q = typeof l.q === "string" ? l.q.slice(0, 160) : "";
    const name = typeof l.name === "string" ? l.name.slice(0, 120) : undefined;
    const id = typeof l.id === "number" && Number.isInteger(l.id) ? l.id : null;
    if (id) {
      const r = idIndex(game.slug).get(id);
      if (r && idAgrees(r[2], name)) return { kind: "sure" as const, cards: [card(game.slug, setNames, r)] };
    }
    if (q.length < 2) return { kind: "none" as const, cards: [] };
    // A printed number with its leading zeros dropped or added ("2/102" and "002/102") is the same number: search both ways,
    // so a reprint that prints it differently still shows up as a choice instead of hiding behind a "sure" match.
    const index = idIndex(game.slug);
    const found = new Map<number, SearchRow>();
    let total = 0;
    for (const variant of numberVariants(q)) {
      const r = searchCards(rows, setInfo, variant, PICK_MAX);
      for (const h of r.hits) {
        const row = index.get(h.id);
        if (row && !found.has(h.id)) {
          found.set(h.id, row);
          if (variant !== q) total++;
        }
      }
      if (variant === q) total += r.total;
    }
    if (!found.size) return { kind: "none" as const, cards: [] };
    // A line that names a printed number ("Pikachu 025/165") is settled when exactly one candidate carries that number;
    // when several do (a reprint, a stamped promo), those come first in the choice.
    const nums = new Set(numberTokens(q).map(numKey));
    const all = [...found.values()];
    const byNumber = all.filter((r) => r[3] && nums.has(numKey(r[3])));
    if (byNumber.length === 1) return { kind: "sure" as const, total: 1, cards: [card(game.slug, setNames, byNumber[0])] };
    const list = (byNumber.length ? [...byNumber, ...all.filter((r) => !byNumber.includes(r))] : all).slice(0, PICK_MAX);
    return { kind: total === 1 && found.size === 1 ? ("sure" as const) : ("pick" as const), total, cards: list.map((r) => card(game.slug, setNames, r)) };
  });
  return Response.json({ results, maxQty: MAX_QTY }, { headers: NO_STORE });
}
