import { dayOfIndex, type CardStats } from "./cards";
import { shortDate, usd } from "./format";

// Plain-English notes on a card page, each drawn from a number the page already shows (TCGplayer's market price, our own
// history since we began reading it, the set, the stores we read). Never a forecast, never advice to buy or sell.

export interface InsightInput {
  name: string;
  setName: string;
  value: number | null;
  printings: [string, number][];
  stats: CardStats;
  rank: { rank: number; of: number; share: number } | null;
  reprints: { count: number; cheapest: number | null; dearest: number | null };
  storeLow: number | null;
  buyTop: { name: string; cents: number } | null;
}

const pct = (n: number) => `${Math.abs(n) < 10 ? Math.abs(n).toFixed(1) : Math.round(Math.abs(n))}%`;

export function cardInsights(x: InsightInput): string[] {
  const out: string[] = [];
  const v = x.value;
  if (x.rank && v != null) {
    if (x.rank.rank === 1 && x.rank.of > 1) out.push(`The most valuable card in ${x.setName}: ${pct(x.rank.share)} of the whole set's market value on its own.`);
    else if (x.rank.rank <= 3 && x.rank.of >= 20) out.push(`One of the three most valuable cards in ${x.setName}.`);
    else if (x.rank.of >= 20 && x.rank.rank / x.rank.of > 0.5) out.push(`In the lower half of ${x.setName} by value (number ${x.rank.rank} of ${x.rank.of}).`);
  }
  const { high, low, ch7, ch30, since } = x.stats;
  if (v != null && high && low && since != null && high.v !== low.v) {
    const from = shortDate(dayOfIndex(since));
    if (v >= high.v) out.push(`At its highest price since we started tracking it on ${from}.`);
    else if (v <= low.v) out.push(`At its lowest price since we started tracking it on ${from}.`);
    else {
      const off = ((high.v - v) / high.v) * 100;
      if (off >= 10) out.push(`${pct(off)} below its tracked high of ${usd(high.v)} (${shortDate(dayOfIndex(high.d))}).`);
      const up = ((v - low.v) / low.v) * 100;
      if (up >= 10) out.push(`${pct(up)} above its tracked low of ${usd(low.v)} (${shortDate(dayOfIndex(low.d))}).`);
    }
  }
  if (ch30 != null && Math.abs(ch30) >= 5) out.push(`${ch30 > 0 ? "Up" : "Down"} ${pct(ch30)} over the last 30 days${ch7 != null && Math.abs(ch7) >= 3 ? `, ${ch7 > 0 ? "up" : "down"} ${pct(ch7)} in the last week` : ""}.`);
  else if (ch7 != null && Math.abs(ch7) >= 5) out.push(`${ch7 > 0 ? "Up" : "Down"} ${pct(ch7)} in the last week.`);
  else if (ch30 != null) out.push(`Steady: within 5% of where it was 30 days ago.`);
  if (x.printings.length > 1) {
    const [top, base] = [x.printings[0], x.printings[x.printings.length - 1]];
    if (base[1] > 0 && top[1] / base[1] >= 1.5) out.push(`The ${top[0]} printing sells for ${(top[1] / base[1]).toFixed(1)}× the ${base[0]}: check which one you have.`);
  }
  if (x.reprints.count > 0 && v != null && x.reprints.cheapest != null && x.reprints.dearest != null) {
    const n = x.reprints.count;
    const other = `${n} other set${n > 1 ? "s" : ""}`;
    if (v > x.reprints.dearest) out.push(`Also printed in ${other}; this is the most valuable printing of ${x.name}.`);
    else if (v < x.reprints.cheapest) out.push(`Also printed in ${other}, all worth more; this is the cheapest way to own ${x.name}.`);
    else out.push(`Also printed in ${other}, from ${usd(x.reprints.cheapest)} to ${usd(x.reprints.dearest)}.`);
  }
  if (x.storeLow != null && v != null && v > 0) {
    const d = ((x.storeLow - v) / v) * 100;
    if (d <= -5) out.push(`The cheapest US store copy we found, ${usd(x.storeLow)}, is ${pct(d)} under TCGplayer's market price.`);
    else if (d >= 5) out.push(`US stores we read ask from ${usd(x.storeLow)}, ${pct(d)} over TCGplayer's market price.`);
  }
  if (x.buyTop && v != null && v > 0) out.push(`${x.buyTop.name} pays ${usd(x.buyTop.cents)} cash for a Near Mint copy, ${Math.round((x.buyTop.cents / v) * 100)}% of market.`);
  return out.slice(0, 6);
}
