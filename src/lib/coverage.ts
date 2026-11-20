// Card coverage: does every card TCGplayer lists (and every card an independent card database lists) have a page here and on
// the sister site that covers its game? Pure functions only; scripts/coverage.ts fetches and writes data/coverage/.
// Owner, 2026-11-20: "every new set that comes in, we have all the cards on our websites", promos and special printings too.

export interface GroupGap {
  groupId: number;
  name: string;
  released: string | null;
  /** Cards TCGplayer lists in the group (cardsOfGroup's rule). */
  tcg: number;
  /** Of those, cards this site has. */
  ours: number;
  /** TCGplayer product ids we lack (at most MAX_IDS kept in the report). */
  missing: number[];
}

export interface SiteGaps {
  site: string;
  game: string;
  tcgCards: number;
  ourCards: number;
  /** Cards TCGplayer lists that the site lacks. */
  missing: number;
  /** Of the missing, cards missing for two days or more (the import has had its chance): what turns the ops monitor red. */
  stale: number;
  /** Of the missing, cards the site's own price floor leaves out on purpose (under the floor, set older than its fresh window). */
  byFloor: number;
  groups: GroupGap[];
}

export interface ExternalGap {
  source: string;
  game: string;
  set: string;
  code: string | null;
  released: string | null;
  /** Cards the source lists in the set. */
  expected: number;
  /** Cards we have for it (0 when no TCGplayer group matches). */
  ours: number;
  note: string;
}

export const MAX_IDS = 60;

/** Group the cards a site lacks by their TCGplayer group, biggest gap first. A group with no gap is left out. */
export function groupGaps(
  tcg: ReadonlyMap<number, { name: string; released: string | null; ids: readonly number[] }>,
  have: ReadonlySet<number>,
  excused: ReadonlySet<number> = new Set(),
): { groups: GroupGap[]; tcgCards: number; missing: number; byFloor: number; all: number[] } {
  const groups: GroupGap[] = [];
  let tcgCards = 0;
  let missing = 0;
  let byFloor = 0;
  const all: number[] = [];
  for (const [groupId, g] of tcg) {
    tcgCards += g.ids.length;
    const lack = g.ids.filter((id) => !have.has(id));
    const real = lack.filter((id) => !excused.has(id));
    byFloor += lack.length - real.length;
    if (!real.length) continue;
    missing += real.length;
    all.push(...real);
    groups.push({ groupId, name: g.name, released: g.released, tcg: g.ids.length, ours: g.ids.length - lack.length, missing: real.slice(0, MAX_IDS) });
  }
  groups.sort((a, b) => b.tcg - b.ours - (a.tcg - a.ours) || a.groupId - b.groupId);
  return { groups, tcgCards, missing, byFloor, all };
}

/** A set name as two sources can agree on it: lower case, accents, punctuation and a leading "SV08:"-style code removed. */
export function setKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^[a-z0-9.]{1,8}:\s+/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|pokemon|tcg)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A source's set is short when we have under 90% of its cards and at least three fewer. */
export function isShort(expected: number, ours: number): boolean {
  return expected > 0 && ours < expected * 0.9 && expected - ours >= 3;
}

/** The prefix of a Yu-Gi-Oh!-style set code ("LOB-EN001" → "LOB", "SDK-001" → "SDK"); null when the number has none. */
export function ygoPrefix(number: string): string | null {
  const m = /^([A-Z0-9]{2,6})-[A-Z]{0,3}\d{1,4}[a-z]?$/i.exec(number.trim());
  return m ? m[1].toUpperCase() : null;
}

/** Is a group inside the release watch: published in the last `back` days or due in the next `ahead` days? */
export function inReleaseWindow(publishedOn: string | null | undefined, now: Date, back = 21, ahead = 45): boolean {
  if (!publishedOn) return false;
  const t = Date.parse(publishedOn.slice(0, 10));
  if (!Number.isFinite(t)) return false;
  const days = (t - now.getTime()) / 86_400_000;
  return days >= -back && days <= ahead;
}

/**
 * Carry the day each missing card was first seen missing (key "site|id"). Cards of the groups read this run that are no longer
 * missing leave; cards of groups not read keep their day. Returns how many of today's missing cards are two days old or more.
 */
export function ageMissing(state: Record<string, string>, site: string, read: readonly number[], missing: readonly number[], day: string): number {
  const lack = new Set(missing);
  for (const id of read) if (!lack.has(id)) delete state[`${site}|${id}`];
  let stale = 0;
  for (const id of missing) {
    const k = `${site}|${id}`;
    state[k] ??= day;
    if (Date.parse(day) - Date.parse(state[k]) >= 2 * 86_400_000) stale++;
  }
  return stale;
}
