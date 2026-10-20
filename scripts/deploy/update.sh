#!/usr/bin/env bash
# Runs ON THE SERVER. Pull origin/main, build core + server + web, apply host config
# (idempotent), restart the API, health-gate.
#   bash /var/www/chess/scripts/deploy/update.sh
# Wrapped in main() so bash parses the whole file before running it: the
# `git reset` below rewrites this very script mid-run.
main() {
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/chess}"
HEALTH_URL="http://127.0.0.1:4100/health"
export CI=true

cd "$APP_DIR"
echo "▶ git pull"
git fetch --quiet origin main
git reset --hard --quiet origin/main

echo "▶ install + build"
pnpm install --frozen-lockfile
pnpm --filter @chess/core build
pnpm --filter @chess/server build
VITE_DEFAULT_SERVER_URL=/api pnpm --filter @chess/web build

echo "▶ host config (idempotent)"
bash "$APP_DIR/scripts/deploy/setup-server.sh"
sudo restorecon -R "$APP_DIR" >/dev/null 2>&1 || true

echo "▶ restart"
sudo systemctl restart chess-server
for i in $(seq 1 40); do
  if curl -sf "$HEALTH_URL" >/dev/null; then
    echo "✅ chess $(git rev-parse --short HEAD) is up — https://chess.ryanweiss.net"
    exit 0
  fi
  sleep 1
done
echo "❌ health check failed — sudo journalctl -u chess-server -n 100 --no-pager"
exit 1
}
main "$@"
