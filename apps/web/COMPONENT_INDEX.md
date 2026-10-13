# COMPONENT_INDEX.md — @chess/web

The **reuse manifest**. Read it before building anything; reuse, adapt or extend what is here.
Add a row for every new page, shared component, hook, utility, store, service or SCSS mixin.

**Placement:** pages → `src/pages/<Name>/` · features → `src/components/<feature>/` · primitives → `src/components/common/<Name>/` (barrel: `@/components/common`).

## Pages

| Page | Path | Purpose | Notes |
|---|---|---|---|
| Home | `src/pages/Home/` | `/` — MovesPanel for the active session, or StartCard (New game / Browse openings / Resume) | built |
| Sessions | `src/pages/Sessions/` | `/sessions` — grid of SessionCards; open → active + `/`; close | built, layout `wide` |
| Openings | `src/pages/Openings/` | `/openings` — browser | **TODO placeholder** (openings feature) |
| OpeningDetail | `src/pages/OpeningDetail/` | `/openings/:id` | **TODO placeholder** (openings feature) |
| Games | `src/pages/Games/` | `/games` — saved games | **TODO placeholder** (saved-games feature) |
| Settings | `src/pages/Settings/` | `/settings/:section` | **TODO placeholder** (settings feature) |
| Play | `src/pages/Play/` | `/play/:roomId` | **TODO placeholder** (online rooms) |
| NotFound | `src/pages/NotFound/` | default route | built |
| PagePlaceholder | `src/pages/PagePlaceholder.tsx` | heading + "coming soon" EmptyState for unbuilt pages | delete usages as pages land |

Routes + layouts + panel tabs: `src/app/routes.ts`.

## Components — common primitives

| Component | Kind | Path | Purpose | Reuse for |
|---|---|---|---|---|
| Icon | common | `src/components/common/Icon` | Inline SVG icon set (`IconName`, `ICON_NAMES`; incl. `logo`, `knight`) | any glyph; never inline raw SVG |
| Spinner | common | `src/components/common/Spinner` | Loading spinner with sr-only label | async states |
| Button | common | `src/components/common/Button` | primary/secondary/ghost/danger, sizes, icon/iconRight, loading, block (forwardRef) | every text action |
| IconButton | common | `src/components/common/IconButton` | Icon-only button; `label` = aria + title; `active` (aria-pressed); `badge` (forwardRef) | toolbars, Menu triggers |
| Input / Textarea | common | `src/components/common/Input` | Labelled field, leading icon, trailing slot, hint/error | forms, search, notes |
| Select | common | `src/components/common/Select` | Styled native select (generic) | enums, sort pickers |
| Slider | common | `src/components/common/Slider` | Range with accent fill + value readout | Elo, volume, font scale |
| Toggle | common | `src/components/common/Toggle` | role=switch row with label/description | boolean settings |
| Tabs | common | `src/components/common/Tabs` | Tablist (underline w/ sliding indicator, pill), roving keys | panel tabs, page sections |
| SegmentedControl | common | `src/components/common/SegmentedControl` | Radiogroup segmented buttons | theme mode, small exclusive filters |
| Modal | common | `src/components/common/Modal` | Dialog: focus trap, Esc/backdrop, scroll lock, mobile bottom card | confirms, forms |
| Sheet | common | `src/components/common/Sheet` | Bottom/right sheet, grab handle, swipe-to-close | mobile filters, drawers |
| Menu / MenuList | common | `src/components/common/Menu` | Popover menu (render-prop trigger, flip/clamp, arrow keys, typeahead); `MenuItem` type (`separator`, `heading`, `checked`, `danger`, `shortcut`) | "more" menus, dropdowns |
| ContextMenu / useContextMenu | common | `src/components/common/ContextMenu` | Point-anchored menu + hook `{ open(e, items), close, element }` | right-click / long-press |
| Tooltip | common | `src/components/common/Tooltip` | Hover/focus tooltip (portal, delay, flip), hidden on touch | icon hints |
| ToastHost | common | `src/components/common/Toast` | Toast stack bottom-center (`--toast-offset`), live region | mounted once in AppShell |
| Chip | common | `src/components/common/Chip` | Pill tag: selectable/removable, `mono`, tones | ECO codes, filters, tags |
| Badge | common | `src/components/common/Badge` | Tone pill or 8 px status dot | mode, counts, statuses |
| ColorPicker | common | `src/components/common/ColorPicker` | Swatches + native picker + validated hex | accent, board/piece colours |
| VirtualList | common | `src/components/common/VirtualList` | Fixed-height windowed list, `onEndReached`, `scrollToIndex` | openings list, games list |
| EmptyState | common | `src/components/common/EmptyState` | Icon + title + description + actions | empty lists, offline |
| Portal | common | `src/components/common/Portal` | Portal into `#portal-root`; `lockScroll`, `usePresence`, `useOverlayLayer`, layer stack (Esc closes topmost) | any new overlay |

