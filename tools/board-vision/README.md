# board-vision

Trains the small CNN behind the PWA's **"load position from a board image"** feature. The model
classifies ONE board square (already cropped by the browser at the detected grid cell) into 13
classes. It is trained only on synthetic data, so it generalizes to any 2D board style: lichess,
chess.com, other apps, book/PDF diagrams, and this app's own boards. 3D photos are out of scope.

The browser side (grid detection, tile cropping, onnxruntime-web inference, UI) lives in `apps/web`.
This tool only produces the model artifacts and the test fixtures.

## I/O contract (fixed; the browser is written against it)

| | |
|---|---|
| Model | `apps/web/public/models/board-vision/pieces-v1.onnx` (ONNX opset 17, fp32, ~1.2 MB) |
| Metadata | `apps/web/public/models/board-vision/pieces-v1.json` — `{ version: 1, inputSize: 40, classes, trainedAt, metrics, arch, bytes }` |
| Input | `input`: float32 `[N, 3, 40, 40]`, dynamic N, **RGB**, values in **[0, 1]**, NCHW. Normalization is inside the graph. |
| Output | `logits`: float32 `[N, 13]` |
| Classes | `["empty","P","N","B","R","Q","K","p","n","b","r","q","k"]` (upper = white, lower = black) |
| Ops | Conv, Relu, MaxPool, GlobalAveragePool, Gemm, Sub, Div, Flatten — all supported by onnxruntime-web WASM |

The browser crops each cell as the exact grid square `(x0 + c*s, y0 + r*s, s, s)` and resamples it
to 40×40 with canvas `drawImage` (`imageSmoothingQuality = 'high'`). Training uses crop jitter
(grid shift ±4% + tile shift ±4%, scale 0.93–1.07, grid scale ±2%), so a few percent of grid
error is fine; slivers of neighbor squares / board frame are expected.

## Setup

Needs `uv`, `rsvg-convert` (librsvg2-tools), an NVIDIA GPU for training (CPU works, slowly), and
the fonts listed in `src/assets.py` (DejaVu Sans, Symbola, Noto Sans Symbols 2, STIX Two Math).

```bash
cd tools/board-vision
uv venv -p 3.12 .venv && uv sync     # CUDA 12.4 torch wheels (see pyproject.toml)
```

## Run

From the repo root, `pnpm vision:train` runs every step (`bash tools/board-vision/run.sh all`).
Single steps (`bash tools/board-vision/run.sh <step>`, or the Python scripts directly from `tools/board-vision`):

| Step | Command | What it does |
|---|---|---|
| fetch | `.venv/bin/python src/fetch.py sets` | Sparse-clones `lichess-org/lila` `public/piece` and `pychess/pychess` `pieces` into `.cache/` (training art only) |
| | `.venv/bin/python src/fetch.py real` | Downloads 40 real lichess GIF exports (`lichess1.org/export/fen.gif`, 6 themes, both orientations) into `.cache/lichess-real` with labels. The exporter rate-limits hard (HTTP 429 with up to ~1 h `Retry-After`); the script waits it out |
| assets | `.venv/bin/python src/assets.py` | Rasterizes every piece style to `.cache/pieces/<style>.npz` (12 × 160² RGBA) |
| fixtures | `.venv/bin/python src/fixtures.py` | Writes `apps/web/e2e/fixtures/board-images/*.png` + `fixtures.json` |
| train | `.venv/bin/python src/train.py --steps 80000 --workers 20 --name v1` | Trains on boards generated on the fly; logs to `runs/v1/` |
| export | `.venv/bin/python src/export.py --ckpt runs/v1/best.pt` | ONNX export, onnx checker, torch↔onnxruntime parity (batch 1/64/200), accuracy via onnxruntime, writes the json |
| eval | `.venv/bin/python src/eval_real.py` | Per-image exact-board + tile accuracy on the real lichess images and on the fixtures |

Debug helpers: `src/preview_sets.py [filter]` (contact sheet of all styles → `runs/sets.png`),
`src/preview_synth.py [seed]` (sample boards + tile mosaic → `runs/`).

Caches (`.cache/`), runs (`runs/`) and the venv are gitignored.

### Continue a stopped run

`train.py` saves `runs/<name>/last.pt` every eval (2,500 steps) and `best.pt` on the best held-out
score. `--resume` loads weights only (the step count and LR schedule start again).

Shipped model: **v3b** (2026-11-18) — v2 → v3 (stopped at ~36k steps) → resumed 70k steps as v3b.
syntheticVal 0.9984, heldOutStyles 0.9676 (v2: 0.9647), lichess real 40/40; image e2e 12/13 exact.
To train further from it, then ship:

