"""Fetch training/eval data.

  python src/fetch.py sets   sparse-clone lichess-org/lila public/piece + pychess/pychess pieces into .cache (training art only)
  python src/fetch.py real   download ~40 real lichess GIF board exports into .cache/lichess-real
"""
from __future__ import annotations

import json
import random
import subprocess
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from io import BytesIO

import chess
from PIL import Image

from common import LILA_DIR, PYCHESS_DIR, REAL_DIR, USER_AGENT

THEMES = ["brown", "blue", "green", "ic", "pink", "purple"]  # all themes the GIF exporter supports
GIF_URL = "https://lichess1.org/export/fen.gif"


def sparse_clone(url: str, dest, path: str) -> None:
	if (dest / path).exists():
		print("already present:", dest / path)
		return
	dest.parent.mkdir(parents=True, exist_ok=True)
	subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse", url, str(dest)], check=True)
	subprocess.run(["git", "-C", str(dest), "sparse-checkout", "set", path], check=True)
	print("ok:", dest / path)


def fetch_sets() -> None:
	sparse_clone("https://github.com/lichess-org/lila.git", LILA_DIR, "public/piece")
	sparse_clone("https://github.com/pychess/pychess.git", PYCHESS_DIR, "pieces")


def random_position(rng: random.Random, plies: int) -> chess.Board:
	"""Semi-random game: prefers captures/checks a bit so middlegames/endgames look natural."""
	b = chess.Board()
	for _ in range(plies):
		moves = list(b.legal_moves)
		if not moves:
			break
		caps = [m for m in moves if b.is_capture(m)]
		b.push(rng.choice(caps) if caps and rng.random() < 0.35 else rng.choice(moves))
	return b


def get(url: str) -> bytes:
	for attempt in range(10):
		req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
		try:
			with urllib.request.urlopen(req, timeout=30) as r:
				data = r.read()
			if data[:3] == b"GIF":
				return data
		except urllib.error.HTTPError as e:
			wait = int(e.headers.get("Retry-After") or 60 * (attempt + 1))
			print(f"  HTTP {e.code}; waiting {wait} s (Retry-After)", flush=True)
			time.sleep(wait + 5)
			continue
		except Exception as e:  # noqa: BLE001
			print("  retry:", e, flush=True)
		time.sleep(60 * (attempt + 1))
	raise RuntimeError(f"failed: {url}")


def fetch_real(n: int = 40) -> None:
	REAL_DIR.mkdir(parents=True, exist_ok=True)
	rng = random.Random(42)
	labels = []
	label_file = REAL_DIR / "labels.json"
	old = {e["file"]: e for e in json.loads(label_file.read_text())} if label_file.exists() else {}
	for i in range(n):
		plies = [0, 4, 8, 12, 20, 30, 40, 60, 80, 110][i % 10] + rng.randint(0, 3)
		b = random_position(rng, plies)
		theme = THEMES[i % len(THEMES)]
		orient = "black" if i % 3 == 2 else "white"
		last = b.peek().uci() if b.move_stack else None
		q = {"fen": b.fen(), "theme": theme, "color": orient}
		if last:
			q["lastMove"] = last
		if b.is_check():
			q["check"] = chess.square_name(b.king(b.turn))
		name = f"lichess-{i:02d}-{theme}-{orient}.png"
		entry = {
			"file": name, "placement": b.board_fen(), "orientation": orient,
			"board": {"x": 0, "y": 0, "size": 720}, "theme": theme,
			"lastMove": [last[:2], last[2:4]] if last else None, "source": "lichess-gif",
		}
		if not (REAL_DIR / name).exists() or old.get(name, {}).get("placement") != entry["placement"]:
			data = get(GIF_URL + "?" + urllib.parse.urlencode(q))
			Image.open(BytesIO(data)).convert("RGB").save(REAL_DIR / name)
			print("got", name)
			time.sleep(5.0)  # the exporter rate-limits aggressively (429 with ~1 h Retry-After)
		labels.append(entry)
	label_file.write_text(json.dumps(labels, indent="\t"))
	print(f"{len(labels)} images in {REAL_DIR}")


if __name__ == "__main__":
	cmd = sys.argv[1] if len(sys.argv) > 1 else ""
	if cmd == "sets":
		fetch_sets()
	elif cmd == "real":
		fetch_real()
	else:
		sys.exit(__doc__)
