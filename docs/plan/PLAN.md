# Chess Openings PWA — Master Plan

Status: draft for review · 2026-10-12
Related: [`docs/research/engines.md`](../research/engines.md)

A chess app for phone and desktop. Main use: **learn openings fast** — browse, favorite, load, play through, fork, then analyse or play a bot from any position. Also: local bots, local 2-player with clocks, and later online play through an optional server.

---

## 0. Guiding decisions

| Topic | Decision | Why |
|---|---|---|
| Repo | pnpm monorepo: `apps/web`, `apps/server`, `packages/core`, `tools/*` | Shared types, chess logic and WS protocol between client and server. |
| Client | **Preact + TS + SCSS + @preact/signals**, Vite 8, `vite-plugin-pwa` | Small, fast, React-compatible. Signals give fine-grained updates for clocks/engine info without re-rendering the board. No better choice for SVG/DOM board work. |
| Router | `preact-iso` (lazy routes) — overrides scaffold's `preact-router` in BUILD.md | Code-split per page, works with persistent board shell. |
| Chess rules | **chessops** (SAN, FEN/EPD, PGN with comments + variations) | Best PGN/variation support. GPL-3 — fine for private use. |
| Board | **Own `Board2D` component** behind a `BoardRenderer` interface | Full control of per-color recoloring, layered shading, animation, and a later `Board3D` (three.js) swap. chessground/cm-chessboard behaviour used as reference (drag threshold, click-click, premove, arrows). |
| Client storage | **IndexedDB via Dexie** (repositories) + `uiStorage` (scaffold) for UI state | Sessions, saved games, favorites, themes, engine downloads. |
| Search | **MiniSearch** in a Web Worker | Fuzzy/prefix search over ~12k openings, instant, offline. |
| Server | **NestJS** via `/scaffold-nest` (Express, Swagger) + **socket.io** gateways | Scaffold standard. Postgres + Redis from scaffold (Redis = explorer cache + room state). |
| Engines | Pluggable `EngineAdapter` (local WASM/ONNX workers + remote UCI over WS) | See §5. Default: Stockfish 19 lite, local. |
| Offline | App fully works with no server. Server is detected and adds features. | Requirement. |

Indentation: tabs (width 4) everywhere — web, server and `packages/core` (scaffold-preact and scaffold-nest rule; enforced by `.editorconfig`). YAML only: 2 spaces.

---

## 1. Repository layout

```
chess/
├── apps/
│   ├── web/                 # Preact PWA  (build → scaffold-preact)
│   │   ├── BUILD.md  DESIGN.md  COMPONENT_INDEX.md
│   └── server/              # NestJS API + WS (scaffold-nest)
│       ├── BUILD.md  DESIGN.md (API design rules)
├── packages/
│   └── core/                # pure TS, no DOM/Node APIs
│       ├── chess/           # move tree, PGN io, position keys, opening matcher
│       ├── game/            # Session / SavedGame models, reducers, fork/merge
│       ├── clock/           # clock state machine (used by client + server)
│       ├── engine/          # EngineAdapter types, engine catalog, strength strategies
│       ├── theme/           # BoardTheme / PieceSet / AppTheme schemas + defaults
│       └── protocol/        # REST DTOs + WS event envelopes (versioned)
├── tools/
│   ├── openings-data/       # build pipeline: TSV + eco.json + popularity + notes → JSON
│   └── piece-assets/        # SVG normalizer → recolorable sprites
├── docs/
│   ├── plan/PLAN.md         # this file
│   ├── research/            # engine research etc.
│   └── architecture.md      # written in phase 1, kept current
├── BUILD.md                 # monorepo-wide rules (points to per-app files)
├── CLAUDE.md
└── README.md
```

---

## 2. Data: openings

### 2.1 Sources

| Source | Use | License |
|---|---|---|
| `lichess-org/chess-openings` (a–e.tsv: eco, name, pgn) | Canonical base (~3.5k named lines) | CC0 |
| `JeffML/eco.json` (successor of hayatbiralem/eco.json, ~12k, FEN-keyed, aliases) | Extra names, aliases, SCID lines. Skip `interpolated` gap-fillers. | MIT |
| Lichess Opening Explorer API (`explorer.lichess.org/lichess`, `/masters`) | Popularity + W/D/L per position. Needs a personal API token (Bearer). Low rate limit. | Lichess ToS |
| Wikibooks *Chess Opening Theory* (MediaWiki API, page per move sequence) | Per-position notes/theory text | CC BY-SA (show attribution) |
| User | Own notes per move/position | — |

