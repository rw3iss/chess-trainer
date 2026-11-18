"""Holdout accuracy by cell size and by style: python src/per_size.py runs/v2/best.pt"""
import random
import sys

import numpy as np
import torch

from model import TileNet
from synth import degrade, list_styles, render_board, tiles_from_board

m = TileNet()
m.load_state_dict(torch.load(sys.argv[1], map_location="cpu"))
m.eval()
torch.set_num_threads(4)
styles = list_styles("holdout")
rng = random.Random(11)
rows = []
for i in range(300):
	st = rng.choice(styles)
	b0 = render_board(rng, [st])
	b = degrade(rng, b0)
	x, y = tiles_from_board(rng, b)
	with torch.no_grad():
		p = m(torch.from_numpy(x).permute(0, 3, 1, 2).float() / 255).argmax(1).numpy()
	rows.append((st, b0.cell, float((p == y).mean())))
for lo, hi in ((14, 20), (20, 30), (30, 45), (45, 70), (70, 111)):
	a = [r[2] for r in rows if lo <= r[1] < hi]
	print(f"cell {lo:3d}-{hi:3d}px: {np.mean(a):.4f} ({len(a)} boards)")
for st in styles:
	a = [r[2] for r in rows if r[0] == st]
	print(f"{st:30s} {np.mean(a):.4f}")
