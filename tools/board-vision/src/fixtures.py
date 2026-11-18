"""Build the browser test fixtures: apps/web/e2e/fixtures/board-images/*.png + fixtures.json.

Mix of real lichess GIF exports (from .cache/lichess-real, run `fetch.py real` first) and synthetic
"screenshots" where a board sits off-center inside a UI-like page (header, panels, move list, buttons).
"""
from __future__ import annotations

import json
import random

import chess
import numpy as np
from PIL import Image, ImageDraw

from common import FIXTURES_OUT, REAL_DIR, placement_to_grid
from fetch import random_position
from synth import FONT_FILES, font, render_board

# (real image index, output scale) -- indices refer to fetch.py's deterministic list.
REAL_PICKS = [(1, 1.0), (2, 0.5), (4, 0.6667), (6, 1.0), (8, 0.5), (10, 0.75), (11, 0.5), (13, 0.6), (15, 0.5)]


def ui_screenshot(rng: random.Random, idx: int, spec: dict) -> tuple[Image.Image, dict, chess.Board]:
	b = random_position(rng, spec["plies"])
	grid = np.array(placement_to_grid(b.board_fen()))
	flip = spec["orientation"] == "black"
	if flip:
		grid = grid[::-1, ::-1]
	s = spec["cell"]
	dark_ui = spec["dark_ui"]
	W, H = spec["canvas"]
	bg = (38, 36, 33) if dark_ui else (246, 246, 246)
	fg = (220, 220, 220) if dark_ui else (40, 40, 40)
	panel = (52, 50, 46) if dark_ui else (232, 232, 236)
	page = Image.new("RGB", (W, H), bg)
	d = ImageDraw.Draw(page)
	f_big = font(FONT_FILES[1], 22)
	f_txt = font(FONT_FILES[0], 15)
	# Header bar.
	d.rectangle([0, 0, W, 54], fill=(30, 30, 30) if dark_ui else (255, 255, 255))
	d.text((20, 27), spec["title"], fill=fg if dark_ui else (20, 20, 20), font=f_big, anchor="lm")
	for i, label in enumerate(["Play", "Puzzles", "Learn", "Watch"]):
		d.text((260 + i * 90, 27), label, fill=(150, 150, 150), font=f_txt, anchor="lm")
	bx, by = spec["board_at"]
	size = 8 * s
	# Player bars above / below the board.
	for (y, name, clock) in ((by - 40, "Opponent (1843)", "4:12"), (by + size + 8, "You (1790)", "3:58")):
		d.text((bx, y + 16), name, fill=fg, font=f_txt, anchor="lm")
		d.rounded_rectangle([bx + size - 90, y, bx + size, y + 32], 4, fill=panel)
		d.text((bx + size - 45, y + 16), clock, fill=fg, font=f_big, anchor="mm")
	# Side panel with a move list and buttons.
	px = bx + size + 30
	if px + 200 < W:
		d.rounded_rectangle([px, by, W - 20, by + size], 8, fill=panel)
		tmp = chess.Board()
		sans = []
		for mv in b.move_stack:
			sans.append(tmp.san(mv))
			tmp.push(mv)
		max_lines = max(1, (size - 100) // 24)
		for i in range(0, min(len(sans), 2 * max_lines), 2):
			line = f"{i // 2 + 1}. {sans[i]}  {sans[i + 1] if i + 1 < len(sans) else ''}"
			d.text((px + 16, by + 20 + (i // 2) * 24), line, fill=fg, font=f_txt)
		for i, label in enumerate(["Resign", "Draw", "Analyze"]):
			x = px + 16 + i * 100
			d.rounded_rectangle([x, by + size - 50, x + 88, by + size - 16], 6, fill=(80, 140, 60) if i == 2 else (120, 120, 120))
			d.text((x + 44, by + size - 33), label, fill=(255, 255, 255), font=f_txt, anchor="mm")
	# Board.
	hl = []
	if b.move_stack:
		for sqi in (b.peek().from_square, b.peek().to_square):
			r, c = 7 - chess.square_rank(sqi), chess.square_file(sqi)
			hl.append((7 - r, 7 - c) if flip else (r, c))
	brd = render_board(rng, [], cell=float(s), grid=grid, squares=spec["squares"], piece_style=spec["style"],
		flip=flip, origin=(12, 12), highlights=hl)
	crop = brd.image.crop((12, 12, 12 + size, 12 + size))
	page.paste(crop, (bx, by))
	entry = {
		"file": f"synthetic-{idx:02d}-{spec['name']}.png",
		"placement": b.board_fen(),
		"orientation": spec["orientation"],
		"board": {"x": bx, "y": by, "size": size},
		"source": "synthetic",
		"style": spec["style"],
	}
	if b.move_stack:
		u = b.peek().uci()
		entry["lastMove"] = [u[:2], u[2:4]]
	return page, entry, b


SYNTH_SPECS = [
	{"name": "green-desktop", "plies": 24, "orientation": "white", "cell": 64, "dark_ui": True, "canvas": (1280, 720),
		"board_at": (140, 112), "squares": ((235, 236, 208), (119, 149, 86), "normal"), "style": "ours-merida", "title": "Chess Site"},
	{"name": "blue-black-pov", "plies": 41, "orientation": "black", "cell": 52, "dark_ui": False, "canvas": (1100, 640),
		"board_at": (420, 100), "squares": ((222, 227, 230), (140, 162, 173), "normal"), "style": "ours-cardinal-v1", "title": "Analysis"},
	{"name": "book-diagram", "plies": 60, "orientation": "white", "cell": 36, "dark_ui": False, "canvas": (760, 560),
		"board_at": (60, 150), "squares": ((255, 255, 255), (190, 190, 190), "book"), "style": "font-noto-symbols2-filled", "title": "Chapter 7"},
	{"name": "wood-lux-small", "plies": 90, "orientation": "white", "cell": 30, "dark_ui": True, "canvas": (900, 520),
		"board_at": (510, 118), "squares": ((216, 181, 138), (138, 90, 54), "normal"), "style": "ours-lux", "title": "My Games"},
]


def main() -> None:
	FIXTURES_OUT.mkdir(parents=True, exist_ok=True)
	out = []
	labels = {e["file"]: e for e in json.loads((REAL_DIR / "labels.json").read_text())} if (REAL_DIR / "labels.json").exists() else {}
	if not labels:
		print("warning: no real lichess images; run `python src/fetch.py real` (synthetic only)")
	for i, scale in REAL_PICKS:
		key = next((k for k in labels if k.startswith(f"lichess-{i:02d}-")), None)
		if not key:
			continue
		e = dict(labels[key])
		im = Image.open(REAL_DIR / key).convert("RGB")
		size = round(720 * scale)
		if size != 720:
			im = im.resize((size, size), Image.LANCZOS)
		e["board"] = {"x": 0, "y": 0, "size": size}
		e.pop("theme", None)
		if e.get("lastMove") is None:
			e.pop("lastMove", None)
		im.quantize(256).save(FIXTURES_OUT / key, optimize=True)
		out.append(e)
	rng = random.Random(7)
	for idx, spec in enumerate(SYNTH_SPECS):
		page, entry, _ = ui_screenshot(rng, idx, spec)
		page.save(FIXTURES_OUT / entry["file"], optimize=True)
		out.append(entry)
	(FIXTURES_OUT / "fixtures.json").write_text(json.dumps(out, indent="\t") + "\n")
	total = sum(p.stat().st_size for p in FIXTURES_OUT.iterdir())
	print(f"{len(out)} fixtures, {total / 1024:.0f} KiB in {FIXTURES_OUT}")


if __name__ == "__main__":
	main()
