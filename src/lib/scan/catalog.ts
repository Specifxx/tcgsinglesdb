// The scanner's catalogue for one game: search.json joined to its set names and codes, built once per server instance
// (the data only changes with a release). Server-only (lib/store.ts reads files).
import { readSearch, readSets } from "../store";
import type { ScanRow } from "./match";

const memo = new Map<string, ScanRow[]>();

export function scanCatalog(game: string): ScanRow[] {
  const hit = memo.get(game);
  if (hit) return hit;
  const sets = new Map(readSets(game).sets.map((s) => [s.slug, s]));
  const rows: ScanRow[] = readSearch(game).map(([set, s, n, no, v, , id]) => ({ id, set, setName: sets.get(set)?.name ?? set, setAbbr: sets.get(set)?.abbr ?? null, s, n, no, v }));
  memo.set(game, rows);
  return rows;
}
