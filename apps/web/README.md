# @chess/web — Chess Trainer PWA

Preact + TypeScript + SCSS client. Learn openings: browse, load, play through, fork, analyse, play bots.
Works fully offline; the NestJS server (`apps/server`) is optional and only adds features.

Rules: [`BUILD.md`](./BUILD.md) (structure, layering, stores, extension points) ·
[`DESIGN.md`](./DESIGN.md) (tokens, typography, layout, motion) ·
[`COMPONENT_INDEX.md`](./COMPONENT_INDEX.md) (reuse manifest — check before building).

## Run

```bash
pnpm dev          # http://localhost:5173 (from the repo root: pnpm dev)
pnpm build        # typecheck (app + service worker) → dist/ (+ sw.js)
pnpm preview      # serve dist/ (service worker active)
pnpm typecheck
pnpm lint         # oxlint
pnpm test         # vitest (jsdom + fake-indexeddb)
pnpm test:e2e     # Playwright, desktop + mobile (starts Vite on :5199)
```

`@chess/core` is aliased to `packages/core/src` (no core build needed for the web app).

## Architecture in one screen

- **AppShell** — TopNav · persistent **BoardStage** (never unmounts) · SidePanel (route content + Moves/Openings/Games/Engine tabs) · GameControls. Mobile (< 900 px): board on top, panel below, sheets for Openings/Games/Sessions/Settings with a "now playing" chip.
- **Routes** (`src/app/routes.ts`, preact-iso lazy): `/`, `/openings`, `/openings/:id`, `/games`, `/sessions`, `/settings/:section`, `/play` (quick play: bot or 2 players), `/play/new` + `/play/:roomId` (online).
- **State** (`src/state/`, signals): `sessions` (open tabs, autosave 300 ms, restore on boot), `settings`, `savedGames`, `favorites`, `playback`, `themes`, `notes`, `openingIdentity`. Pattern: `state/registry.ts`.
- **Services**: `db` (Dexie repositories), `api` (ApiClient → Http or Mock), `server` (ServerConnector), `cache` (IndexedDB TTL cache), `commands` (command bus), `playback`, `toast`, `sw`.
- **Keyboard**: ←/→ step · Home/End · Space play/pause · F flip · Ctrl+S save · Ctrl+⇧+S save as · / search.

## Data layer

| Data | Path | Notes |
|---|---|---|
| Sessions, saved games, favorites, themes, notes, settings | `services/db` repositories (IndexedDB `chess-openings`) | the only path for user data |
| Server-only data (health, auth, explorer, engines, sync, rooms) | `services/api` `ApiClient` | `HttpApiAdapter` while the server is online, else `MockApiAdapter` + `src/mock/data/*.json` |
| Fetched/derived data with TTL | `services/cache` (IndexedDB `chess-cache`) | `useCachedResource(key, loader, ttl)` |
| UI view state | `lib/storage` / `useUIState` | localStorage |

**Connecting the server:** set the URL in settings (`settings.server.url`, default `http://localhost:3000`).
`ServerConnector` probes `GET /health` (1.5 s timeout) on boot, every 60 s and when the browser comes online;
`serverConnector.status` is `online | offline | unconfigured`. To add a server call: add it to `ApiClient`,
implement it in `HttpApiAdapter` and `MockApiAdapter` (+ a fixture). No UI changes needed to swap adapters.

## Extending

See the **Extension points** table in [`BUILD.md`](./BUILD.md): routes, panel tabs, stage slots (clocks, eval bar, overlays),
dataset-notes slot, opening identifier, command bus, keyboard shortcuts, ApiClient, repositories, board renderer.

## PWA

`vite-plugin-pwa` (injectManifest) builds `src/services/sw/sw.ts`: precaches the shell, route chunks and the opening datasets;
runtime-caches `/data/*`, `/pieces/*` and Google Fonts. An update shows a "New version — Reload" toast. No SW in dev.

## Docker

```bash
docker build -f config/Dockerfile -t chess-web .
docker run -p 8080:80 chess-web
```

`.dockerignore` lives at the project root (Docker requires it at the build-context root).
