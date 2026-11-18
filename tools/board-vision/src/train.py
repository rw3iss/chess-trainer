"""Train the tile classifier on synthetic boards generated on the fly.

  python src/train.py [--steps 60000] [--batch 512] [--workers 16] [--name v1]

Writes runs/<name>/{best.pt,last.pt,log.jsonl}. Validation:
  val      fixed synthetic boards with training styles (different seeds)
  holdout  fixed synthetic boards with styles never seen in training (common.HOLDOUT)
  real     real lichess GIF exports (.cache/lichess-real), if fetched
"""
from __future__ import annotations

import os
os.environ.setdefault("OMP_NUM_THREADS", "1")

import argparse
import json
import math
import multiprocessing as mp
import random
import time

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, IterableDataset

from common import CACHE, CLASSES, RUNS
from model import TileNet
from synth import degrade, list_styles, render_board, sample_tiles, tiles_from_board


# ---------------------------------------------------------------- data

class TileStream(IterableDataset):
	"""Each worker keeps a reservoir of tiles from many boards and emits shuffled batches."""

	def __init__(self, batch: int, reservoir: int = 8192, boards_per_batch: int = 4, seed: int = 0) -> None:
		self.batch, self.reservoir, self.bpb, self.seed = batch, reservoir, boards_per_batch, seed

	def __iter__(self):
		info = torch.utils.data.get_worker_info()
		wid = info.id if info else 0
		rng = random.Random(self.seed * 1000 + wid + int(time.time()))
		nrng = np.random.default_rng(rng.getrandbits(32))
		styles = list_styles("train")
		xs, ys = [], []
		while sum(len(y) for y in ys) < self.reservoir:
			x, y = sample_tiles(rng, styles)
			xs.append(x)
			ys.append(y)
		X = np.concatenate(xs)
		Y = np.concatenate(ys)
		while True:
			for _ in range(self.bpb):
				x, y = sample_tiles(rng, styles)
				idx = nrng.choice(len(X), len(x), replace=False)
				X[idx] = x
				Y[idx] = y
			pick = nrng.choice(len(X), self.batch, replace=False)
			yield torch.from_numpy(X[pick].copy()), torch.from_numpy(Y[pick].copy())


def _val_boards(args: tuple[str, int, int]) -> tuple[np.ndarray, np.ndarray]:
	split, seed, n = args
	rng = random.Random(seed)
	styles = list_styles(split)
	xs, ys = [], []
	for _ in range(n):
		b = degrade(rng, render_board(rng, styles))
		x, y = tiles_from_board(rng, b)
		xs.append(x)
		ys.append(y)
	return np.concatenate(xs), np.concatenate(ys)


