# Production security — chess.ryanweiss.net

Box: the ryanweiss.net host (Fedora, SELinux enforcing), shared with other sites. Everything below is
chess-specific unless marked **box-wide**. Installed and kept in sync by `scripts/deploy/setup-server.sh`
(runs on every deploy). Audited and applied 2026-11-19.

## Traffic path

Browser → **Cloudflare** (proxied DNS for chess.ryanweiss.net and chess.rw3iss.com) → nginx :443 → API on
127.0.0.1:4100. nginx restores the real client IP from `CF-Connecting-IP`, trusting only Cloudflare ranges
(`/etc/nginx/chess/realip.conf`, from `deploy/nginx/chess-realip.conf`; refresh when Cloudflare changes ranges:
https://www.cloudflare.com/ips-v4 and /ips-v6). The API sees that IP in `X-Forwarded-For` (trust proxy = loopback).

## nginx (deploy/nginx/)

| What | Where | Setting |
|---|---|---|
| Rate-limit zones | `conf.d/00-chess-http.conf` | `chess_auth` 10 r/min, `chess_api` 20 r/s, `chess_conn` per client |
| Sign-in / sign-up / password / OAuth (`/api/auth/{login,register,password/,oauth/,google/,lichess/}`) | vhost | 10 r/min, burst 5 → 429; body ≤ 64 KB |
| Rest of `/api/` | vhost | 20 r/s, burst 40 → 429; body ≤ 2 MB (`/api/sync` ≤ 10 MB) |
| socket.io | vhost | no request-rate limit; counts toward 30 open connections per client |
| Slow clients | vhost | header/body timeout 15 s, send 30 s, keep-alive 30 s |
| Scanner paths (`*.php`, dotfiles except `.well-known`) | vhost | 404 (and fail2ban `chess-scan`) |
| Headers | `chess/security-headers.conf` | HSTS (1 y), nosniff, Referrer-Policy, X-Frame-Options SAMEORIGIN, CSP `frame-ancestors 'self'` only (no script CSP: wasm + workers), Permissions-Policy; `server_tokens off` |
| Logs | vhost | `/var/log/nginx/chess.access.log`, `chess.error.log` (fail2ban reads them) |

## fail2ban (deploy/fail2ban/)

| Jail | Watches | Rule | Ban |
|---|---|---|---|
| `chess-auth` | chess access log: POST `/api/auth/{login,register,password/*,oauth/*}` → 401/403/429 | 10 in 10 min | 1 h |
| `chess-limit-req` | chess error log: nginx `limiting requests` on `chess_*` zones | 20 in 1 min | 10 min |
| `chess-scan` | chess access log: `.php`, `/.env`, `/.git/`, `/wp-*`, `/phpmyadmin`, `/cgi-bin/`, … | 3 in 10 min | 1 day |
| `sshd` (**box-wide**) | journal | 5 in 10 min | 1 h (firewall) |
| `recidive` (**box-wide**) | `/var/log/fail2ban.log` | 5 bans in 1 day | 1 week (firewall) |

Ignored: 127.0.0.1/8, ::1, the box's own IPv4 and IPv6.

**How chess bans work.** Cloudflare is the TCP peer, so a firewall ban would never match a real client. Chess jails
use the `chess-nginx-deny` action instead: it writes `deny <ip>;` lines to `/var/lib/fail2ban/chess-banned.list`.
`chess-nginx-bans.service` (root, `/usr/local/bin/chess-nginx-bans --watch`) checks that list every 5 s, copies valid
lines to `/etc/nginx/chess/banned.conf` (included by the vhost), runs `nginx -t` and reloads (restoring the previous
list if the test fails). This split is needed because SELinux keeps fail2ban out of `/etc/nginx` and does not let it
run `systemctl`. Banned clients get 403 from nginx within ~5 s, through Cloudflare or direct to the origin.

## Commands

```bash
sudo fail2ban-client status                      # jails
sudo fail2ban-client status chess-auth           # failures + banned IPs of one jail
sudo fail2ban-client set chess-auth unbanip <ip> # unban (same for chess-scan, chess-limit-req, sshd, recidive)
sudo fail2ban-client set chess-scan banip <ip>   # manual ban
sudo cat /etc/nginx/chess/banned.conf            # what nginx denies now
sudo tail -f /var/log/fail2ban.log
sudo tail -f /var/log/nginx/chess.error.log      # 'limiting requests' lines = rate limits hit
systemctl status chess-nginx-bans                # ban list → nginx sync
```

## Audit (2026-11-19)

- firewalld (zone FedoraServer): public services ssh, http, https, cockpit (9090), dhcpv6-client. Everything else
  (Postgres 5432, Valkey 6379, the chess API 4100, other apps' ports) is closed to the internet. Postgres and Valkey
  listen on localhost only.
- The chess API binds `*:4100` (all interfaces). It is closed by the firewall, but binding 127.0.0.1 would be safer
  (needs a `HOST` option in `apps/server/src/main.ts`).
- sshd: key-only (`PasswordAuthentication no`, `KbdInteractiveAuthentication no`), `PermitRootLogin no`, port 22.
- TLS: Let's Encrypt, TLSv1.2 + 1.3. Cloudflare terminates TLS for visitors.
- Cockpit (9090) is reachable from the internet (box-wide; left as is — close with
  `sudo firewall-cmd --permanent --remove-service=cockpit && sudo firewall-cmd --reload` if unused).

## Not done (by choice)

- Cloudflare-level rules (WAF, Bot Fight, rate limiting at the edge, banning at Cloudflare via API): need a Cloudflare
  API token. Edge rules would stop floods before they reach the box; nginx limits + fail2ban cover the origin.
- No script Content-Security-Policy (would need nonces/hashes for the boot script, wasm and workers).
