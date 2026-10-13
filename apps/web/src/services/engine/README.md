# services/engine

Engine layer for the web client. Everything here implements or uses core's
`EngineAdapter` contract (`packages/core/src/engine`). It is framework-agnostic:
no signals, no components. The UI uses `EngineRegistry`, `BotPlayer` and
`Analyzer`. It never imports a concrete adapter.

```
engine/
├── index.ts                 public exports
├── types.ts                 WorkerLike, availability, EngineAbortError
├── registry.ts              EngineRegistry: catalog + availability + download + adapter cache
├── assetStore.ts            Cache Storage downloads with byte progress (cache 'chess-engines-v1')
├── jobQueue.ts              serial job queue shared by the adapters
├── uciEngine.ts             line-based UCI channel over a Worker
├── adapters/
│   ├── StockfishWorkerAdapter.ts   sf-lite (default), sf-full (on demand)
│   ├── MaiaAdapter.ts              Maia-2 ONNX via onnxruntime-web (lazy)
│   └── RemoteEngineAdapter.ts      server engines over socket.io '/engine' (lazy)
├── maia/encode.ts           Maia-2 board encoding, policy decoding, sampling
├── controllers/
│   ├── BotPlayer.ts         plays a bot side; cancels on position change
│   └── Analyzer.ts          continuous MultiPV, White-POV lines, pauses when hidden
└── __tests__/               vitest + browser/smoke.mjs (real Chromium)
```

## Usage

```ts
import { EngineRegistry, BotPlayer, Analyzer } from '@/services/engine';

const registry = new EngineRegistry({ api, remote: serverOnline ? { serverUrl, token: () => auth.accessToken } : null });
const engines = await registry.list();              // [{ meta, availability: { available, reason?, message?, downloadable, installed } }]
await registry.download('sf-full', (p) => (progress.value = p.fraction));
await registry.remove('sf-full');
await registry.importMaiaModel(file);               // user-picked .onnx
const adapter = await registry.getAdapter('sf-lite'); // lazy, cached; idle adapters are disposed after 5 min

const bot = new BotPlayer({
	adapter,
	config: { color: 'black', targetElo: 1200, think: { preset: 'normal' } },
	getPosition: () => ({ fen: session.startFen, moves: session.lineUcis }),
	applyMove: (uci) => session.play(uci),
	onThinking: (b) => (thinking.value = b),
	onError: (e) => toast.error(e.message),
});
bot.sync(); // call after every move / undo / navigation; bot.dispose() on detach

const analyzer = new Analyzer({
	adapter,
	getPosition,
	onUpdate: (s) => (analysis.value = s), // { fen, lines[{ multipv, depth, score (White POV), winProbability, pv }], depth, running, paused }
	options: { multiPv: 3 },
});
analyzer.start(); analyzer.sync(); analyzer.stop(); analyzer.dispose();
```

Adapter semantics (all adapters):
- `play()` and `analyze()` run one at a time through a queue. A new request stops any running
  analysis, and the adapter waits for that search's `bestmove` before it sends the next `position`.
- `stop()` cancels every job. A pending `play()` rejects with `EngineAbortError`, so check it with
  `isAbortError(e)`. `BotPlayer` and `Analyzer` already ignore aborts.
- `play()` applies `resolveStrength()` from core: UCI options, `go` limits, the blunder blend
  (`pickBlunderMove`) and `minDelayMs`. Remote engines apply these on the server.
- One adapter can serve both the bot and the analysis, but a bot move cancels the running analysis.
  The `Analyzer` starts again on its next `sync()`.

## Engines

| id | Adapter | Files / size | Availability |
|---|---|---|---|
| `sf-lite` | StockfishWorkerAdapter | `public/engines/stockfish/stockfish-19-lite-single.{js,wasm}`: 28 KB + 1.76 MB | Always. Precached. |
| `sf-full` | StockfishWorkerAdapter | `public/engines/stockfish-full/stockfish-19-single.{js,wasm}`: 28 KB + 94.6 MB | `needs-download`. You get it from Settings into Cache Storage. The wasm is given to the worker as a `blob:` URL in the hash. |
| `maia` | MaiaAdapter (Maia-2 rapid) | model 89 MB (93,246,338 B) + `public/engines/maia/all_moves.json` 25 KB + ORT wasm 14.2 MB | `model-missing` until downloaded or imported |
| `fairy` | none | none | `binary-missing`: no Fairy-Stockfish WASM build is installed |
| `sf-native`, `lc0`, `maia-remote`, `komodo` | RemoteEngineAdapter | server | `needs-server` offline. When online, the server's `GET /engines` gives availability and the reason. |

