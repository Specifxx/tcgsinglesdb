// The ONE file that names games and the brand. Engine code (src/lib, src/app, scripts) never names a game.
//
// Each game is a TCGplayer product line (TCGCSV category id). A game is imported and shown only while `live` is true, and a game
// goes live only after the one before it passed its indexing gate (DECISIONS.md, 2026-11-18). `slug` is the first URL segment and
// is frozen once the game is live.
export interface Game {
  slug: string;
  name: string;
  /** How the game is named in a sentence and an eBay search. */
  short: string;
  category: number;
  live: boolean;
  /** false: every page is live for visitors but no card is released to Google (a sister site serves these cards in search). */
  index?: boolean;
  /** Cards released to Google per day for this game instead of CARD_INDEX_GROWTH. Only with the owner's go: Pokémon may get a
   *  faster ramp after the 8 Dec 2026 read if its released cards pass 150+ Google clicks a week (owner, 2026-11-19). */
  growth?: number;
  /** The card scanner (/scan) reads this game. Set only once the game's accuracy eval passed (scan-eval/<game>.json,
   *  tests/scan.test.ts; DECISIONS.md 2026-11-20 "Card scanner"). */
  scan?: boolean;
  /** Why a game is not live yet (shown nowhere; for the next reader). */
  note?: string;
}

export const SITE = {
  name: "TCG Singles DB",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://tcgsinglesdb.com").replace(/\/$/, ""),
  tagline: "Single-card prices for every trading card game",
  /** EPN customid and Impact sharedid prefix: tells this site apart in the networks' reports. */
  tag: "tcgsdb",
  /** Rift Compare reads the scanner's photo (one model call; it holds the key, the caps and the counters). */
  scanReadUrl: "https://riftcompare.com/api/scan/read",
  disclaimer:
    "TCG Singles DB is an independent price guide. It is not affiliated with, endorsed by or sponsored by The Pokémon Company, Nintendo, Konami, Wizards of the Coast, TCGplayer, eBay or any card game publisher. Card names and images belong to their owners.",
} as const;

export const GAMES: Game[] = [
  // Every game live at once (owner, 2026-11-18: "get all these singles in"). Google still sees cards only as the per-game
  // index ramp releases them (1,000 a game, then CARD_INDEX_GROWTH a day). Category ids are TCG Prices' (tcgcompare site.config).
  { slug: "pokemon", name: "Pokémon", short: "Pokemon", category: 3, live: true },
  { slug: "magic", index: false, name: "Magic: The Gathering", short: "MTG", category: 1, live: true },
  { slug: "yugioh", name: "Yu-Gi-Oh!", short: "Yugioh", category: 2, live: true },
  { slug: "one-piece", index: false, name: "One Piece Card Game", short: "One Piece", category: 68, live: true },
  { slug: "lorcana", index: false, name: "Disney Lorcana", short: "Lorcana", category: 71, live: true },
  { slug: "riftbound", index: false, name: "Riftbound", short: "Riftbound", category: 89, live: true },
  { slug: "pokemon-japan", name: "Pokémon Japan", short: "Pokemon Japanese", category: 85, live: true },
  { slug: "star-wars-unlimited", name: "Star Wars: Unlimited", short: "Star Wars Unlimited", category: 79, live: true },
  { slug: "gundam", index: false, name: "Gundam Card Game", short: "Gundam Card Game", category: 86, live: true },
  { slug: "flesh-and-blood", name: "Flesh and Blood", short: "Flesh and Blood", category: 62, live: true },
  { slug: "digimon", name: "Digimon Card Game", short: "Digimon", category: 63, live: true },
  { slug: "dragon-ball-fusion-world", name: "Dragon Ball Super Fusion World", short: "Dragon Ball Fusion World", category: 80, live: true },
  { slug: "union-arena", name: "Union Arena", short: "Union Arena", category: 81, live: true },
  { slug: "weiss-schwarz", name: "Weiß Schwarz", short: "Weiss Schwarz", category: 20, live: true },
  { slug: "cardfight-vanguard", name: "Cardfight!! Vanguard", short: "Cardfight Vanguard", category: 16, live: true },
  { slug: "sorcery", name: "Sorcery: Contested Realm", short: "Sorcery Contested Realm", category: 77, live: true },
  { slug: "grand-archive", name: "Grand Archive", short: "Grand Archive", category: 74, live: true },
  { slug: "hololive", name: "hololive OFFICIAL CARD GAME", short: "hololive card game", category: 87, live: true },
  { slug: "godzilla", name: "Godzilla Card Game", short: "Godzilla Card Game", category: 88, live: true },
  { slug: "cyberpunk", index: false, name: "Cyberpunk TCG", short: "Cyberpunk TCG", category: 92, live: true },
  { slug: "final-fantasy", name: "Final Fantasy TCG", short: "Final Fantasy TCG", category: 24, live: true },
  { slug: "dragon-ball-super-masters", name: "Dragon Ball Super Masters", short: "Dragon Ball Super Card Game", category: 27, live: true },
  { slug: "shadowverse-evolve", name: "Shadowverse: Evolve", short: "Shadowverse Evolve", category: 73, live: true },
  { slug: "universus", name: "UniVersus", short: "UniVersus", category: 25, live: true },
  { slug: "naruto", name: "Naruto Card Game", short: "Naruto Card Game", category: 93, live: true },
  { slug: "elestrals", name: "Elestrals", short: "Elestrals", category: 83, live: true },
  { slug: "cookierun-braverse", name: "CookieRun: Braverse", short: "CookieRun Braverse", category: 90, live: true },
  { slug: "palworld", name: "Palworld Card Game", short: "Palworld Card Game", category: 91, live: true },
  { slug: "wixoss", name: "WIXOSS", short: "WIXOSS", category: 67, live: true },
  { slug: "battle-spirits-saga", name: "Battle Spirits Saga", short: "Battle Spirits Saga", category: 72, live: true },
  { slug: "alpha-clash", name: "Alpha Clash", short: "Alpha Clash", category: 78, live: true },
];

export const LIVE_GAMES = GAMES.filter((g) => g.live);
export const gameBySlug = (slug: string): Game | null => LIVE_GAMES.find((g) => g.slug === slug) ?? null;
