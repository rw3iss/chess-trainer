"""Contact sheet of all rasterized styles -> runs/sets.png (one row per style, on a mid-gray/tan background)."""
import sys
import numpy as np
from PIL import Image, ImageDraw
from common import PIECES_DIR, RUNS

files = sorted(PIECES_DIR.glob("*.npz"))
if len(sys.argv) > 1:
	files = [f for f in files if any(a in f.stem for a in sys.argv[1:])]
cell = 40
sheet = Image.new("RGB", (cell * 12 + 160, cell * len(files)), (200, 170, 130))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
	sp = np.load(f)["sprites"]
	for j in range(12):
		bg = (240, 217, 181) if (i + j) % 2 == 0 else (181, 136, 99)
		tile = Image.new("RGBA", (cell, cell), bg + (255,))
		tile.alpha_composite(Image.fromarray(sp[j]).resize((cell, cell), Image.LANCZOS))
		sheet.paste(tile.convert("RGB"), (160 + j * cell, i * cell))
	d.text((4, i * cell + 14), f.stem, fill=(0, 0, 0))
RUNS.mkdir(exist_ok=True)
sheet.save(RUNS / "sets.png")
print(RUNS / "sets.png", sheet.size)
