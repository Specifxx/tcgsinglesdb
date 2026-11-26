import { gameBySlug } from "@/site.config";
import { readSet, setBySlug } from "@/lib/store";
import { openCard, openJson, openSet } from "@/lib/open-api";

export const dynamic = "force-dynamic";

// One set's cards with today's TCGplayer market prices: what a collection app values its cards with (lib/open-api.ts).
export function GET(_req: Request, { params }: { params: { game: string; set: string } }) {
  const set = gameBySlug(params.game) ? setBySlug(params.game, params.set) : null;
  if (!set) return openJson({ error: "unknown set" }, 404);
  return openJson({ game: params.game, set: openSet(set), cards: readSet(params.game, set.slug).map(openCard) });
}
