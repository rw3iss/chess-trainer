"""Export a trained checkpoint to ONNX (+ metadata json) and verify it with onnxruntime.

  python src/export.py [--ckpt runs/v1/best.pt]

Output: apps/web/public/models/board-vision/pieces-v1.onnx + pieces-v1.json
Contract: input `input` float32 [N,3,40,40] RGB in [0,1] (NCHW) -> output `logits` [N,13] in CLASSES order.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json

import numpy as np
import onnx
import onnxruntime as ort
import torch

from common import CLASSES, INPUT_SIZE, MODEL_OUT, RUNS
from model import WIDTHS, TileNet


def ort_accuracy(sess: ort.InferenceSession, x: np.ndarray, y: np.ndarray) -> float:
	preds = []
	for i in range(0, len(x), 2048):
		inp = x[i:i + 2048].transpose(0, 3, 1, 2).astype(np.float32) / 255
		preds.append(sess.run(["logits"], {"input": inp})[0].argmax(1))
	return float((np.concatenate(preds) == y).mean())


def main() -> None:
	ap = argparse.ArgumentParser()
	ap.add_argument("--ckpt", default=str(RUNS / "v1" / "best.pt"))
	args = ap.parse_args()

	model = TileNet()
	model.load_state_dict(torch.load(args.ckpt, map_location="cpu"))
	model.eval()
	MODEL_OUT.mkdir(parents=True, exist_ok=True)
	onnx_path = MODEL_OUT / "pieces-v1.onnx"
	dummy = torch.rand(2, 3, INPUT_SIZE, INPUT_SIZE)
	torch.onnx.export(
		model, (dummy,), str(onnx_path), opset_version=17, dynamo=False,
		input_names=["input"], output_names=["logits"],
		dynamic_axes={"input": {0: "N"}, "logits": {0: "N"}}, do_constant_folding=True,
	)
	m = onnx.load(str(onnx_path))
	onnx.checker.check_model(m)
	ops = sorted({n.op_type for n in m.graph.node})
	print("ops:", ops)

	sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
	# 1) numerical parity with torch, incl. a full 64-tile board batch
	for n in (1, 64, 200):
		x = torch.rand(n, 3, INPUT_SIZE, INPUT_SIZE)
		with torch.no_grad():
			ref = model(x).numpy()
		got = sess.run(["logits"], {"input": x.numpy()})[0]
		assert got.shape == (n, len(CLASSES)), got.shape
		diff = float(np.abs(ref - got).max())
		assert diff < 1e-3 and (ref.argmax(1) == got.argmax(1)).all(), diff
		print(f"batch {n}: max |torch - ort| = {diff:.2e}")

	# 2) accuracy through onnxruntime
	from train import val_set
	metrics: dict = {}
	vx, vy = val_set("train", 300, 1)
	hx, hy = val_set("holdout", 400, 2)
	metrics["syntheticVal"] = round(ort_accuracy(sess, vx, vy), 5)
	metrics["heldOutStyles"] = round(ort_accuracy(sess, hx, hy), 5)
	try:
		from eval_real import load_real_tiles
		rx, ry, items = load_real_tiles()
		metrics["lichessRealTiles"] = round(ort_accuracy(sess, rx, ry), 5)
		metrics["lichessRealImages"] = len(items)
	except FileNotFoundError:
		pass
	size = onnx_path.stat().st_size
	meta = {
		"version": 1,
		"inputSize": INPUT_SIZE,
		"classes": CLASSES,
		"trainedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
		"metrics": metrics,
		"arch": f"TileNet conv{list(WIDTHS)} + GAP + FC",
		"bytes": size,
	}
	(MODEL_OUT / "pieces-v1.json").write_text(json.dumps(meta, indent="\t") + "\n")
	print(json.dumps(meta, indent=2))
	assert size <= 2 * 1024 * 1024, f"model too large: {size}"


if __name__ == "__main__":
	main()