### 2.2 Pipeline (`tools/openings-data`)

1. **Parse + merge** Lichess TSV and eco.json. Replay every PGN with chessops → per-ply EPD. Dedupe by final EPD; keep Lichess name as primary, others as `aliases`.
2. **Position graph**: one node per EPD (transpositions merge), edges = moves (SAN + UCI). Each opening = path of node ids. Gives "what openings continue from here" and "which opening is this game in" for any game.
3. **Derived fields**: `family` (name before `:`), `variation`, `eco`, `plies`, `perspective` (`white` | `black` — side that makes the defining last move; names with "Defense/Defence" bias to black; overridable in a small manual table).
4. **Popularity** (resumable script, token from env, ~1 req / 2.5 s, cached on disk): query `/lichess` (speeds blitz,rapid,classical; ratings 1600–2500) and `/masters` for each opening's final EPD. Store `games`, `white/draw/black %`, `mastersGames`. Score = log-scaled percentile 0–100. Re-runnable monthly.
5. **Notes**: for each opening path, request the Wikibooks page for the move sequence (`Chess_Opening_Theory/1._e4/1...e5/...`) via `action=query&prop=extracts`. Strip to clean text/markdown; key by EPD; record source URL for attribution. Missing page = no notes.
6. **Emit** hashed, versioned files into `apps/web/public/data/`:
   - `openings.v<n>.json` (compact: id, name, aliases, eco, family, perspective, uci moves, popularity) — precached.
   - `graph.v<n>.json` (nodes/edges) — precached.
   - `notes.v<n>.<chunk>.json` (chunked by ECO letter) — lazy, runtime-cached.
   - `manifest.json` (version, counts, hashes).

### 2.3 Runtime

- Client loads manifest → datasets (Cache Storage via SW), indexes in a search worker. On new dataset version, re-index; favorites keyed by stable opening id (hash of UCI line) survive.
- If server is online: **Explorer panel** shows live next-move stats for the current position (server proxies Lichess with the token, Redis cache 7 days). Offline: static snapshot only.

---

## 3. Domain model (`packages/core`)

```ts
type MoveNode = { id; ply; san; uci; fen; parentId; children: string[]; comment?; nags?; userNote? }
type MoveTree = { rootFen; nodes: Record<string, MoveNode>; mainline: string[] }

type SessionMode = 'analysis' | 'bot' | 'local-pvp' | 'online'

type Session = {                       // an open "tab" — what the user is working on
	id; title; tree: MoveTree; cursor: string /* node id */;
	orientation: 'white' | 'black'; mode: SessionMode;
	source: { kind: 'opening' | 'fork' | 'new' | 'import' | 'saved'; openingId?; parentSessionId?; atNodeId? };
	savedGameId?: string;              // link for "Save" (overwrite)
	bot?: { engineId; targetElo; color: 'white' | 'black'; think: ThinkPreset | { movetimeMs } };
	clock?: ClockState;
	playback?: { speed: 'slow' | 'medium' | 'fast'; playing: boolean };
	result?; createdAt; updatedAt;
}

type SavedGame = { id; name; tags; favorite; tree; finalFen; source; result?; createdAt; updatedAt; parentGameId? }
```

Rules:
- **Autosave**: every session mutation is persisted (debounced 300 ms) to `sessions`. Sessions stay open across reloads and route changes until closed.
- **Save** (modal): default = overwrite `savedGameId`; option "Save as new" (name, tags) → new `SavedGame`, session re-links to it. First save of a session = always "new".
- **Fork** at cursor: new session, tree = path root→cursor, `source.kind='fork'`, mode `analysis`, becomes active tab.
- **Moving off the mainline** adds a variation; never deletes. Variations can be promoted / deleted from the move list.
- Opening identification: after each move, look up current EPD in graph → show opening name (deepest match) in the header.

---

## 4. Client app (`apps/web`)