## Components — features

| Component | Kind | Path | Purpose | Reuse for |
|---|---|---|---|---|
| AppShell | feature | `src/components/shell/AppShell.tsx` | TopNav + persistent BoardStage + SidePanel (tabs, Router, overrides) + GameControls; mobile sheets | the only root layout |
| TopNav / ServerStatus | feature | `src/components/shell/TopNav.tsx` | logo, SessionSwitcher, links, offline pill, server status dot, theme toggle | — |
| NowPlayingChip | feature | `src/components/shell/NowPlayingChip.tsx` | floating mini-board chip over mobile sheets → back to `/` | — |
| panelSlots | slot | `src/components/shell/panelSlots.ts` | `panelSlots.engine` — content for the route-less Engine tab | engine panel |
| BoardStage | feature | `src/components/stage/BoardStage.tsx` | **single board integration point**: active session → Board2D (settings + themes), player strips, mode badge, result banner, slots; ghost session when none open (first move opens one) | — |
| StageMiniBoard | feature | `src/components/stage/BoardStage.tsx` | MiniBoard for a session with active themes | cards, chips, thumbnails |
| boardViewModel / playerLabel / lastMoveOf / movableFor | util | `src/components/stage/boardModel.ts` | Session + settings → BoardViewModel (pure) | any board view of a session |
| stageSlots | slot | `src/components/stage/slots.ts` | `clockTop`, `clockBottom`, `side`, `evalBar`, `overlay` | clocks, eval bar, overlays |
| GameControls | feature | `src/components/controls/GameControls.tsx` | first/prev/play-pause/next/last, speed menu, flip/fork/save/bot (collapse into More by container width), More menu | — |
| sessionCommands | util | `src/components/controls/sessionCommands.ts` | default command handlers (quick save, saveAs, fork, newGame, openBot), `copyPgn`, `copyFen`, `copyToClipboard` | fallbacks; clipboard |
| SessionSwitcher / lastMoveLabel | feature | `src/components/sessions/SessionSwitcher.tsx` | "Current ▾ N" quick list + New game + All sessions | — |
| SessionCard | feature | `src/components/sessions/SessionCard.tsx` | mini board, title, mode/active/playing/saved badges, last move, time, close | session/game grids |
| MovesPanel | feature | `src/components/moves/MovesPanel.tsx` | OpeningHeader + MoveList + NotesCard + NoteEditorModal for a session | `/` panel |
| MoveList | feature | `src/components/moves/MoveList.tsx` | SAN pairs, figurines, variations, comments/notes, current + auto-scroll, context menu (fork/delete/promote/note) | any move tree display (pass `actions`) |
| moveLayout | util | `src/components/moves/moveLayout.ts` | pure tree → rows/variation blocks/line tokens; `moveNumber`, `isWhiteMove` | move lists, PGN previews |
| OpeningHeader | feature | `src/components/moves/OpeningHeader.tsx` | live opening name (ECO chip, family/variation, W/D/L) via `identify` prop or `openingIdentifier` | opening preview headers |
| WdlBar | feature | `src/components/moves/WdlBar.tsx` | white/draw/black % bar + game count | popularity, explorer |
| NotesCard | feature | `src/components/moves/NotesCard.tsx` | per-position (EPD) user note editor (debounced autosave) + dataset notes slot | opening detail |
| notesSlots | slot | `src/components/moves/notesSlots.ts` | `notesSlots.dataset` ({ epd, fen }) | Wikibooks notes |
| NoteEditorModal | feature | `src/components/moves/NoteEditorModal.tsx` | edit a move's `userNote` | — |
| StartCard | feature | `src/pages/Home/StartCard.tsx` | hero + New game / Browse openings / Resume saved | — |
| Board2D / MiniBoard / EvalBar / PromotionPicker | feature | `src/components/board/` | board renderer (owned by the board feature; see `board/index.ts`) | import only via `@/components/board` in BoardStage |

