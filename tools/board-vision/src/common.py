"""Shared constants and paths for the board-vision tool."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent.parent
CACHE = ROOT / ".cache"
RUNS = ROOT / "runs"
PIECES_DIR = CACHE / "pieces"  # rasterized piece sprites (npz per set/variant)
LILA_DIR = CACHE / "lila"  # sparse clone of lichess-org/lila (public/piece)
PYCHESS_DIR = CACHE / "pychess"  # sparse clone of pychess/pychess (pieces)
REAL_DIR = CACHE / "lichess-real"  # real lichess GIF exports (PNG + labels.json)
OUR_PIECES = REPO / "apps/web/public/pieces"
MODEL_OUT = REPO / "apps/web/public/models/board-vision"
FIXTURES_OUT = REPO / "apps/web/e2e/fixtures/board-images"

# Model I/O contract (fixed; the browser is written against it).
CLASSES = ["empty", "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"]
INPUT_SIZE = 40
# Piece codes in sprite order: (color, role) -> class index.
PIECE_CODES = ["wP", "wN", "wB", "wR", "wQ", "wK", "bP", "bN", "bB", "bR", "bQ", "bK"]
CODE_TO_CLASS = {c: i + 1 for i, c in enumerate(PIECE_CODES)}
FEN_TO_CLASS = {ch: i for i, ch in enumerate(CLASSES) if i > 0}

# Raster size used for the cached piece sprites (RGBA, square).
SPRITE_PX = 160

# Lichess sets that are not usable as normal piece art.
LILA_EXCLUDE = {"disguised", "letter", "shapes", "mono"}

# pychess sets also in lichess (or non-standard shapes) are skipped; only the extra families are used.
PYCHESS_SKIP = {"atopdown", "makruk", "sittuyin", "letter", "shapes"}

# Styles held out of training entirely, used to measure generalization to unseen art.
HOLDOUT = {"lila-companion", "lila-fresca", "ours-lux", "font-noto-symbols2"}

USER_AGENT = "board-vision-dataset/0.1 (chess trainer tooling)"


def placement_to_grid(placement: str) -> list[list[int]]:
	"""FEN piece placement -> 8x8 class indices, row 0 = rank 8, col 0 = file a."""
	rows = placement.split("/")
	assert len(rows) == 8, placement
	grid: list[list[int]] = []
	for row in rows:
		out: list[int] = []
		for ch in row:
			if ch.isdigit():
				out.extend([0] * int(ch))
			else:
				out.append(FEN_TO_CLASS[ch])
		assert len(out) == 8, placement
		grid.append(out)
	return grid


def grid_to_placement(grid: list[list[int]]) -> str:
	rows = []
	for r in grid:
		s, n = "", 0
		for v in r:
			if v == 0:
				n += 1
			else:
				if n:
					s += str(n)
					n = 0
				s += CLASSES[v]
		if n:
			s += str(n)
		rows.append(s)
	return "/".join(rows)
