// Sealed coverage (owner, 2026-11-22: "the latest releases ... must be on our sites"). Does every sealed product TCGplayer
// added to a recent set have a page on the sealed sites (DexCompare, MTG, YGO, OP, Lorcana, Gundam, Cyberpunk Compare and
// TCG Prices)? Pure functions only; scripts/sealed-coverage.ts fetches and writes data/coverage/sealed.{json,md}.
// Report only: each site's own focus rules decide what keeps a page, so a product listed here is a lead to check,
// and only one missing two days or more is worth a look (the site's import has had its chance).

import type { TcgcsvGroup, TcgcsvProduct } from "./cards";

const SEALED_WORDS = /\b(?:booster|box|bundle|deck|tin|collection|case|display|pack|kit|blister|chest|set|gift|premium|starter|sleeved|half)\b/i;
const NOT_SEALED = /\b(?:sleeves?|playmat|binder|portfolio|deck ?box|dice|card ?sleeves|art series|code card|token|memorabilia)\b/i;

const ext = (p: TcgcsvProduct, key: string) => p.extendedData?.find((e) => e.name === key)?.value?.trim() || null;

/** A sealed product: no card number, a sealed-product word in its name, and not an accessory. */
export function isSealedProduct(p: TcgcsvProduct): boolean {
  if (ext(p, "Number")) return false;
  return SEALED_WORDS.test(p.name) && !NOT_SEALED.test(p.name);
}

/** A group worth checking: published in the last `pastDays` or the next `aheadDays`, or changed in the last `touchedDays`. */
export function recentGroup(g: Pick<TcgcsvGroup, "publishedOn" | "modifiedOn">, now: Date, pastDays = 120, aheadDays = 120, touchedDays = 14): boolean {
  const day = 86_400_000;
  const pub = g.publishedOn ? Date.parse(g.publishedOn) : NaN;
  const mod = g.modifiedOn ? Date.parse(g.modifiedOn) : NaN;
  if (Number.isFinite(pub) && pub >= now.getTime() - pastDays * day && pub <= now.getTime() + aheadDays * day) return true;
  return Number.isFinite(mod) && mod >= now.getTime() - touchedDays * day;
}

/** The slug a site's importer would give a product name (lower case, ASCII, words joined by "-"). */
export function slugOf(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** TCGplayer product ids named in a site's own data: image and product URLs carry them. */
export function idsInText(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/tcgplayer[^"\s]*?\/product\/(\d{4,7})/g)) out.add(Number(m[1]));
  return out;
}

/** First-seen day per missing product: kept for those still missing, today for new ones, dropped once covered. */
export function ageSealed(prev: Readonly<Record<string, string>>, missingKeys: readonly string[], today: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of missingKeys) out[k] = prev[k] ?? today;
  return out;
}
