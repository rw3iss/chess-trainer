# tests/

Plain Jest + ts-jest + supertest + socket.io-client.

```
tests/
├── framework/setupGlobals.js   # baseline test env (SQLite :memory:, memory cache, fixed JWT secret, owner/owner-pass)
├── helpers/app.ts              # bootApp(env), ownerToken, guestToken, connect, send (enveloped + ack), next (await event)
├── fixtures/
│   ├── fake-uci.js             # minimal UCI engine (executable) used by engine specs
│   └── data/                   # tiny openings dataset (manifest + one hashed file)
└── specs/
    ├── smoke.spec.ts           # envelopes; full app boot: /health, /health/ready, dataset files, /docs, auth required
    ├── auth.spec.ts            # login, refresh, guest, token types, validation
    ├── sync.spec.ts            # LWW unit + CRUD, pagination, /sync, tombstones, per-user scoping
    ├── explorer.spec.ts        # mapping, token header, cache, de-dup, errors, rate-limit queue (mocked fetch)
    ├── uci-process.spec.ts     # UciProcess parsing/lifecycle + EnginePool against the fake engine
    ├── engines.gateway.spec.ts # /engine: catalog, auth, quota, analyze/stop/play, disconnect cleanup
    └── rooms.gateway.spec.ts   # /play with two clients: create/join/move/illegal/idempotent, chat, action, resign, draw, clock flag, reconnect, spectator
```

Run: `pnpm test`, `pnpm test:smoke`, `pnpm test:watch`.

`bootApp(env)` sets env **before** importing `AppModule` (ConfigModule validates env at import). `@chess/core` is mapped to its TypeScript sources (see `config/jest.config.js`).
