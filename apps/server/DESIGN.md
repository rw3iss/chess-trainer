# DESIGN.md — server API design

The server is optional. Every feature must degrade cleanly: the client reads `GET /health` → `features` and only uses what is on.

## REST

- **Resources are nouns**: `/games`, `/sessions`, `/users/me`, `/engines`, `/openings/manifest`, `/explorer`. Actions that are not CRUD get their own noun (`/sync`, `/auth/login`).
- **Envelope**: success `{ data, timestamp }`; error `{ error: { code, message, details?, timestamp, path } }` with `code` from `ErrorCode` (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `RATE_LIMITED`, …). Validation errors list fields in `details.fields`. Types: `ApiSuccess` / `ApiError` in `@chess/core`.
- **Auth**: `Authorization: Bearer <accessToken>`. Access 15 min, refresh 30 days (`POST /auth/refresh`), guest 24 h (rooms only). Default for a new route: authenticated non-guest.
- **Pagination**: cursor-based. `?limit=` (1–200, default 50) + `?cursor=`; response `{ items, nextCursor }` (`null` at the end). Order: most recently changed first (`server_updated_at DESC, id DESC`); the cursor is opaque.
- **Client documents** (`SavedGame`, `Session`): the client owns ids and the document shape (`@chess/core/game`). The server stores the whole object and only reads `id`, `revision`, `updatedAt`, `tree`.
  - `PUT /games/:id` is an upsert under **last-writer-wins**: higher `revision` wins; equal revision → later `updatedAt`; exact tie keeps the server copy. Response `{ accepted, current }` so the client can adopt the winner.
  - `DELETE` writes a tombstone (kept forever, cheap) so other devices learn about it. A tombstone beats an upload unless the upload has a higher revision.
  - Documents are scoped per user: primary key `(user_id, id)`.
- **Sync** (`POST /sync`, `SyncRequest` → `SyncResponse`): apply client deletes, then uploads (LWW), then return every server row changed since `since` (inclusive) plus server copies that beat an upload; docs the client just won with are not echoed. `serverTime` is captured before writes — store it and send it as the next `since`. Worst case a doc comes back once more; never lost.
- **Datasets**: `GET /openings/manifest` (no-cache) and `GET /openings/data/:file` (ETag + `If-None-Match` → 304; content-hashed files `Cache-Control: immutable`). File names are validated (no paths).
- **Explorer**: `GET /explorer?fen=&source=lichess|masters` → `ExplorerResult` (moves in king-two-squares UCI). Cache key = source + EPD, TTL 7 days. Upstream: one request at a time, ≥1 s apart, 60 s pause after a 429 (then `429 RATE_LIMITED` to the client). No token → `503`. Upstream failure → `502`.
- **Engines**: `GET /engines` → `RemoteEngineDto[]` — every remote catalog engine, with `available` and a human `reason` when not.
- **Docs**: Swagger at `/docs` (`@ApiTags` per module, bearer auth). On outside production; `SWAGGER_ENABLED=true` in production.

## WebSocket

- socket.io namespaces: **`/engine`** (remote engines) and **`/play`** (rooms). Auth token in `handshake.auth.token` (or `Authorization` header). A rejected handshake is told why and disconnected.
- **Versioned envelopes** both ways: `{ v: 1, type, id, payload }` (`WsEnvelope`, `envelope()` in core). Wrong version or shape → `BAD_ENVELOPE`.
- **Every client command is acked** with `WsAck` `{ ok, data?, error?: { code, message } }`. Clients must pass an ack callback. Errors are codes, not exceptions: `NOT_FOUND`, `BAD_REQUEST`, `UNAVAILABLE`, `QUOTA`, `BUSY`, `ENGINE_FAILED`, `NOT_IN_ROOM`, `NOT_A_PLAYER`, `NOT_YOUR_TURN`, `ILLEGAL_MOVE`, `WAITING`, `GAME_OVER`, `FLAGGED`, `NO_OFFER`, `INTERNAL_ERROR`.
- **Idempotent moves**: the envelope `id` of `game:move` is the idempotency key. A retried id returns the original `GameMovedPayload` and is not applied twice (last 64 ids per room).
- **Server-authoritative play**: the server validates every move with core (`applyUci`), owns the clock (core `pressClock` / `checkFlag`; a timer flags the side to move), detects results (`detectResult`: mate, stalemate, insufficient material, 50-move, threefold), and handles resign / draw offer + answer.
- **Presence + reconnect**: seats belong to a `userId`. Disconnect marks the player `connected: false` (seat kept); joining again with the same user restores the seat. Extra users are spectators.
- **Extension point**: `action` `{ roomId, type, payload }` is relayed to everyone else in the room with `from` = sender id. New room features should be new `action` types first; promote to a named event only when the server must validate them.
- **Room state** is in memory; with Redis each change is mirrored to `room:<id>` (TTL `ROOM_TTL`) and rehydrated on join after a restart.
- **Engines over WS**: `engine:start` → session (one pooled process); `engine:position`; `engine:go` in `play` mode (strength plan from `resolveStrength`, blunder blend, minimum human delay, one `engine:bestmove`) or `analyze` mode (MultiPV, depth/movetime/infinite, streamed `engine:info`, final `engine:bestmove`); `engine:stop`; `engine:close`. Results of a superseded search are dropped. Quotas: per-socket sessions and a global process cap.
