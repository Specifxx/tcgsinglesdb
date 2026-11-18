// The HTTP client of the store crawl (lib/stores/, scripts/stores-probe.ts, scripts/stores-crawl.ts), copied from TCG Prices: the
// only code in this repository that visits a store. It is strict on purpose:
//
// - robots.txt first, once per store and run: a path it disallows is never asked for. A robots.txt that is missing
//   (404/410) allows everything; one that cannot be read (5xx, timeout) allows nothing that run (RFC 9309).
// - An honest User-Agent that names this site, and a `From` address.
// - One request at a time per store, at least DELAY_MS between two of them, and the caller runs two stores at a time
//   (`eachStore`).
// - A 401, 403 or 429, a captcha or a challenge page (Cloudflare's "Just a moment", cf-chl, hCaptcha, reCAPTCHA)
//   STOPS that store for the run. No retry, no way around it.
// - A timeout per request, a request budget for the whole run and a cap per store: a run can never grow.
//
// Everything that touches the network is injected (fetch, sleep, clock), so tests/crawl.test.ts runs it offline.

export const USER_AGENT = "tcgsinglesdb.com price comparison (+https://tcgsinglesdb.com/about; compareempire@gmail.com)";
/** The token our robots.txt group would be listed under. */
export const ROBOTS_TOKEN = "tcgsinglesdb";
export const DELAY_MS = 1000;
export const TIMEOUT_MS = 20_000;
/** Consecutive failed requests (5xx, timeouts, unreadable JSON) after which a store is dropped for the run. */
export const MAX_ERRORS = 3;

export type StopReason = "blocked" | "challenge" | "robots-unreachable" | "budget" | "store-cap" | "errors" | "deadline";

/** Thrown when a store must not be asked anything more this run. */
export class StopStore extends Error {
  constructor(
    public reason: StopReason,
    detail: string,
  ) {
    super(`${reason}: ${detail}`);
  }
}

/** The run's request budget, shared by every store. */
export class RequestBudget {
  used = 0;
  constructor(public readonly limit: number) {}
  take(): boolean {
    if (this.used >= this.limit) return false;
    this.used++;
    return true;
  }
  get left() {
    return this.limit - this.used;
  }
}

export interface PoliteOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  budget: RequestBudget;
  /** Most requests one store may be sent this run (robots.txt included). */
  perStoreCap: number;
  delayMs?: number;
  timeoutMs?: number;
  /** No request starts after this time (ms since epoch). */
  deadline?: number;
}

// ── robots.txt ──────────────────────────────────────────────────────────────

interface Rule {
  allow: boolean;
  pattern: string;
  re: RegExp;
}

const ruleRe = (pattern: string): RegExp => {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
};

/**
 * The rules of the group that names our token, else of `User-agent: *`; Allow/Disallow with `*` and `$` (RFC 9309).
 * Returns a checker for a path with its query. The longest matching rule wins; on a tie, Allow.
 */
export function parseRobots(text: string, token = ROBOTS_TOKEN): (pathAndQuery: string) => boolean {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur || (field !== "allow" && field !== "disallow")) continue;
    if (!value) continue; // "Disallow:" with nothing allows everything
    cur.rules.push({ allow: field === "allow", pattern: value, re: ruleRe(value) });
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && token.toLowerCase().includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  return (p: string) => {
    let best: Rule | null = null;
    for (const r of rules) {
      if (!r.re.test(p)) continue;
      if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
    }
    return !best || best.allow || p === "/robots.txt";
  };
}

// ── Challenge pages ─────────────────────────────────────────────────────────

const CHALLENGE = /cf-chl|cf_chl|challenge-platform|\/cdn-cgi\/challenge|just a moment\.\.\.|attention required! \| cloudflare|captcha|hcaptcha|g-recaptcha|px-captcha|perimeterx|datadome|are you a robot|verify you are human/i;

/** A bot wall or a captcha, from its headers or its body. */
export function isChallenge(status: number, headers: Headers, body: string): boolean {
  if (/challenge/i.test(headers.get("cf-mitigated") ?? "")) return true;
  if (headers.get("x-datadome") || headers.get("x-px-captcha")) return true;
  return CHALLENGE.test(body.slice(0, 50_000)) && (status !== 200 || /html/i.test(headers.get("content-type") ?? "") || /^\s*</.test(body));
}

// ── One store's session ─────────────────────────────────────────────────────

