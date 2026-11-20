// Christmas on TCG Singles DB (owner, 2026-11-20: "put a Santa hat on top of the logos for all of our websites, and add
// some decorations here and there, like some Christmas lights"). The sister sites stamp data-season from the visitor's
// own date with a boot script; this site has no script of its own, and its pages are CDN copies held a day, so the
// server decides from the UTC date and the look ends within a day of Boxing Day. globals.css's xmas-logo block keys on
// the two attributes the layout sets from here. Remove after New Year: set the switch to false (or delete this file,
// the two attributes and the block).

/** The one off switch. */
export const CHRISTMAS_FESTIVE_LAYER = true;

/** 1 November to Boxing Day (26 December), inclusive, by the UTC date. */
export function christmasOn(now: Date = new Date()): boolean {
  if (!CHRISTMAS_FESTIVE_LAYER) return false;
  const md = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  return md >= 1101 && md <= 1226;
}
