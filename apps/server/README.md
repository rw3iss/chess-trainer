# @chess/server

Optional NestJS backend for the chess openings PWA. The web app works fully offline without it; when it is reachable the client turns on extra features from `GET /health`.

- **Stack**: NestJS 11 (Express, SWC, oxlint), TypeORM, socket.io, Swagger.
- **Defaults need nothing**: SQLite file in `data/` + in-memory cache. Postgres and Redis are opt-in through env.
- **Shared contract**: DTOs, WS events and envelopes come from `@chess/core` (`packages/core/src/protocol`).

Rules for contributors: [`BUILD.md`](BUILD.md). API design: [`DESIGN.md`](DESIGN.md).

## Run

```bash
# from the repo root
pnpm --filter @chess/core build          # the server loads core's dist/
cp apps/server/.env.example apps/server/.env   # set OWNER_USERNAME / OWNER_PASSWORD
pnpm dev:server                          # watch mode on http://localhost:3000
```

Or from `apps/server`: `make dev` (builds core first), `make build && make start`. `make help` lists every target.

Optional services (Docker): `make docker-services profiles=postgres` or `profiles=redis` (or both), then set `DB_TYPE=postgres` / `REDIS_HOST=localhost` in `.env`. Full stack in Docker: `make docker-start` (api + SQLite volume), add `profiles="postgres redis"` for the services. The Docker build context is the repo root (see `config/Dockerfile`).

Production (`NODE_ENV=production`, the image default) requires `JWT_SECRET` (32+ random chars) and an `OWNER_PASSWORD`. Example: `docker build -f apps/server/config/Dockerfile -t chess-server .` then `docker run -p 3000:3000 -e JWT_SECRET=… -e OWNER_PASSWORD=… -v chess-data:/app/data chess-server`. Verified with Podman (2026-10-13).

## Commands

```bash
pnpm build               # dist/ (SWC + type check)
pnpm start               # nest start (build + run)
pnpm start:prod          # node dist/main
pnpm typecheck           # tsc --noEmit (src + tests)
pnpm lint                # oxlint
pnpm test                # jest (all specs)
pnpm test:smoke          # smoke suite only

# migrations (TypeORM CLI, uses DB_TYPE / DB_PATH / DB_* from .env)
pnpm migration:generate src/database/migrations/<Name>   # then add it to migrations/index.ts
pnpm migration:run
pnpm migration:revert
pnpm migration:show
```

## Environment

All variables are validated by Joi at boot (`src/config/env.validation.ts`). The server loads `apps/server/.env`, then the repo-root `.env` (for `LICHESS_TOKEN`); real env vars win.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `staging` \| `production` \| `test` |
| `PORT` | `3000` | |
| `API_PREFIX` | *(empty)* | e.g. `api/v1` |
| `CORS_ORIGINS` | `*` | comma-separated allow-list |
| `LOG_LEVEL` | `log` | |
| `SWAGGER_ENABLED` | `false` | Swagger UI at `/docs` is always on outside production; this enables it in production |
| `DB_TYPE` | `sqlite` | `sqlite` \| `postgres` |
| `DB_PATH` | `data/chess.sqlite` | SQLite file (relative to cwd) or `:memory:` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | — / `5432` | required only when `DB_TYPE=postgres` |
| `DB_SYNCHRONIZE` | `false` | dev-only schema sync; migrations always run at boot |
| `REDIS_HOST` | *(empty)* | empty → in-memory cache; set → Redis cache + room mirror |
| `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | `6379`, —, `0` | |
| `JWT_SECRET` | random per process | **required in production** (≥16 chars) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` / `GUEST_TTL` | `900` / `2592000` / `86400` | seconds |
| `OWNER_USERNAME`, `OWNER_PASSWORD` | `owner` / — | owner account, created or re-hashed at boot (no account when the password is unset) |
| `DATA_DIR` | `../web/public/data` | openings dataset (from `tools/openings-data`) |
| `LICHESS_TOKEN` | — | enables `/explorer` (Lichess now requires a token) |
| `EXPLORER_BASE_URL` | `https://explorer.lichess.org` | |
| `EXPLORER_MIN_INTERVAL_MS` | `1000` | min gap between Lichess requests |
| `EXPLORER_CACHE_TTL` | `604800` | seconds (7 days) |
| `EXPLORER_PUBLIC` | `false` | `true` → `/explorer` needs no token |
| `ENGINE_STOCKFISH_PATH` | — | native Stockfish → engine `sf-native` |
| `ENGINE_LC0_PATH`, `LC0_WEIGHTS` | — | lc0 + network → engine `lc0` |
| `MAIA_WEIGHTS_DIR` | — | dir with `maia-1100.pb.gz` … `maia-1900.pb.gz` (run on lc0) → `maia-remote` |
| `ENGINE_KOMODO_PATH` | — | user-supplied Komodo Dragon → `komodo` |
| `ENGINE_FAIRY_PATH` | — | native Fairy-Stockfish → `fairy-native` (listed only when set) |
| `ENGINE_MAX_PROCESSES` | `4` | global cap on engine processes |
| `ENGINE_MAX_PER_SOCKET` | `2` | engine sessions per `/engine` connection |
| `ENGINE_IDLE_TIMEOUT_MS` | `300000` | idle processes are killed after this |
| `ENGINE_THREADS`, `ENGINE_HASH_MB` | `1`, `64` | sent as `Threads` / `Hash` |
| `ENGINE_ALLOW_GUESTS` | `false` | let guest tokens use `/engine` |
| `ROOM_TTL` | `86400` | seconds a room stays in the Redis mirror |

