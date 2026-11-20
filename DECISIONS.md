# Decisions

## 2026-11-18: a separate site for singles, one game at a time

The owner asked for a new site just for TCG singles covering every game ("tcgsinglesdb", 17 Nov) and approved the plan
(`ops/tcgsinglesdb-plan-2026-11-18.html` in the project files).

- **Own domain, not a section of TCG Prices.** TCG Prices went live on 14 Nov 2026, so it has no authority to lend, and the
  sealed sites earned A$2,444 of the network's A$3,144 in the 30 days before: a bad indexing result must stay off them.
- **Why rationed.** Dex's full card catalogue fell to zero impressions by September 2026 (5,594 URLs still "crawled, not indexed"
  on 16 Nov); MTG Compare's 42,000 sitemap URLs got its homepage indexed (19 Oct). YGO Compare's cards did index: its Google clicks
  fell 88% when they were removed (6 Nov), but singles earned A$1.53 of its A$39.93 a week. So: every card is a page, Google sees
  1,000 per game first, then 250 a day, US$1 and up.
- **Order.** Pokémon (no singles anywhere in the network, and it keeps them off Dex during the dexcompare.io move), Yu-Gi-Oh!
  (proven demand, no home), the uncovered games, Magic only after MTG Compare's read on about 9 Dec, the sister-covered games last.
- **Stop rules.** Under 30% of released cards indexed three weeks after a game's launch: `CARD_INDEX_GROWTH=0`, no new game. A
  sealed sister's Google clicks down 15% week on week with no other cause: that game goes noindex. Under A$0.01 a visitor after
  eight weeks: keep, add nothing.
- **What a page has that TCGplayer's does not.** History from the first import (a point only when the value moves 2% and 5 cents;
  cards at US$1 and up), the week's movers (cards at US$5 and up), every game in one search, and a plain dated price sentence plus
  `Product` structured data without an `Offer` (we do not sell the card).
- **Prices per printing as TCGplayer names them** (`Record<subTypeName, cents>`), not MTG Compare's fixed normal/foil/etched:
  Pokémon has Holofoil, Reverse Holofoil and 1st Edition; Yu-Gi-Oh! has 1st Edition, Unlimited and Limited.
- **Data is read with fs and traced into the functions.** Simple and proven on MTG Compare (24 MB of cards). A test fails at
  150 MB; `lib/store.ts` is the one place to change then.
- **US only.** TCGplayer's price is one US-dollar figure; the eBay row is eBay.com. Regions are not built.
- **Not built yet:** the one footer link to `/our-sites` (needs `lib/family-network.ts`), a per-card JSON endpoint, share images.

## 2026-11-18: every game live at once, Google still rationed

The owner, on launch day: "we need to get all these singles and stores in." Every game TCG Prices lists (31, its TCGplayer
category ids) is live, instead of one game per three-week gate. What protects the site from a thin-content verdict is not the
catalogue but what Google is shown, and that stays rationed per game: 1,000 cards on a game's first run, then 250 a day, US$1
and up. The four games a sister site already serves in search (Magic, One Piece, Riftbound, Lorcana) are `index: false`:
visitors get every card, Google gets none of them, so two of our hosts never compete for one card. A game with no data yet has
no page, menu entry or sitemap file. The tripwire stays: under 30% of a game's released cards indexed three weeks after its
launch pauses that game's growth.

## 2026-11-18: Store prices for singles, by TCGplayer id only

Owner, 18 Nov: "we need to get all these singles and stores in". Card pages now list independent US stores that have the card
Near Mint and in stock, under the eBay and TCGplayer rows. Why this shape:

- **By id, never by title.** Stores on TCGplayer-linked point-of-sale systems put TCGplayer's product id in the photo file name
  or the SKU; that id is the card. A title-only match would put a reverse holo's price on a holo, so a listing without exactly
  one id is skipped. The printing must then be named without doubt, else skipped.
- **US stores, US$ only, for now.** The site's reference price is TCGplayer's US$ market price and the band (40-250%) compares
  like with like; prices are never converted. Other markets can follow with their own band once the US rows prove out.
- **Rotation, not a full read.** A big store lists tens of thousands of singles. Each run reads up to 60 pages a store from a
  saved cursor, least recently read stores first, within 110 minutes; a matched listing is shown for 4 days after its last read.
