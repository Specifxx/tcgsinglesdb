// Graded card value: one estimate, a range and the working, from several signals (owner, 2026-11-26).
//
// Pure arithmetic: no fetch, no file, no clock (the caller passes `now`). It is built before the data so a sold-price
// source can be plugged in without touching the maths. Rules:
//
// 1. Sold prices lead. Recent completed sales at the exact grader and grade carry most of the weight; nothing else
//    can outvote three or more of them.
// 2. Never invent a price. With no sales, no asking prices and no measured peer multiple, the answer is `null`, never
//    a guess. Every multiple is measured from real sales of other cards, never a rule of thumb.
// 3. Outliers are dropped by a robust rule (median absolute deviation on log prices), and every drop is listed in the
//    working so a reader can see it.
// 4. Asking prices are a ceiling and a weak signal: anyone can list a slab for any price, but the cheapest live copy
//    caps what one is worth today.
// 5. Population counts are shown as context only. They do not move the number: their effect is already in the sales.

export type Grader = "PSA" | "CGC" | "BGS" | "SGC" | "TAG";

export type Sale = {
  priceCents: number;
  /** ISO date or date-time of the sale. */
  date: string;
  grader: Grader;
  /** "10", "9.5", "9"… as the label prints it. */
  grade: string;
  /** Where it sold, e.g. "ebay". */
  source: string;
  /** An accepted Best Offer's shown price is the list price, not what was paid; we halve its weight. */
  bestOffer?: boolean;
};

export type Ask = { priceCents: number; grader: Grader; grade: string; source: string };

/** PSA 10 ÷ raw for other cards like this one (same set and rarity), measured from their own sales. */
export type PeerMultiple = { value: number; cards: number };

export type Population = { grade10: number; total: number; asOf: string };

export type GradedInput = {
  grader: Grader;
  grade: string;
  sales: Sale[];
  asks?: Ask[];
  /** The ungraded card's market price (TCGplayer), cents. */
  rawCents?: number | null;
  peer?: PeerMultiple | null;
  population?: Population | null;
  now: Date;
};

export type Confidence = "high" | "medium" | "low";

export type Signal = {
  key: "sold" | "asks" | "peer";
  label: string;
  cents: number;
  /** Share of the final number, 0–1, after renormalising. */
  weight: number;
  detail: string;
};

export type GradedEstimate = {
  cents: number;
  lowCents: number;
  highCents: number;
  confidence: Confidence;
  signals: Signal[];
  /** Plain-English steps, in order, for the "how we got this" panel. */
  working: string[];
  salesUsed: number;
  salesDropped: { priceCents: number; date: string; why: string }[];
  newestSale: string | null;
  /** PSA 10 ÷ raw for this card, when both exist. */
  rawMultiple: number | null;
  /** Share of graded copies at 10, when a population is known. */
  gemRate: number | null;
};

export const WINDOW_DAYS = 90;
export const HALF_LIFE_DAYS = 30;
/** Modified z-score above which a sale is an outlier (Iglewicz and Hoaglin's 3.5). */
export const OUTLIER_Z = 3.5;
/** Base weights before evidence scaling. Sold always dominates once it has 3+ sales. */
export const BASE_WEIGHTS = { sold: 0.75, asks: 0.15, peer: 0.1 } as const;
/** Live asks run above what sells; the cheapest few asks are discounted by this before they count. Measured later
 *  from our own sold-vs-ask pairs; until then a conservative 10%. */
export const ASK_DISCOUNT = 0.9;

const DAY = 86_400_000;

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