```bash
cd tools/board-vision
.venv/bin/python -u src/train.py --steps 70000 --workers 20 --name v4 --resume runs/v3b/best.pt --lr 2e-3 | tee runs/v4.log
.venv/bin/python src/export.py --ckpt runs/v4/best.pt
.venv/bin/python src/eval_real.py
cd ../../apps/web && npx playwright test -c config/playwright.config.ts e2e/import-position.spec.ts --project=desktop
```

Ship only if `heldOutStyles` beats the shipped model (0.9676) and the image e2e still passes; otherwise
restore the model with `git checkout apps/web/public/models/board-vision/`.

## Synthetic data

Every training sample comes from a full synthetic board (`src/synth.py`), so neighbors, borders and
coordinates look real:

- **Piece art** (123 styles): our 15 sprite sets (default colors + 3 random recolors each), 40
  lichess sets, 13 extra pychess families lichess lacks (alfonso, alila, chessicons, chessmonk,
  freestaunton, kilfiger, libra, magnetic, maya, merida_new, metaltops, pirat, regular), and Unicode
  chess glyphs from 5 fonts in 3 ink modes (outline-only, white-filled, gray). Lichess `disguised`,
  `letter`, `shapes`, `mono` are excluded.
- **Per-board art restyle** (55% of boards): duotone recolor (white stays light, black stays dark),
  binarized print ink with optional outline-only white pieces, stretch ±12%, tilt ±4°, bolder strokes.
- **Held-out styles** (never trained on; used for the `heldOutStyles` metric): `lila-companion`,
  `lila-fresca`, `ours-lux` (+ recolors), `font-noto-symbols2` (all modes).
- **Squares**: known site palettes, our board themes (`packages/core/src/theme/boardThemes.ts`),
  random HSV pairs, wood/marble/grain/gradient/mottled textures, book diagrams (white + gray or
  hatched dark squares, white halo under pieces), plain white boards with grid lines.
- **Overlays**: last-move / selected / premove tints, check glow, hover outline, legal-move dots
  (on empty squares — still `empty`), capture rings and corner marks, arrows, coordinates inside
  the edge squares or outside the board, board frames, page backgrounds.
- **Pieces**: scale 0.70–1.0 of the square, small offsets, occasional drop shadow, random resample filter.
- **Degradation**: cell size 14–110 px, whole-image rescale (×0.6–1.6), blur, color/contrast/
  saturation jitter, grayscale, noise, JPEG q40–95, GIF-style palette quantization; then each cell
  is cropped with jitter and resampled to 40×40 with a random filter. Horizontal flip p=0.3 at train time.
- **Balance**: each square is empty with p = 0.3, otherwise a uniformly random piece class.

## Training art licenses

The lichess piece sets are used **for training only**. They are downloaded into `.cache/` and are
never committed or shipped; the model weights do not contain the art. Licenses vary per set (see
`.cache/lila/COPYING.md` after `fetch.py sets`): GPLv2+ (cburnett, merida), MIT (fantasy, spatial,
celtic), Apache 2.0 (chessnut), CC BY 4.0 (kiwen-suwi, firi, totoy, papercut), CC0 (rhosgfx), many
CC BY-NC-SA 4.0 (cardinal, maestro, staunty, california, …), AGPLv3+ (pixel, pirouetti), freeware
(alpha, companion, leipzig, chess7) and a few unstated. The pychess extras are taken from the GPLv3
`pychess/pychess` repo (`pieces/`); their individual origins are mostly freeware chess fonts. Our own sets are listed in
`apps/web/public/pieces/LICENSES.md`. Fonts are system fonts (DejaVu: Bitstream Vera license;
Noto: OFL; Symbola: free use; STIX: OFL).

The fixtures only contain art that ships with the app (our sprite sets, cburnett via the lichess
GIF exporter) and the Noto Sans Symbols 2 font (OFL).

## Fixtures (`apps/web/e2e/fixtures/board-images/`)

`fixtures.json` is an array of:

```jsonc
{
	"file": "lichess-02-ic-black.png",
	"placement": "rnbqkbnr/...",          // FEN piece placement, WHITE at the bottom (standard FEN)
	"orientation": "white" | "black",     // as drawn in the image
	"board": { "x": 0, "y": 0, "size": 360 }, // board square region (8×8 cells) in image pixels
	"lastMove": ["e2", "e4"],             // optional
	"source": "lichess-gif" | "synthetic",
	"style": "ours-merida"                 // synthetic only: piece style used
}
```

Lichess images are exported at 720 px and some are downscaled (360–720 px). Synthetic ones place
the board off-center inside a UI-like page (header, player bars, move list panel, buttons).
