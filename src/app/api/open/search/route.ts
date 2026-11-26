import { searchAll } from "@/lib/search";
import { readSets } from "@/lib/store";
import { cardImage } from "@/lib/format";
import { openJson } from "@/lib/open-api";

export const dynamic = "force-dynamic";

// Card search for our sister sites' collection apps (lib/open-api.ts). The CDN keeps each query a day (the data changes once a day; next.config.js's page rule matches this path too); the app asks
// only after a pause in typing.
export function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const q = (u.get("q") ?? "").slice(0, 80);
  const game = (u.get("game") ?? "").replace(/[^a-z0-9-]/g, "") || null;
  const { hits, total } = searchAll(q, game, 12);
  const names = new Map<string, Map<string, string>>();
  const setName = (g: string, s: string) => {
    if (!names.has(g)) names.set(g, new Map(readSets(g).sets.map((x) => [x.slug, x.name])));
    return names.get(g)!.get(s) ?? s;
  };
  return openJson({ total, hits: hits.map((h) => ({ game: h.game, set: h.set, setName: setName(h.game, h.set), s: h.s, n: h.n, no: h.no, v: h.v, id: h.id, img: cardImage(h.id) })) });
}
