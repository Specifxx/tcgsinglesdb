"use client";
// Share (owner, 2026-11-18, word of mouth; ported from TCG Prices): the phone's own share sheet (navigator.share) where there
// is one, else the link copied with a short "Link copied" note. No pop-up, no account. The link is the page's canonical URL plus
// utm_source=share&utm_medium=<what>, so the visit it brings is counted (Trackers' share_visit), and each tap sends one Vercel
// event, share { medium }. The link preview is the card's own TCGplayer image (seo.ts): nothing is drawn, nothing costs.
import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { SITE } from "@/site.config";

export type ShareMedium = "card" | "set" | "game";

export function shareUrl(base: string, path: string, medium: ShareMedium): string {
  const u = new URL(path, base);
  u.searchParams.set("utm_source", "share");
  u.searchParams.set("utm_medium", medium);
  return u.toString();
}

export function ShareButton({ path, title, text, medium }: { path: string; title: string; text: string; medium: ShareMedium }) {
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function share() {
    const url = shareUrl(SITE.url, path, medium);
    try {
      track("share", { medium });
    } catch {}
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setNote("Link copied");
    } catch {
      setNote("Couldn’t copy the link");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(""), 2500);
  }
  return (
    <span className="share">
      <button type="button" className="btn" onClick={share} aria-label={`Share ${title}`}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v13" />
        </svg>
        <span style={{ marginLeft: 6 }}>Share</span>
      </button>
      <span role="status" aria-live="polite" className="small" style={{ marginLeft: 8 }}>
        {note}
      </span>
    </span>
  );
}
