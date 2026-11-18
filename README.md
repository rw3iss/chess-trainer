# Chess Trainer

A chess app for phone and desktop (installable PWA), built to **learn openings fast**: browse 12k+ openings, favorite them, load and auto-play them, step through the moves, fork at any position, analyse with an engine, or play a bot from where you are. Also: local 2-player games with clocks, and online games through the optional server.

Works fully offline. The server is optional and adds sync, live opening statistics, native engines and online rooms.

## Features

- **Openings** — every opening has a shareable address (`/openings/<slug>`, e.g. `/openings/sicilian-defense-najdorf-variation`); loading one moves the address there. The Share button in the Moves panel copies the opening's link, or a short reversible code of your own moves (`/openings/~…`) for custom lines; a bad link opens the list with a message. 12,322 openings (Lichess + eco.json), fuzzy search by name / ECO / moves (`e4 c5 Nf3`), White/Black focus, filters, 8 sorts, family groups, ★ favorites, popularity + W/D/L from one database at a time ("Stats: Lichess | Masters" switch — Lichess online games or over-the-board master games, never mixed), Wikibooks theory notes per position, continuations tree. The Moves panel shows the openings a line is built on and the named openings that continue from it (expandable, with popularity) — load any of them in one click. It follows the moves you play: the name, title, "Built on" and variations update live, and own moves past a named opening show as "custom +N". "Keep position" (on by default) loads a variation at the move you are on (and plays its next move when you are at the end of the line). "Flip board" (on by default) turns the board to the loaded opening's side; turn it off to keep the board as it is. "Clear board" under the move list goes back to the start position with no opening (undo in the toast) and lists the openings to start from. "Load from here" (the round button when you hover a move, or the move's menu on touch) removes the moves after that move: the name, "Built on", variations and address follow the shorter line (undo in the toast).
- **Games** — every open game autosaves and stays open while you browse; Save (overwrite) or Save as new; fork at any move; variations; notes; PGN import/export; saved-games library. **Import** also takes a FEN or a picture of a board: a 2D screenshot or diagram from any site, app or book (file, drag-drop or paste). The app reads it in the browser (offline after first use; nothing is uploaded): it finds the board, reads each square with a small neural network, turns the board so White is at the bottom, and takes the side to move from the last-move highlight when there is one. You check and fix it in a position editor, then **Open on board** starts a new unsaved game from it.
- **Playback** — auto-play a line at slow / medium / fast; pause and step at any time.
- **Engines** — Stockfish 19 lite (offline, default), full Stockfish (download on demand), Maia-2 human-like bot (download on demand), and server engines (Stockfish, lc0, Maia, Komodo if you supply the binary). Analysis with MultiPV lines and arrows. Optional eval bar on any side of the board (Settings → Board, or the bar button left of the board — on phones, at the end of the bottom player row); it runs a light engine search on its own and updates on every move. Play a bot at any Elo from the current position.
- **Play** — the Play page starts a bot or 2-player game in two clicks (engine, Elo, colour, think time, clock, start position) and shows the live opening name and moves while you play.
- **Local play + clocks** — 2 players on one device, time controls with increment/delay, clock placement and size options, tabletop mode.
- **Themes** — 9 board themes (procedural wood/marble/slate/felt textures), 14 recolourable piece sets (incl. two originals, Lux and Sleek), theme editor to clone and recolour anything, light/dark app theme with accent colour, optional board shadow (a soft dark halo around the board, optional extra top/bottom over the player rows; color, opacity, size and extra top/bottom are adjustable).
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
| `pnpm data:ingest` | Refresh all openings data incrementally: sources (Lichess, eco.json, SCID), Wikibooks named lines + notes, Lichess/Masters stats for new positions, build ([details](tools/openings-data/README.md)) |
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
| `tools/board-vision` | Board-image piece classifier training ([README](tools/board-vision/README.md)) |
| `docs/` | [Plan](docs/plan/PLAN.md), [architecture](docs/architecture.md), [engine research](docs/research/engines.md) |

## Production

Live at **https://chess.ryanweiss.net** (alias **https://chess.rw3iss.com**; PWA + API at `/api` + socket.io at `/api/socket.io`) on the ryanweiss.net
box. Deploy with `bash scripts/deploy/deploy.sh` after pushing to `main`; details, paths and operations are in
[`CLAUDE.md`](CLAUDE.md#production--httpschessryanweissnet). Build-time default server URL:
`VITE_DEFAULT_SERVER_URL` — absolute, or relative like `/api` (resolved against the page origin); falls back to
`http://localhost:3000`.

## Licenses and data

Stockfish (GPL-3.0) ships as a separate worker file with its license. Opening data: Lichess chess-openings (CC0), eco.json (MIT), SCID scid.eco (GPL-2.0), Wikibooks Chess Opening Theory (CC BY-SA 4.0), Lichess explorer statistics — see `apps/web/public/data/ATTRIBUTION.md`. Piece sets keep their own licenses — see `apps/web/public/pieces/LICENSES.md`; four sets are for personal use only. This is a personal-use app.
