"""Evaluate the exported ONNX model on real board images.

  python src/eval_real.py [--model apps/web/public/models/board-vision/pieces-v1.onnx]

Sources: real lichess GIF exports (.cache/lichess-real/labels.json) and the browser fixtures
(apps/web/e2e/fixtures/board-images/fixtures.json). Each board is cropped with its known box, split
8x8 (exact cells) and resampled to 40x40 like the browser, then classified in one batch per image.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from common import CLASSES, FIXTURES_OUT, MODEL_OUT, REAL_DIR, RUNS, grid_to_placement, placement_to_grid
from synth import crop_tile


def image_tiles(img: Image.Image, box: dict) -> np.ndarray:
	s = box["size"] / 8
	return np.stack([crop_tile(img, box["x"] + c * s, box["y"] + r * s, s, Image.LANCZOS)
		for r in range(8) for c in range(8)])


def image_labels(entry: dict) -> np.ndarray:
	g = np.array(placement_to_grid(entry["placement"]))
	if entry["orientation"] == "black":
		g = g[::-1, ::-1]
	return g.reshape(-1)


def load_set(label_file: Path) -> list[tuple[str, np.ndarray, np.ndarray, dict]]:
	if not label_file.exists():
		return []
	out = []
	for e in json.loads(label_file.read_text()):
		img = Image.open(label_file.parent / e["file"]).convert("RGB")
		out.append((e["file"], image_tiles(img, e["board"]), image_labels(e), e))
	return out


def load_real_tiles() -> tuple[np.ndarray, np.ndarray, list]:
	items = load_set(REAL_DIR / "labels.json")
	if not items:
		raise FileNotFoundError("no real images; run `python src/fetch.py real`")
	return np.concatenate([i[1] for i in items]), np.concatenate([i[2] for i in items]), items


def main() -> None:
	import onnxruntime as ort

	ap = argparse.ArgumentParser()
	ap.add_argument("--model", default=str(MODEL_OUT / "pieces-v1.onnx"))
	args = ap.parse_args()
	sess = ort.InferenceSession(args.model, providers=["CPUExecutionProvider"])
	report = {}
	for name, path in (("lichess-real", REAL_DIR / "labels.json"), ("fixtures", FIXTURES_OUT / "fixtures.json")):
		items = load_set(path)
		if not items:
			print(f"{name}: none")
			continue
		exact = 0
		tiles_ok = tiles = 0
		print(f"\n{name}:")
		for fname, x, y, e in items:
			inp = x.transpose(0, 3, 1, 2).astype(np.float32) / 255
			p = sess.run(["logits"], {"input": inp})[0].argmax(1)
			ok = int((p == y).sum())
			tiles_ok += ok
			tiles += 64
			exact += ok == 64
			errs = [f"row{i // 8}col{i % 8}:{CLASSES[y[i]]}->{CLASSES[p[i]]}" for i in np.where(p != y)[0]]
			print(f"  {fname:44s} {ok}/64 {'OK' if ok == 64 else ' '.join(errs)}")
		report[name] = {"images": len(items), "exactBoards": exact, "tileAcc": tiles_ok / tiles}
		print(f"  => exact boards {exact}/{len(items)}, tile acc {tiles_ok / tiles:.4%}")
	# Same real images downscaled: small boards / tiny cells (resampled board, then the usual crop).
	labels = json.loads((REAL_DIR / "labels.json").read_text()) if (REAL_DIR / "labels.json").exists() else []
	for size in (360, 240, 160, 120):
		ok = tot = exact = 0
		for e in labels:
			im = Image.open(REAL_DIR / e["file"]).convert("RGB").resize((size, size), Image.LANCZOS)
			x = image_tiles(im, {"x": 0, "y": 0, "size": size})
			y = image_labels(e)
			p = sess.run(["logits"], {"input": x.transpose(0, 3, 1, 2).astype(np.float32) / 255})[0].argmax(1)
			ok += int((p == y).sum())
			tot += 64
			exact += bool((p == y).all())
		if labels:
			report[f"lichess-real@{size}px"] = {"images": len(labels), "exactBoards": exact, "tileAcc": ok / tot}
			print(f"lichess-real downscaled to {size} px (cell {size / 8:.0f} px): exact {exact}/{len(labels)}, tile acc {ok / tot:.4%}")
	print(json.dumps(report))
	RUNS.mkdir(exist_ok=True)
	(RUNS / "eval_real.json").write_text(json.dumps(report, indent="\t"))


if __name__ == "__main__":
	main()
