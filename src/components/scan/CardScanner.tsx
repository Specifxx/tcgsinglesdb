"use client";

// The card scanner's browser half (DECISIONS.md 2026-11-20 "Card scanner"). The live viewfinder frames the card and captures it
// on its own; a photo from the camera app or gallery works too. The capture is shrunk to 1,024 px and sent ONCE to Rift
// Compare's reader (SITE.scanReadUrl: 5 free a day per visitor), which returns only the text it read; this site's own
// /api/scan/match turns that into our cards. Look-alike printings are shown with their pictures and the visitor picks. The
// photo is never stored, here or there.
import { useCallback, useRef, useState } from "react";
import { Viewfinder } from "./Viewfinder";
import { addToCollection } from "@/lib/scan/collection";
import { cardImage, cardPath, usd } from "@/lib/format";

interface ScanCard { id: number; set: string; setName: string; s: string; n: string; no: string; r: string | null; prices: Record<string, number>; printing: string | null }
interface Scanned {
  key: number;
  photo: string;
  state: "reading" | "done" | "error";
  error?: string;
  kind?: "match" | "pick" | "none";
  why?: string;
  cards: ScanCard[];
  chosen: ScanCard | null;
  printing: string | null;
  added: number;
}

const MAX_SIDE = 1024;
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  let w: number, h: number, src: CanvasImageSource;
  if (bitmap) {
    w = bitmap.width; h = bitmap.height; src = bitmap;
  } else {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    w = img.naturalWidth; h = img.naturalHeight; src = img;
  }
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

const best = (p: Record<string, number>) => Math.max(0, ...Object.values(p));

