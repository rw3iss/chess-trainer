#!/usr/bin/env bash
# Runs ON THE SERVER (ryanweiss.net box: Fedora, native nginx + Postgres + Valkey).
# Idempotent; called by update.sh. Creates: stockfish, data dir, Postgres role+db,
# /etc/chess/chess-server.env (first run only), systemd units, TLS cert, nginx vhost + hardening
# (rate-limit zones, Cloudflare real IP, security headers), fail2ban jails. See docs/ops/SECURITY.md.
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/chess}"
DATA_DIR=/var/lib/chess
ENV_FILE=/etc/chess/chess-server.env
DOMAIN=chess.ryanweiss.net
RUN_USER=rw3iss

# 1) Native engine.
command -v stockfish >/dev/null || sudo dnf install -y -q stockfish

# 2) Data dir.
sudo mkdir -p "$DATA_DIR"
sudo chown -R "$RUN_USER:$RUN_USER" "$DATA_DIR"

# 3) Postgres role + db and env file (first run only; never overwritten).
if ! sudo test -f "$ENV_FILE"; then
  DB_PASS="$(openssl rand -hex 24)"
  JWT="$(openssl rand -hex 32)"
  OWNER_PASS="$(openssl rand -base64 18 | tr -d '/+=')"
  sudo -u postgres psql -qtAc "SELECT 1 FROM pg_roles WHERE rolname='chess'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE ROLE chess LOGIN PASSWORD '$DB_PASS'"
  sudo -u postgres psql -qc "ALTER ROLE chess PASSWORD '$DB_PASS'"
  sudo -u postgres psql -qtAc "SELECT 1 FROM pg_database WHERE datname='chess'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE DATABASE chess OWNER chess"
  sudo mkdir -p "$(dirname "$ENV_FILE")"
  sudo tee "$ENV_FILE" >/dev/null <<ENV
NODE_ENV=production
PORT=4100
HOST=127.0.0.1
API_PREFIX=
CORS_ORIGINS=https://$DOMAIN,https://chess.rw3iss.com
LOG_LEVEL=log
SWAGGER_ENABLED=false
DB_TYPE=postgres
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=chess
DB_PASSWORD=$DB_PASS
DB_NAME=chess
DB_SYNCHRONIZE=false
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=7
JWT_SECRET=$JWT
OWNER_USERNAME=owner
OWNER_PASSWORD=$OWNER_PASS
DATA_DIR=$APP_DIR/apps/web/public/data
LICHESS_TOKEN=
EXPLORER_PUBLIC=false
ENGINE_STOCKFISH_PATH=/usr/bin/stockfish
ENGINE_MAX_PROCESSES=2
ENGINE_MAX_PER_SOCKET=1
ENGINE_THREADS=1
ENGINE_HASH_MB=64
ENGINE_ALLOW_GUESTS=false
ENV
  sudo chmod 600 "$ENV_FILE"
fi
# Keys added after first install (append once; existing values are never changed).
for kv in "HOST=127.0.0.1" "APP_PUBLIC_URL=https://$DOMAIN" "SIGNUP_MODE=open" "AVATAR_DIR=/var/lib/chess/avatars"; do
  sudo grep -q "^${kv%%=*}=" "$ENV_FILE" || echo "$kv" | sudo tee -a "$ENV_FILE" >/dev/null
done

# 4) systemd units.
changed=0
for u in chess-server.service chess-server-healthcheck.service chess-server-healthcheck.timer chess-nginx-bans.service; do
  if ! sudo cmp -s "$APP_DIR/deploy/systemd/$u" "/etc/systemd/system/$u"; then
    sudo install -m 644 "$APP_DIR/deploy/systemd/$u" "/etc/systemd/system/$u"; changed=1
  fi
done
[ "$changed" = 1 ] && sudo systemctl daemon-reload
sudo systemctl enable --quiet chess-server.service chess-server-healthcheck.timer
sudo systemctl start chess-server-healthcheck.timer