### 4.1 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ♞ Logo   [Current ▾ 3]  Openings  Games  Settings     ● server  │  TopNav
├───────────────────────────────┬──────────────────────────────────┤
│                               │ [Moves][Openings][Games][Engine] │  panel tabs
│                               │                                  │
│           BOARD STAGE         │      Side panel content          │
│   (active session, always     │   (route/tab driven; board keeps │
│    mounted; playback & bot    │    playing while you browse)     │
│    keep running)              │                                  │
│   [clock (if side/top/bot)]   ├──────────────────────────────────┤
│                               │ ⏮ ◀ ▶ ⏭  ▶Play·speed  Fork Save  │  GameControls
│                               │ Flip  Bot  Analyse  …            │  (always active session)
└───────────────────────────────┴──────────────────────────────────┘
```

- `AppShell` holds `TopNav`, `BoardStage`, `SidePanel`, `GameControls`. Routes only swap the **panel content** (desktop) — the board never unmounts.
- **Current**: dropdown for quick switch + `/sessions` page (grid of mini-boards, title, mode, last move, close).
- **Mobile (< 900 px)**: board full width on top; panel tabs below; `GameControls` sticky bottom bar. Openings/Games open as full-height sheets with a floating "now playing" mini-board chip that returns to the game.
- Keyboard: ←/→ step, Home/End, Space play/pause, F flip, Ctrl+S save, Ctrl+Shift+S save as, / search.

### 4.2 Routes (preact-iso, lazy)

| Route | Panel content |
|---|---|
| `/` | Moves of active session (or "start" card: new game / browse openings) |
| `/openings` `?q&color&eco&sort&fav` | Openings browser |
| `/openings/:id` | Opening detail (preview board, moves, notes, stats, Load / Fork) |
| `/games` `?q&fav&sort` | Saved games |
| `/sessions` | Current open games |
| `/settings/:section` | app, board, pieces, engines, clock, server, data |
| `/play/:roomId` | online room (phase 12) |

Filter/sort state is in the URL → back/forward and links work.

### 4.3 Features

**Openings browser**
- Search box (fuzzy: name, alias, ECO, family, SAN moves like `e4 c5 Nf3`). 100 ms throttle.
- Filters: White / Black focus, ECO A–E, family, length range, has notes, ★ favorites only.
- Sort: popularity, name, ECO, length, white score, black score, recently viewed.
- Group by family (collapsible) or flat list. Virtualized list.
- Row: ★ toggle, name, ECO chip, move preview, popularity bar, perspective icon.
- Hover/select = **preview** on a mini-board in the panel (does not touch the active session). Actions: **Load** (new session, or reuse the active one if it is an untouched opening session — setting), **Fork** (new session at preview ply), ★.
- Tree mode: "continuations from here" for the current board position (from graph + live explorer if online).

**Moves panel**
- Move list (two-column SAN pairs, figurines from active piece set), variations indented, comments/notes inline, click to jump, right-click/long-press menu: fork here, delete from here, promote variation, add note.
- Header: opening name (live), ECO, popularity, W/D/L bar.
- Notes card for current position (Wikibooks text + attribution, user notes editor).

**Playback**
- `PlaybackController` (per session): play from cursor to end of line at speed slow 2.0 s / medium 1.0 s / fast 0.4 s (configurable). Pause, step, scrub. Any manual move or step pauses playback.

**Analysis mode (default for any loaded game)**
- You move both sides. Optional engine eval: eval bar, best-line arrows, MultiPV lines list (engine tab). Toggle on/off; runs in worker; stops when tab hidden.

**Play with Bot** (attach at any time, from the current position)
- Modal: engine (only available ones), target Elo slider (engine's range; below range → strength strategy, §5.3), your color (white/black/random), think time (instant/fast/normal/deep or custom ms), optional clock, "allow takebacks".
- Bot moves are added to the tree from the cursor (new variation if the cursor was not at the line end). Detach → back to analysis. Mode badge on the board.

**Local player vs player**
- Two humans on one device. Optional auto-flip each move, tabletop mode (top clock rotated 180°).

**Clock**
- `ClockConfig`: time + increment (presets 1+0 … 30+20, custom), delay option, low-time warning, tenths under 10 s, sound.
- Placement: side (narrow vertical strip beside board), top/bottom (above/below board), or overlay; size S/M/L. Pause on tab switch (option). State machine lives in `core/clock` (shared with server).

**Saved games**
- List with search, ★ filter, sort (updated, created, name), filters (source opening, mode, result). Thumbnail mini-board of final position.
- Actions: open (focus existing session if already open, else new session), rename, duplicate, delete (undo toast), export/import PGN.

**Settings**
- **App**: theme light/dark/system, accent color, density, font scale, sounds, animations speed / reduced motion.
- **Board**: theme pick, coordinates (inside/outside/none), highlights (last move, check, legal dots), arrows color, piece animation speed, drag vs click, show eval bar.
- **Pieces**: set pick + per-side colors (fill, stroke, accent) override.
- **Theme editor**: clone any board or piece theme → edit base colors per side, texture type/intensity, shading strength → live preview → save as new; export/import JSON.
- **Engines**: catalog cards (§5.4) with pros/cons, size, strength range, local/remote, status (installed / downloadable / on server). Default engine, download/remove large local engines.
- **Clock** defaults. **Server**: URL, status, login, sync on/off. **Data**: dataset version, clear caches, export all.

### 4.4 Board, pieces, themes

`BoardRenderer` contract (props in, events out) — `Board2D` now, `Board3D` later:

```ts
type BoardViewModel = { fen; orientation; lastMove?; check?; dests: Map<Square, Square[]>;
	arrows: Arrow[]; marks: Mark[]; premove?; interactive: boolean; animationMs: number }