- **Candidates from TCG Prices.** `data/stores/candidates.json` is a one-time copy of TCG Prices' US store list (its blocklist
  and refused stores left out, `data/stores/blocklist.json` copied too). Refresh it by hand from that repo when it grows.


## 2026-11-18: A share button, counted like the sister sites' (owner)

Owner: a share feature on every site so links spread by word of mouth. Card and set pages carry `ShareButton` (the phone's share
sheet, else copy link) sharing the canonical path plus `utm_source=share&utm_medium=card|set`; each tap sends `share { medium }`
and `Trackers` sends `share_visit { medium }` once per session for a visit a shared link brings, the same events RiftCompare's
growth report reads for every site. robots.txt allows `/*utm_source=share` so X's and Reddit's preview fetchers can read a
shared link. The preview stays the card's own TCGplayer image: no image is drawn, so sharing costs nothing. No share-for-a-deal
offer here yet: this site has no deals page.

## 2026-11-18: a return-visit beacon, so retention has a number on every site

Owner, 2026-11-18: "we want new visitors and we want to retain those visitors". Vercel Web Analytics cannot tell a returning
visitor from a new one, and Google Analytics runs on only four of the sites (consent-gated on two). `lib/return-visit.ts` keeps one
small localStorage record (`rv`: first day, last day, visit days) and `components/ReturnBeacon.tsx` (root layout, renders nothing)
sends ONE `return_visit` event the first time a returning visitor opens the site on a new day. New visitors send nothing (Vercel's
visitor count is the denominator), so it costs at most one event per returning visitor per day. Properties are buckets only:
`k` = "<days since last visit>:<page type>", `age` = days since first visit, `n` = visit days, `via` (direct, search, email, share,
social, ai, other), plus the arm of each live 50/50 test (`rn`, `ln`, `share`, `cart`, `watch`) so every retention lever reads its
return rate on against off. No id, date or URL leaves the browser. The identical file is in every Compare repo; read weekly by the
retention thread. Rollback: remove `<ReturnBeacon />` from the layout.

## 2026-11-18: the return-visit beacon also carries the `since` arm

Retention lever 2 ("Since your last visit", on the sister sites) is a 50/50 test under `since-arm`; `ARM_KEYS` in
`lib/return-visit.ts` gains `since` so the file stays the same in every repo. Nothing changes on this site until it runs the lever.

## 2026-11-18 — "Who pays most?": Card Kingdom's cash buylist on Magic card pages (growth test #1)

