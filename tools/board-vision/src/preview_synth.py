"""Write sample boards + a tile mosaic to runs/ for eyeballing the generator."""
import random
import sys
import numpy as np
from PIL import Image
from common import RUNS, CLASSES
from synth import degrade, list_styles, render_board, tiles_from_board

rng = random.Random(int(sys.argv[1]) if len(sys.argv) > 1 else 0)
styles = list_styles("train")
RUNS.mkdir(exist_ok=True)
mosaic = []
for i in range(6):
	b = degrade(rng, render_board(rng, styles))
	b.image.save(RUNS / f"board{i}.png")
	t, l = tiles_from_board(rng, b)
	mosaic.append(np.concatenate([np.concatenate(list(t[r * 8:(r + 1) * 8]), axis=1) for r in range(8)], axis=0))
	print(i, b.image.size, round(b.cell, 1), "".join(CLASSES[x][0] for x in l[:8]))
top = np.concatenate(mosaic[:3], axis=1)
bot = np.concatenate(mosaic[3:], axis=1)
Image.fromarray(np.concatenate([top, bot], axis=0)).save(RUNS / "tiles.png")
