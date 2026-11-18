// IndexNow (Bing, Yandex, Seznam…). The key is public by design (every engine fetches it from /indexnow-key.txt to check a
// ping came from this host), so it lives in the code, not in a secret.
export const INDEXNOW_KEY = "6b9c187f5f2786fc599945e90f5c8f58";
export const INDEXNOW_MAX = 1000;

/** Pure: the URLs never sent before, most valuable first, at most INDEXNOW_MAX. */
export function pickNew(cands: { url: string; w: number }[], sent: Record<string, string>): string[] {
  return cands
    .filter((c) => !(c.url in sent))
    .sort((a, b) => b.w - a.w)
    .slice(0, INDEXNOW_MAX)
    .map((c) => c.url);
}