function sameGrade(a: { grader: Grader; grade: string }, grader: Grader, grade: string): boolean {
  return a.grader === grader && Number(a.grade) === Number(grade);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Weighted quantile (q in 0–1) by the midpoint rule. */
export function weightedQuantile(values: number[], weights: number[], q: number): number {
  const pairs = values.map((v, i) => [v, weights[i]] as const).sort((a, b) => a[0] - b[0]);
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let acc = 0;
  for (let i = 0; i < pairs.length; i++) {
    const mid = (acc + pairs[i][1] / 2) / total;
    if (mid >= q) {
      if (i === 0) return pairs[0][0];
      const prevMid = (acc - pairs[i - 1][1] / 2) / total;
      const t = (q - prevMid) / (mid - prevMid);
      return pairs[i - 1][0] + t * (pairs[i][0] - pairs[i - 1][0]);
    }
    acc += pairs[i][1];
  }
  return pairs[pairs.length - 1][0];
}

/** Drops outliers by modified z-score on log price. Needs 4+ sales; fewer are all kept (too few to judge). */
export function splitOutliers<T extends { priceCents: number }>(sales: T[]): { kept: T[]; dropped: T[] } {
  if (sales.length < 4) return { kept: sales, dropped: [] };
  const logs = sales.map((s) => Math.log(s.priceCents));
  const med = median(logs);
  const mad = median(logs.map((l) => Math.abs(l - med)));
  if (mad === 0) return { kept: sales, dropped: [] };
  const kept: T[] = [];
  const dropped: T[] = [];
  sales.forEach((s, i) => ((0.6745 * Math.abs(logs[i] - med)) / mad > OUTLIER_Z ? dropped : kept).push(s));
  return { kept, dropped };
}

export function estimateGraded(input: GradedInput): GradedEstimate | null {
  const { grader, grade, now } = input;
  const label = `${grader} ${grade}`;
  const working: string[] = [];
  const signals: Omit<Signal, "weight">[] = [];
  const rawWeights: number[] = [];

  // --- Sold ---------------------------------------------------------------------------------------------------
  const cutoff = now.getTime() - WINDOW_DAYS * DAY;
  const inWindow = input.sales.filter(
    (s) => sameGrade(s, grader, grade) && s.priceCents > 0 && Date.parse(s.date) >= cutoff && Date.parse(s.date) <= now.getTime(),
  );
  const { kept, dropped } = splitOutliers(inWindow);
  const otherGrades = input.sales.length - input.sales.filter((s) => sameGrade(s, grader, grade)).length;
  working.push(
    `Took ${inWindow.length} ${label} sale${inWindow.length === 1 ? "" : "s"} from the last ${WINDOW_DAYS} days` +
      (otherGrades ? ` (other grades and graders left out: ${otherGrades})` : "") +
      ".",
  );
  if (dropped.length) {
    working.push(`Left out ${dropped.length} outlier${dropped.length === 1 ? "" : "s"} (${dropped.map((d) => usd(d.priceCents)).join(", ")}): far from the rest, likely a mislisted or damaged copy.`);
  }

  let soldCents: number | null = null;
  let nEff = 0;
  let spread: { lo: number; hi: number } | null = null;
  const newest = kept.reduce<string | null>((a, s) => (!a || Date.parse(s.date) > Date.parse(a) ? s.date : a), null);
  if (kept.length) {
    const w = kept.map((s) => Math.pow(0.5, (now.getTime() - Date.parse(s.date)) / DAY / HALF_LIFE_DAYS) * (s.bestOffer ? 0.5 : 1));
    const p = kept.map((s) => s.priceCents);
    soldCents = weightedQuantile(p, w, 0.5);
    const sw = w.reduce((a, b) => a + b, 0);
    nEff = (sw * sw) / w.reduce((a, b) => a + b * b, 0);
    spread = { lo: weightedQuantile(p, w, 0.25), hi: weightedQuantile(p, w, 0.75) };
    signals.push({
      key: "sold",
      label: "Recent sales",
      cents: Math.round(soldCents),
      detail: `${kept.length} sale${kept.length === 1 ? "" : "s"}, newer ones count more (half weight after ${HALF_LIFE_DAYS} days)`,
    });
    rawWeights.push(BASE_WEIGHTS.sold * Math.min(1, nEff / 3));
    working.push(`Weighted middle of those sales, newest counting most: ${usd(Math.round(soldCents))}.`);
  }

  // --- Asks -----------------------------------------------------------------------------------------------------
  const asks = (input.asks ?? []).filter((a) => sameGrade(a, grader, grade) && a.priceCents > 0).sort((a, b) => a.priceCents - b.priceCents);
  const cheapestAsk = asks[0]?.priceCents ?? null;
  if (asks.length) {
    const low = asks.slice(0, 3).map((a) => a.priceCents);
    const askCents = median(low) * ASK_DISCOUNT;
    signals.push({
      key: "asks",
      label: "Copies for sale now",
      cents: Math.round(askCents),
      detail: `${asks.length} listed; the cheapest ${low.length} less ${Math.round((1 - ASK_DISCOUNT) * 100)}%, since asks run above sales`,
    });
    rawWeights.push(BASE_WEIGHTS.asks);
  }

  // --- Peer multiple ----------------------------------------------------------------------------------------------
  const raw = input.rawCents && input.rawCents > 0 ? input.rawCents : null;
  if (raw && input.peer && input.peer.cards >= 3 && input.peer.value > 0) {
    signals.push({
      key: "peer",
      label: "Similar cards",
      cents: Math.round(raw * input.peer.value),
      detail: `raw ${usd(raw)} × ${input.peer.value.toFixed(1)}, the ${label} multiple of ${input.peer.cards} similar cards`,
    });
    rawWeights.push(BASE_WEIGHTS.peer * Math.min(1, input.peer.cards / 10));
  }

  if (!signals.length) return null;

  // --- Blend ------------------------------------------------------------------------------------------------------
  const total = rawWeights.reduce((a, b) => a + b, 0);
  const weighted: Signal[] = signals.map((s, i) => ({ ...s, weight: rawWeights[i] / total }));
  let cents = weighted.reduce((a, s) => a + s.cents * s.weight, 0);
  working.push(
    weighted.length === 1
      ? `Only one signal: ${weighted[0].label.toLowerCase()}.`
      : `Blended ${weighted.map((s) => `${s.label.toLowerCase()} ${Math.round(s.weight * 100)}%`).join(", ")}.`,
  );

  if (cheapestAsk && cents > cheapestAsk) {
    working.push(`Capped at the cheapest copy for sale now (${usd(cheapestAsk)}): nobody pays more than that today.`);
    cents = cheapestAsk;
  }

  // --- Range and confidence -----------------------------------------------------------------------------------------
  const daysSinceNewest = newest ? (now.getTime() - Date.parse(newest)) / DAY : Infinity;
  const confidence: Confidence =
    nEff >= 5 && daysSinceNewest <= 30 ? "high" : nEff >= 2 && daysSinceNewest <= 60 ? "medium" : "low";
  // Half-width: the sales' own middle 50%, widened when there are few of them; a flat ±30% without sales.
  const base = spread && soldCents ? Math.max((spread.hi - spread.lo) / 2 / soldCents, 0.04) : 0.3;
  const half = Math.min(0.6, base * (1 + 1 / Math.sqrt(Math.max(nEff, 1))));
  let lowCents = Math.round(cents * (1 - half));
  let highCents = Math.round(cents * (1 + half));
  if (cheapestAsk) highCents = Math.min(highCents, Math.max(cheapestAsk, Math.round(cents)));
  cents = Math.round(cents);
  lowCents = Math.min(lowCents, cents);
  working.push(`Likely range ${usd(lowCents)} to ${usd(highCents)}; confidence ${confidence} (${nEff ? `${nEff.toFixed(1)} sales' worth of evidence` : "no sales"}${newest ? `, newest ${Math.round(daysSinceNewest)} days ago` : ""}).`);

  const pop = input.population;
  return {
    cents,
    lowCents,
    highCents,
    confidence,
    signals: weighted,
    working,
    salesUsed: kept.length,
    salesDropped: dropped.map((d) => ({ priceCents: d.priceCents, date: d.date, why: "outlier" })),
    newestSale: newest,
    rawMultiple: raw ? Math.round((cents / raw) * 10) / 10 : null,
    gemRate: pop && pop.total > 0 ? pop.grade10 / pop.total : null,
  };
}

/**
 * The PSA 10 multiple of a group of similar cards: the median of (graded estimate ÷ raw) over cards that have both,
 * each from real sales. Fewer than 3 such cards → null (not enough to measure).
 */
export function peerMultiple(pairs: { gradedCents: number; rawCents: number }[]): PeerMultiple | null {
  const r = pairs.filter((p) => p.gradedCents > 0 && p.rawCents > 0).map((p) => p.gradedCents / p.rawCents);
  if (r.length < 3) return null;
  return { value: median(r), cards: r.length };
}

/** One grade's value as the open card API publishes it (collection apps read this; agreed 2026-11-26). Integer US
 *  cents; `n` is the sales behind it. Keyed on the card as `graded[printing]["PSA 10"]`, present only with data. */
export type OpenGraded = { c: number; lo: number; hi: number; n: number; conf: Confidence; at: string };

export const gradeKey = (grader: Grader, grade: string) => `${grader} ${Number(grade)}`;

export function toOpenGraded(e: GradedEstimate, at: string): OpenGraded {
  return { c: e.cents, lo: e.lowCents, hi: e.highCents, n: e.salesUsed, conf: e.confidence, at };
}