interface BoardEvents { onMove(from, to, promotion?); onSelect(sq); onArrow(arrow) }
```

`Board2D` layers (bottom→top): squares (SVG), texture overlay, highlights, coordinates, pieces (absolute-positioned, transform-animated with FLIP / WAAPI), drag ghost, arrows/marks SVG, promotion picker. Pointer events for mouse + touch, drag threshold, click-click, right-drag arrows. Resize via ResizeObserver; square size = integer px for crisp lines.

**Recolorable assets — the key technique**
- **Pieces**: each piece SVG is normalized into role groups: `body` (fill `var(--pc-body)`), `line` (stroke `var(--pc-line)`), `accent` (`var(--pc-accent)`), plus a **shading group** of neutral white/black gradients with alpha + blend modes. Any base color still looks lit and 3D-ish. Pieces render from a per-set `<symbol>` sprite with `<use>`; white/black side vars set on the board root.
- **Boards**: base light/dark colors + optional procedural texture (SVG `feTurbulence` wood grain, marble veins, slate, felt, paper) drawn as a luminance overlay → tinted by any color. Tiny, offline, fully recolorable. Optional image textures later.
- **Effects**: soft piece drop shadow, lift-on-drag scale, capture fade, check glow pulse, last-move tint.

**Starter assets** (`tools/piece-assets` normalizes; licenses kept in `apps/web/public/pieces/LICENSES.md`):
- Imported (recolorable after normalization): `cburnett` (GPLv2+), `merida` (GPLv2+), `rhosgfx` (CC0), `fantasy` / `spatial` / `celtic` (MIT), `chessnut` (Apache-2.0), `kiwen-suwi` (CC BY 4.0). Optional personal-use only: `california`, `cardinal`, `maestro`, `staunty` (CC BY-NC-SA).
- Original (built here): **Sleek** (minimal geometric, one path per piece) and **Lux** (Staunton profile with layered shading for a realistic look).
- Board themes: Classic Brown, Tournament Green, Ice Blue, Slate, Walnut (wood), Carrara (marble), Felt, Midnight, Paper.

### 4.5 Client architecture

```
src/
  app/          AppShell, providers, route table
  pages/        Openings/, OpeningDetail/, Games/, Sessions/, Settings/, Home/
  components/
    common/     Button, IconButton, Input, Select, Slider, Toggle, Tabs, Modal, Sheet,
                Menu, Tooltip, Toast, Chip, Badge, ColorPicker, VirtualList, EmptyState
    board/      Board2D, layers/*, PromotionPicker, MiniBoard, EvalBar
    moves/      MoveList, MoveRow, VariationBlock, NotesCard, OpeningHeader
    controls/   GameControls, PlaybackControls, SaveModal, BotModal
    openings/   OpeningsSearch, OpeningsFilters, OpeningRow, OpeningPreview, ContinuationsList
    games/      GameRow, GameThumbnail
    sessions/   SessionSwitcher, SessionCard
    engine/     EnginePanel, PvLines, EngineCard
    clock/      Clock, ClockConfigForm
    theme/      ThemeEditor, BoardThemePreview, PieceSetPreview
  state/        signal stores: sessions, settings, theme, openings, engines, server
  services/
    api/        ApiClient (interface) + MockApiAdapter + HttpApiAdapter + index.ts
    db/         Dexie schema + repositories (Sessions, SavedGames, Favorites, Themes, Notes)
    engine/     EngineRegistry, adapters/*, workers/*
    openings/   dataset loader, search worker client
    realtime/   socket.io client (rooms, engine stream)
    server/     ServerConnector (detect, health, auth tokens)
    sound/      move/capture/check/low-time sounds
    sw/         service worker (vite-plugin-pwa injectManifest)
  lib/          pure helpers (format, throttle, color math, keyboard)
```

- **Dependency rule**: components → hooks/state → services (via interfaces) → core. Components never import a concrete adapter.
- **Repositories** are the single data path; `LocalRepository` (Dexie) always; `RemoteRepository` adds sync when the server is online and sync is on (last-write-wins by `updatedAt` + `revision`).
- **Mock layer** (build skill rule): `ApiClient` covers server-only data (explorer stats, engine list, rooms, auth). `MockApiAdapter` + `src/mock/data/*.json` make all of it demo without a server; `HttpApiAdapter` is selected when `ServerConnector` reports online.

### 4.6 PWA / caching

- `vite-plugin-pwa` (injectManifest). Precache: app shell, route chunks, opening datasets, Stockfish lite WASM, default piece set + board.
- Runtime: large engines + Maia models → CacheFirst (explicit download from Settings, progress UI, versioned); notes chunks → StaleWhileRevalidate; API → NetworkFirst with timeout.
- Install prompt, update toast ("new version — reload"), offline indicator in TopNav.
- Persistent storage request (`navigator.storage.persist()`) after first save.

---

## 5. Engines

### 5.1 Contract (`core/engine`)

```ts
interface EngineAdapter {
	readonly meta: EngineMeta            // id, name, kind local|remote, sizeMb, eloRange, humanLike, license, pros[], cons[]
	readonly capabilities: { limitStrength; multiPv; analysis; ponder }
	init(): Promise<void>
	newGame(): void
	play(pos: { fen; moves: string[] }, opts: PlayOptions): Promise<{ uci; info? }>
	analyze(pos, opts: AnalyzeOptions, onInfo: (i: EngineInfo) => void): () => void   // returns stop()
	dispose(): void
}
```

`EngineRegistry` = local adapters + engines reported by server `GET /engines`. Unavailable engines show with the reason (needs server / needs download / binary missing).

### 5.2 Catalog

| Engine | Where | Strength control | Notes |
|---|---|---|---|
| Stockfish 19 lite (single-thread) | Local WASM worker, ~1.6 MB | `UCI_Elo` 1320–3190, Skill 0–20, movetime/depth/nodes | **Default.** No COOP/COEP needed. |
| Stockfish 19 full NNUE | Local (download on demand, large) | same | Stronger analysis. Multi-thread only if served with COOP/COEP (Vite dev + server headers set). |
| Maia (1100–1900 ONNX, ~3.3 MB each) / Maia-2 (600–2600) | Local `onnxruntime-web` (WebGPU → WASM) | rating = model/bucket | Human-like mistakes — best for learning. Policy only, no search. |
| Fairy-Stockfish WASM | Local, optional | Skill, depth | Plays weaker than 1320; variants later. |
| Stockfish 19 native | Server | same as SF | Multi-thread, full net, deep analysis. |
| Leela (lc0) + BT nets | Server (GPU if present) | nodes limit | Strong, "human-ish" style. |
| Maia via lc0 (nodes=1) / Maia-2 via onnxruntime-node | Server | rating | Offloads models from phone. |
| Komodo Dragon 3.3 (free download) | Server, **user-supplied binary** (not redistributable) | `UCI Elo` (with space), Skill, Personality | Personal use only; detected by path in env. |

### 5.3 Strength strategy

`StrengthStrategy` maps `(engine, targetElo, thinkPreset)` → UCI options + go limits:
- Stockfish ≥ 1320: `UCI_LimitStrength=true`, `UCI_Elo`. Movetime by preset.
- Stockfish < 1320: `Skill Level 0`, low depth/nodes, plus a blunder blend (probability of a random legal non-losing-mate move, rising as Elo drops toward 400).
- Maia: nearest model / bucket; optional tiny temperature sampling.
- Komodo: `UCI Elo` / Skill. lc0: nodes curve.
- Think presets: instant (50 ms), fast (300 ms), normal (1 s), deep (3 s), custom. A minimum "human delay" so instant bots don't feel jarring (setting).

### 5.4 Settings UI

Engine cards: name, local/remote badge, size, Elo range, human-like badge, pros/cons bullets, status + action (Use / Download / Remove / Needs server). Comparison toggle shows a table.

---

## 6. Server (`apps/server`)

Optional. Client detects it; everything else degrades gracefully.

- **Scaffold**: `/scaffold-nest apps/server with swagger` (Express, Postgres + Redis, SWC, oxlint). Add `@nestjs/websockets` + `@nestjs/platform-socket.io`.
- **Modules** (`src/modules/*`):
  - `auth` — username/password (argon2), JWT access + refresh; guest tokens for joining rooms. Personal use → single owner account seeded from env; more users later.
  - `users` — profile, preferences sync.
  - `openings` — `GET /openings/manifest`, dataset files; `GET /explorer?fen&source=lichess|masters` → Lichess proxy with token, request queue (rate limit), Redis cache.
  - `games` — CRUD for saved games + sessions; `POST /sync` (batch, LWW by `updatedAt`/`revision`).
  - `engines` — catalog from config + binary detection on boot; `EnginePool` of `UciProcess` (spawn, line parser, idle timeout, max concurrent); REST `GET /engines`; WS namespace `/engine` (`start`, `position`, `go`, `info`, `bestmove`, `stop`).
  - `rooms` — WS namespace `/play`: `room:create|join|leave`, `game:move` (validated with `core` chessops), authoritative clock (`core/clock`), `chat:message`, generic `action` envelope `{ type, payload }` for future features, presence, reconnect + resync. Room state in memory, mirrored to Redis.
- **Protocol** in `packages/core/protocol`: typed, versioned envelopes `{ v: 1, type, id, payload }`, shared by client + server.
- **Ops**: Dockerfile + compose from scaffold; engine binaries mounted at `/opt/engines`; `COOP/COEP` headers when serving the web build.

---

## 7. BUILD.md / DESIGN.md content

Generated by the skills, then tailored. Content to put in them:

### 7.1 `apps/web/BUILD.md` (additions to the template)
- Stack: Preact, TS strict, SCSS (no modules), `@preact/signals`, `preact-iso`, `chessops`, `dexie`, `minisearch`, `motion`, `vite-plugin-pwa`, `onnxruntime-web` (lazy), `socket.io-client` (lazy), vitest + Playwright.
- Layering + dependency rule (§4.5). `packages/core` holds all pure chess/game logic — no chess rules in components.
- Board never unmounts; routes swap panel content only.
- Heavy work off the main thread: engines, search index, PGN import → Web Workers.
- Lazy-load: engine adapters, theme editor, settings sections, socket client, notes chunks.
- All persisted data goes through repositories; UI-only state through `useUIState`.
- Extension points (document each): `EngineAdapter`, `BoardRenderer`, `PieceSet`/`BoardTheme` JSON schema, `ApiClient`, WS `action` types, sound sets.
- Tests: vitest for `core` + services; Playwright for main flows (§9).

### 7.2 `apps/web/DESIGN.md`
- **Aesthetic**: "modern study" — calm, elegant, focused on the board. Deep ink/charcoal default dark theme with warm brass accent; light theme = warm paper. The board is the hero; chrome is quiet, rounded, layered with soft shadows; playful micro-motion (piece lift, check glow, favorite star pop).
- **Color tokens** (CSS vars): `--color-bg`, `--color-surface-1..3`, `--color-text`, `--color-text-muted`, `--color-accent` (user-configurable), `--color-success/warn/danger`, `--color-white-adv` / `--color-black-adv` (eval bar, W/D/L bar). Board/piece colors are separate token sets owned by the theme system.
- **Typography**: display serif for headings/opening names (e.g. *Fraunces*), UI sans (*Inter* or *Geist*), tabular mono for clocks and coordinates (*JetBrains Mono*); figurine notation in move lists.
- **Spacing & radii**: 4 px scale; radii 6 / 10 / 16; panel gutters 16/24.
- **Components**: cards with subtle border + shadow, segmented controls for filters, chips for ECO/tags, sheets on mobile, toasts bottom-center, 44 px min touch targets.
- **Motion**: piece move 180 ms ease-out (setting), panel transitions 200 ms, respects `prefers-reduced-motion`.
- **Accessibility**: keyboard board control (arrow-key square focus), ARIA move list, contrast AA in both themes, color-blind-safe highlight option.

### 7.3 `apps/server/BUILD.md`
- Scaffold rules (Nest, SWC, config via `ConfigService`, global filter/interceptors, tab indentation).
- Module boundaries: one feature per `src/modules/<name>/`; gateways thin, logic in services; shared DTOs from `packages/core/protocol`.
- Engine processes: never block the event loop; per-socket quotas; kill on disconnect.
- Secrets (Lichess token, JWT secret, Komodo path) only via env.

### 7.4 `apps/server/DESIGN.md` (API design)
- REST: resource nouns, `{ data, timestamp }` success, `{ error: {...} }` failures (scaffold shape), cursor pagination, ETags for datasets.
- WS: namespaces `/engine`, `/play`; versioned envelopes; acks for every client command; idempotent move ids.

---

## 8. Phases

Each phase ends with: typecheck + lint + tests green, docs updated, commit.

**Progress (2026-10-13)**

| # | Status |
|---|---|
| 0 Repo + rules | **DONE** — `6b38c04`, pushed to github.com/rw3iss/chess-trainer. |
| 1 Scaffold | **DONE** — web `853b698`, server `3dc5343`; BUILD/DESIGN/COMPONENT_INDEX tailored. |
| 2 Core | **DONE** — `bc1afee` (90 core tests incl. theme + openings). |
| 3 Openings data | IN PROGRESS — pipeline + datasets built; notes/popularity fetches running. |
| 4 Board + assets | **DONE** — `0ac8e76` (14 piece sets, 9 board themes), `22f2b99` (Board2D). |
| 5 App shell + sessions | **DONE** — `853b698`. |
| 6 Openings browser | IN PROGRESS |
| 7 Saved games | IN PROGRESS |
| 8 Local engines | Service layer **DONE** `441b9be` (sf-lite, sf-full, Maia-2, remote); UI IN PROGRESS. |
| 9 Settings + themes | IN PROGRESS |
| 10 Local PvP + clocks | IN PROGRESS |
| 11 PWA polish | IN PROGRESS |
| 12 Server features | Server side **DONE** `3dc5343`; client sync/auth IN PROGRESS. |
| 13 Online rooms | Server gateway **DONE**; client IN PROGRESS. |

Corrections found while building:
- §3 `MoveTree.mainline` was dropped: the mainline is the `children[0]` chain (simpler, no duplicate state).
- §5.2 local Maia is **Maia-2** (one ~89 MB ONNX model, Elo 1100–2000), not per-rating Maia-1 files. It is weak in the first 10 plies, so book moves from the openings data are used there.
- §6 Nest gateway/Swagger/JWT packages pinned to v11 (v12 needs Nest 12 core). DB defaults to SQLite (`DB_TYPE=postgres` optional); Redis optional.

| # | Phase | Main deliverables |
|---|---|---|
| 0 | **Repo + rules** | `git init`, pnpm workspace, root README/CLAUDE.md/BUILD.md, `docs/architecture.md`. |
| 1 | **Scaffold** | `/build` → `/scaffold-preact apps/web` (theme, motion, router→preact-iso, sw, caching/indexeddb); tailor `apps/web` BUILD.md / DESIGN.md / COMPONENT_INDEX.md (§7). `/scaffold-nest apps/server with swagger`; tailor its BUILD.md / DESIGN.md. `packages/core` skeleton + vitest. |
| 2 | **Core** | Move tree ops, PGN in/out (comments, variations, NAGs), EPD keys, Session/SavedGame reducers (move, variation, promote, delete, fork), clock state machine. Full unit tests. |
| 3 | **Openings data** | `tools/openings-data`: merge, graph, perspective, notes fetcher, popularity fetcher (resumable). Emit datasets + manifest. Popularity run in background (needs Lichess token). |
| 4 | **Board + assets** | `Board2D` (layers, drag/click, animation, promotion, arrows), `MiniBoard`, `tools/piece-assets` normalizer, starter piece sets + Sleek/Lux originals, procedural board themes, theme schema. |
| 5 | **App shell + sessions** | AppShell layout (desktop + mobile), TopNav with Current switcher, Dexie repos, sessions store with autosave, Moves panel, GameControls, PlaybackController, keyboard shortcuts, `/sessions` page. |
| 6 | **Openings browser** | Search worker, filters/sort/group, virtual list, ★ favorites, preview, detail page with notes + stats, Load / Fork, live opening name in game header, continuations list. |
| 7 | **Saved games** | Save / Save-as modal, Games page (search, ★, sort, filters, thumbnails), open/rename/duplicate/delete/undo, PGN import/export. |
| 8 | **Local engines** | Engine registry, Stockfish lite worker adapter, analysis panel (eval bar, MultiPV, arrows), Bot modal + attach/detach, strength strategy, Maia ONNX adapter, Stockfish full download. |
| 9 | **Settings + themes** | App theme + accent, board/piece pickers, per-side color overrides, Theme editor (clone/edit/export/import), engine cards with pros/cons, clock defaults, sounds. |
| 10 | **Local PvP + clocks** | PvP mode, Clock component (placements, sizes), tabletop mode, flags, results. |
| 11 | **PWA polish** | SW precache/runtime strategies, install/update prompts, offline indicator, storage persistence, Lighthouse PWA + perf pass. |
| 12 | **Server features** | Auth, ServerConnector + HttpApiAdapter, explorer proxy, games sync, engine pool + `/engine` WS (SF native, lc0+Maia, Komodo if present), remote engine adapter in client. |
| 13 | **Online rooms** | `/play` gateway, room UI (create/share link/join), moves, clocks, chat, reconnect. |

Phases 3 and 4 can run in parallel with 2 (no shared files). 12 can start after 2.

---

## 9. Verification

- **Unit (vitest)**: core tree/PGN/fork/clock, strength mapping, opening matcher, dataset pipeline (fixtures), repositories (fake-indexeddb).
- **E2E (Playwright, desktop + mobile viewports)**:
  1. Search "sicilian najdorf" → ★ → filter favorites → Load → play at fast → pause → step back 3 → Fork → new tab active.
  2. Make moves in analysis → Play with Bot (1500, black) → bot replies → detach.
  3. Save → edit → Save (overwrite) → Save as new → both in Games → reload page → sessions restored.
  4. Navigate Openings/Games/Settings while playback runs → returns with correct position.
  5. Offline (network off) → app loads, search works, local bot plays.
  6. Theme editor: clone board theme, change colors → board updates → persists.
- **Server**: smoke + module tests; WS room test with two clients.

---

## 10. Defaults chosen (change any before phase 1)

1. Own `Board2D` instead of chessground/cm-chessboard.
2. `chessops` (GPL-3) for rules/PGN — fine for private use; swap to `chess.js` (BSD) if the app is ever distributed.
3. Postgres + Redis (scaffold default) for the server; SQLite is possible if you want a slimmer deploy. *NOTE*: If SQLite is a lot lighter, and suffices without taking much memory, we can use it if it makes sense, but abstracted so the DB engine can be replaced later if necessary.
4. Komodo only as a user-supplied server binary (its license forbids redistribution; no WASM build exists).
5. Popularity is precomputed (needs your free Lichess API token) and refreshed live only when the server is online. **Lichess API Token**: stored as `LICHESS_TOKEN` in the root `.env` (gitignored; moved out of this file so it is never committed).