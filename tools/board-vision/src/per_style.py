"""Per-style accuracy of a checkpoint on fresh synthetic boards: python src/per_style.py runs/v1/best.pt [filter...]"""
import random
import sys

import numpy as np
import torch

from common import CLASSES
from model import TileNet
from synth import degrade, list_styles, render_board, tiles_from_board
from train import top_confusions

ckpt = sys.argv[1]
filters = sys.argv[2:]
m = TileNet()
m.load_state_dict(torch.load(ckpt, map_location="cpu"))
m.eval()
styles = list_styles("holdout") + list_styles("train")
if filters:
	styles = [s for s in styles if any(f in s for f in filters)]
else:
	styles = list_styles("holdout")
for st in styles:
	rng = random.Random(5)
	xs, ys = [], []
	for _ in range(40):
		b = degrade(rng, render_board(rng, [st]))
		x, y = tiles_from_board(rng, b)
		xs.append(x)
		ys.append(y)
	x = torch.from_numpy(np.concatenate(xs)).permute(0, 3, 1, 2).float() / 255
	y = np.concatenate(ys)
	with torch.no_grad():
		p = m(x).argmax(1).cpu().numpy()
	conf = np.zeros((13, 13), np.int64)
	np.add.at(conf, (y, p), 1)
	print(f"{st:32s} {np.mean(p == y):.4f}  {top_confusions(conf, 4)}")