## State stores (`src/state/`, barrel `@/state`)

| Store | Path | Read | Write |
|---|---|---|---|
| registry | `state/registry.ts` | `registeredStores()` | `defineStore`, `initStores`, `flushStores` |
| settings | `state/settings.ts` | `settings`, `settingsLoaded`, `DEFAULT_SETTINGS`, types `AppSettings`, `BoardDisplaySettings` | `updateSettings`, `replaceSetting`, `resetSettings`, `deepMerge` |
| sessions | `state/sessions.ts` | `openSessions`, `activeSession`, `activeId`, `sessionCount`, `sessionsRestored`, `getSession`, `isAtLineEnd`, `isAtStart`, `cursorNode`, `onSessionEvent` | `sessionsActions.*`, `flushSessions` |
| savedGames | `state/savedGames.ts` | `savedGames`, `savedGamesLoaded`, `getSavedGame` | `savedGamesActions.*` |
| favorites | `state/favorites.ts` | `favoriteOpeningIds`, `favoriteGameIds`, `isFavorite` | `toggleFavorite`, `setFavorite` |
| playback | `state/playback.ts` | `activeIsPlaying`, `playback.playing`, `playback.isPlaying(id)` | `playbackActions.play/pause/toggle/setSpeed` |
| themes | `state/themes.ts` | `boardThemes`, `pieceThemes`, `pieceSets`, `activeBoardTheme`, `activePieceTheme`, `activePieceSet` | `themesActions.saveBoard/savePiece/remove` |
| notes | `state/notes.ts` | `userNotes`, `noteFor`, `isNoteLoaded` | `loadNote`, `saveNote` |
| openingIdentity | `state/openingIdentity.ts` | `openingIdentifier` | `setOpeningIdentifier` |

## Services

| Name | Path | Purpose | Reuse for |
|---|---|---|---|
| repositories | `src/services/db` | `getRepositories()` / `setRepositories()`; Sessions/SavedGames/Favorites/Themes/Notes/Settings/Kv interfaces + Dexie impl (`ChessDb`) | all persisted local data |
| api | `src/services/api` | `api` (delegates Http ↔ Mock by server status), `ApiClient`, `HttpApiAdapter`, `MockApiAdapter`, `ApiRequestError`, `setAuthTokenProvider`, `apiKind` | server-only data |
| mock fixtures | `src/mock/data/*.json` | health, user, explorer, engines, rooms | MockApiAdapter |
| serverConnector | `src/services/server` | probe `/health`; `status`, `url`, `health`, `networkOnline`, `isOnline`; `start/configure/probe/stop` | feature gating |
| dataCache | `src/services/cache` | TTL cache (`get/peek/set/getOrFetch/load`), IndexedDB/memory backends | fetched/derived data |
| commands | `src/services/commands` | `CommandBus` / `commands` (register stack, dispatch, onDispatch) | shortcuts, menus |
| PlaybackController | `src/services/playback` | DI'd auto-stepper (play/pause/toggle/retime, `playing` signal) | any timed stepping |
| toast | `src/services/toast` | `toast.show/info/success/warn/error/dismiss/clear`, id dedupe, sticky, actions | user feedback |
| sw | `src/services/sw` | `sw.ts` (Workbox precache + runtime caching); `registerServiceWorker`, `swNeedRefresh`, `swOfflineReady`, `applyServiceWorkerUpdate` | PWA |
| createSlot | `src/app/slots.tsx` | typed extension slot (`register` → unregister, `Render` with fallback) | new extension points |

