import { gameBySlug } from "@/site.config";
import { readSets } from "@/lib/store";
import { openJson, openSet } from "@/lib/open-api";

export const dynamic = "force-dynamic";

// A game's sets, for a collection import that matches a spreadsheet row by set name and number (lib/open-api.ts).
export function GET(_req: Request, { params }: { params: { game: string } }) {
  const g = gameBySlug(params.game);
  if (!g) return openJson({ error: "unknown game" }, 404);
  return openJson({ game: g.slug, name: g.name, sets: readSets(g.slug).sets.map(openSet) });
}
