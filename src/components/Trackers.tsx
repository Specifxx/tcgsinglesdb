"use client";
// Two Vercel Web Analytics events, ported from TCG Prices (DECISIONS.md, 2026-11-18):
//   ai_referral: a visit from ChatGPT, Perplexity, Claude, Gemini, Copilot and the like, once per session (lib/ai-referral.ts);
//   buy_click: a click on a paid row (eBay or TCGplayer), with the game (the plan keeps two properties per event).
// Nothing is stored beyond sessionStorage; no address or text is read.
import { useEffect } from "react";
import { track } from "@vercel/analytics";
import { aiSourceOf } from "@/lib/ai-referral";

export function Trackers() {
  useEffect(() => {
    let src: string | null = null;
    try {
      src = sessionStorage.getItem("ai_source");
    } catch {}
    if (!src) {
      src = aiSourceOf(
        document.referrer,
        new URLSearchParams(location.search).get("utm_source"),
      );
      if (src) {
        try {
          sessionStorage.setItem("ai_source", src);
        } catch {}
        track("ai_referral", {
          assistant: src,
          page: location.pathname.slice(0, 80),
        });
      }
    }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const network = href.startsWith("/out/tcgplayer")
        ? "tcgplayer"
        : /(^|\.)ebay\.[a-z.]+\//.test(href.replace(/^https?:\/\//, ""))
          ? "ebay"
          : null;
      if (!network) return;
      track("buy_click", {
        network,
        game: location.pathname.split("/")[1] || "home",
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