Owner's go (18 Nov, growth ideas list, item 1): a seller-side comparison, starting with Card Kingdom. `scripts/buylist.ts` runs
in `card-prices.yml` after the store crawl and never stops the release. It reads Card Kingdom's public price list
(`api.cardkingdom.com/api/v2/pricelist`, one request through `polite-http`; that host's robots.txt allows every path, while
www.cardkingdom.com's disallows `/api/`, which we never ask) and Scryfall's bulk `default_cards` file, streamed
(`JsonArraySplitter`, about half a gigabyte, never held whole). A row reaches a card ONLY by id: Card Kingdom's `scryfall_id` →
Scryfall's `tcgplayer_id` → our card. Never by title. `matchCk` only refuses: not buying, no id, not our card, etched and other
special finishes (TCGplayer files them under another id), a card under US$1, or a cash price under 10% or over 125% of the
printing's TCGplayer market (a mismatch, not a bargain). Output: `data/buylist/magic/<set>.json`, `top.json` (the 200 best
offers, for `/sell`) and `meta.json`; after 3 days without a good read the rows are dropped, never shown stale. The card page
shows a "Sell it: who pays most?" block (cash, Near Mint, share of market, copies wanted, date); `/sell` lists the 100 best
offers. Links to the buyer are unpaid, `rel="nofollow"`. The ops monitor's "Card Kingdom buylist" check is red after 50 hours.
Read the result on 9 Dec (clicks on "Sell to", `/sell` visits). More buyers (Star City Games, ABU, TCGplayer's buylist) join
`BUYERS` only through a public list that carries an id we can map, never a title.

## 2026-11-18: Graded-card demand test (PSA 10 on eBay)

Every TCG in TCGplayer's Q3 2026 top 10 already has a site of ours; the open market is graded slabs (Collectr's
June 2026 report: 60% of tracked TCG sales value, PSA 85% of it). Before building a graded site, Pokémon card pages
carry one more row, "PSA 10 on eBay": a tagged eBay search (customid `tcgsdb-us-graded`), no API call, no price
claimed, `GRADED_TEST_GAMES` in `lib/affiliate.ts`. The click event carries `kind: graded`. Read on 2 Dec 2026:
EPN clicks and sales on `tcgsdb-us-graded` against `tcgsdb-us-card-ebay`. If it earns, propose the graded site
(domain is Bill's spend); if not, remove the row. Plan: `/mnt/project-files/strategy/new-market-ranking-2026-11-18.html`.

## 2026-11-18: Gundam and Cyberpunk singles noindex too (core update)

Gundam Compare and Cyberpunk Compare serve the same single cards in search, from the same TCGplayer prices, and both lost
most of their Google impressions in the November 2026 core update (Gundam about 327 a day to 2, Cyberpunk 287 to 28). A
second host of ours offering the same card pages is the network duplication the quality push is removing, so these two games
join the four `index: false` ones: every card stays live for visitors, none is released to Google or put in a sitemap. Turn one
back on only with the owner, and only if its sister drops its card pages.


## Who runs it and what it costs, on /about (2026-11-19)

Core-update quality pass (owner, 2026-11-19). The site has no banner ads and a four-link footer, so nothing moved. /about
now says who runs it (Bill and George), how AI tools are used, and what the sites cost (about A$790 a month, our books,
30 days to 15 Nov 2026).

## 2026-11-19: A phone ad strip, on the owner's word (owner)

The owner, 2026-11-19, of the sister sites' phone dock: "I want it for all the sites, so people have like an ad on their phone right
there … we can have eBay as a strip banner there." This site had no ad unit at all (CLAUDE.md, "Money": no banner ads), so the
owner's ask is the exception, and only this one unit: `components/PhoneStrip.tsx`, a slim bar at the foot of a phone screen (below
720px) with a tagged eBay search and a TCGplayer link (through `/out/tcgplayer`), both labelled Ad, rel sponsored, claiming no
price, under their own placements (`dock-ebay`, `dock-tcgplayer`). On a card page it searches that card; elsewhere the game in the
path. Browser only (nothing in the server HTML), never on the first screen, hidden near the card page's buy rows, the footer and
while typing, ✕ for the visit, moved on transform only (CLS 0), never Amazon, never a pop-up. `tests/phone-strip.test.ts` pins it.
CLAUDE.md's "No banner ads" line is the owner's to amend.

## 2026-11-19: Price history draws the cheapest US store listing against TCGplayer's market price

Owner: "I really really like opcompare's price history where you have the tcgplayer market price as well as the cheapest price
locally. Can we pls copy it across all our tcg websites?" The card page's chart (`components/PriceHistory.tsx`, maths in
`lib/history-chart.ts`, the same helpers as TCG Prices and the engine sites) now draws two lines in US$: the cheapest in-stock
store row of the card's headline printing (solid red) and TCGplayer's market price (dashed gold), with Now / Low / High, the
change, 7D / 30D / 90D / All tabs once the history is longer than them, and a hover, touch or arrow-key tooltip reading both.

- The red line is new data: `scripts/stores.ts crawl` folds each card's cheapest in-stock row of the HEADLINE printing (the one
  `cardValue` reads, so both lines price the same copy) into `data/history/_stores/<game>/<set>.json`, change-points as
  `data/history`, followed from the day a store first has the card, 0 on a day none has it (a gap, never a price)
  (`lib/store-history.ts`, `tests/store-history.test.ts`). It sits under `data/history/` so it is never bundled into a function
  and is read from the raw file like the TCGplayer history. It starts with the next crawl; until then the gold line draws alone.
- No new request to any store or API: the rows are the ones the store table already shows. Nothing reads the line to rank,
  badge or claim a cheapest.

## 2026-11-19: a per-game Google ramp, for Pokémon after the 8 Dec read

Owner, 19 Nov (boardroom plan, move N1): Pokémon singles may release to Google faster than 250 a day after the 8 Dec read, if
the cards released so far bring 150+ Google clicks a week. `Game.growth` overrides `CARD_INDEX_GROWTH` for one game; `0` in the
variable still pauses every game. Nothing is set yet: on 8 Dec, pass sets Pokémon's `growth` (proposed 1,000 a day, which
releases its 17,069 US$1+ cards in about two weeks); a miss keeps 250 and the 9 Dec 30%-indexed tripwire still applies.


## 2026-11-20: A Santa hat on the logo and lights under the header

