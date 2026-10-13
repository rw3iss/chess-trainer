# Architecture

How the parts fit. The plan (`docs/plan/PLAN.md`) says *what* to build; this file says *how it is wired*. Keep it current.

## Packages

```
apps/web  ──┐
            ├──► packages/core ──► chessops
apps/server ┘
tools/openings-data ──► packages/core (openings), chessops ──► apps/web/public/data/*
tools/piece-assets  ──► packages/core (theme)              ──► apps/web/public/pieces/*
```

- **`@chess/core`** — pure TS. Modules: `chess` (rules, move tree, PGN), `game` (Session / SavedGame reducers), `clock`, `engine` (adapter contract, catalog, strength strategy, UCI parsing), `theme` (board/piece theme schema + built-ins), `openings` (`OpeningIndex` over the generated datasets), `protocol` (REST DTOs + WS envelopes/events). Contract: `packages/core/API.md`.
  - Web consumes `src/` through a Vite/TS alias (HMR, no build step).
  - Server consumes `dist/` (ESM; Node 22 `require(esm)` from the CommonJS Nest build).

## Web client

Layers (dependencies point downward only):

```
pages / components        (Preact, SCSS)
   │
hooks + state             (@preact/signals stores: sessions, settings, savedGames, favorites, openings, engines, themes, server)
   │
services (interfaces)     (db repositories · api ApiClient · engine registry · openings loader/search worker · playback · commands · realtime · sw)
   │
@chess/core               (pure logic)
```

- **Board stage is persistent.** `AppShell` renders `BoardStage` once; routes swap only the side-panel content, so playback, bots and clocks keep running while browsing.
- **Sessions** are open game tabs. Every change goes through a pure `@chess/core/game` reducer, then the store autosaves (debounced) to IndexedDB (Dexie). Explicit Save writes a `SavedGame` (overwrite linked one or save as new).
- **Data access** goes through repositories (`services/db`) for local data and `ApiClient` (`services/api`) for server-only data. `ServerConnector` probes the server; when offline the app uses local engines, static datasets and the mock/offline API.
- **Engines** implement `EngineAdapter`. Local adapters run in Web Workers (Stockfish WASM, Maia ONNX). Remote adapters talk to the server's `/engine` socket.io namespace. `EngineRegistry` merges both and reports availability.
- **Openings** datasets are static, hashed JSON in `/data/`, precached by the service worker. A search worker (MiniSearch) indexes them; `OpeningIndex` identifies openings and continuations for any position.
- **Themes**: board and piece themes are JSON (`@chess/core/theme`). Pieces are SVG sprites with role classes (`pc-body`, `pc-line`, `pc-accent`, `pc-shade`) coloured through CSS variables, so any colour keeps its shading. Board textures are procedural SVG filters tinted by the theme's light/dark colours.
- **Commands bus** (`services/commands`) decouples keyboard shortcuts and menus from features (e.g. `save`, `saveAs`, `focusSearch`). Handlers stack: a feature's handler (SaveModal) overrides the default quick-save.
- **Extension slots** (`app/slots.tsx`): features plug UI into the shell without editing it — `stageSlots` (clocks, eval bar, overlays), `panelSlots.engine`, `notesSlots.dataset`; opening names via `setOpeningIdentifier()`. Full table: `apps/web/BUILD.md`.

## Server (optional)

NestJS, modules under `apps/server/src/modules/*`: `auth`, `users`, `openings` (dataset + Lichess explorer proxy with cache), `games` (CRUD + sync), `engines` (native UCI process pool + `/engine` gateway), `rooms` (`/play` gateway, authoritative moves + clocks). SQLite by default (TypeORM, `DB_TYPE` switch to Postgres); Redis optional (in-memory cache fallback). Details: `apps/server/README.md`, `apps/server/DESIGN.md`.

## Data flow examples

- **Load an opening**: Openings page → `sessions.fromOpening(entry)` → new session (tree = opening line, cursor at root) → board shows start → playback steps along the line.
- **Fork**: move list / controls → `forkSession(session, nodeId)` → new active session with the path to that node.
- **Play bot**: Bot modal → session `mode='bot'` + `bot` config → engine controller watches the active session; on bot's turn it asks the adapter (`resolveStrength` → options + limits) and applies the move through the sessions store.
