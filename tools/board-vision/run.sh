#!/usr/bin/env bash
# Board-vision pipeline wrapper. Usage: bash tools/board-vision/run.sh <setup|fetch|assets|fixtures|train|export|eval|all> [args...]
set -euo pipefail
cd "$(dirname "$0")"
PY=.venv/bin/python
cmd="${1:-all}"
shift || true
case "$cmd" in
	setup) uv venv -p 3.12 .venv --allow-existing && uv sync ;;
	fetch) $PY src/fetch.py sets && $PY src/fetch.py real ;;
	assets) $PY src/assets.py ;;
	fixtures) $PY src/fixtures.py ;;
	train) $PY src/train.py "$@" ;;
	export) $PY src/export.py "$@" ;;
	eval) $PY src/eval_real.py "$@" ;;
	all)
		[ -x "$PY" ] || { uv venv -p 3.12 .venv && uv sync; }
		$PY src/fetch.py sets
		$PY src/fetch.py real
		$PY src/assets.py
		$PY src/fixtures.py
		$PY src/train.py "$@"
		$PY src/export.py
		$PY src/eval_real.py
		;;
	*) echo "unknown command: $cmd" >&2; exit 1 ;;
esac
