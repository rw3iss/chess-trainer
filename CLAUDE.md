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

## Production — https://chess.ryanweiss.net

Host: the ryanweiss.net box (InterServer, Fedora 44, `162.35.181.92`). Native services, no Docker.

**Connect:** `ssh rw3iss@162.35.181.92` (key `~/.ssh/id_ed25519`; NOPASSWD sudo). Interactive shells have
the alias `rw` (`alias rw='ssh rw3iss@162.35.181.92'`); scripts use the full host. The box's handbook is
`~/README.md` on the server.

| Thing | Where |
|---|---|
| Repo checkout (built on the box) | `/var/www/chess`, branch `main` (public HTTPS remote) |
| PWA (nginx docroot) | `/var/www/chess/apps/web/dist` |
| API service | `chess-server.service` → `node dist/main` in `apps/server`, **127.0.0.1:4100**, User `rw3iss` |
| Self-healing | `Restart=always` (no start limit) + `chess-server-healthcheck.timer` (2 min, restarts on failed `/health`) |
| Env (secrets) | `/etc/chess/chess-server.env` (root, 0600; written once, never overwritten). Owner login = `OWNER_USERNAME`/`OWNER_PASSWORD` there |
| DB / cache | Postgres role+db `chess`; Valkey DB `7` |
| Native engine | Fedora `stockfish` (`/usr/bin/stockfish`) → engine `sf-native`. lc0/Maia/Komodo not installed |
| nginx | `/etc/nginx/conf.d/chess.ryanweiss.net.conf`: static PWA, `/api/` → API (prefix stripped), `/api/socket.io/` WebSocket |
| TLS | Let's Encrypt `/etc/letsencrypt/live/chess.ryanweiss.net/` (auto-renew) |

The client is built with `VITE_DEFAULT_SERVER_URL=https://chess.ryanweiss.net/api`, so new installs talk to the
server out of the box. socket.io goes through `services/server/socketTarget.ts` (namespace on the origin,
`path: /api/socket.io`).

**Deploy** (the box pulls `origin/main` and builds itself — push first):

```bash
bash scripts/deploy/deploy.sh                       # from here: SSH → update.sh
ssh rw3iss@162.35.181.92 'bash /var/www/chess/scripts/deploy/update.sh'   # same thing
```

`update.sh`: `git reset --hard origin/main` → `pnpm install` → build core, server, web → `setup-server.sh`
(idempotent: stockfish, data dir, Postgres role/db + env file on first run, systemd units, TLS cert, nginx vhost)
→ restart → health-gate. Migrations run at server boot.

**Operate:** `sudo journalctl -u chess-server -f` · `sudo systemctl restart chess-server` ·
`curl -s http://127.0.0.1:4100/health` · edit `/etc/chess/chess-server.env` then restart.
