# @chess/core — public API contract

Pure TypeScript (no DOM, no Node APIs). Used by `apps/web` (via Vite alias to `src/`) and `apps/server` (via built `dist/`).
Types live in `src/<module>/types.ts`. All functions are **pure and immutable**: they return new objects and never mutate inputs.
Subpath imports: `@chess/core/chess`, `/game`, `/clock`, `/engine`, `/theme`, `/protocol`, `/openings` (or the root barrel).

## chess (`src/chess/`)

| Function | Signature | Notes |
|---|---|---|
| `INITIAL_FEN`, `ROOT_ID` | consts | |
| `legalDests` | `(fen) => Map<SquareName, SquareName[]>` | Castling dests use king-two-squares (e1→g1). |
| `applyUci` | `(fen, uci) => { fen: string; san: string; uci: Uci } \| null` | null if illegal. `uci` is canonical (king-takes-rook `e1h1` input → `e1g1`). |
| `makeUci` | `(from, to, promotion?: PromotionRole) => Uci` | |
| `isPromotionMove` | `(fen, from, to) => boolean` | |
| `sanToUci` / `uciToSan` | `(fen, san) => Uci \| null` / `(fen, uci) => string \| null` | |
| `positionStatus` | `(fen) => PositionStatus` | |
| `piecesFromFen` | `(fen) => PieceOnSquare[]` | For the board renderer. |
| `turnFromFen` | `(fen) => Color` | |
| `toEpd` | `(fen) => string` | First 4 FEN fields. |
| `validateFen` | `(fen) => boolean` | |
| `randomLegalMove` | `(fen, rng?: () => number, opts?: { avoidMateIn1?: boolean }) => Uci \| null` | For blunder blend. |
| `isRepetition` / `isFiftyMove` | `(fens: string[]) => boolean` / `(fen) => boolean` | |
| `createTree` | `(fen = INITIAL_FEN) => MoveTree` | |
| `treeFromUci` | `(uci: Uci[], fen?) => MoveTree` | Mainline only. Stops at the first illegal move. |
| `addMove` | `(tree, parentId, uci) => { tree; nodeId } \| null` | Reuses existing child with same uci. New child appended (becomes variation unless first). |
| `getNode` | `(tree, id) => MoveNode` | throws if missing |
| `pathTo` | `(tree, id) => MoveNode[]` | root → id inclusive (root first). |
| `uciPathTo` | `(tree, id) => Uci[]` | excludes root. |
| `mainline` | `(tree, fromId = ROOT_ID) => MoveNode[]` | children[0] chain, excluding `fromId`. |
| `lineEnd` | `(tree, id) => string` | follow children[0] to leaf. |
| `nextInLine` / `prevNode` | `(tree, id) => string \| null` | children[0] / parent. |
| `isOnMainline` | `(tree, id) => boolean` | |
| `deleteFrom` | `(tree, id) => MoveTree` | removes node + subtree (root → tree returned unchanged). |
| `promoteVariation` | `(tree, id) => MoveTree` | makes the branch containing id the first child at every ancestor. |
| `truncateTo` | `(tree, id) => MoveTree` | new tree with only root→id path (node ids preserved). |
| `setComment` / `setUserNote` / `setNags` | `(tree, id, value) => MoveTree` | `''` / `[]` / `undefined` clears the field. |
| `treeToPgn` | `(tree, headers?: Record<string,string>) => string` | Variations, comments (userNote exported as comment), NAGs. |
| `pgnToGames` | `(pgn) => PgnGame[]` | Multi-game; FEN/SetUp headers honored. `[%clk]`/`[%eval]`/shape commands stripped from comments; pre-move + post-move comments merge into `comment`. Games with an invalid start position are skipped; an illegal move ends its branch. |
| `nodeCount` / `maxPly` | `(tree) => number` | |

Node ids: `nanoid`-like short random strings from `newId()` (exported from `chess/id.ts`; uses `crypto.getRandomValues` when present, else Math.random).

