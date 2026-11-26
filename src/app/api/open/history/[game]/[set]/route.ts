import { gameBySlug } from "@/site.config";
import { readHistory, setBySlug } from "@/lib/store";
import { openJson, parseIds, pickHistory } from "@/lib/open-api";
import type { Point } from "@/lib/cards";

export const dynamic = "force-dynamic";

// Price history (TCGplayer market, US cents, day numbers since 2026-01-01) for the asked cards of one set: the collection
// chart. ?ids=1,2,3 (at most 200, sorted by the app so one collection is one cache key).
export async function GET(req: Request, { params }: { params: { game: string; set: string } }) {
  const set = gameBySlug(params.game) ? setBySlug(params.game, params.set) : null;
  if (!set) return openJson({ error: "unknown set" }, 404);
  const ids = parseIds(new URL(req.url).searchParams.get("ids"));
  const file: Record<string, Point[]> = {};
  for (const id of ids) file[String(id)] = await readHistory(params.game, set.slug, id);
  return openJson({ epoch: "2026-01-01", history: pickHistory(file, ids) });
}
