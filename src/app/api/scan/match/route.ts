import { gameBySlug } from "@/site.config";
import { readSet } from "@/lib/store";
import { scanCatalog } from "@/lib/scan/catalog";
import { matchScan, printingFor, type ScanReading } from "@/lib/scan/match";

export const dynamic = "force-dynamic";

// The scanner's match (DECISIONS.md 2026-11-20 "Card scanner"): POST { game, reading } (what Rift read off the photo) ->
// the matching card, or the look-alike printings to pick from, with today's TCGplayer prices. Reads only the committed card
// files; no photo ever reaches this route, and nothing is stored.
const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

function clean(r: unknown): ScanReading | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
  return {
    isTradingCard: o.isTradingCard === true,
    game: str(o.game),
    name: str(o.name),
    setCode: str(o.setCode),
    collectorNumber: str(o.collectorNumber),
    promoStamp: o.promoStamp === true,
    language: str(o.language),
    firstEdition: o.firstEdition === true,
  };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { game?: unknown; reading?: unknown } | null;
  const game = typeof body?.game === "string" ? gameBySlug(body.game) : null;
  const reading = clean(body?.reading);
  if (!game?.scan || !reading) return Response.json({ error: "Pick a game and scan again." }, { status: 400, headers: NO_STORE });
  const cat = scanCatalog(game.slug);
  const m = matchScan(reading, cat, { foreignOk: /japan/i.test(game.slug) });
  const byId = new Map(cat.map((c) => [c.id, c]));
  const cards = m.ids.map((id) => {
    const row = byId.get(id)!;
    const full = readSet(game.slug, row.set).find((c) => c.id === id);
    const prices = full?.p ?? {};
    return { id, set: row.set, setName: row.setName, s: row.s, n: row.n, no: row.no, r: full?.r ?? null, prices, printing: printingFor(prices, reading.firstEdition) };
  });
  return Response.json({ kind: m.kind, why: m.why, cards }, { headers: NO_STORE });
}