## game (`src/game/`)

| Function | Signature |
|---|---|
| `createSession` | `(opts?: NewSessionOptions) => Session` (mode 'analysis', playback {medium,false}, dirty false) |
| `sessionFromOpening` | `(entry: OpeningEntry, opts?) => Session` — tree = opening line, cursor = root, title = opening name, source {kind:'opening', openingId}, orientation = entry.perspective |
| `forkSession` | `(session, nodeId, now?) => Session` — tree = truncateTo, cursor = nodeId, source {kind:'fork', parentSessionId, atNodeId}, mode 'analysis', no bot/clock, title `${title} (fork)` |
| `sessionFromSavedGame` | `(game: SavedGame, now?) => Session` — linked via savedGameId, cursor = lineEnd(root) |
| `sessionMove` | `(session, uci, now?) => Session \| null` — adds at cursor (reuses existing child; dirty only if the tree changed); cursor → new node; result = rule-based `detectResult` (in non-analysis modes a manual result such as resign sticks) |
| `sessionGoto` | `(session, nodeId) => Session` — throws on unknown id; no revision bump (cursor is view state) |
| `sessionStep` | `(session, delta: number) => Session` — ±n along current line (forward = children[0]) |
| `sessionToStart` / `sessionToEnd` | `(session) => Session` |
| `sessionUpdate` | `(session, patch: Partial<Session>, now?) => Session` — bumps updatedAt + revision |
| `currentFen` | `(session) => string` |
| `savedGameFromSession` | `(session, { name, tags?, asNew: boolean, existing?: SavedGame, now? }) => SavedGame` — overwrite keeps id/createdAt/favorite and bumps revision; asNew gets new id and parentGameId = session.savedGameId |
| `linkSessionToSaved` | `(session, game) => Session` — sets savedGameId, title = game.name, dirty=false |
| `detectResult` | `(fen, history fens?) => GameResult \| undefined` |
| `defaultTitle` | `(session) => string` |

## clock (`src/clock/`)

`CLOCK_PRESETS: ClockPreset[]` (1+0, 2+1, 3+0, 3+2, 5+0, 5+3, 10+0, 10+5, 15+10, 30+0, 30+20).
`ClockState.delayRemaining?` holds unused simple-delay ms for the current turn (kept across pause/resume).
`createClock(config, toMove = 'white')`, `startClock(state, now)`, `pressClock(state, now)` (stop mover, add increment, start other, apply delay; if no clock is running it just starts the opponent — no time/increment; if the mover is out of time it flags), `pauseClock(state, now)`, `resumeClock(state, now)`, `remainingAt(state, color, now)`, `checkFlag(state, now) => ClockState` (sets flagged), `isLowTime(state, color, now, thresholdMs)`, `formatClock(ms, { tenthsUnderMs = 10000 })` → `'4:59'` / `'0:09.3'` / `'1:02:03'`.

## engine (`src/engine/`)

- `ENGINE_CATALOG: EngineMeta[]` — every engine from PLAN §5.2 with pros/cons (local + remote). Ids: `sf-lite`, `sf-full`, `maia`, `fairy`, `sf-native`, `lc0`, `maia-remote`, `komodo`.
- `THINK_PRESET_MS: Record<ThinkPreset, number>` (instant 50, fast 300, normal 1000, deep 3000).
- `resolveStrength(meta: EngineMeta, targetElo: number | undefined, think: ThinkSetting) => StrengthPlan` — PLAN §5.3.
- `MAIA_BUCKETS = [1100..1900 step 100]`, `nearestMaiaBucket(elo)`.
- UCI helpers: `parseInfoLine(line) => EngineInfo | null` (null for `info string`, currmove-only and score-less lines), `parseBestMove(line) => { uci, ponder? } | null` (null for `(none)`/`0000`), `buildPositionCommand(pos: EnginePosition) => string`, `buildGoCommand(go: GoLimits) => string` (no limits / `infinite` → `go infinite`; set MultiPV via `setOptionCommands({ MultiPV: n })`), `setOptionCommands(options) => string[]`.
- `toWhitePov(score, turn: Color) => EngineScore`, `scoreToWinProbability(score) => number` (0..1 for white, logistic on cp), `formatScore(score) => '+1.23' | '#3' | '-#2'`.
- `pickBlunderMove(fen, bestUci, chance, rng) => Uci` — returns bestUci or a random legal move (never one that allows mate-in-1 when avoidable).
- Extras: `engineMeta(id)`, `thinkMs(think)`, `lc0Nodes(elo)`, `blendChance(elo, floorElo)`, constants `STOCKFISH_ELO_MIN/MAX`, `MIN_HUMAN_DELAY_MS`, `MAIA_TEMPERATURE`.