/** Everything this run asks one store goes through one session: one request at a time, robots.txt first. */
export class StoreSession {
  requests = 0;
  /** Requests that failed (5xx, timeout, a 200 that was not JSON): a caller compares it before and after a read to
   *  tell a failed page from an honest "nothing here" (a 404, or a path robots.txt disallows). */
  failures = 0;
  stopped: { reason: StopReason; detail: string } | null = null;
  private allows: ((p: string) => boolean) | null = null;
  private lastAt = -Infinity;
  private errors = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly f: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    public readonly base: string,
    private readonly opts: PoliteOptions,
  ) {
    this.f = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
  }

  private stop(reason: StopReason, detail: string): never {
    this.stopped ??= { reason, detail };
    throw new StopStore(reason, detail);
  }

  /** One raw request, spaced from the last one, counted against the budget and the store's cap. */
  private async send(pathAndQuery: string): Promise<{ status: number; headers: Headers; body: string } | null> {
    if (this.stopped) throw new StopStore(this.stopped.reason, this.stopped.detail);
    if (this.opts.deadline != null && this.now() >= this.opts.deadline) this.stop("deadline", "the run's time is up");
    if (this.requests >= this.opts.perStoreCap) this.stop("store-cap", `${this.opts.perStoreCap} requests`);
    const wait = this.lastAt + (this.opts.delayMs ?? DELAY_MS) - this.now();
    if (wait > 0) await this.sleep(wait);
    if (!this.opts.budget.take()) this.stop("budget", `the run's ${this.opts.budget.limit} requests are spent`);
    this.requests++;
    this.lastAt = this.now();
    let res: Response;
    try {
      res = await this.f(`${this.base}${pathAndQuery}`, {
        headers: { "User-Agent": USER_AGENT, From: "compareempire@gmail.com", Accept: "application/json, text/plain;q=0.9, */*;q=0.1" },
        redirect: "follow",
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? TIMEOUT_MS),
      });
    } catch {
      this.lastAt = this.now();
      return null;
    }
    const body = await res.text().catch(() => "");
    this.lastAt = this.now();
    if (res.status === 401 || res.status === 403 || res.status === 429) this.stop("blocked", `HTTP ${res.status} on ${pathAndQuery}`);
    if (isChallenge(res.status, res.headers, body)) this.stop("challenge", `challenge page on ${pathAndQuery}`);
    return { status: res.status, headers: res.headers, body };
  }

  private async robots(): Promise<(p: string) => boolean> {
    if (this.allows) return this.allows;
    const r = await this.send("/robots.txt");
    if (r && (r.status === 404 || r.status === 410)) this.allows = () => true;
    else if (!r || r.status >= 500 || r.status !== 200) this.stop("robots-unreachable", r ? `robots.txt answered HTTP ${r.status}` : "robots.txt did not answer");
    else this.allows = parseRobots(r.body);
    return this.allows!;
  }

  /** May this path be asked for? Reads robots.txt the first time. */
  async allowed(pathAndQuery: string): Promise<boolean> {
    return (await this.robots())(pathAndQuery);
  }

  /**
   * GET JSON, one request at a time. null when robots.txt disallows the path, or the answer is not JSON (a 404, a
   * store on another platform). Throws StopStore when the store must be left alone.
   */
  getJson<T>(pathAndQuery: string): Promise<T | null> {
    const run = async (): Promise<T | null> => {
      if (!(await this.allowed(pathAndQuery))) return null;
      const r = await this.send(pathAndQuery);
      if (!r || r.status >= 500) return this.failed(pathAndQuery);
      if (r.status !== 200) return null;
      try {
        const v = JSON.parse(r.body) as T;
        this.errors = 0;
        return v;
      } catch {
        this.failures++;
        return null;
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** GET an HTML or text page, one request at a time. null when robots.txt disallows the path or it did not answer 200. */
  getText(pathAndQuery: string): Promise<string | null> {
    const run = async (): Promise<string | null> => {
      if (!(await this.allowed(pathAndQuery))) return null;
      const r = await this.send(pathAndQuery);
      if (!r || r.status >= 500) return this.failed(pathAndQuery);
      if (r.status !== 200) return null;
      this.errors = 0;
      return r.body;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private failed(p: string): null {
    this.failures++;
    if (++this.errors >= MAX_ERRORS) this.stop("errors", `${MAX_ERRORS} failed requests in a row (last ${p})`);
    return null;
  }
}

/** Runs `fn` over `items`, exactly `concurrency` at a time (two stores, by default). */
export async function eachStore<T>(items: readonly T[], fn: (item: T) => Promise<void>, concurrency = 2): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