## Shared hooks & utilities

| Name | Path | Purpose | Reuse for |
|---|---|---|---|
| useTheme / useApplyAppearance / resolveTheme | `src/hooks/useTheme.ts` | light/dark/system; applies data-theme, density, motion, accent, font scale | theme toggles |
| useMediaQuery / useIsStacked | `src/hooks/useMediaQuery.ts` | reactive media query; `< 900 px` layout | responsive logic |
| useKeyboardShortcuts / DEFAULT_SHORTCUTS / comboFromEvent | `src/hooks/useKeyboardShortcuts.ts` | global shortcuts (ignores inputs, modals, key-owning widgets) | new shortcuts |
| useCachedResource | `src/hooks/useCachedResource.ts` | SWR resource over dataCache `{ data, loading, error, refresh }` | server data in components |
| useServiceWorkerToasts | `src/hooks/useServiceWorkerToasts.ts` | SW signals → toasts | — |
| useUIState | `src/hooks/useUIState.ts` | persisted UI state (localStorage) | view prefs |
| useFocusTrap | `src/hooks/useFocusTrap.ts` | trap Tab, initial focus, restore | custom dialogs |
| useClickOutside | `src/hooks/useClickOutside.ts` | pointerdown outside refs | popovers |
| useLongPress | `src/hooks/useLongPress.ts` | touch long-press handlers (500 ms, 8 px) | mobile context menus |
| throttle / debounce | `src/lib/throttle.ts` | 100 ms default throttle; debounce with flush/cancel/pending | input/scroll handlers, autosave |
| cx | `src/lib/classNames.ts` | class-name joiner | all components |
| formatRelativeTime / moveNumberLabel / figurineSan / describeMove | `src/lib/format.ts` | display formatting | lists, cards |
| isHexColor / normalizeHex / luminance / readableOn | `src/lib/color.ts` | colour math | pickers, accent fg |
| uiStorage / cacheStorage / Storage | `src/lib/storage.ts` | sync key/value over localStorage | UI state |

## Shared SCSS (mixins · tokens)

| Name | Path | Purpose | Reuse for |
|---|---|---|---|
| `mobile` / `tablet` / `tablet-up` / `stacked` / `split` / `desktop` / `wide` | `styles/_responsive.scss` | breakpoint mixins (`stacked` = < 900 px app layout) | media queries |
| `fluid()` / `visually-hidden` / `respect-reduced-motion` | `styles/_mixins.scss` | clamp sizing, sr-only, motion | |
| `interactive` / `surface($level)` / `eyebrow` / `truncate` / `tabular` | `styles/_mixins.scss` | hover/active/focus/disabled; card surface; small-caps label; ellipsis; mono numerals | all components |
| `.visually-hidden` | `styles/global.scss` | sr-only utility class | markup |
| `--color-*` / `--space-*` / `--radius-*` / `--shadow-*` / `--ease-*` / `--dur-*` / `--z-*` / `--text-*` / `--control-*` | `styles/_tokens.scss` | CSS custom-property tokens (emitted once) | all components |
| `--font-display` / `--font-body` / `--font-mono` / `--font-figurine` | `styles/_tokens.scss` | font stacks | typography |
| `[data-theme='light']`, `[data-density='compact']`, `[data-motion='reduced']` | `styles/_themes.scss`, `global.scss` | runtime theme / density / motion | theming |
| `$bp-*` | `styles/_variables.scss` | Sass-only breakpoints (no CSS output — safe to `@use`) | mixins |
