import { indexFiles, indexXml } from "@/lib/sitemap";
import { readMeta, shownGame, shownGames } from "@/lib/store";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";
export function GET() {
  const meta = readMeta();
  const files = indexFiles(shownGames().map((g) => ({ slug: g.slug, indexed: meta.games[g.slug]?.indexed ?? 0 })));
  return new Response(indexXml(SITE.url, files), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
