# @chess/openings-data

Builds the openings datasets shipped in `apps/web/public/data/` (PLAN §2.2).

## Commands (from the repo root)

| Command | What it does | Network |
|---|---|---|
| `pnpm --filter @chess/openings-data build` | Download sources (if not cached), merge, build graph, merge cached popularity + notes, emit hashed files + `manifest.json` + `ATTRIBUTION.md`. Removes stale hashed files. `--refresh-sources` re-downloads the TSV/JSON sources. | GitHub raw (first run only) |
| `pnpm --filter @chess/openings-data notes` | Fetch Wikibooks *Chess Opening Theory* pages for every opening path prefix. ≤ 2 req/s. Options: `--max-ply N`. | en.wikibooks.org |
| `pnpm --filter @chess/openings-data popularity` | Fetch Lichess Opening Explorer stats for every opening's final position. ~1 req / 1.5–2.5 s, 429 backoff. Options: `--only lichess\|masters`, `--source lichess\|eco.json`, `--limit N`. Needs `LICHESS_TOKEN` (env or repo-root `.env`). | explorer.lichess.org |
| `pnpm --filter @chess/openings-data test` | Vitest (fixtures in `test/fixtures/`). | — |

`build` never needs notes or popularity: it merges whatever is in the cache. Re-run `build` after a fetch to ship the new data.

Both fetch scripts are **resumable**: results append to `.cache/**/*.jsonl` and cached keys are skipped on the next run. Interrupt them any time. Long runs:

```sh
cd tools/openings-data
nohup pnpm -s popularity > .cache/popularity.log 2>&1 &
nohup pnpm -s notes > .cache/notes.log 2>&1 &
tail -f .cache/popularity.log
```

## Sources

| Source | Use | License |
|---|---|---|
| [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) `a–e.tsv` | Canonical names, ECO, lines | CC0 |
| [JeffML/eco.json](https://github.com/JeffML/eco.json) `ecoA–E.json` | Extra names + aliases + extra lines (`interpolated` entries skipped) | MIT |
| [Wikibooks Chess Opening Theory](https://en.wikibooks.org/wiki/Chess_Opening_Theory) (MediaWiki API) | Notes per position | CC BY-SA 4.0 |
| [Lichess Opening Explorer](https://lichess.org/api#tag/Opening-Explorer) `/lichess`, `/masters` | Popularity, W/D/L | Lichess API terms |

## Pipeline

1. **Parse** TSV + eco.json; replay every line with chessops (SAN → standard UCI with `e1g1` castling, per-ply EPD with legal-only en-passant square).
2. **Merge**: each distinct Lichess line is an entry (same line twice → alias). eco.json lines whose final EPD is already known add their names as `aliases`; otherwise they become new entries (`source: 'eco.json'`). Aliases are deduped case-insensitively.
3. **Derive**: `id = openingId(uci)` (cyrb53 of the UCI line, base36 — stable across rebuilds), `family`/`variation` via `splitName`, `plies`, `epd`, `perspective` (see below).
4. **Graph** (`GraphFile`): one node per EPD (transpositions merge), edges `[uci, san, to]` deduped per node, `ends[node]` = ids ending there. Node 0 = start.
5. **Popularity** (`.cache/popularity/{lichess,masters}.jsonl`, keyed by EPD): one query per distinct final EPD (`play=` UCI list). Order: Lichess-TSV × `/lichess`, Lichess-TSV × `/masters`, eco.json × `/lichess`, eco.json × `/masters`. `/lichess` uses speeds blitz/rapid/classical, ratings 1600–2500. Percentages are of the `/lichess` total. `score` = mean of the percentile rank and log-scaled game count (`log1p(games) / log1p(max)`), × 100.
6. **Notes** (`.cache/notes/info.jsonl` + `extracts.jsonl`): title `Chess Opening Theory/1. e4/1...e5/2. Nf3` (check marks dropped). Phase 1 checks existence/redirects 50 titles per request, breadth-first by ply (children only when the parent page exists). Phase 2 fetches one plain-text extract per distinct page (the API returns only one full extract per request). Cleaning drops the title heading, stub boilerplate, empty sections and everything from *Theory table / References / See also* on; caps at ~1500 chars. Keyed by EPD (shortest path wins), with page `url`.
7. **Emit** (compact JSON): `openings.v1.<hash8>.json`, `graph.v1.<hash8>.json`, `notes.v1.<A–E>.<hash8>.json`, `manifest.json`, `ATTRIBUTION.md`. A note's chunk letter = smallest ECO letter among openings through that position (same rule as `OpeningIndex.notesChunk(fen)` in `@chess/core/openings`).

### Perspective

`perspectiveFor(name, plies)` in `src/perspective.ts`:

| Rule (first match) | Result |
|---|---|
| Override reaching into the variation (`PERSPECTIVE_OVERRIDES`, longest prefix) | override |
| Variation (first part before `,`) has *Defense/Defence/Countergambit* | black |
| Variation has *Gambit Accepted/Declined* | family rule |
| Variation has *Gambit* | side that made the last move |
| Variation has *Attack* | white |
| Family override | override |
| Family has *Defense/Defence/Countergambit*, or *Gambit Accepted/Declined* | black |
| Family has *Attack/Opening/Game/System* | white |
| otherwise | side that made the last move |

Edit `PERSPECTIVE_OVERRIDES` to fix individual lines.

## Refreshing

```sh
pnpm --filter @chess/openings-data build --refresh-sources   # new upstream names/lines
rm tools/openings-data/.cache/popularity/*.jsonl              # optional: refetch stats (monthly)
pnpm --filter @chess/openings-data popularity
pnpm --filter @chess/openings-data notes                      # only fetches titles not yet cached
pnpm --filter @chess/openings-data build
```

To refetch notes from scratch, delete `.cache/notes/`. `.cache/` is gitignored.
