# DESIGN.md — @chess/web

Design rules for the web client. **Every build request reads this file first.**
Values live in `styles/_tokens.scss` (CSS custom properties) and `styles/_themes.scss`;
this file records intent. Record every new design decision here.

## Aesthetic — "modern study"

Calm, elegant, focused on the board. A deep ink/charcoal room with warm brass details
(dark, default); a warm-paper study in daylight (light). **The board is the hero** — chrome is
quiet, rounded, layered with soft shadows and hairline borders. Display serif for names and
headings gives a bookish, scholarly tone; the UI sans keeps controls crisp. Micro-motion is
playful but brief (piece lift, check glow, ★ pop, sheet slide).

## Color

One accent (brass), user-configurable through `--color-accent` (settings → app → accent).
All accent derivatives (`-hover`, `-soft`, `-softer`, `-text`, `--color-focus`) are computed
with `color-mix()` from it; `--color-accent-fg` is set by `useApplyAppearance()` for contrast.

| Token | Role | Dark (default) | Light |
|---|---|---|---|
| `--color-bg` / `--color-bg-glow` | page / top radial glow | `#0e0f12` / `#17181d` | `#f3eee4` / `#f9f5ed` |
| `--color-surface-1..3` | panels → cards → raised | `#15161a` `#1c1d22` `#25262c` | `#fbf8f2` `#f0e9dc` `#e6dccb` |
| `--color-surface-overlay` | translucent bars, sheets, chips (with backdrop blur) | ink 72% | paper 78% |
| `--color-border` / `-strong` | hairlines | warm white 8% / 16% | ink 11% / 20% |
| `--color-hover` / `--color-active` | interactive tints | | |
| `--color-text` / `-muted` / `-subtle` | text ramp | `#ece6da` `#9c968b` `#6f6a62` | `#2a241b` `#6e6455` `#9a8f7e` |
| `--color-accent` | brass | `#c9a45c` | `#a27a2e` |
| `--color-success/warn/danger/info` (+ `-soft`) | semantic, only for real states | | |
| `--color-white-adv` / `--color-black-adv` / `--color-draw` | eval bar, W/D/L bars, player swatches | | |

Board and piece colours are **separate token sets owned by the theme system** (`@chess/core/theme`
→ `--pc-*`, board vars); app tokens never style squares or pieces.

Rules: no raw hex in component SCSS; semantic colours only for genuine states; contrast AA in both themes.

## Typography

Loaded from Google Fonts (`display=swap`, cached by the service worker) with local fallbacks.

| Token | Family | Used for |
|---|---|---|
| `--font-display` | **Fraunces** (opsz axis) → Iowan/Palatino/Georgia | headings, opening names, session titles, result banner |
| `--font-body` | **Inter** → system-ui | UI, SAN moves |
| `--font-mono` | **JetBrains Mono** → ui-monospace | clocks, coordinates, ECO codes, counts (`@include tabular`) |
| `--font-figurine` | Noto Sans Symbols 2 → Segoe UI Symbol | figurine glyphs (♘♗♖♕♔) in move lists |

Scale: `--text-xs 11` · `sm 13` · `md 14` (base) · `lg 16` · `xl 20` · `2xl 26` · `3xl 34`, all × `--font-scale`
(settings). Weights 400/500/600. Small-caps labels: `@include eyebrow` (11 px, 600, +0.08em, uppercase, subtle).
Components use `font-family: var(--font-*)` — never raw font strings.

## Spacing, sizes & radii

- 4 px scale: `--space-0` 2 · `1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `8` 32 · `10` 40 · `12` 48 · `16` 64.
- Panel gutters `--gutter` 16 / `--gutter-lg` 24 (compact density: 12 / 16).
- Radii: `--radius-xs` 4 · `sm` 6 · `md` 10 · `lg` 16 · `full`.
- Controls: `--control-sm` 32 · `md` 40 · `lg` 48. **Touch targets ≥ 44 px** (`--touch-target`, enforced on `pointer: coarse`).
- Shell: `--topnav-height` 56 · `--controls-height` 64 · `--sidepanel-width` clamp(340, 30vw, 440); wide routes clamp(520, 52vw, 900).
- Breakpoints (Sass, `_variables.scss`): mobile 480 · tablet 768 · **split 900** (stacked ↔ board + panel) · desktop 1024 · wide 1440. Mixins: `mobile`, `tablet`, `tablet-up`, `stacked`, `split`, `desktop`, `wide`.

## Layout

- Desktop: TopNav · board stage (left, square board sized by container queries, player strips above/below) · side panel (right: tabs Moves / Openings / Games / Engine, route content, GameControls footer).
- Stacked (< 900 px): board full width on top, tabs below, content scrolls under the board, GameControls at the bottom. Openings / Games / Sessions / Settings open as **full-height sheets** with a "Board" back button and a floating **now-playing chip** (mini board + title + last move).

## Components

- Cards: `@include surface($level)` — surface colour, hairline border, inset top highlight, `--radius-md`/`lg`.
- Segmented controls for small exclusive filters; chips for ECO / tags (mono); badges for mode/status.
- Menus/popovers: surface-2, strong border, `--shadow-lg`; destructive items in danger colour, last.
- Toasts bottom-center (`--toast-offset` above mobile controls); undo actions for destructive operations.
- Sheets on mobile instead of side drawers; modals become bottom cards on phones.
- Move list: two columns (number · white · black), current move = accent-soft fill + 2 px accent bar, variations in an indented block with a left rule, nested lines inline in parens, comments italic muted, user notes as an accent-tinted pill.
- Primary action per view = `Button variant="primary"` (brass). Icon-only buttons always carry a label (aria + tooltip).
- Reuse before creating — consult [`COMPONENT_INDEX.md`](./COMPONENT_INDEX.md).

## Motion

Tokens: `--ease-out`, `--ease-in-out`, `--ease-spring`; `--dur-fast` 120 · `--dur-med` 200 · `--dur-slow` 360 · `--dur-piece` 180 ms.
- Piece move 180 ms ease-out (board setting `animationMs`); panel/sheet transitions ≤ 360 ms; hover tints 120 ms.
- Spring only for small celebratory moments (result banner, now-playing chip, ★).
- Respect `prefers-reduced-motion` (global override in `global.scss`) and the app setting `motion: 'reduced'` (`<html data-motion="reduced">`).

## Accessibility

- Visible `:focus-visible` ring (`--color-focus`) everywhere; skip link to the panel.
- Keyboard: ←/→ step, Home/End, Space play/pause, F flip, Ctrl+S save, Ctrl+⇧+S save as, / search; menus/tabs/segmented controls use roving focus + arrow keys.
- Move list: `role="list"`, current move `aria-current="step"`, figurines have SAN text for screen readers.
- Contrast AA in both themes; colour-blind-safe highlight option (`settings.board.colorBlindHighlights`).