export function CardScanner({ games, readUrl }: { games: { slug: string; name: string }[]; readUrl: string }) {
  const [game, setGame] = useState(games[0]?.slug ?? "");
  const [items, setItems] = useState<Scanned[]>([]);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const update = (key: number, patch: Partial<Scanned>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const scan = useCallback(
    async (photo: string) => {
      const key = Date.now();
      const fresh: Scanned = { key, photo, state: "reading", cards: [], chosen: null, printing: null, added: 0 };
      setItems((xs) => [fresh, ...xs].slice(0, 20));
      setBusy(true);
      try {
        const r = await fetch(readUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: photo.split(",")[1], game }) });
        const read = await r.json().catch(() => ({}));
        if (typeof read.remaining === "number") setRemaining(read.remaining);
        if (!r.ok) {
          if (read.limited) setRemaining(0);
          return update(key, { state: "error", error: read.error ?? "We couldn't read that photo. Try again." });
        }
        const m = await fetch("/api/scan/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, reading: read.reading }) });
        const res = await m.json().catch(() => ({}));
        if (!m.ok) return update(key, { state: "error", error: res.error ?? "Something went wrong. Try again." });
        const cards: ScanCard[] = res.cards ?? [];
        const chosen = res.kind === "match" ? cards[0] : null;
        update(key, { state: "done", kind: res.kind, why: res.why, cards, chosen, printing: chosen?.printing ?? null });
      } catch {
        update(key, { state: "error", error: "No connection. Try again." });
      } finally {
        setBusy(false);
      }
    },
    [game, readUrl],
  );

  if (!games.length) return <p className="lede">The scanner opens here as each game passes its accuracy test.</p>;
  const out = remaining === 0;
  return (
    <div className="sc">
      <div className="chips sc-games" role="radiogroup" aria-label="Which game?">
        {games.map((g) => (
          <button key={g.slug} type="button" role="radio" aria-checked={g.slug === game} className={`chip${g.slug === game ? " on" : ""}`} onClick={() => setGame(g.slug)}>
            {g.name}
          </button>
        ))}
      </div>
      <Viewfinder
        busy={busy || out}
        onCapture={scan}
        footnote={out ? "That's your 5 free scans for today. They come back tomorrow." : remaining !== null ? `${remaining} free scan${remaining === 1 ? "" : "s"} left today` : "5 free scans a day. Your photo is read once and never stored."}
      />
      <p className="sc-photo">
        <button type="button" className="btn" disabled={busy || out} onClick={() => pickRef.current?.click()}>
          Use a photo instead
        </button>
        <input
          ref={pickRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) scan(await shrink(f));
          }}
        />
      </p>

      <ol className="sc-results">
        {items.map((it) => (
          <li key={it.key} className="card sc-item">
            <img className="sc-thumb" src={it.photo} alt="Your photo" />
            <div className="sc-body">
              {it.state === "reading" && <p className="sc-status">Reading the card…</p>}
              {it.state === "error" && <p className="sc-status down">{it.error}</p>}
              {it.state === "done" && it.kind === "none" && (
                <p className="sc-status">
                  No match. Try again with the card flat and the number at the bottom in view, or <a href="/search">search by name</a>.
                </p>
              )}
              {it.state === "done" && !it.chosen && it.kind === "pick" && (
                <>
                  <p className="sc-status">
                    <b>Which one is it?</b> {it.cards.length} printings look alike. Tap yours.
                  </p>
                  <ul className="sc-pick">
                    {it.cards.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => update(it.key, { chosen: c, printing: c.printing })}>
                          <img src={cardImage(c.id)} alt="" loading="lazy" width={100} height={140} />
                          <span className="n">{c.n}</span>
                          <span className="m">{c.setName}{c.no ? ` · ${c.no}` : ""}</span>
                          <span className="p">{best(c.prices) ? usd(best(c.prices)) : "No price yet"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="sc-small">Not here? <a href="/search">Search by name</a>.</p>
                </>
              )}
              {it.chosen && (
                <Chosen
                  game={game}
                  c={it.chosen}
                  printing={it.printing}
                  added={it.added}
                  sure={it.kind === "match"}
                  onPrinting={(p) => update(it.key, { printing: p })}
                  onBack={it.kind === "pick" ? () => update(it.key, { chosen: null, printing: null }) : undefined}
                  onAdd={() => {
                    if (addToCollection({ id: it.chosen!.id, game, set: it.chosen!.set, s: it.chosen!.s, printing: it.printing ?? "Normal", src: "scan" })) update(it.key, { added: it.added + 1 });
                  }}
                />
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Chosen(p: { game: string; c: ScanCard; printing: string | null; added: number; sure: boolean; onPrinting: (k: string) => void; onAdd: () => void; onBack?: () => void }) {
  const keys = Object.keys(p.c.prices);
  const price = p.printing && p.c.prices[p.printing] ? p.c.prices[p.printing] : 0;
  return (
    <div className="sc-chosen">
      <a href={cardPath(p.game, p.c.set, p.c.s)} className="sc-card">
        <img src={cardImage(p.c.id)} alt="" width={100} height={140} />
        <span>
          {p.sure && <span className="sc-badge">Match</span>}
          <span className="n">{p.c.n}</span>
          <span className="m">{p.c.setName}{p.c.no ? ` · ${p.c.no}` : ""}{p.c.r ? ` · ${p.c.r}` : ""}</span>
          <span className="p">{price ? usd(price) : best(p.c.prices) ? `from ${usd(Math.min(...Object.values(p.c.prices).filter((v) => v > 0)))}` : "No price yet"}</span>
          <span className="sc-small">TCGplayer market price. Open the card for its history and store prices.</span>
        </span>
      </a>
      {keys.length > 1 && (
        <div className="chips" role="radiogroup" aria-label="Which printing?">
          {keys.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={p.printing === k} className={`chip${p.printing === k ? " on" : ""}`} onClick={() => p.onPrinting(k)}>
              {k} {p.c.prices[k] ? usd(p.c.prices[k]) : ""}
            </button>
          ))}
        </div>
      )}
      <div className="sc-actions">
        <button type="button" className="btn primary" disabled={keys.length > 1 && !p.printing} onClick={p.onAdd}>
          {p.added ? `Added ×${p.added} · add another` : "Add to My Collection"}
        </button>
        {p.added > 0 && <a className="btn" href="/collection">My Collection</a>}
        {p.onBack && <button type="button" className="btn" onClick={p.onBack}>Not this one</button>}
      </div>
      {keys.length > 1 && !p.printing && <p className="sc-small">Pick the printing (Normal, Holofoil…) to add it.</p>}
    </div>
  );
}
