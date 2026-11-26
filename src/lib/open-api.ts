// The open card API (2026-11-26, owner: a collection app "better than Collectr" on TCG Prices). Our own sister sites read
// cards and TCGplayer market prices from here in the visitor's browser, so a collection can hold single cards of every game
// without a second copy of the catalogue anywhere. Public data only (the same as every card page), read-only, CORS-open,
// and cached by Vercel's CDN for a day like the pages (the data changes once a day, with the release). Nothing is stored,
// no cookie or header is read, and no route here may ever take a body.
import type { CardRow, CardSet, Point } from "./cards";

export const OPEN_CACHE = "public, s-maxage=86400, stale-while-revalidate=86400";

export function openHeaders(cdn = OPEN_CACHE): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET",
    "Vercel-CDN-Cache-Control": cdn,
    "Cache-Control": "public, max-age=3600",
    "X-Robots-Tag": "noindex",
  };
}

export const openJson = (body: unknown, status = 200, cdn = OPEN_CACHE) => Response.json(body, { status, headers: openHeaders(cdn) });

/** One card as the open API sends it: the catalogue's own fields, nothing derived or private. */
export interface OpenCard {
  id: number;
  s: string;
  n: string;
  no: string;
  r: string | null;
  /** TCGplayer market price in US cents per printing ("Normal", "Holofoil"…); a printing with no price is left out. */
  p: Record<string, number>;
}

export function openCard(c: CardRow): OpenCard {
  const p: Record<string, number> = {};
  for (const [k, v] of Object.entries(c.p ?? {})) if (typeof v === "number" && v > 0) p[k] = v;
  return { id: c.id, s: c.s, n: c.n, no: c.no, r: c.r, p };
}

export function openSet(s: CardSet) {
  return { slug: s.slug, name: s.name, abbr: s.abbr, released: s.released, cards: s.cards };
}

/** Only the asked ids of a set's history (at most 200), so a collection never downloads a whole set's past. */
export function pickHistory(file: Record<string, Point[]>, ids: readonly number[]): Record<string, Point[]> {
  const out: Record<string, Point[]> = {};
  for (const id of ids.slice(0, 200)) {
    const h = file[String(id)];
    if (Array.isArray(h) && h.length) out[String(id)] = h;
  }
  return out;
}

/** "12,34,56" -> [12, 34, 56]: whole positive ids only, sorted and unique (so one collection's ask is one cache key). */
export function parseIds(raw: string | null): number[] {
  const ids = new Set<number>();
  for (const t of (raw ?? "").split(",")) {
    const n = Number(t);
    if (Number.isInteger(n) && n > 0 && n < 1e9) ids.add(n);
  }
  return [...ids].sort((a, b) => a - b).slice(0, 200);
}
