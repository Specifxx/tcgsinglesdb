"use client";
// The Sell desk (DECISIONS.md 2026-11-24). Everything happens in the browser except the card lookup (/api/sell/price), which
// stores nothing. Events (Vercel Web Analytics, two properties each): sell_list {game, size}, sell_export {kind},
// seller_pro {step}. No text a seller types is ever sent to analytics.
import { useMemo, useState } from "react";
import { track } from "@vercel/analytics";
import { bestRoute, ebayNet, MAX_LINES, parseList, pickPrinting, ROUTE_NAMES, tcgplayerNet, toCsv, type ListLine, type Route, type SoldRow } from "@/lib/sell";

interface FoundCard {
  id: number;
  set: string;
  setName: string;
  s: string;
  n: string;
  no: string;
  prices: Record<string, number>;
  cash: Record<string, number>;
}
interface Result {
  kind: "sure" | "pick" | "none";
  total?: number;
  cards: FoundCard[];
}
interface Row {
  line: ListLine;
  res: Result;
  /** Index into res.cards, or -1 while the seller has not picked. */
  pick: number;
  printing: string | null;
}

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sizeBucket = (n: number) => (n <= 5 ? "1-5" : n <= 20 ? "6-20" : n <= 50 ? "21-50" : "51-100");
const SAMPLE: Record<string, string> = {
  pokemon: "1 Charizard ex 199/165\n2 Pikachu 025/165 reverse holo\n1 Umbreon VMAX 215/203",
  magic: "1 The One Ring LTR 451\n4 Lightning Bolt M10 146\n1 Sheoldred, the Apocalypse DMU 107 foil",
  yugioh: "1 Blue-Eyes White Dragon LOB-001\n3 Ash Blossom & Joyous Spring MP23-EN248",
};

