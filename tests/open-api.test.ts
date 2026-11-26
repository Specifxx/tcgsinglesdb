// The open card API (lib/open-api.ts): public card data for our sister sites' collection apps, read-only and CDN-cached.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openCard, openHeaders, parseIds, pickHistory } from "../src/lib/open-api";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : []);

test("ids are whole, positive, unique, sorted and capped (one collection = one cache key)", () => {
  assert.deepEqual(parseIds("5,3,3,abc,-1,2.5,,7"), [3, 5, 7]);
  assert.deepEqual(parseIds(null), []);
  assert.equal(parseIds(Array.from({ length: 500 }, (_, i) => i + 1).join(",")).length, 200);
});

test("a card keeps only real prices and none of the index fields", () => {
  const c = openCard({ id: 1, s: "a-1", n: "A", no: "1/2", r: "Rare", p: { Normal: 120, Holofoil: 0 } as never, ix: 1, since: "2026-11-18" });
  assert.deepEqual(c, { id: 1, s: "a-1", n: "A", no: "1/2", r: "Rare", p: { Normal: 120 } });
});

test("history returns only the asked cards", () => {
  assert.deepEqual(pickHistory({ "1": [[1, 100]], "2": [[1, 5]], "3": [] }, [1, 3, 9]), { "1": [[1, 100]] });
});

test("headers: CORS-open GET, CDN-cached at least six hours, never indexed", () => {
  const h = openHeaders();
  assert.equal(h["Access-Control-Allow-Origin"], "*");
  assert.equal(h["Access-Control-Allow-Methods"], "GET");
  assert.equal(h["X-Robots-Tag"], "noindex");
  const s = Number(/s-maxage=(\d+)/.exec(h["Vercel-CDN-Cache-Control"])?.[1]);
  assert.ok(s >= 21600);
});

test("every open route is GET-only, reads no request headers or cookies, and answers through openJson", () => {
  const routes = walk(join(ROOT, "src/app/api/open")).filter((f) => f.endsWith("route.ts"));
  assert.equal(routes.length, 4);
  for (const f of routes) {
    const t = readFileSync(f, "utf8");
    assert.match(t, /export (async )?function GET/, f);
    assert.doesNotMatch(t, /export (async )?function (POST|PUT|PATCH|DELETE)/, f);
    assert.doesNotMatch(t, /req\.headers|cookies\(|headers\(\)/, f);
    assert.match(t, /openJson\(/, f);
  }
});
