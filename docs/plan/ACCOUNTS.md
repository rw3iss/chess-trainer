# Accounts plan — sign-up, profiles, password recovery, linked sign-in

Status (2026-11-19): **all phases done** — A local DB per account; B sign-up, invites, login limits, devices (rotating refresh tokens), delete account; C `/profile` (avatar, email confirmation, security, invites, data, owner tools); D1 email reset, D2 email confirmation, D3 recovery codes, D4 owner reset link; E Lichess sign-in + game import; F Google; G Chess.com game import. Privacy policy: `/privacy.html` (`/privacy` redirects). Box hardening: docs/ops/SECURITY.md.
Possible later: avatar crop UI with zoom, "unsynced changes" warning on remove-from-device, Cloudflare edge rules.

## 1. Today

| Area | State |
|---|---|
| Device data | One IndexedDB database per browser (`chess-openings`, Dexie): sessions, saved games, favorites, themes, notes, settings, kv. The app works fully offline with no account. |
| Server data | One Postgres database for all users. `users`; `saved_games` + `sessions` rows keyed `(user_id, id)`; `password_resets`. |
| Accounts | Owner (env-seeded) + users from sign-up (`SIGNUP_MODE=open`, configurable) or Google. Guests: rooms only, no DB row. |
| Sign-in | Header account menu / Settings → Server; `/signup`; Continue with Google. JWT access (15 min) + refresh (30 days). Failed logins rate limited. |
| Password | Change (current password) and reset by email (`/auth/password/*`, Resend). Both end older refresh tokens (`users.tokens_valid_after`). |
| Gaps | Refresh tokens cannot be revoked one by one (password change ends all). No `/account` page, avatar, email verification. |

## 2. Rules

- **Offline first.** Every account works offline on a device where it signed in before. The server only syncs.
- **No silent merge.** Data moves between the anonymous space and an account only when the user says so.
- **Swappable providers** (SOLID): mail (`Mailer` port), identity providers (`IdentityProvider` port), avatar storage (`AvatarStore` port). Config picks the implementation; callers never change.
- Secrets only in `/etc/chess/chess-server.env` (prod) and `apps/server/.env` (dev).

## 3. Phases

### A. One local database per account (client) — **DONE (client) 2026-11-19**
Built: `services/db/accounts.ts` (`openActiveDatabase` at boot, `accountKey`, `accountDbName`, `copyRepositories`, `deleteAccountDatabase`) + `state/account.ts` (known accounts, `switchTo`, `signOut`, `removeFromDevice`, copy prompt). Device state (active key, known accounts, tokens of the active and stashed accounts, guest) lives in the anonymous/device database's kv. Switching reloads the app on the target database (simplest way to re-init every store, timer and sync). A new account database starts from the device settings with the account's server URL and sync on. Copy keeps ids (the server scopes them per user, so a second copy does not duplicate). Sync only runs when the signed-in account owns the active database. Header `AccountMenu`, `CopyDataDialog`, "Remove from this device" on the account card. Not built: avatar blob in the known-accounts list (needs C), "unsynced changes" warning on remove.

Original plan:
- `services/db`: `openDatabase(accountKey)`: anonymous → `chess-openings`; account → `chess-openings@<serverHost>|<userId>`. Repositories are already behind `getRepositories()`; switching = close, reopen, re-init stores.
- `state/account.ts`: `accounts` (known on this device: id, username, display name, avatar blob, server), `activeAccount` (null = anonymous), `switchTo(account | null)`.
- First sign-in on a device: dialog "Copy this device's games and sessions into <account>?" (Copy · Not now). Copy = read the anonymous DB, write into the account DB with new ids, mark for sync.
- Sign out → back to anonymous. Account DB stays for offline use; "Remove from this device" deletes it (warns if unsynced changes).
- Header account menu: avatar/initials, list (Anonymous + recent accounts), Sign in, Create account, Account page, Sign out.
- Sync state already keys on `${serverUrl}|${userId}`; it moves into the account DB.

