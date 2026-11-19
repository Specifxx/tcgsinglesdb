"use client";
// The card page's price history, OP Compare's two-line look (owner, 2026-11-19: "copy it across all our tcg websites"): the
// cheapest in-stock US store price of the card's headline printing (solid red, data/history/_stores) against TCGplayer's
// market price (dashed gold, data/history), both in US$, with Now / Low / High and the change, 7D / 30D / 90D / All tabs
// where the history is longer than them, and a hover, touch or arrow-key crosshair whose tooltip reads both lines for the day.
// Either line draws alone where the other has no data yet (store lows are recorded from 2026-11-20). Pure maths in
// lib/history-chart.ts; the page decides with historyLines whether there is anything to draw. The first paint is SVG at a fixed
// height, so nothing shifts.
import { useEffect, useMemo, useRef, useState } from "react";
import { usd } from "@/lib/format";
import { chartRanges, historyLines, linePath, nearestIndex, seriesChange, ticks, type Series } from "@/lib/history-chart";

const LOCAL = "#e5484d";
const MARKET = "#d9a21b";
const EPOCH = Date.parse("2026-01-01T00:00:00Z");
const PAD = { r: 12, t: 12, b: 24 };
const FALLBACK_W = 640;
const TIP_W = 230;
const H = 230;
const at = (d: number) => new Date(EPOCH + d * 86_400_000);
const dayIso = (d: number) => at(d).toISOString().slice(0, 10);
const shortDay = (d: number) => at(d).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
const longDay = (d: number) => at(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function tipStyle(hx: number, w: number): React.CSSProperties {
  if (hx + 10 + TIP_W <= w) return { left: hx + 10 };
  if (hx - 10 - TIP_W >= 0) return { right: w - hx + 10 };
  return { left: Math.max(4, Math.min(w - TIP_W - 4, hx - TIP_W / 2)) };
}

export function PriceHistory({ tcg, lows, through, days = 365 }: { tcg?: Series; lows?: Series; through: number; days?: number }) {
  const lines = useMemo(() => historyLines(tcg, lows, 1, through, days), [tcg, lows, through, days]);
  const series = useMemo(
    () =>
      lines
        ? [
            { label: "Cheapest US store listing", color: LOCAL, dashed: false, ys: lines.local },
            { label: "TCGplayer market", color: MARKET, dashed: true, ys: lines.market },
          ].filter((s) => s.ys.some((v) => v != null))
        : [],
    [lines],
  );
  const ranges = useMemo(() => (lines ? chartRanges(lines.days, series.map((s) => s.ys)) : []), [lines, series]);
  const [rangeKey, setRangeKey] = useState("all");
  const [hover, setHover] = useState<number | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drawn = lines != null;

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setMeasured(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [drawn]);

  if (!lines || !ranges.length) return null;
  const range = ranges.find((r) => r.key === rangeKey) ?? ranges[ranges.length - 1];
  const xs = lines.days.slice(range.start);
  const view = series.map((s) => ({ ...s, ys: s.ys.slice(range.start) }));
  const n = xs.length;
  const fmt = (v: number) => usd(Math.round(v));
  const tickVals = ticks(range.lo, range.hi);
  const W = measured ?? FALLBACK_W;
  const padL = Math.max(48, Math.ceil(Math.max(...tickVals.map((t) => fmt(t).length)) * 6.6) + 10);
  const plotW = Math.max(1, W - padL - PAD.r);
  const X = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const Y = (v: number) => PAD.t + (1 - (v - range.lo) / (range.hi - range.lo || 1)) * (H - PAD.t - PAD.b);
  const xLabels = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1];

  // The headline line (the first with data in this range): now, low, high and change.
  const head = view.find((s) => s.ys.some((v) => v != null));
  let lo = -1;
  let hi = -1;
  let last = -1;
  head?.ys.forEach((v, i) => {
    if (v == null) return;
    if (lo < 0 || v < head.ys[lo]!) lo = i;
    if (hi < 0 || v > head.ys[hi]!) hi = i;
    last = i;
  });
  const pct = head ? seriesChange(head.ys)?.pct : null;
  const isNow = last === n - 1;

  const moveTo = (clientX: number) => {
    const el = wrap.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    setHover(nearestIndex((((clientX - rect.left) / rect.width) * W - padL) / plotW, n));
  };
  const hx = hover != null ? X(hover) : 0;

  return (
    <figure className="ph" data-price-history="">
      <p className="ph-kicker">In US$ · lowest price</p>
      <div className="ph-head">
        {head && last >= 0 ? (
          <p className="ph-stats">
            {isNow ? (
              <span>
                Now <b>{fmt(head.ys[last]!)}</b>
              </span>
            ) : (
              <span className="m">
                Last recorded <b>{fmt(head.ys[last]!)}</b> · {shortDay(xs[last])}
              </span>
            )}
            <span className="m">Low {fmt(head.ys[lo]!)}</span>
            <span className="m">High {fmt(head.ys[hi]!)}</span>
            {pct != null && Math.abs(pct) >= 0.05 && (
              <b className={pct > 0 ? "up" : "down"}>
                {pct > 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
              </b>
            )}
          </p>
        ) : (
          <span />
        )}
        {ranges.length > 1 && (
          <span className="ph-tabs" role="group" aria-label="Chart range">
            {ranges.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={r.key === range.key}
                onClick={() => {
                  setRangeKey(r.key);
                  setHover(null);
                }}
              >
                {r.label}
              </button>
            ))}
          </span>
        )}
      </div>
      <div
        ref={wrap}
        className="ph-plot"
        style={{ height: H }}
        tabIndex={0}
        aria-label={`${view.map((s) => s.label).join(" and ")}, ${dayIso(xs[0])} to ${dayIso(xs[n - 1])}. Use the left and right arrow keys to read each day.`}
        onPointerMove={(e) => moveTo(e.clientX)}
        onPointerDown={(e) => moveTo(e.clientX)}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHover(null);
        }}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            setHover((h) => Math.min(n - 1, Math.max(0, (h ?? (e.key === "ArrowLeft" ? n : -1)) + (e.key === "ArrowRight" ? 1 : -1))));
          } else if (e.key === "Escape") setHover(null);
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: H }} preserveAspectRatio={measured == null ? "none" : undefined} aria-hidden="true">
          {tickVals.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - PAD.r} y1={Y(t)} y2={Y(t)} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
              <text x={padL - 6} y={Y(t) + 4} textAnchor="end" fill="currentColor" fillOpacity="0.55" fontSize="11">
                {fmt(t)}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text key={i} x={X(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fill="currentColor" fillOpacity="0.55" fontSize="11">
              {shortDay(xs[i])}
            </text>
          ))}
          {view.map((s) => (
            <path key={s.label} d={linePath(s.ys, X, Y)} fill="none" stroke={s.color} strokeWidth="2.2" strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {measured != null && n <= 45 && view.map((s) => s.ys.map((v, i) => (v == null ? null : <circle key={`${s.label}-${i}`} cx={X(i)} cy={Y(v)} r="2.5" fill={s.color} />)))}
          {hover != null && (
            <g>
              <line x1={hx} x2={hx} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" />
              {view.map((s) => {
                const v = s.ys[hover];
                return v == null ? null : <circle key={s.label} cx={hx} cy={Y(v)} r="4.5" fill={s.color} stroke="var(--card)" strokeWidth="1.5" />;
              })}
            </g>
          )}
        </svg>
        {hover != null && (
          <div className="ph-tip" style={tipStyle(hx, W)} role="status">
            <p className="m">{longDay(xs[hover])}</p>
            {view.map((s) => (
              <p key={s.label}>
                <i style={{ background: s.color }} />
                <span className="m">{s.label}</span>
                <b>{s.ys[hover] == null ? "—" : fmt(s.ys[hover]!)}</b>
              </p>
            ))}
          </div>
        )}
      </div>
      <figcaption className="ph-legend">
        {view.map((s) => (
          <span key={s.label}>
            <i style={{ borderTop: `2px ${s.dashed ? "dashed" : "solid"} ${s.color}` }} />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
