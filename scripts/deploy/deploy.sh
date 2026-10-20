#!/usr/bin/env bash
# Deploy origin/main to production from a dev machine:
#   bash scripts/deploy/deploy.sh
# The server pulls from GitHub and builds itself, so push first.
set -euo pipefail
HOST="${CHESS_SSH:-rw3iss@162.35.181.92}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ -n "$(git -C "$ROOT" status --porcelain)" ] || [ "$(git -C "$ROOT" rev-parse HEAD)" != "$(git -C "$ROOT" rev-parse @{u} 2>/dev/null)" ]; then
  echo "⚠ Local changes or unpushed commits — the server deploys origin/main only."
fi
ssh -o StrictHostKeyChecking=accept-new "$HOST" "bash /var/www/chess/scripts/deploy/update.sh"
