# CLAUDE.md — chess

Chess openings learning PWA (phone + desktop) with an optional NestJS server.
Master plan: `docs/plan/PLAN.md`. Architecture: `docs/architecture.md`. Core API contract: `packages/core/API.md`.

## Layout
- `apps/web` — Preact + TS + SCSS PWA. Rules: `apps/web/BUILD.md`, `apps/web/DESIGN.md`, reuse manifest `apps/web/COMPONENT_INDEX.md`.
- `apps/server` — NestJS API + socket.io gateways. Rules: `apps/server/BUILD.md`, `apps/server/DESIGN.md`.
- `packages/core` — pure TS shared logic (chess tree/PGN, sessions, clock, engine contracts + strength, themes, openings index, WS protocol). No DOM/Node APIs.
- `tools/openings-data` — builds `apps/web/public/data/*` from Lichess TSV + eco.json + Lichess explorer popularity + Wikibooks notes.
- `tools/piece-assets` — normalizes SVG piece sets into recolorable sprites in `apps/web/public/pieces/`.

## Conventions
- pnpm workspace. Run from root: `pnpm dev`, `pnpm dev:server`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- Tabs (width 4) everywhere; YAML 2 spaces.
- `@chess/core` must be built (`pnpm --filter @chess/core build`) before the server typechecks/runs; the web app aliases it to `src/`.
- Core functions are pure + immutable. No chess rules in components.
- Secrets only in root `.env` / `apps/server/.env` (gitignored). `LICHESS_TOKEN` lives in root `.env`.
- The server is optional: the web app must work fully offline without it.