### B. Server accounts — **sign-up, invites, login limits DONE 2026-11-19**
Built: `POST /auth/register` + `RegistrationService` (`SIGNUP_MODE=open|invite|off`, default open; 5 sign-ups/IP/h). Invites: `POST/GET /invites`, `GET /invites/:code` (friend gets an email with `/signup?invite=…`; who invited whom is recorded; required in `invite` mode; 10/day; accounts younger than 24 h cannot invite — spam guard). Login: username or email; failed attempts limited per username (10) and IP (30) per 15 min → 429. `RateLimiter` shared. Still open: refresh-token table + devices, `DELETE /users/me`.

Original plan:
- `POST /auth/register` `{ username, displayName, password, email?, inviteCode? }`. `ALLOW_SIGNUP=off|invite|open` (recommend `invite`). Owner page: create/revoke invite codes (`invites` table: code hash, uses left, expires).
- `refresh_tokens` table (id, user_id, device label, created, last used, revoked). Rotation on every refresh; reuse of an old token revokes the family. `POST /auth/logout` revokes the current one. `GET/DELETE /users/me/sessions` → "Sign out other devices".
- Login rate limit (per username + per IP, CacheService), same as reset.
- `DELETE /users/me` (password required): deletes rows + avatar.
- Username rules: 3–24, `[a-z0-9_-]`, unique, case-insensitive.

### C. Profile page (client) `/profile` — **DONE (client) 2026-11-19**
Built: one page with section links — Profile (picture: center-crop + 256 px WebP in the browser, `PUT /users/me/avatar` multipart, cached as a data URL for the offline header; display name; email + Verified / Not verified + Resend), Security (change / set password, recovery codes shown once with Copy / Download, devices with "This device" and per-device Sign out, linked sign-ins Google + Lichess), Invites, Data (export PGN + JSON backup, remove from device, delete account with username + password — not the owner), Owner tools (one-time reset link for a user). Signed out: sign-in panel (Google, Lichess, password, Forgot password? → email link or recovery code, Create account) + export. Settings → Server keeps URL + sync + an account summary that links here. Also `/verify-email?token=` page, sign-out ends the server session (`POST /auth/logout`, best effort), "Continue with Lichess" everywhere Google is offered.

Original plan:

- Profile: display name, username, email (+ verified badge once D2 exists), avatar (upload/crop/remove).
- Security: change password (done in Settings → Server), recovery codes (D3), devices (B), linked sign-ins (E/F).
- Data: export everything (JSON/PGN), import, delete account.
- Avatar: client crops to a square, uploads `PUT /users/me/avatar` (≤ 1 MB). Server: `AvatarStore` port (disk under the data dir; S3-style later), resizes to 256 px WebP (`sharp`), serves `GET /users/:id/avatar?v=<updatedAt>` (immutable cache). Client keeps a blob copy in the account record for offline.

### D. Password recovery
- **D1 — email reset link. DONE.** `Mailer` port + `ResendMailer` (`MAIL_PROVIDER=resend`, `noreply@ryanweiss.net`). Hashed single-use tokens, 1 h, 202 for every request, rate limited, reset ends other sessions. App: "Forgot password?" (shown when `/health` says `passwordReset`), `/reset-password` page, email + change password on the account card.
- **D2 — email verification.** Same `Mailer`: on email change, send a verify link; only verified emails get reset links. (Today the owner sets their own email while signed in, so this is low risk; needed before open sign-up.)
- **D3 — recovery codes.** 8 one-time codes at sign-up and on demand (Account → Security → "New codes" invalidates old ones). Stored as argon2 hashes. `POST /auth/password/recover { username, code, password }`. Works with no email at all.
- **D4 — owner reset link.** Owner page: "Reset link for <user>" → one-time link (1 h) to pass on by any channel.

