# BUILD.md — @chess/web

Build rules for the web client: structure, code quality, tooling, extension points.
**Every build request reads this file** (with `DESIGN.md` and `COMPONENT_INDEX.md`).
Record new build decisions here so later work complies. Master plan: `docs/plan/PLAN.md`.

## Stack

- **Preact + TypeScript (strict) + SCSS** (traditional, no CSS modules), Vite 8 (Rolldown).
- **State:** `@preact/signals` stores in `src/state/`.
- **Router:** `preact-iso` with lazy routes (overrides the scaffold's `preact-router`).
- **Chess logic:** `@chess/core` (wraps `chessops`). No chess rules in components.
- **Storage:** IndexedDB via **Dexie** (repositories) · `uiStorage` (`src/lib/storage.ts`) for UI-only state.
- **Search:** `minisearch` (in a worker) · **motion** for micro-animation · `vite-plugin-pwa` (injectManifest).
- **Lazy only:** `onnxruntime-web`, `stockfish`, `socket.io-client`.
- **Tests:** vitest (jsdom + fake-indexeddb) · Playwright e2e. Lint: oxlint.

## Commands (run from `apps/web` or `pnpm --filter @chess/web <cmd>`)

| Command | What |
|---|---|
| `pnpm dev` | Vite dev server on :5173 (no service worker in dev) |
| `pnpm build` | typecheck (app + SW) then production build → `dist/` (+ `sw.js`) |
| `pnpm typecheck` | `config/tsconfig.app.json` + `config/tsconfig.worker.json` |
| `pnpm lint` | oxlint over `src/` |
| `pnpm test` | vitest (`config/vitest.config.ts`) |
| `pnpm test:e2e` | Playwright (`config/playwright.config.ts`, specs in `e2e/`, desktop 1440×900 + mobile 390×844) |

## Project structure

```
config/            vite, vitest (+ setup), playwright, tsconfig app/node/worker, oxlint, aliases.ts, Dockerfile
public/            static: data/ (openings datasets), pieces/ (sprites), engines/, icon.svg
e2e/               Playwright specs
src/
  app/             App, AppShell boot, routes.ts (route table + panel tabs), slots.tsx (extension slots), boot.ts
  pages/<Name>/    route views (lazy): Home, Openings, OpeningDetail, Games, Sessions, Settings, Play, NotFound
  components/
    common/<Name>/ primitives (Button, Icon, Menu, Modal, Sheet, Tabs, Toast, …) — barrel common/index.ts
    board/         Board2D, MiniBoard, EvalBar (BoardRenderer contract in board/types.ts)
    stage/         BoardStage (the ONLY board integration point) + stage slots
    shell/         AppShell, TopNav, NowPlayingChip, panel slots
    controls/      GameControls + default session command handlers
    moves/         MovesPanel, MoveList, OpeningHeader, NotesCard, NoteEditorModal, WdlBar
    sessions/      SessionSwitcher, SessionCard
  state/           signal stores (registry.ts pattern) — settings, sessions, favorites, savedGames, notes, themes, playback, openingIdentity
  services/
    db/            Dexie schema + repositories (interfaces + Dexie impl) + getRepositories()
    api/           ApiClient (server-only data) + HttpApiAdapter + MockApiAdapter + index.ts (injection)
    server/        ServerConnector (probe /health, status signal)
    cache/         DataCache (TTL, IndexedDB backend) — used by useCachedResource
    commands/      CommandBus (save, saveAs, focusSearch, …)
    pgn/           PGN import worker (pgn.worker.ts) + client, import/export helpers
    playback/      PlaybackController (dependency-injected)
    toast/         toast queue (signals)
    sw/            sw.ts (service worker) + register.ts (update signals)
  hooks/           useTheme, useMediaQuery, useKeyboardShortcuts, useCachedResource, useUIState, useFocusTrap, …
  lib/             pure helpers: throttle/debounce, cx, format, color, storage
  mock/data/       JSON fixtures for MockApiAdapter
styles/            _variables (Sass-only), _tokens (CSS vars, emitted once), _themes, _mixins, _responsive, _reset, global
```

Placement: screen → `pages/`; self-contained feature → `components/<feature>/`; primitive → `components/common/<Name>/`.

## Layering (dependency rule)

```
pages / components  →  hooks + state  →  services (via interfaces / index.ts)  →  @chess/core
```

- Components never import a concrete adapter (Dexie, HttpApiAdapter). Use `getRepositories()` (services/db) and `api` (services/api).
- **All chess rules come from `@chess/core`** (move legality, SAN, trees, sessions). Components map state → view only.
- `lib/` is pure (no Preact). `services/` is side-effectful and framework-free (signals allowed).
- `@chess/core` is aliased to `packages/core/src` (`config/aliases.ts` + `tsconfig.app.json` paths) — HMR, no build step.

## App-shell rules

- **The board never unmounts.** `AppShell` renders `BoardStage` once; routes swap only side-panel content. Playback, bots and clocks keep running while browsing.
- Route `layout` (in `src/app/routes.ts`): `panel` (normal), `wide` (wider panel, board shrinks), `sheet` (full-height sheet on mobile < 900 px, with the "now playing" chip).
- Mobile (< 900 px): board on top full width, panel tabs below, panel content scrolls under the board, GameControls at the bottom.

## State stores — the pattern

Every store is `src/state/<name>.ts`:
1. module-level signals (private `_x`), exported read-only via `computed`;
2. exported action functions/objects are the only writers;
3. persistence through repositories (`getRepositories()`), never Dexie directly;
4. `defineStore({ name, init, flush, dispose })` so `initStores()` (boot) restores it and `flushStores()` (pagehide) saves it;
5. add `export * from './<name>'` to `src/state/index.ts`.

Key stores:
- **sessions** — open tabs; actions `open/newSession/fromOpening/fromSavedGame/fork/close/setActive/reorder/move/goto/step/toStart/toEnd/flip/setMode/update/replace/rename/deleteFrom/promoteVariation/setUserNote/setComment`, all via `@chess/core/game` reducers. Autosave debounced 300 ms; order + active id persisted as meta. `onSessionEvent` emits `user-action` (manual nav — pauses playback), `opened`, `closed`, `activated`. Programmatic navigation passes `{ silent: true }`.
- **settings** — `settings` signal + `updateSettings(deepPartial)`; persisted (debounced) to SettingsRepository `'app'`; theme mirrored to localStorage for the flash-free boot script in `index.html`.
- **savedGames** — `save` (overwrite linked / first save = new), `saveAs`, `rename`, `setTags`, `setNotes`, `addMany` (import), `duplicate`, `remove` (returns undo), `setFavorite/toggleFavorite`, `open`. `SaveOptions` = `{ name, tags, notes }`.
- **favorites** — `isFavorite(kind,id)`, `toggleFavorite`, `setFavorite` (kinds `opening` | `game`).
- **playback** — `playbackActions.play/pause/toggle/setSpeed`, `activeIsPlaying`; speeds from `settings.playback` (ms).
- **themes** — built-in + custom board/piece themes, `activeBoardTheme/activePieceTheme/activePieceSet` (with colour overrides).
- **notes** — per-position (EPD) user notes. **openingIdentity** — `setOpeningIdentifier(fn)`.

## Extension points (document each new one here)

| Extension | Where | How |
|---|---|---|
| Page / route | `src/app/routes.ts` | add `{ path, component: lazy(...), layout, title }` |
| Panel tab | `PANEL_TABS` in `routes.ts` | tab with `href` (route) or without (renders a panel slot) |
| Engine panel | `panelSlots.engine` (`components/shell/panelSlots.ts`) | `panelSlots.engine.register(EnginePanel)` |
| Clocks / eval bar / board overlays | `stageSlots` (`components/stage/slots.ts`) | `clockTop`, `clockBottom`, `side`, `evalBar`, `overlay` |
| Dataset notes | `notesSlots.dataset` (`components/moves/notesSlots.ts`) | receives `{ epd, fen }` |
| Opening name | `setOpeningIdentifier(fn)` (`state/openingIdentity.ts`) | `(uci[], startFen?) => OpeningEntry \| undefined` |
| Commands | `commands.register(id, fn)` (`services/commands`) | stack: latest wins. Built-ins: `save`, `saveAs`, `focusSearch`, `openBot`, `newGame`, `resign`, `offerDraw` (local PvP), `togglePlay`, `flip`, `fork`, `editNote`; extend `CommandMap` via declaration merging |
| Keyboard shortcuts | `DEFAULT_SHORTCUTS` (`hooks/useKeyboardShortcuts.ts`) | ←/→ Home/End Space F Ctrl+S Ctrl+⇧+S / |
| Server data | `ApiClient` (`services/api/ApiClient.ts`) | add method to interface + Http + Mock (+ fixture) |
| Local persistence | `Repositories` (`services/db/repositories/types.ts`) | add interface + Dexie impl + schema version bump |
| Board renderer | `BoardRenderer` props (`components/board/types.ts`) | Board2D now, Board3D later; swap in `BoardStage.tsx` only |
| Engines | `EngineAdapter` (`@chess/core/engine`) | `services/engine/` registry |
| Themes | `BoardTheme` / `PieceTheme` JSON (`@chess/core/theme`) | `themesActions.saveBoard/savePiece` |
| WS actions | `RoomActionPayload` (`@chess/core/protocol`) | generic `{ type, payload }` envelope; send with `roomsClient().action(roomId, type, payload)`, receive `RoomEvent` `'action'` |
| Stage move handling | `setStageMoveHandler(owner, handler)` (`components/stage/slots.ts`) | per-mode `movable(session)`, `onMove(session, uci) → true = handled` (not applied locally), `playerLabel(session, color)`; used by online play |

Default `save`/`saveAs`/`fork`/`newGame`/`openBot` handlers live in `components/controls/sessionCommands.ts` (quick save + toast). The SaveModal (`components/controls/SaveModal`; `SaveModalHost` mounted in AppShell, `registerGamesFeature()` called from `app/boot.ts`) owns `save`/`saveAs`: Ctrl+S on a linked session overwrites directly with a toast; a first save or Ctrl+⇧+S opens the modal (Overwrite vs Save as new copy). Other feature modals register their own handlers; later registrations take precedence.

## Server (optional) & offline

- `ServerConnector` probes `${settings.server.url}/health` (1.5 s timeout) on boot, every 60 s and on `online`. `serverStatus`: `online | offline | unconfigured`.
- `api` (services/api) delegates per call: `HttpApiAdapter` while online, else `MockApiAdapter` (fixtures). Features check `serverConnector.status` and degrade — **the app must work fully offline.**
- `HttpApiAdapter` unwraps the server's `{ data, timestamp }` envelope and maps `{ error }` to `ApiRequestError`.

## Server sync

- **Auth** (`state/auth.ts`): `authActions.login` stores `AuthTokens` in kv `auth:session`; the access token auto-refreshes 60 s before expiry and once on a 401 (`HttpApiAdapter` → `setUnauthorizedHandler`). Concurrent refreshes share one request. A rejected refresh token (401/403) signs out; network errors keep the session.
- **Sync** (`services/sync`, started by `startSync()` after boot): runs only while `serverConnector.status === 'online'` **and** signed in (non-guest) **and** `settings.server.sync`. Triggers: the gate opening (enable / login / back online), every 2 min, and 3 s after a local change to `savedGames` / `openSessions`.
- Each pass: `ensureAccessToken()` → `POST /sync` with docs whose `updatedAt ≥ lastPushAt`, tombstones for ids known after the previous sync but now missing, and `since` = last `serverTime`. State lives in kv `sync:state` (`{ account, since, lastPushAt, knownSavedGameIds, knownSessionIds, lastSyncAt }`); another account starts fresh.
- Merge (`merge.ts`, pure): higher `revision` wins → equal: later `updatedAt` → exact tie keeps local. A remote tombstone deletes locally only if the local doc did not change since the last sync. Applied through store APIs (saved games: repository + `loadSavedGames()`; sessions: `sessionsActions.replace/open({ activate: false })/close`) under an `applying` flag so merges are not seen as local changes. Sessions in mode `online` are never synced.
- UI: `ServerSettingsSection` (`@/components/server`, lazy in Settings → Server).

| Signed in | Server online | `server.sync` | `syncStatus` |
|---|---|---|---|
| no | any | any | `disabled` |
| yes | any | off | `disabled` |
| yes | no | on | `offline` |
| yes | yes | on | `idle` / `syncing` / `error` |

## Online play (rooms)

- `services/realtime/RoomsClient` — socket.io `/play` client (lazy `import('socket.io-client')`), `WsEnvelope` + ack per command (8 s timeout → `RoomError('TIMEOUT')`), server codes → `RoomError.code`. Reconnect: re-joins every room and emits `'resync'` with the fresh `RoomState`. Move envelope id = idempotency key.
- `services/realtime/roomSession` — pure `syncTree` / `roomSessionPatch` / `localClock` (server clock → local time via skew estimated from `game:moved`), `parseRoomRef`, `roomLink`.
- `state/rooms` — `roomsActions.create/join/leave/move/resign/offerDraw/answerDraw/chat`; one Session per room (mode `online`, `source.roomId`). **Local moves are never applied locally**: the stage hands them to `roomsActions.move` (pending until the ack/broadcast). Token: user access token, else a cached guest token (`authActions.roomToken()`, guest name from `auth`).
- Routes: `/play/new` lobby (create: time control from `CLOCK_PRESETS`, colour, name; join by link/code), `/play/:roomId` room. Disabled with an explanation when `serverConnector` is not online or `health.features.rooms` is off. Entry: "Or play online with a friend" on the `/play` page.
- Quick play `/play` (`pages/QuickPlay`): "Play" in the TopNav (icon button on mobile). Shows the active bot / local game (status, `BotStatusCard`, local Resign/Draw/Flip, `MovesPanel`) or a New game setup. Setup reuses `BotSetupFields` + `useBotSetupForm` (`controls/BotModal`) and `StartPositionField` + `PvpSetupFields` (`controls/NewGameModal`), the same fields as the modals.
- Clocks: `session.clock` mirrors the server `ClockState`, so the stage clock slot shows it; `OnlineClock` is the fallback when no clock component is registered.
- E2E against a real server: `e2e/online.spec.ts` (`E2E_SERVER_URL`, skipped when unreachable).

## Data cache vs. repositories vs. UI state

- **Repositories** (`services/db`): user data — sessions, saved games, favorites, themes, notes, settings, kv.
- **DataCache** (`services/cache`, IndexedDB `chess-cache`): fetched/derived data with TTL — read via `useCachedResource(key, loader, ttl)` (stale-while-revalidate).
- **uiStorage / useUIState**: small view state (open panels, sort order).

## PWA

- `vite-plugin-pwa` injectManifest → `src/services/sw/sw.ts` (typechecked by `tsconfig.worker.json`). Precache globs live in `config/vite.config.ts`; exclusions in `config/pwa.ts`.

| Asset | Strategy | Cache |
|---|---|---|
| `index.html`, `assets/**/*.{js,css,woff,woff2}` (shell + route chunks + workers) | precache | workbox precache |
| manifest icons, `icon.svg`, `icons/apple-touch-icon.png` | precache | workbox precache |
| `data/manifest.json`, `data/openings*.json`, `data/graph*.json` | precache | workbox precache |
| `engines/manifest.json`, `engines/stockfish/*` (sf-lite js + wasm) | precache | workbox precache |
| `pieces/manifest.json`, default piece set (`DEFAULT_PIECE_THEME_ID`, read from core) | precache | workbox precache |
| `/data/notes*` | StaleWhileRevalidate | `data-notes` |
| other `/data/*` | StaleWhileRevalidate | `data` |
| other `/pieces/*` (non-default sets) | CacheFirst | `pieces` |
| `/engines/*` (sf-full, maia vocab), `/models/*`, `*.onnx`, `ort-wasm*.wasm`, the pinned Maia-2 model URL | CacheFirst | `chess-engines-v1` (shared with `engine/assetStore`) |
| server API GETs: `/health /openings /explorer /engines /auth/me /users/me /games /sessions` (any cross-origin host, or same-origin `/api/*`) | NetworkFirst, 3 s timeout, 200 only | `api` |
| POST/PUT/DELETE, `/sync`, `/socket.io` | network only (never cached) | — |
| Google Fonts CSS / files | SWR / CacheFirst | `google-fonts-css` / `google-fonts` |
| navigations | precached `index.html` (denylist `/api`, `/socket.io`, paths with a file extension) | — |

- Never precached (`globIgnores`): `engines/stockfish-full/**`, `engines/maia/**`, `**/ort-wasm*.wasm`, `**/*.onnx`, `**/*.map`, `pieces/preview.html`, non-default piece sets, `data/notes*`.
- Registration is hand-rolled (`services/sw/register.ts`, no `workbox-window`): `swNeedRefresh` / `swOfflineReady` signals → toasts via `useServiceWorkerToasts` (called in `App.tsx`). "Reload" posts `SKIP_WAITING` and reloads on `controllerchange`. No SW in dev; dev builds expose `window.__pwa` (the signals) to preview the toasts.
- Install: `services/sw/install.ts` stashes `beforeinstallprompt`; `components/pwa/InstallPrompt` shows the card (iOS Safari → Share hint). Dismissal persists in `uiStorage` (`ui:pwa-install-dismissed`). `registerPwaFeature()` (from `app/boot.ts`) mounts it.
- Storage: `watchFirstSaveForPersistence()` calls `navigator.storage.persist()` once, after the first save following boot (`ui:storage-persist-requested`).
- Icons: `node scripts/gen-icons.mjs` regenerates `public/icon.svg`, `public/icons/maskable.svg` and the PNGs (192/512 any + maskable, 180 apple-touch) with Playwright Chromium.
- Offline e2e: `pnpm exec vite build --config config/vite.config.ts && pnpm exec playwright test --config config/playwright.preview.config.ts` (`e2e/offline.spec.ts`; skips itself under the dev-server config).

## Code rules

- Tabs (width 4). Hoist: imports → constants → types → helpers → component.
- Explicit prop types; no `any` on public surfaces. One `Component.scss` per component, imported once, real class names.
- Only CSS custom properties for colours/spacing/radii/fonts/motion (see DESIGN.md). Inline `style` only for runtime-computed values.
- Bound input/scroll/resize handlers are throttled (100 ms default, `lib/throttle`).
- Never block first paint: render shell → loading → data. Boot (`app/boot.ts`) restores stores after render.
- Heavy work off the main thread (engines, search index, PGN import → Web Workers).
- `COMPONENT_INDEX.md` is the reuse manifest: check it first, add a row for every shared component/hook/util/mixin.
- Update this file, DESIGN.md and README in the same change as the behaviour.

## Testing

- vitest + jsdom + fake-indexeddb (`config/vitest.setup.ts`); `@testing-library/preact` for components. Colocate `*.test.ts(x)` or use `__tests__/`.
- Store tests use `freshRepositories()` (`src/state/__tests__/testDb.ts`) for an isolated database.
- Dev builds expose `window.__chess` (all stores) for e2e/scripted checks; never in production.
