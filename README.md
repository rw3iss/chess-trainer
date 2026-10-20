# Chess Trainer

A chess app for phone and desktop (installable PWA), built to **learn openings fast**: browse 12k+ openings, favorite them, load and auto-play them, step through the moves, fork at any position, analyse with an engine, or play a bot from where you are. Also: local 2-player games with clocks, and online games through the optional server.

Works fully offline. The server is optional and adds sync, live opening statistics, native engines and online rooms.

## Features

- **Openings** — 12,322 openings (Lichess + eco.json), fuzzy search by name / ECO / moves (`e4 c5 Nf3`), White/Black focus, filters, 8 sorts, family groups, ★ favorites, popularity + W/D/L, Wikibooks theory notes per position, continuations tree.
- **Games** — every open game autosaves and stays open while you browse; Save (overwrite) or Save as new; fork at any move; variations; notes; PGN import/export; saved-games library.
- **Playback** — auto-play a line at slow / medium / fast; pause and step at any time.
- **Engines** — Stockfish 19 lite (offline, default), full Stockfish (download on demand), Maia-2 human-like bot (download on demand), and server engines (Stockfish, lc0, Maia, Komodo if you supply the binary). Analysis with eval bar, MultiPV lines and arrows. Play a bot at any Elo from the current position.
- **Play** — the Play page starts a bot or 2-player game in two clicks (engine, Elo, colour, think time, clock, start position) and shows the live opening name and moves while you play.
- **Local play + clocks** — 2 players on one device, time controls with increment/delay, clock placement and size options, tabletop mode.
- **Themes** — 9 board themes (procedural wood/marble/slate/felt textures), 14 recolourable piece sets (incl. two originals, Lux and Sleek), theme editor to clone and recolour anything, light/dark app theme with accent colour.
- **Server (optional)** — auth, sync across devices, Lichess explorer proxy, native engines, online rooms with chat.

## Quick start

Requires Node 22+ and pnpm 10.

```sh
pnpm install
pnpm dev                 # web app → http://localhost:5173
```

Optional server:

```sh
pnpm --filter @chess/core build
cp apps/server/.env.example apps/server/.env   # set OWNER_PASSWORD; LICHESS_TOKEN goes in the root .env
pnpm dev:server          # → http://localhost:3000 (Swagger at /docs)
```

Then in the app: Settings → Server → URL `http://localhost:3000`, log in, and turn on sync.

## Commands (repo root)

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm dev:server` | Run the web app / the server in watch mode |
| `pnpm build` | Build every package |
| `pnpm test` | Unit tests everywhere (vitest + jest) |
| `pnpm typecheck` / `pnpm lint` | Type checks / oxlint |
| `pnpm --filter @chess/web test:e2e` | Playwright end-to-end tests (desktop + mobile) |
| `pnpm data:openings` | Rebuild the openings datasets into `apps/web/public/data/` |
| `pnpm data:notes` / `pnpm data:popularity` | Fetch Wikibooks notes / Lichess popularity (resumable; needs `LICHESS_TOKEN` in `.env`) |
| `pnpm assets:pieces` | Rebuild the piece-set sprites |

## Repository

| Path | Contents |
|---|---|
| `apps/web` | Preact + TypeScript + SCSS PWA ([README](apps/web/README.md), [BUILD](apps/web/BUILD.md), [DESIGN](apps/web/DESIGN.md)) |
| `apps/server` | NestJS API + socket.io gateways, SQLite or Postgres ([README](apps/server/README.md)) |
| `packages/core` | Shared pure logic: rules, move tree, PGN, sessions, clock, engine contracts, themes, openings index, protocol ([API](packages/core/API.md)) |
| `tools/openings-data` | Openings data pipeline ([README](tools/openings-data/README.md)) |
| `tools/piece-assets` | Piece-set normaliser ([README](tools/piece-assets/README.md)) |
| `docs/` | [Plan](docs/plan/PLAN.md), [architecture](docs/architecture.md), [engine research](docs/research/engines.md) |

## Production

Live at **https://chess.ryanweiss.net** (alias **https://chess.rw3iss.com**; PWA + API at `/api` + socket.io at `/api/socket.io`) on the ryanweiss.net
box. Deploy with `bash scripts/deploy/deploy.sh` after pushing to `main`; details, paths and operations are in
[`CLAUDE.md`](CLAUDE.md#production--httpschessryanweissnet). Build-time default server URL:
`VITE_DEFAULT_SERVER_URL` — absolute, or relative like `/api` (resolved against the page origin); falls back to
`http://localhost:3000`.

## Licenses and data

Stockfish (GPL-3.0) ships as a separate worker file with its license. Opening data: Lichess chess-openings (CC0), eco.json (MIT), Wikibooks Chess Opening Theory (CC BY-SA 4.0), Lichess explorer statistics — see `apps/web/public/data/ATTRIBUTION.md`. Piece sets keep their own licenses — see `apps/web/public/pieces/LICENSES.md`; four sets are for personal use only. This is a personal-use app.
