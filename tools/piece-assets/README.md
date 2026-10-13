# @chess/piece-assets

Builds the recolourable piece-set sprites used by the board.

```sh
pnpm assets:pieces              # download (cached in .cache/), normalise, write outputs
pnpm assets:pieces -- --render  # also render preview.html to out/preview.png (Playwright)
```

## Outputs

- `apps/web/public/pieces/<id>/sprite.svg` — one `<symbol>` per piece
- `apps/web/public/pieces/manifest.json`, `LICENSES.md`, `preview.html`
- `packages/core/src/theme/pieceSets.generated.ts` — the `BUILTIN_PIECE_SETS` list

## How recolouring works

`normalize.ts` sorts every fill and stroke in a source SVG into a role and replaces the colour with a CSS class:

| Class | Colour | Use |
|---|---|---|
| `.pc-body` | `var(--pc-body)` | main fill |
| `.pc-line` | `var(--pc-line)` | outlines, dark strokes |
| `.pc-accent` | `var(--pc-accent)` | secondary details |
| `.pc-shade` | neutral gradients × `--pc-shade` | shading, so any colour still looks lit |

In-between tones become `color-mix()` of the role variables. The board sets the variables per side from the active piece theme.

## Sets

- **Originals** (`src/originals/`): `lux` (Staunton shapes with a shading layer) and `sleek` (minimal). One shape for both sides (`layout: 'shared'`).
- **Imported from lichess-org/lila** (`src/sets.ts`): cburnett, merida, rhosgfx, fantasy, spatial, celtic, chessnut, kiwen-suwi, plus california, cardinal, maestro, staunty (CC BY-NC-SA, marked `personalUseOnly`). Each side keeps its own shapes (`layout: 'per-color'`).

To add a set: add an entry to `src/sets.ts` (id, name, author, license, source), run the build, check `out/preview.png`.