Strength truth table (`resolveStrength`):

| Family | Target Elo | Options | go | blunderChance |
|---|---|---|---|---|
| stockfish | none or ≥ 3190 | `UCI_LimitStrength=false`, `Skill Level=20` | movetime | 0 |
| stockfish | 1320–3189 | `UCI_LimitStrength=true`, `UCI_Elo` | movetime | 0 |
| stockfish | < 1320 | `UCI_LimitStrength=false`, `Skill Level=0` | depth 1–5, nodes 50–5000, movetime ≤ 200 | 0 → 0.5 linearly from 1320 down to 400 |
| komodo | in range | `UCI LimitStrength=true`, `UCI Elo` (space) | movetime | blend below range min |
| lc0 | any | — | nodes = 10^((elo−2200)/400) (min 1), movetime | blend below 2200 |
| maia | any | — (`ratingBucket` = nearest 1100–1900, `temperature` 0.1; 0 when no target) | remote: nodes 1 | blend below 1100 |
| fairy | any | `Skill Level` 0–20 over eloRange | depth cap when skill < 10 | blend below range min |

## theme (`src/theme/`) — owned by the board/assets work

- `BUILTIN_BOARD_THEMES: BoardTheme[]` (classic-brown, tournament-green, ice-blue, slate, walnut, carrara, felt, midnight, paper).
- `BUILTIN_PIECE_SETS: PieceSetAsset[]` (populated from tools/piece-assets output), `BUILTIN_PIECE_THEMES: PieceTheme[]` (one per asset with its default colors).
- `DEFAULT_BOARD_THEME_ID`, `DEFAULT_PIECE_THEME_ID`, `DEFAULT_APP_THEME: AppThemeSettings`.
- `cloneBoardTheme(theme, name) / clonePieceTheme(theme, name)` → new id, builtIn false, baseId set.
- `pieceThemeCssVars(theme) => Record<string,string>` (`--pc-white-body`, … , `--pc-shade`, `--pc-shadow`), `boardThemeCssVars(theme) => Record<string,string>`.
- `validateBoardTheme(x) / validatePieceTheme(x)` → type guards for import.
- `findPieceSet(id)`. Defaults: board `walnut`, pieces `lux`. `BUILTIN_PIECE_SETS` lives in `pieceSets.generated.ts` — regenerate with `pnpm assets:pieces` (`-- --render` also writes `tools/piece-assets/out/preview.png`).

## openings (`src/openings/`) — owned by the openings-data work

- `OpeningIndex` class: `static fromData(openings: OpeningsFile, graph: GraphFile)`;
  `byId(id)`, `all()`, `identify(fenOrEpd) => OpeningEntry | undefined` (deepest opening ending at this position),
  `identifyLine(uci: Uci[], startFen?) => OpeningEntry | undefined` (deepest named opening along the line),
  `continuations(fen) => Continuation[]`, `openingsThrough(fen) => OpeningEntry[]`.
- `openingId(uci: Uci[]) => string` (stable short hash), `splitName(name) => { family, variation? }`.

## protocol (`src/protocol/`)

Types only (+ `PROTOCOL_VERSION`, `EngineEvents`, `RoomEvents`), plus `envelope(type, payload, id?) => WsEnvelope`.