**Owner, 2026-11-20:** "change the logo for all of our websites so that it's Christmas themed now. Put a Santa hat on top
of the logos … and add some decorations here and there, like some Christmas lights … and yeah, Santa Claus." The owner
asked for hats and lights by name, so they come back after the 2026-11-08 tone-down, kept to the header.

- The logo mark wears a Santa hat (class `xmas-cap` on its wrapper), a string of lights hangs under the sticky header
  (`xmas-garland`), and the home page's gift-guide line, where there is one, gets a small Santa. All of it is the
  `xmas-logo` block in `globals.css`, the same block on every Compare site (RiftCompare's DECISIONS has the history).
- CSS only: three inline SVG data URIs (~2.5 KB of stylesheet), no request, no script, no animation. Every piece is
  `position: absolute` and `pointer-events: none`: no layout shift, no tap caught, nothing in the server HTML changes
  but two class names, so titles, metadata and structured data are untouched. Favicons and share images are unchanged.
- Off switch: `CHRISTMAS_FESTIVE_LAYER` in the new `lib/season.ts`. This site has no boot script, so the layout sets
  `data-season` and `data-festive` from the UTC date (1 Nov to 26 Dec); with pages held a day by the CDN it ends by
  28 December at the latest. The hat sits on the "T" of the word logo, sized in em. Remove after New Year: delete the block and the two classes.

## 2026-11-20: Card pages v2: details, tracked highs and lows, rank in set, reprints, insights

Owner's brief (20 Nov): card pages should hold as much as a collector wants to know. The import now keeps TCGplayer's own
fields for each card (`extendedData` minus number and rarity: type, HP, attacks, text, artist…), as plain text, capped at 14
fields of 600 characters, in `data/details/<game>/<set>.json` (`detailsOfGroup`, `lib/cards.ts`). Like history it is NOT bundled
(next.config.js excludes it; `tests/cost-rules.test.ts`): the card page fetches the set's file from this public repo's raw copy at
the deployed commit (`rawFile` in `lib/store.ts`), so data/ stays well under the function limit. A failed group read keeps
yesterday's file. The page adds "at a glance" (tracked high and low once the price has moved, 7- and 30-day change once the
history reaches that far, rank in set and share of the set's value), plain-English insights (`lib/insights.ts`: each one a
number the page already shows; never a forecast or advice to buy or sell), a card details table and other printings of the same
name (exact name, from search.json). Highs and lows are "since we began reading the card": history is never backfilled.

## 2026-11-20: The card coverage guard (owner: every card on every site, promos and new sets included)

Owner, 2026-11-20: "every new set that comes in, we have all the cards on our websites", promos and special printings too,
for every game, kept true without him (he knows only Riftbound). `coverage.yml` runs `scripts/coverage.ts`:

- **Daily 23:47 UTC, the release watch**: every TCGplayer group published in the last 21 days or dated in the next 45 (TCGplayer's
  own release calendar), every group TCGplayer modified in the last 3 days (promo and event groups keep a years-old date and gain
  cards monthly), and any group we lack. **Mondays, the full audit**: every group of all 31 games.
- Compared with this site's cards and with the sister site of each game (OP Compare's snapshot, MTG Compare's card files,
  Lorcana / Gundam / Cyberpunk Compare's catalogues; Rift Compare has its own `coverage-audit.yml`), all public data.
- Independent lists, Mondays: Scryfall (Magic: every short or promo set card by card through Scryfall's TCGplayer ids),
  YGOPRODeck (every printed code), pokemontcg.io (set sizes, matched by code then name), Lorcast (Lorcana, by TCGplayer id,
  else by name) and OPTCG API (One Piece numbers and printings). These only report: a card TCGplayer does not sell has no
  price to show, so it is listed, never invented.
- A card counts as a gap only after two days missing (`data/coverage/state.json`): a card TCGplayer adds after a site's import
  is normal for a day. A gap opens or updates the issue "Card coverage gaps" and turns the ops monitor red.
- Cards Lorcana, Gundam and Cyberpunk Compare leave out under their US$1 floor (owner, 2026-11-07) are counted apart, not
  as gaps: every one of them has a page here.

First run (20 Nov): TCGplayer's catalogue is mirrored in full here (gaps only cards TCGplayer added after the 19 Nov import);
MTG Compare lacked 22 numbered "Emblem" cards (fixed, mtgcompare #242).