### E. Sign in with Lichess (+ game import)
**Game import DONE (client) 2026-11-19:** Games → Import → "Lichess / Chess.com" (`components/games/OnlineImport.tsx`, `services/importers`). Browser-only (both APIs allow CORS), streamed NDJSON, newest first; last 20 / 100 / all, month range, rated only; username prefilled from a linked Lichess sign-in; 429 waits + retries; Stop keeps saved batches. Dedupe by deterministic saved-game id `lichess-<gameId>`; tags `lichess` + username. Public games only (no token).

- OAuth2 Authorization Code + PKCE. **No registration, no client secret**: `client_id` is any name (e.g. `chess.ryanweiss.net`). Endpoints `https://lichess.org/oauth` and `https://lichess.org/api/token`; profile `GET /api/account` (optional `email:read` scope).
- Server: `IdentityProvider` port (`LichessProvider`, later `GoogleProvider`); `user_identities` table (provider, subject, user_id, username, linked_at). Flows: sign in (existing link), create account from Lichess (sign-up policy applies), link to the signed-in account, unlink (only if a password or another link remains).
- Game import (no OAuth needed for public games): `GET https://lichess.org/api/games/user/<name>` (NDJSON with PGN; filters: since/until, rated, perfType, max). Client streams it through the existing PGN worker into saved games with tags `lichess`, `<username>`; dedupe by Lichess game id. Options: last N, date range, all. With the user's Lichess token, imports are faster and include their private data the scopes allow.
- "Reference" (not copy): a Lichess panel that lists recent games live and opens one in a session; "Save" copies it.

### F. Sign in with Google — **DONE 2026-11-19**
Built: `IdentityProvider` port + `GoogleProvider` (code + PKCE, profile from the userinfo endpoint server-to-server), `OAuthService` (state + single-use exchange code in the cache; tokens never in URLs), `user_identities`; sign in, create (sign-up policy applies), link, unlink. Never links by email alone: a Google email that matches an existing account → "sign in with your password, then link Google". Lichess (E) plugs into the same port.

Original plan:
- OpenID Connect (Authorization Code + PKCE, scopes `openid email profile`). Server verifies the ID token (`jose` against Google's JWKS) and links via `user_identities` (provider `google`, subject `sub`). A verified Google email can fill `users.email`.

### G. Chess.com — **game import DONE (client) 2026-11-19**
Same Import tab: archives → months newest first, standard chess only, saved-game id `chesscom-<gameId>`, tags `chesscom` + username. No username link/OAuth (not needed for public games).

- No public OAuth (as far as we know, OAuth access is for approved partners only; check before relying on it). Without it: link a Chess.com **username** (no proof of ownership) and import public games from `https://api.chess.com/pub/player/<name>/games/archives` (monthly PGN), same import pipeline as E.

## 4. Order and size

| Step | Size |
|---|---|
| A local DB per account + account menu + copy prompt | ~1 day |
| B sign-up/invites, refresh-token table, logout/devices, login rate limit | ~1 day |
| C account page + avatar | ~1 day |
| D2 verify email, D3 recovery codes, D4 owner reset link | ~0.5 day |
| E Lichess sign-in + import | ~1 day |
| F Google | ~0.5 day (after E: same port) |
| G Chess.com username + import | ~0.5 day |

## 5. Needed from the owner

| For | What |
|---|---|
| D1 email (live) | Done: `RESEND_API_KEY` + `MAIL_FROM` in `/etc/chess/chess-server.env`. Set your email on the account card (Settings → Server) or `OWNER_EMAIL`. Rotate the Resend key if it was shared anywhere. |
| B sign-up | Choose `ALLOW_SIGNUP`: `off`, `invite` (recommended) or `open`. |
| E Lichess | Nothing to register. Optional: the name shown on the Lichess consent screen (default "Chess Trainer"). |
| F Google | Google Cloud project → OAuth consent screen (External; scopes `openid email profile`) → OAuth client "Web application" with redirect URIs `https://chess.ryanweiss.net/api/auth/google/callback`, `https://chess.rw3iss.com/api/auth/google/callback`, `http://localhost:3000/auth/google/callback`. Send `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (they go in the server env file only). |
| G Chess.com | Nothing (unless you get partner OAuth access). |
