#!/usr/bin/env bash
# Copies fail2ban's chess ban list (/var/lib/fail2ban/chess-banned.list, written by the chess-nginx-deny
# action) to /etc/nginx/chess/banned.conf and reloads nginx when it changed. `--watch`: repeat every
# 5 s (chess-nginx-bans.service). Installed to /usr/local/bin/chess-nginx-bans by scripts/deploy/setup-server.sh.
set -euo pipefail
if [ "${1:-}" = "--watch" ]; then
	while true; do "$0" || true; sleep 5; done
fi
SRC=/var/lib/fail2ban/chess-banned.list
DST=/etc/nginx/chess/banned.conf
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
# Only well-formed `deny <ipv4|ipv6>[/prefix];` lines get through.
if [ -f "$SRC" ]; then grep -E '^deny [0-9A-Fa-f:.]+(/[0-9]{1,3})?;$' "$SRC" | sort -u > "$TMP" || true; fi
if cmp -s "$TMP" "$DST"; then exit 0; fi
cp "$DST" "$DST.prev" 2>/dev/null || true
cat "$TMP" > "$DST"
if /usr/sbin/nginx -t -q; then
	/usr/bin/systemctl reload nginx
else
	echo "nginx -t failed with the new ban list; restoring the previous one" >&2
	cat "$DST.prev" > "$DST"
	exit 1
fi
