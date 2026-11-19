# CLAUDE.md — chess

Chess openings learning PWA (phone + desktop) with an optional NestJS server.
Master plan: `docs/plan/PLAN.md`. Accounts plan (sign-up, recovery, linked sign-in): `docs/plan/ACCOUNTS.md`. Architecture: `docs/architecture.md`. Core API contract: `packages/core/API.md`.

## Layout
- `apps/web` — Preact + TS + SCSS PWA. Rules: `apps/web/BUILD.md`, `apps/web/DESIGN.md`, reuse manifest `apps/web/COMPONENT_INDEX.md`.
- `apps/server` — NestJS API + socket.io gateways. Rules: `apps/server/BUILD.md`, `apps/server/DESIGN.md`.
- `packages/core` — pure TS shared logic (chess tree/PGN, sessions, clock, engine contracts + strength, themes, openings index, WS protocol). No DOM/Node APIs.
- `tools/openings-data` — builds `apps/web/public/data/*` from Lichess TSV + eco.json + Lichess explorer popularity + Wikibooks notes.
- `tools/piece-assets` — normalizes SVG piece sets into recolorable sprites in `apps/web/public/pieces/`.
- `tools/board-vision` — trains the board-image piece classifier → `apps/web/public/models/board-vision/` (`pnpm vision:train`). **`vision:train` runs the full pipeline:** it rewrites the committed e2e fixtures, trains from scratch and exports over the shipped model. To continue a run, use `train.py --resume runs/<name>/last.pt` (see its README). Ship only if `heldOutStyles` beats the current model and `e2e/import-position.spec.ts` passes.

## Conventions
- pnpm workspace. Run from root: `pnpm dev`, `pnpm dev:server`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- Tabs (width 4) everywhere; YAML 2 spaces.
- `@chess/core` must be built (`pnpm --filter @chess/core build`) before the server typechecks/runs; the web app aliases it to `src/`.
- Core functions are pure + immutable. No chess rules in components.
- Secrets only in root `.env` / `apps/server/.env` (gitignored). `LICHESS_TOKEN` lives in root `.env`.
- The server is optional: the web app must work fully offline without it.
- Web direct runs (from `apps/web`): `npx vitest run -c config/vitest.config.ts` (without `-c`, the `@/` aliases fail); typecheck is `config/tsconfig.app.json` + `config/tsconfig.worker.json`. The lib is ES2022, so ignore oxlint `no-array-sort`/`toSorted` warnings.
- e2e: drive state through `window.__chess` (wait for it first). Settings and sessions save with a 300 ms debounce, so wait about 600 ms before `page.reload()`.

## Production — https://chess.ryanweiss.net (alias https://chess.rw3iss.com)

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
| nginx | `/etc/nginx/conf.d/chess.ryanweiss.net.conf` (`chess.ryanweiss.net` + `chess.rw3iss.com`): static PWA, `/api/` → API (prefix stripped), `/api/socket.io/` WebSocket |
| TLS | Let's Encrypt `/etc/letsencrypt/live/chess.ryanweiss.net/` (auto-renew) |
| Cloudflare | Both domains are proxied by Cloudflare. nginx restores the client IP from `CF-Connecting-IP` (`/etc/nginx/chess/realip.conf`) — limits and bans are per real client |
| Rate limits | nginx zones `chess_auth` (10 r/min on `/api/auth/{login,register,password,oauth}`), `chess_api` (20 r/s), 30 connections per client → 429. Files: `deploy/nginx/` |
| fail2ban | Jails `chess-auth`, `chess-limit-req`, `chess-scan` (ban = nginx `deny` via `chess-nginx-bans.service`, since Cloudflare is the TCP peer) + box-wide `sshd`, `recidive`. Unban: `sudo fail2ban-client set <jail> unbanip <ip>`. Details: `docs/ops/SECURITY.md` |

The client is built with `VITE_DEFAULT_SERVER_URL=/api` (relative → resolved against the page origin), so new
installs talk to the same-origin server out of the box on either domain. `CORS_ORIGINS` lists both domains. socket.io goes through `services/server/socketTarget.ts` (namespace on the origin,
`path: /api/socket.io`).

**Deploy** (the box pulls `origin/main` and builds itself — push first):

```bash
bash scripts/deploy/deploy.sh                       # from here: SSH → update.sh
ssh rw3iss@162.35.181.92 'bash /var/www/chess/scripts/deploy/update.sh'   # same thing
```

`update.sh`: `git reset --hard origin/main` → `pnpm install` → build core, server, web → `setup-server.sh`
(idempotent: stockfish, data dir, Postgres role/db + env file on first run, systemd units, TLS cert, nginx vhost +
chess snippets/zones, fail2ban jails)
→ restart → health-gate. Migrations run at server boot.

**Operate:** `sudo journalctl -u chess-server -f` · `sudo systemctl restart chess-server` ·
`curl -s http://127.0.0.1:4100/health` · edit `/etc/chess/chess-server.env` then restart.