export function SellDesk({ games }: { games: { slug: string; name: string }[] }) {
  const [game, setGame] = useState(games[0]?.slug ?? "pokemon");
  const [text, setText] = useState("");
  const [ebayPct, setEbayPct] = useState(100);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cut, setCut] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pro, setPro] = useState(false);

  async function run() {
    setErr("");
    const { lines, cut } = parseList(text);
    if (!lines.length) {
      setErr("Paste at least one card, one a line, or upload a CSV export.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/sell/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, lines: lines.map((l) => ({ q: l.q, name: l.name, id: l.id })) }) });
      const j = (await r.json()) as { results?: Result[]; error?: string };
      if (!r.ok || !j.results) throw new Error(j.error || "Something went wrong. Try again.");
      setRows(
        lines.map((line, i) => {
          const res = j.results![i] ?? { kind: "none", cards: [] };
          const pick = res.kind === "sure" ? 0 : -1;
          return { line, res, pick, printing: pick === 0 ? pickPrinting(res.cards[0].prices, line.hint) : null };
        }),
      );
      setCut(cut);
      track("sell_list", { game, size: sizeBucket(lines.length) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function choose(i: number, pick: number) {
    setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, pick, printing: pick >= 0 ? pickPrinting(r.res.cards[pick].prices, r.line.hint) : null } : r)));
  }
  function choosePrinting(i: number, printing: string) {
    setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, printing } : r)));
  }
  function topForAll() {
    setRows((rs) => rs && rs.map((r) => (r.pick < 0 && r.res.cards.length ? { ...r, pick: 0, printing: pickPrinting(r.res.cards[0].prices, r.line.hint) } : r)));
  }

  const sold: (SoldRow | null)[] = useMemo(
    () =>
      (rows ?? []).map((r) => {
        const c = r.pick >= 0 ? r.res.cards[r.pick] : null;
        const market = c && r.printing ? c.prices[r.printing] : undefined;
        if (!c || !r.printing || !market) return null;
        const cash = c.cash[r.printing] ?? null;
        const best = bestRoute(market, ebayPct, cash);
        return { qty: r.line.qty, name: c.n, set: c.setName, number: c.no, printing: r.printing, id: c.id, market, tcgplayerNet: tcgplayerNet(market), ebayNet: ebayNet(Math.round((market * ebayPct) / 100)), cash, route: best.route };
      }),
    [rows, ebayPct],
  );
  const done = sold.filter((s): s is SoldRow => s !== null);
  const sum = (f: (s: SoldRow) => number) => done.reduce((n, s) => n + f(s) * s.qty, 0);
  const totals = {
    market: sum((s) => s.market),
    tcgplayer: sum((s) => s.tcgplayerNet),
    ebay: sum((s) => s.ebayNet),
    best: sum((s) => bestRoute(s.market, ebayPct, s.cash).net),
  };
  const byRoute = (route: Route) => done.filter((s) => s.route === route).reduce((n, s) => n + s.qty, 0);
  const pending = (rows ?? []).filter((r) => r.pick < 0 && r.res.cards.length).length;
  const missing = (rows ?? []).filter((r) => !r.res.cards.length).length;
  const hasCash = done.some((s) => s.cash !== null);

  function download() {
    const blob = new Blob([toCsv(done)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sell-list-${game}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    track("sell_export", { kind: "csv" });
  }
  async function copy() {
    const t = done.map((s) => `${s.qty} ${s.name} ${s.number ? `#${s.number} ` : ""}(${s.set})${s.printing !== "Normal" ? ` ${s.printing}` : ""} - ${usd(s.market)}`).join("\n");
    try {
      await navigator.clipboard.writeText(t);
    } catch {}
    track("sell_export", { kind: "copy" });
  }
  async function readFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 400_000) {
      setErr("That file is over 400 KB. Export fewer cards, or paste the first 100.");
      return;
    }
    setText(await f.text());
    setErr("");
  }

  return (
    <div className="sd">
      <div className="card sd-in">
        <div className="sd-row">
          <label>
            Game{" "}
            <select value={game} onChange={(e) => setGame(e.target.value)}>
              {games.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="btn sd-file">
            Upload CSV
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
          {SAMPLE[game] ? (
            <button type="button" className="sd-link" onClick={() => setText(SAMPLE[game])}>
              Try an example
            </button>
          ) : null}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          spellCheck={false}
          aria-label="Your card list"
          placeholder={`One card a line: quantity, name, then set and number if you know them.\n2 Charizard ex 199/165\n1 Lightning Bolt M10 146 foil\n\nOr upload a CSV from ManaBox, Collectr, TCGplayer's app or a spreadsheet (up to ${MAX_LINES} cards).`}
        />
        <div className="sd-row">
          <button type="button" className="btn primary" onClick={run} disabled={busy}>
            {busy ? "Pricing…" : "Price my list"}
          </button>
          <label className="small">
            My eBay price:{" "}
            <input type="number" min={50} max={200} step={5} value={ebayPct} onChange={(e) => setEbayPct(Math.min(200, Math.max(50, Number(e.target.value) || 100)))} style={{ width: 64 }} />% of TCGplayer market
          </label>
        </div>
        {err ? <p className="sd-err">{err}</p> : null}
      </div>

      {rows ? (
        <>
          <ul className="facts sd-totals">
            <li className="card">
              <span className="small">TCGplayer market</span>
              <b>{usd(totals.market)}</b>
            </li>
            <li className="card">
              <span className="small">All on TCGplayer, after fees</span>
              <b>{usd(totals.tcgplayer)}</b>
            </li>
            <li className="card">
              <span className="small">All on eBay, after fees</span>
              <b>{usd(totals.ebay)}</b>
            </li>
            <li className="card sd-best">
              <span className="small">Best route for each card</span>
              <b>{usd(totals.best)}</b>
              <span className="small">
                {(["tcgplayer", "ebay", "cash", "bulk"] as Route[])
                  .filter((r) => byRoute(r))
                  .map((r) => `${byRoute(r)} ${ROUTE_NAMES[r]}`)
                  .join(" · ")}
              </span>
            </li>
          </ul>
          {pending ? (
            <p className="sd-note">
              {pending} {pending === 1 ? "line matches" : "lines match"} more than one printing: pick yours below (they are left out of the totals until you do).{" "}
              <button type="button" className="sd-link" onClick={topForAll}>
                Use the top match for all
              </button>
            </p>
          ) : null}
          {missing ? <p className="sd-note">{missing} {missing === 1 ? "line found" : "lines found"} no card. Add the set or number, or check the game.</p> : null}
          {cut ? <p className="sd-note">Your list had {cut} more {cut === 1 ? "card" : "cards"} than the free {MAX_LINES}: only the first {MAX_LINES} are priced.</p> : null}

          <div className="wrap">
            <table className="list sd-table">
              <thead>
                <tr>
                  <th scope="col">Card</th>
                  <th scope="col" className="r">Qty</th>
                  <th scope="col">Printing</th>
                  <th scope="col" className="r">Market</th>
                  <th scope="col" className="r">TCGplayer net</th>
                  <th scope="col" className="r">eBay net</th>
                  {hasCash ? <th scope="col" className="r">Cash offer</th> : null}
                  <th scope="col">Best route</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const c = r.pick >= 0 ? r.res.cards[r.pick] : null;
                  const s = sold[i];
                  return (
                    <tr key={i}>
                      <td>
                        {r.res.cards.length > 1 && r.res.kind === "pick" ? (
                          <select value={r.pick} onChange={(e) => choose(i, Number(e.target.value))} aria-label={`Which card is "${r.line.q}"`}>
                            <option value={-1}>Pick: {r.line.q.slice(0, 40)}</option>
                            {r.res.cards.map((o, k) => (
                              <option key={o.id} value={k}>
                                {o.n} {o.no ? `#${o.no}` : ""} · {o.setName}
                              </option>
                            ))}
                          </select>
                        ) : c ? (
                          <a href={`/${game}/${c.set}/${c.s}`} target="_blank" rel="noopener">
                            {c.n}
                            {c.no ? ` #${c.no}` : ""}
                            <span className="small" style={{ display: "block" }}>
                              {c.setName}
                            </span>
                          </a>
                        ) : (
                          <span className="small">No card found: {r.line.q.slice(0, 60)}</span>
                        )}
                      </td>
                      <td className="r">{r.line.qty}</td>
                      <td>
                        {c && Object.keys(c.prices).length > 1 ? (
                          <select value={r.printing ?? ""} onChange={(e) => choosePrinting(i, e.target.value)} aria-label="Printing">
                            {Object.keys(c.prices).map((p) => (
                              <option key={p}>{p}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="small">{r.printing ?? (c ? "No price" : "")}</span>
                        )}
                      </td>
                      <td className="r">{s ? usd(s.market) : "–"}</td>
                      <td className="r">{s ? usd(s.tcgplayerNet) : "–"}</td>
                      <td className="r">{s ? usd(s.ebayNet) : "–"}</td>
                      {hasCash ? <td className="r">{s?.cash ? usd(s.cash) : "–"}</td> : null}
                      <td>{s ? <span className={`sd-route sd-${s.route}`}>{ROUTE_NAMES[s.route]}</span> : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="sd-row" style={{ marginTop: 14 }}>
            <button type="button" className="btn primary" onClick={download} disabled={!done.length}>
              Download spreadsheet (CSV)
            </button>
            <button type="button" className="btn" onClick={copy} disabled={!done.length}>
              Copy as text
            </button>
          </div>

          <div className="card sd-pro">
            <p className="eyebrow">Coming next · Seller Pro</p>
            <b>Unlimited lists, saved between visits, and a weekly email when your cards move.</b>
            <p className="small">We&rsquo;re deciding whether to build it, at US$7.99 a month. It isn&rsquo;t ready, and nothing is charged.</p>
            {pro ? (
              <p className="sd-thanks">Thanks, counted. If enough sellers ask for it, we&rsquo;ll say so on this page.</p>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPro(true);
                  track("seller_pro", { step: "interest" });
                }}
              >
                I&rsquo;d use Seller Pro
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
