# BUILD.md — apps/server

Rules for code in `apps/server`. API shape rules: [`DESIGN.md`](DESIGN.md). How to run: [`README.md`](README.md).

## Stack

NestJS 11 on Express, SWC builder (`config/.swcrc`, CommonJS output), TypeScript strict, oxlint, TypeORM 0.3 (SQLite via better-sqlite3 by default, Postgres by env), ioredis (optional), socket.io via `@nestjs/platform-socket.io`, `@nestjs/jwt` + argon2, `@nestjs/swagger`, Jest + ts-jest + supertest + socket.io-client.

## Scaffold rules (kept)

- All tool configs live in `config/`. Tabs (width 4); YAML 2 spaces.
- **Config only through `ConfigService`** (`configService.get('namespace.key')`). Never `process.env.X` in app code — only in `src/config/loaders/*` and the TypeORM CLI `data-source.ts`. Every env var is in `env.validation.ts` (Joi) and `.env.example`, and documented in `README.md`.
- Responses: `ResponseInterceptor` → `{ data, timestamp }`; errors: `AllExceptionsFilter` → `{ error: { code, message, … } }`. Don't hand-roll shapes. Both skip non-HTTP contexts (gateways return `WsAck`).
- Global `ValidationPipe` (whitelist + forbidNonWhitelisted). Bodies that carry client documents (`SavedGame`, `Session`) are typed as plain objects and checked with `assertSyncedDoc` so nested trees are stored verbatim. Arrays of plain objects in DTOs need `@Type(() => Object)` (implicit conversion otherwise turns each item into `[]`).
- Controller routes and service methods get a one-line comment saying what they do; non-obvious logic gets a *why* comment.
- App wiring shared by `main.ts` and tests lives in `src/bootstrap.ts` (`configureApp`).

## Module boundaries

- One feature per `src/modules/<name>/` (module, controller/gateway, service, `entities/`, `dto/`). `app.module.ts` imports a flat list.
- Cross-cutting code goes in `src/common/` (auth claims type, decorators, WS helpers), `src/cache/`, `src/database/`.
- Allowed module imports: `rooms`, `engines` → `auth` (token verification); `auth` → `users`; `health` → `engines`, `openings`, `users` (feature flags). No other feature-to-feature imports.
- **Gateways are thin**: authenticate the handshake, `unwrap` the envelope, call a service, return `ack(...)`. Game rules, clocks, engine I/O and sessions live in services. Services push events through a small sink/emitter interface (`EngineSink`, `RoomsEmitter`) and never touch sockets.
- **Shared types come from `@chess/core`** (`protocol`, `engine`, `game`, `clock`, `chess`). Do not redefine DTOs that exist there. Chess rules (move legality, SAN, results, clocks, strength plans, UCI parsing) always go through core — never import `chessops` directly.
- Import core from the root barrel (`@chess/core`): the server's `moduleResolution: node` does not see core's subpath exports.

## @chess/core (ESM) from a CommonJS build

- Build core first: `pnpm --filter @chess/core build` (`make dev` / `make build` do it).
- Runtime: SWC emits `require('@chess/core')`; Node ≥ 22.12 loads ESM via `require(esm)`. Core must stay free of top-level `await`.
- Jest: `@chess/core` → `packages/core/src/index.ts` (ts-jest), `./x.js` specifiers mapped to extensionless.

## Database

- `DB_TYPE=sqlite` (default; `DB_PATH`, `data/` is gitignored) or `postgres` (`DB_*`). Options are built in one place: `src/database/db-options.ts`.
- Portability: entity columns use `varchar`, `text`, `integer`, `bigint` (+ `bigintNumber` transformer, epoch ms), `boolean`, `simple-json`. No engine-specific types.
- Migrations use TypeORM's `Table` API (not raw SQL) so one file runs on both engines. They run at boot (`migrationsRun`). Register every migration in `src/database/migrations/index.ts`. `DB_SYNCHRONIZE` is dev-only.
- Client-synced tables (`saved_games`, `sessions`) share `SyncedRow`: PK `(user_id, id)`, JSON `data`, `revision`, `updated_at`, `deleted` (tombstone), `server_updated_at` (delta sync).

## Cache

Inject `CacheService` (`get` / `set(key, value, ttlSeconds)` / `del` / `ping`, `kind`). `REDIS_HOST` empty → `MemoryCacheService`; set → `RedisCacheService`. Values are JSON in both. Work that only matters when shared (room mirror) checks `cache.kind === 'redis'`.

## Auth

- Global `JwtAuthGuard` (APP_GUARD): every HTTP route needs a Bearer access token unless `@Public()` / `@PublicIf('config.key')`. Guest tokens are refused unless the route has `@AllowGuest()`.
- Token types via the `typ` claim: `access`, `refresh` (only `/auth/refresh`), `guest`. Gateways call `AuthService.authenticate(handshakeToken(socket))` in `handleConnection` and disconnect on failure.
- Owner account is seeded from `OWNER_USERNAME` / `OWNER_PASSWORD` at boot (argon2); env is the source of truth.

## Engine processes

- Never block the event loop: `UciProcess` uses async child stdio + `readline`; no sync I/O after boot (the boot-time `accessSync` / `readdirSync` checks are the only exception).
- Every process belongs to the `EnginePool`: global cap `ENGINE_MAX_PROCESSES`, per-socket quota `ENGINE_MAX_PER_SOCKET`, idle reaper `ENGINE_IDLE_TIMEOUT_MS`, `releaseOwner` on disconnect, `shutdown` on module destroy (`enableShutdownHooks` in `main.ts`).
- Options are sent only if the engine advertises them (`option name …`). One search per process; a new `go` stops the previous one.
- Binaries are user-supplied paths (`ENGINE_*_PATH`); Komodo is never bundled.

## Secrets

`JWT_SECRET`, `LICHESS_TOKEN`, owner password and engine paths come only from env (`apps/server/.env` or repo-root `.env`, both gitignored). Never log tokens. Production requires `JWT_SECRET`.

## Tests

- Jest specs in `tests/specs/*.spec.ts`; helpers in `tests/helpers/app.ts` (boot full app on SQLite `:memory:` + memory cache, socket helpers). Fixtures in `tests/fixtures/` (fake UCI engine, tiny dataset).
- Every module gets a spec. Gateways are tested with real socket.io clients against a listening app. External HTTP (Lichess) is mocked (`jest.spyOn(global, 'fetch')`).
- Done = `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` green, plus a real boot (`pnpm start`) and `curl /health`.
