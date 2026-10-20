#!/usr/bin/env bash
# Runs ON THE SERVER (ryanweiss.net box: Fedora, native nginx + Postgres + Valkey).
# Idempotent; called by update.sh. Creates: stockfish, data dir, Postgres role+db,
# /etc/chess/chess-server.env (first run only), systemd units, TLS cert, nginx vhost.
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

# 4) systemd units.
changed=0
for u in chess-server.service chess-server-healthcheck.service chess-server-healthcheck.timer; do
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

# 6) nginx vhost.
if ! sudo cmp -s "$APP_DIR/deploy/nginx/$DOMAIN.conf" "$VHOST"; then
  sudo install -m 644 "$APP_DIR/deploy/nginx/$DOMAIN.conf" "$VHOST"
  sudo nginx -t -q && sudo systemctl reload nginx
fi