# 5) TLS cert (HTTP-01 webroot; HTTP-only vhost first).
VHOST=/etc/nginx/conf.d/$DOMAIN.conf
if ! sudo test -d "/etc/letsencrypt/live/$DOMAIN"; then
  sudo tee "$VHOST" >/dev/null <<NGX
server { listen 80; listen [::]:80; server_name $DOMAIN;
  location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
  location / { return 503; } }
NGX
  sudo nginx -t -q && sudo systemctl reload nginx
  sudo certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" \
    --non-interactive --agree-tos -m rw3iss@gmail.com --keep-until-expiring
fi

# 6) nginx: chess snippets (/etc/nginx/chess/), rate-limit zones (conf.d/00-chess-http.conf), vhost.
#    Chess-only files; other sites on the box are untouched. banned.conf is owned by fail2ban (never overwritten).
nginx_changed=0
install_if_changed() { # src dst
  if ! sudo cmp -s "$1" "$2"; then sudo install -m 644 "$1" "$2"; nginx_changed=1; fi
}
sudo mkdir -p /etc/nginx/chess
for f in realip security-headers proxy; do
  install_if_changed "$APP_DIR/deploy/nginx/chess-$f.conf" "/etc/nginx/chess/$f.conf"
done
sudo test -f /etc/nginx/chess/banned.conf || { sudo touch /etc/nginx/chess/banned.conf; nginx_changed=1; }
install_if_changed "$APP_DIR/deploy/nginx/00-chess-http.conf" /etc/nginx/conf.d/00-chess-http.conf
install_if_changed "$APP_DIR/deploy/nginx/$DOMAIN.conf" "$VHOST"
sudo restorecon -R /etc/nginx/chess /etc/nginx/conf.d/00-chess-http.conf "$VHOST" 2>/dev/null || true
if [ "$nginx_changed" = 1 ]; then sudo nginx -t -q && sudo systemctl reload nginx; fi

# 7) fail2ban: chess jails (ban = nginx deny, since traffic comes through Cloudflare) + box sshd/recidive.
rpm -q fail2ban >/dev/null 2>&1 || sudo dnf install -y -q fail2ban
f2b_changed=0
for f in action.d/chess-nginx-deny.conf filter.d/chess-auth.conf filter.d/chess-scan.conf jail.d/chess.local jail.d/box.local; do
  if ! sudo cmp -s "$APP_DIR/deploy/fail2ban/$f" "/etc/fail2ban/$f"; then
    sudo install -m 644 "$APP_DIR/deploy/fail2ban/$f" "/etc/fail2ban/$f"; f2b_changed=1
  fi
done
sudo touch /var/log/nginx/chess.access.log /var/log/nginx/chess.error.log /var/log/fail2ban.log
sudo restorecon /var/log/fail2ban.log 2>/dev/null || true
# Ban list → nginx (SELinux keeps fail2ban out of /etc/nginx; chess-nginx-bans.service applies its list).
if ! sudo cmp -s "$APP_DIR/scripts/deploy/chess-nginx-bans.sh" /usr/local/bin/chess-nginx-bans; then
  sudo install -m 755 "$APP_DIR/scripts/deploy/chess-nginx-bans.sh" /usr/local/bin/chess-nginx-bans
  sudo restorecon /usr/local/bin/chess-nginx-bans 2>/dev/null || true
fi
sudo touch /var/lib/fail2ban/chess-banned.list
sudo restorecon /var/lib/fail2ban/chess-banned.list 2>/dev/null || true
sudo systemctl disable --quiet --now chess-nginx-bans.path 2>/dev/null || true
sudo rm -f /etc/systemd/system/chess-nginx-bans.path
sudo systemctl enable --quiet chess-nginx-bans.service
sudo systemctl restart chess-nginx-bans.service
sudo systemctl enable --quiet --now fail2ban
if [ "$f2b_changed" = 1 ]; then sudo fail2ban-client reload >/dev/null; fi
