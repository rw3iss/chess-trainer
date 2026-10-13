# Chess engine research (2026-10-12)

Goal: engine for a chess-openings PWA (phone + desktop). Needs: play vs bot with settable Elo and think time, full rules, optional analysis. Local (offline) and server (remote) modes.

## Recommendation

| Role | Engine | Where |
|---|---|---|
| Default bot + analysis | **Stockfish 19** (WASM, lite single-threaded) | Client Web Worker |
| Strong analysis / future online play | **Stockfish 19** native binary (full NNUE, multi-thread) | Server (UCI over WebSocket) |
| Human-like bots (600–2600) | **Maia-2** (ONNX, `onnxruntime-web`) | Client or server |
| Rules / move gen / PGN / FEN | **chess.js** (or **chessops**) | Client + server (shared) |
| Opening index data | **lichess-org/chess-openings** (CC0 TSV, ECO + name + PGN) | Bundled JSON |

Engine choice is a config setting: `engine: 'local' | 'remote'`, `model: 'stockfish-lite' | 'stockfish-full' | 'maia2'`.
All engines speak UCI (or a thin UCI-like adapter for Maia), so one `EngineAdapter` interface covers them.

## Stockfish (browser builds)

npm `stockfish` (nmrugg, used by Chess.com), v19.0.0:

| Build | Size | Needs COOP/COEP | Notes |
|---|---|---|---|
| lite single-threaded | ~1.6 MB | No | Recommended by README. Small NNUE, weaker but still far above human. |
| lite multi-threaded | ~1.6 MB | Yes | |
| large single-threaded | ~94 MB-class | No | Full NNUE. Too big for mobile PWA default. |
| large multi-threaded | ~94 MB | Yes | Strongest. |
| asm.js | ~3 MB | No | Slow fallback. |

(SF18 lite was ~7 MB; SF19 README says ~1.6 MB — verify on install.)

Alternative: `@lichess-org/stockfish-web` — Lichess's own builds (`sf_19`, `sf_19_smallnet`, `fsf_14` Fairy-Stockfish). NNUE loaded separately. Old `stockfish.js` / `stockfish.wasm` (SF10 / classical) are unmaintained.

Multi-threaded builds need `SharedArrayBuffer` → `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`. Single-threaded avoids this.

### Strength / difficulty controls (UCI)

- `UCI_LimitStrength true` + `UCI_Elo 1320..3190` (calibrated at 120s+1s, CCRL 40/4 anchor). Overrides `Skill Level`.
- `Skill Level 0..20` (MultiPV internally, picks weaker move by probability).
- Per-move budget: `go movetime <ms>`, `go depth <n>`, `go nodes <n>`.
- `MultiPV n` for analysis lines; `info score cp|mate` for eval bar.

**Floor is 1320.** Values below clamp. For beginner bots (400–1300): use `Skill Level 0` + low `depth`/`nodes` + random-legal-move blending, or use Maia-2.

## Maia-2 (human-like)

- One model, any rating 600–2600 (Lichess scale). Also conditions on opponent rating.
- Trained on human games: makes human-type mistakes (better for learning than a handicapped Stockfish).
- Runs in browser via ONNX Runtime Web (official `CSSLab/maia-platform-frontend` does this).
- Outputs move probabilities + win probability; no search. Fast, but weak at tactics by design.
- Maia-1: 9 separate models, 1100–1900.

## Others considered

- **Leela Chess Zero (lc0)**: very strong, but needs GPU and large nets. Server-only; no benefit over Stockfish here.
- **Fairy-Stockfish**: variants; can play weaker than 1320. Useful only if variants are wanted.
- **Komodo Dragon**: commercial. Excluded.

## License note

Stockfish is GPL-3.0. Shipping its WASM in the PWA = distributing it: keep it as a separate worker file, link to its source, include the license. App code that talks to it over UCI does not need to be GPL. Maia: check repo license before bundling weights.