`scripts/copy-engines.mjs` copies the Stockfish builds from `node_modules/stockfish` and writes
`public/engines/manifest.json`. The manifest holds sizes, sha256 values and `precache` / `onDemand`
flags. Run it after you install or update the package. Use `--skip-full` to skip the 95 MB build.
The full wasm is gitignored.

### Maia-2

- Model URL (default): `https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/e23a50e/public/maia2/maia_rapid.onnx`.
  It is pinned to the last commit that has Maia-2 (CORS `*`). raw.githubusercontent is not a CDN,
  so host the model yourself in production and pass `maia: { modelUrl }` to the registry.
- Inputs: `boards` float32 [1,18,8,8] (planes PNBRQK/pnbrqk, turn, castling KQkq, en passant).
  `elo_self` / `elo_oppo` are int64 Elo categories: <1100 → 0, then 100-point buckets, ≥2000 → 10.
  Outputs: `logits_maia` [1,1880] over `all_moves.json`, and `logits_value` (side to move).
  When Black is to move, the board is mirrored and the moves are mirrored back.
- The encoding was checked with the real model in Node and in Chromium. Examples: Ruy Lopez 6.Re1
  at 0.67, 6…b5 at 0.87, a hanging queen taken, back-rank …Rd1# at 0.98.
- Maia-2 was trained with plies 0–9 skipped (`first_n_moves: 10`), so it plays bad opening moves
  (for example 1.Na3). Use the `openingMove(fen, ply)` hook for plies < 10, for example a weighted
  pick from the openings dataset.
- Other models: Maia-1 ONNX (lc0 112-plane, about 2.6 MB each) is at `hunterchen7/play-lc0` on R2.
  That repo has no license, so it is not used. Maia-3 (`maia3_simplified.onnx`, 45 MB) is a
  different format.
- Inference runs on the main thread with `onnxruntime-web/wasm`. One evaluation takes about 40 ms.

## Adding an engine

1. Add its `EngineMeta` to `ENGINE_CATALOG` in core. Add its strength mapping to `resolveStrength`
   if it needs one.
2. If it is a UCI engine compiled to a worker, put the files in `public/engines/<dir>/`, add an
   entry to `copy-engines.mjs` (so it goes into the manifest), and use `StockfishWorkerAdapter`.
   Otherwise, implement `EngineAdapter` in `adapters/` and use `JobQueue`.
3. Add availability rules to `EngineRegistry.localAvailability()` and add construction to `create()`.
   For tests, pass `factories: { id: () => adapter }`.
4. Remote engines need no client code. The server lists them.

## Tests

- `pnpm vitest run --config config/vitest.config.ts src/services/engine`. This runs fake-UCI
  protocol tests, strength wiring, queue and stop draining, BotPlayer cancellation, Analyzer POV,
  debounce and visibility, and registry availability, download and idle disposal. It also runs a
  **real** Stockfish 19 lite (Node) and the RemoteEngineAdapter against a **real** socket.io server.
  The real Maia-2 test runs when `MAIA_MODEL_PATH` is set or `/tmp/maia/dl/maia_rapid.onnx` exists.
- `node src/services/engine/__tests__/browser/smoke.mjs [model.onnx]` bundles the adapters with
  Vite and runs them in headless Chromium. It uses a real Worker, the precached path, the
  blob-wasm (sf-full) path, Cache Storage, and Maia on onnxruntime-web.

## Licenses

- **Stockfish 19** (stockfish.js by Nathan Rugg, npm `stockfish`): **GPL-3.0**. It ships as its own
  worker file with `COPYING.txt` next to it. The app talks to it only over UCI messages. Source:
  https://github.com/nmrugg/stockfish.js and https://github.com/official-stockfish/Stockfish.
  Link to both from the About / licenses screen.
- **Maia-2** weights and move vocabulary: the `CSSLab/maia2` training code and weights are MIT. The
  copy hosted in `maia-platform-frontend` is in a GPL-3.0 repo. `maia/encode.ts` is a clean-room
  version of the published format.
- **onnxruntime-web**: MIT. **socket.io-client**: MIT.