## REST endpoints

Success: `{ data, timestamp }`. Error: `{ error: { code, message, details?, timestamp, path } }`. Auth: `Authorization: Bearer <accessToken>`. Swagger: `/docs`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | public | `HealthDto` + feature flags (`auth`, `explorer`, `engines`, `rooms`, `sync`) |
| GET | `/health/ready` | public | DB + cache readiness |
| POST | `/auth/login` | public | `{ username, password }` → `AuthTokens` |
| POST | `/auth/refresh` | public | `{ refreshToken }` → new `AuthTokens` |
| POST | `/auth/guest` | public | `{ displayName }` → guest access token (rooms) |
| GET | `/auth/me` | user or guest | current principal (`UserDto`) |
| GET / PATCH | `/users/me` | user | profile + synced `preferences` blob |
| GET | `/openings/manifest` | public | `DATA_DIR/manifest.json` |
| GET | `/openings/data/:file` | public | dataset files with ETag; hashed files cached immutable |
| GET | `/explorer?fen=&source=lichess\|masters` | user (or public with `EXPLORER_PUBLIC`) | Lichess explorer → `ExplorerResult` |
| GET | `/games` · `/sessions` | user | cursor-paginated list (`?limit=&cursor=` → `{ items, nextCursor }`) |
| GET / PUT / DELETE | `/games/:id` · `/sessions/:id` | user | read / LWW upsert (`{ accepted, current }`) / tombstone delete |
| POST | `/sync` | user | `SyncRequest` → `SyncResponse` (LWW by `revision`, then `updatedAt`) |
| GET | `/engines` | public | `RemoteEngineDto[]` (`available` + `reason`) |

## WebSocket (socket.io)

Connect with `io(url + '/engine' | '/play', { auth: { token } })`. Every client command is a `WsEnvelope` `{ v: 1, type, id, payload }` sent **with an ack callback**; the ack is a `WsAck` `{ ok, data?, error?: { code, message } }`. Server events are envelopes too. Event names: `EngineEvents` / `RoomEvents` in `@chess/core`.

**`/engine`** (owner/user tokens; guests only with `ENGINE_ALLOW_GUESTS`)

| Client → server | Payload | Ack data |
|---|---|---|
| `engine:start` | `{ engineId }` | `{ engineSessionId, meta }` |
| `engine:position` | `{ engineSessionId, fen, moves }` | `null` |
| `engine:go` | `{ engineSessionId, mode: 'play' \| 'analyze', play?, analyze? }` | `null` (results stream) |
| `engine:stop` / `engine:close` | `{ engineSessionId }` | `null` |

Server → client: `engine:info` `{ engineSessionId, info }`, `engine:bestmove` `{ engineSessionId, uci, info? }`, `engine:error` `{ engineSessionId, message }`, `engine:close` `{ engineSessionId, reason }`. Play mode applies `resolveStrength` (UCI options + limits), the blunder blend and the minimum human delay. Disconnect kills the socket's engine processes.

**`/play`** (owner/user or guest tokens)

| Client → server | Payload | Ack data |
|---|---|---|
| `room:create` | `RoomCreatePayload` | `RoomJoinResult` |
| `room:join` | `{ roomId }` | `RoomJoinResult` (same seat on reconnect, else free seat, else spectator) |
| `room:leave` / `room:resync` | `{ roomId }` | `null` / `RoomState` |
| `game:move` | `{ roomId, uci }` (envelope `id` = idempotency key) | `GameMovedPayload` |
| `game:resign` / `game:draw-offer` | `{ roomId }` | `GameResult` / `RoomState` |
| `game:draw-answer` | `{ roomId, accept }` | `RoomState` |
| `chat:message` | `{ roomId, text }` | `ChatMessage` |
| `action` | `{ roomId, type, payload }` | `null` (relayed to the others) |

Server → room: `game:moved`, `game:ended` `{ roomId, result, room }`, `room:state`, `chat:message`, `presence` `{ roomId, players, spectators }`, `action` `{ …, from }`. A rejected handshake gets `error` `{ code, message }` and is disconnected.

## Layout

- `src/modules/` — `auth`, `users`, `openings` (manifest, dataset files, explorer proxy), `games` (saved games, sessions, sync), `engines` (catalog, `UciProcess`, `EnginePool`, `/engine` gateway), `rooms` (`/play` gateway).
- `src/common/` — filter, interceptors, decorators (`@Public`, `@AllowGuest`, `@PublicIf`, `@CurrentUser`), WS helpers.
- `src/config/` — loaders + Joi schema. `src/database/` — DB options, migrations, CLI data source. `src/cache/` — `CacheService` (memory / Redis).
- `config/` — nest-cli, tsconfig, .swcrc, oxlint, jest, Dockerfile, compose files.
- `tests/` — jest specs, helpers, fixtures (fake UCI engine, dataset). See `tests/README.md`.

## Notes

- `@chess/core` is ESM-only. The SWC build is CommonJS and loads it with Node 22 `require(esm)` (Node ≥ 22.12). Jest maps it to `packages/core/src` instead. Import core from the root barrel (`@chess/core`) only — subpaths don't resolve under the server's `moduleResolution: node`. Never import `chessops` directly (its CJS build is broken under `"type": "module"`); go through core.
- Usernames are stored lower-case.
- Engine binaries are probed with a UCI handshake at boot; a missing or broken binary shows as `available: false` with a reason.