def val_set(split: str, boards: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
	path = CACHE / "val" / f"{split}-{boards}-{seed}.npz"
	if path.exists():
		d = np.load(path)
		return d["x"], d["y"]
	path.parent.mkdir(parents=True, exist_ok=True)
	chunks = [(split, seed * 100000 + i, boards // 20) for i in range(20)]
	with mp.get_context("spawn").Pool(min(20, os.cpu_count() or 4)) as pool:
		parts = pool.map(_val_boards, chunks)
	x = np.concatenate([p[0] for p in parts])
	y = np.concatenate([p[1] for p in parts])
	np.savez_compressed(path, x=x, y=y)
	return x, y


def to_input(x: torch.Tensor, device: str) -> torch.Tensor:
	return x.to(device, non_blocking=True).permute(0, 3, 1, 2).float().div_(255)


@torch.no_grad()
def evaluate(model: TileNet, x: np.ndarray, y: np.ndarray, device: str) -> dict:
	model.eval()
	preds = []
	for i in range(0, len(x), 4096):
		xb = to_input(torch.from_numpy(x[i:i + 4096]), device)
		with torch.autocast("cuda", dtype=torch.bfloat16):
			preds.append(model(xb).argmax(1).cpu())
	p = torch.cat(preds).numpy()
	model.train()
	conf = np.zeros((len(CLASSES), len(CLASSES)), np.int64)
	np.add.at(conf, (y, p), 1)
	return {"acc": float((p == y).mean()), "conf": conf}


def top_confusions(conf: np.ndarray, k: int = 6) -> list[str]:
	c = conf.copy()
	np.fill_diagonal(c, 0)
	idx = np.dstack(np.unravel_index(np.argsort(-c.ravel()), c.shape))[0][:k]
	return [f"{CLASSES[a]}->{CLASSES[b]}:{c[a, b]}" for a, b in idx if c[a, b] > 0]


# ---------------------------------------------------------------- main

def main() -> None:
	ap = argparse.ArgumentParser()
	ap.add_argument("--steps", type=int, default=60000)
	ap.add_argument("--batch", type=int, default=512)
	ap.add_argument("--workers", type=int, default=16)
	ap.add_argument("--lr", type=float, default=3e-3)
	ap.add_argument("--eval-every", type=int, default=2500)
	ap.add_argument("--name", default="v1")
	ap.add_argument("--resume", default="")
	args = ap.parse_args()

	device = "cuda"
	out = RUNS / args.name
	out.mkdir(parents=True, exist_ok=True)
	print("building validation sets ...", flush=True)
	vx, vy = val_set("train", 300, 1)
	hx, hy = val_set("holdout", 400, 2)
	print(f"val {len(vy)} tiles, holdout {len(hy)} tiles", flush=True)
	try:
		from eval_real import load_real_tiles
		rx, ry, _ = load_real_tiles()
	except Exception as e:  # noqa: BLE001
		print("no real eval:", e)
		rx = ry = None

	model = TileNet().to(device).to(memory_format=torch.channels_last)
	if args.resume:
		model.load_state_dict(torch.load(args.resume, map_location=device))
	opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.02)
	sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=args.steps, pct_start=0.05)
	dl = DataLoader(TileStream(args.batch), batch_size=None, num_workers=args.workers, pin_memory=True,
		prefetch_factor=4, persistent_workers=True)
	log = open(out / "log.jsonl", "a")
	best = -1.0
	t0 = time.time()
	seen = 0
	running = 0.0
	for step, (xb, yb) in enumerate(dl, 1):
		x = to_input(xb, device).contiguous(memory_format=torch.channels_last)
		y = yb.to(device, non_blocking=True)
		if random.random() < 0.3:  # mirrored art exists (knights face both ways across sets)
			x = x.flip(3)
		with torch.autocast("cuda", dtype=torch.bfloat16):
			loss = F.cross_entropy(model(x), y, label_smoothing=0.05)
		opt.zero_grad(set_to_none=True)
		loss.backward()
		opt.step()
		sched.step()
		seen += len(y)
		running = 0.98 * running + 0.02 * loss.item() if step > 1 else loss.item()
		if step % 200 == 0:
			el = time.time() - t0
			print(f"step {step} loss {running:.4f} lr {sched.get_last_lr()[0]:.2e} {seen / el:.0f} tiles/s {el / 60:.1f} min", flush=True)
		if step % args.eval_every == 0 or step == args.steps:
			v = evaluate(model, vx, vy, device)
			h = evaluate(model, hx, hy, device)
			rec = {"step": step, "min": (time.time() - t0) / 60, "loss": running, "val": v["acc"], "holdout": h["acc"],
				"val_conf": top_confusions(v["conf"]), "holdout_conf": top_confusions(h["conf"])}
			if rx is not None:
				r = evaluate(model, rx, ry, device)
				rec["real"] = r["acc"]
				rec["real_conf"] = top_confusions(r["conf"])
			print(json.dumps(rec), flush=True)
			log.write(json.dumps(rec) + "\n")
			log.flush()
			score = v["acc"] + h["acc"]
			torch.save(model.state_dict(), out / "last.pt")
			if score > best:
				best = score
				torch.save(model.state_dict(), out / "best.pt")
				np.save(out / "best_holdout_conf.npy", h["conf"])
				np.save(out / "best_val_conf.npy", v["conf"])
		if step >= args.steps:
			break
	print(f"done in {(time.time() - t0) / 60:.1f} min; best val+holdout {best:.4f}", flush=True)
	os._exit(0)  # don't wait on infinite workers


if __name__ == "__main__":
	main()
