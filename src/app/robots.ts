import type { MetadataRoute } from "next";
import { SITE } from "@/site.config";

// Crawlers that render the long tail for someone else's index and send no visitors are refused (each page they render is a billed
// function call). Search engines and AI answer engines (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended) are
// allowed: the owner wants the prices found in AI answers (2026-11-09). No page reads a query string, so "?" URLs are not crawled, except a shared link (utm_source=share): X's and Reddit's preview fetchers obey robots.txt, and
// the page canonicalises to its clean URL.
const BLOCKED = ["Bytespider", "meta-externalagent", "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot", "BLEXBot", "Barkrowler", "serpstatbot", "SeekportBot", "ImagesiftBot", "Timpibot", "AhrefsBot", "SemrushBot", "CCBot", "Diffbot", "omgili"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/_next/", "/*utm_source=share"], disallow: ["/api/", "/out/", "/search", "/*?"] },
      { userAgent: BLOCKED, disallow: "/" },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
