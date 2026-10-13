# @chess/core

Pure TypeScript logic shared by `apps/web` and `apps/server`. No DOM or Node APIs. Every function is pure and immutable.
Full function list and contracts: [`API.md`](./API.md).

| Module | Contents |
|---|---|
| `chess` | Rules via `chessops` (legal dests, UCI/SAN, status, FEN helpers), immutable `MoveTree` ops, PGN import/export. |
| `game` | `Session` (open game tab) and `SavedGame` reducers: create, from opening, fork, move, navigate, save / save-as-new. |
| `clock` | Deterministic clock state machine (`now` passed in): increment, simple delay, pause/resume, flag, `formatClock`. |
| `engine` | `ENGINE_CATALOG`, strength strategy (`resolveStrength`), UCI parse/build helpers, score utils, blunder blend. |
| `theme` | Board / piece themes and CSS-var helpers. |
| `openings` | `OpeningIndex` over the generated datasets. |
| `protocol` | REST DTOs, WS envelopes and event names shared with the server. |

## Conventions

- Moves are UCI strings. Castling is always king-two-squares (`e1g1`); conversion to chessops' king-takes-rook form is internal to `chess/position.ts`.
- Trees: `children[0]` is the mainline; later children are variations. Node ids come from `newId()`.
- PGN export writes `comment` then `userNote` as separate comments; on import they merge into `comment`.

## Scripts

```sh
pnpm --filter @chess/core test       # vitest (src/**/*.test.ts)
pnpm --filter @chess/core typecheck
pnpm --filter @chess/core build      # tsc → dist/ (tests excluded); required before the server typechecks
```

The web app aliases `@chess/core` to `src/`; the server uses `dist/`.
