# COMPONENT_INDEX.md — @chess/web

The **reuse manifest**. Read it before building anything; reuse, adapt or extend what is here.
Add a row for every new page, shared component, hook, utility, store, service or SCSS mixin.

**Placement:** pages → `src/pages/<Name>/` · features → `src/components/<feature>/` · primitives → `src/components/common/<Name>/` (barrel: `@/components/common`).

## Pages

| Page | Path | Purpose | Notes |
|---|---|---|---|
| Home | `src/pages/Home/` | `/` — MovesPanel for the active session, or StartCard (New game / Browse openings / Resume) | built |
| Sessions | `src/pages/Sessions/` | `/sessions` — grid of SessionCards; open → active + `/`; close | built, layout `wide` |
| Openings | `src/pages/Openings/` | `/openings` — browser: search, filters, sort, group by family, virtual list, preview (desktop card / mobile inline), Browse ⇄ Tree tabs; view state in the URL (`?q&color&eco&family&len&notes&fav&sort&group&view`) | built, layout `sheet` |
| OpeningDetail | `src/pages/OpeningDetail/` | `/openings/:id` — header, mini board + stepper, MoveList, theory notes along the line, popularity, continuations, Load / Fork / ★ | built, layout `sheet` |
| Games | `src/pages/Games/` | `/games?q&fav&sort&source&mode&result` — saved games: search, ★, sort, filters, VirtualList of GameRows, import/export PGN, empty state | built |
| Settings | `src/pages/Settings/` | `/settings/:section` — sections App · Board · Pieces · Theme editor · Engines · Clock · Server · Data (registry `sections.ts`; desktop nav beside content, mobile list → section) | built, layout `wide` |
| SettingsGroup / SettingsRow / SectionHeader | `src/pages/Settings/SettingsLayout.tsx` | titled card group, label + control row (`stacked` for wide controls), section heading | settings-like forms |
| LazySection | `src/pages/Settings/LazySection.tsx` | mounts another feature's section via `import.meta.glob` with a fallback (Engines, Server) | optional cross-feature UI |
| dataTransfer | `src/pages/Settings/sections/dataTransfer.ts` | `buildBackup` / `parseBackup` / `restoreBackup` (all repos as one JSON), `clearRuntimeCaches`, `storageEstimate`, `formatBytes`, `fetchDatasetManifest` | backups |
| Play | `src/pages/Play/` | `/play/new` lobby · `/play/:roomId` room (join gate, unavailable state) | built |
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
| PlayLobby / PlayUnavailable / GuestNameField | feature | `src/components/play/PlayLobby.tsx` | create room (time control, colour, name) + join by link; server-unavailable explanation; guest name input | online entry points |
| RoomView | feature | `src/components/play/RoomView.tsx` | in-room panel: share link, players, status, draw/resign, MoveList, chat, leave | — |
| RoomPlayers / OnlineClock | feature | `src/components/play/` | seats with presence + clock; read-only ticking `ClockState` display | any server-driven clock |
| ChatPanel / ShareLink | feature | `src/components/play/` | chat list + composer; read-only link + copy | room chat, share UIs |
| registerOnlineStage | util | `src/components/play/onlineStage.tsx` | stage move handler for online sessions + fallback clock slot | — |
| NowPlayingChip | feature | `src/components/shell/NowPlayingChip.tsx` | floating mini-board chip over mobile sheets → back to `/` | — |
| panelSlots | slot | `src/components/shell/panelSlots.ts` | `panelSlots.engine` — content for the route-less Engine tab | engine panel |
| BoardStage | feature | `src/components/stage/BoardStage.tsx` | **single board integration point**: active session → Board2D (settings + themes), player strips, mode badge, result banner, slots; ghost session when none open (first move opens one) | — |
| StageMiniBoard | feature | `src/components/stage/BoardStage.tsx` | MiniBoard for a session with active themes | cards, chips, thumbnails |
| boardViewModel / playerLabel / lastMoveOf / movableFor | util | `src/components/stage/boardModel.ts` | Session + settings → BoardViewModel (pure) | any board view of a session |
| stageSlots | slot | `src/components/stage/slots.ts` | `clockTop`, `clockBottom`, `side`, `evalBar`, `overlay` | clocks, eval bar, overlays |
| setStageMoveHandler / stageShapes | slot | `src/components/stage/slots.ts` | feature move handling per session mode (`movable`, `onMove`, `playerLabel`); feature arrows/marks | online play, engine arrows |
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
| SaveModal / SaveModalHost | feature | `src/components/controls/SaveModal/` | registers `save`/`saveAs`; Ctrl+S on a linked session quick-overwrites (toast), else modal; modal = "Overwrite '<name>'" vs "Save as new copy" + name/tags/notes | — |
| saveModalState | util | `src/components/controls/SaveModal/saveModalState.ts` | `requestSave`, `requestSaveAs`, `openSaveModal`, `submitSave`, `suggestedName`, `linkedGame` | programmatic save |
| TagsInput / mergeTags | feature | `src/components/controls/SaveModal/TagsInput.tsx` | chip tag editor (Enter/comma add, Backspace remove, suggestions) | any tag field |
| GameRow | feature | `src/components/games/GameRow.tsx` | saved game row (thumb, inline rename, opening/ECO, moves, result/mode/open badges, tags, ★, menu); `GAME_ROW_HEIGHT` | game lists |
| GameThumbnail | feature | `src/components/games/GameThumbnail.tsx` | MiniBoard of a FEN with active themes | any FEN thumbnail |
| GamesToolbar | feature | `src/components/games/GamesToolbar.tsx` | search (throttled) · ★ · sort · filters panel (source/opening, mode, result) | — |
| PgnImportModal | feature | `src/components/games/PgnImportModal.tsx` | file (multi, drag-drop) / paste → worker parse → preview → `savedGamesActions.addMany` | PGN import |
| gamesQuery | util | `src/components/games/gamesQuery.ts` | parse/serialize URL query, `filterGames`, `sortGames`, `queryGames`, `openingsAmong` (pure) | game filtering |
| gameOpening / gameActions | util | `src/components/games/` | `openingResolver(identifier)`; `openGame`, `deleteGameWithUndo`, `duplicateGame`, `renameGame`, `exportGame(s)` | saved-game UX |
| Board2D / MiniBoard / EvalBar / PromotionPicker | feature | `src/components/board/` | board renderer (owned by the board feature; see `board/index.ts`) | import only via `@/components/board` in BoardStage |
| EnginePanel | feature | `src/components/engine/EnginePanel.tsx` | Engine tab (`panelSlots.engine`): analysis toggle, engine select, depth/nodes/nps, MultiPV 1–5, PvLines, bot card / "Play vs bot" | — |
| PvLines | feature | `src/components/engine/PvLines.tsx` | MultiPV rows: White-POV score chip + numbered SAN (figurines); click plays first move, hover previews its arrow | any engine line list |
| EngineEvalBar | slot | `src/components/engine/EngineEvalBar.tsx` | `stageSlots.evalBar` wiring (analysis on + `board.showEvalBar`); thin edge strip when stacked | — |
| engineShapes / focusedLine | util | `src/components/engine/engineShapes.ts` | best-move arrows via `setStageShapes('engine')` (best opaque, rest lighter; hovered line alone) | — |
| pvToSan / evalBarLabel / compactNumber / linesToArrows | util | `src/components/engine/pvFormat.ts` | pure PV → SAN tokens, score labels, counts, arrows | engine displays |
| BotStatusCard | feature | `src/components/engine/BotStatusCard.tsx` | bot game status (engine · Elo · colour, thinking, history hint) + Takeback / Bot settings / Detach | — |
| EngineCard | feature | `src/components/engine/EngineCard.tsx` | catalog card: badges, Elo/size/license, pros/cons, status + Use / Download (progress) / Remove / Needs server | engine pickers |
| EngineSettingsSection | feature | `src/components/engine/EngineSettingsSection.tsx` | Settings → Engines: default engine, analysis defaults, human delay, cards ↔ comparison table, Maia import | mount lazily in Settings |
| registerEngineFeature | util | `src/components/engine/register.tsx` | registers Engine tab, eval bar, arrows, `openBot` command + BotModal host (called from `app/boot.ts`) | — |
| BotModal / BotModalHost / openBotModal | feature | `src/components/controls/BotModal/` | Play with Bot: engine (available only + reasons), Elo slider + presets, colour, think time, clock preset, takebacks; edits/detaches a running bot | — |
| botForm | util | `src/components/controls/BotModal/botForm.ts` | pure form model: `ELO_PRESETS`, `THINK_CHOICES`, `initialForm`, `toSetup`, `presetEnabled` | — |
| ServerSettingsSection | feature | `src/components/server/` | Settings → Server: URL + status badge + Check, sign-in / account + sign out, sync toggle + status + Sync now, guest name. Lazy: `import('@/components/server')` (named + default export) | server/account UI |
| OpeningRow / FamilyRow | feature | `src/components/openings/OpeningRow.tsx` | fixed-height (`OPENING_ROW_HEIGHT` 64) opening row: ★, name, ECO chip, SAN preview, popularity + W/D/L mini bars, side dot; collapsible family header | opening lists |
| OpeningPreview / LineMoves | feature | `src/components/openings/OpeningPreview.tsx` | preview of a line (never touches sessions): mini board, clickable moves, scrubber, Load / Fork here / ★ / Details; `layout` card or inline | any opening preview |
| PlyScrubber | feature | `src/components/openings/PlyScrubber.tsx` | step + range scrubber over a SAN line (`full` / `compact`) | line steppers |
| OpeningsToolbar | feature | `src/components/openings/OpeningsToolbar.tsx` | search (100 ms throttle → URL), side segmented, ★ only, filters panel (ECO, family, length, notes), sort, grouping, removable filter chips | — |
| ContinuationsList / mergeContinuations | feature | `src/components/openings/ContinuationsList.tsx` | next moves from a FEN: book graph (names + popularity) + live explorer W/D/L when the server is online | tree mode, detail page |
| OpeningsTree | feature | `src/components/openings/OpeningsTree.tsx` | Tree tab: continuations for the active session's position (click plays the move) + "lines from here" | — |
| DatasetNotes / NoteBody / useDatasetNote | feature | `src/components/openings/DatasetNotes.tsx` | Wikibooks theory for a position with attribution; registered into `notesSlots.dataset` | notes UIs |
| usePreviewLine | hook | `src/components/openings/usePreviewLine.ts` | local preview session for an opening at a ply (`setPly`, `step`, `plyOf`) | previews, steppers |
| loadOpening / forkOpeningAt / openingForkSession | util | `src/components/openings/actions.ts` | Load (reuses an untouched opening session per `settings.openings.loadReusesUntouched`) / fork at ply → new active session; marks recently viewed | opening actions |
| parseViewState / serializeViewState / viewStateUrl | util | `src/components/openings/urlState.ts` | openings browser state ⇄ URL query | links into the browser |
| buildListItems / itemKey | util | `src/components/openings/listModel.ts` | results → flat / grouped VirtualList items with an inline preview block | — |
| sanLine / plyLabel / compactCount | util | `src/components/openings/format.ts` | `1.e4 c5 2.Nf3`, `2…Nc6`, `1.2k` | move/count labels |
| registerOpeningsFeature | util | `src/components/openings/register.ts` | dataset-notes slot + global `focusSearch` (→ `/openings`); called from `app/boot.ts` | — |
| Clock | feature | `src/components/clock/Clock.tsx` | one side's clock: core `formatClock` (tenths < 10 s), low-time pulse, flag, running dot, tap to pause/resume; variants `strip` / `side` / `overlay`, `rotated` (tabletop) | any session clock display |
| ClockConfigForm | feature | `src/components/clock/ClockConfigForm.tsx` | time-control picker: presets + custom minutes/increment + delay, summary + category | Settings → Clock, NewGameModal |
| ClockController / clockController | service | `src/components/clock/ClockController.ts`, `clockService.ts` | DI'd driver: presses on new moves, ticks only while running (`now` signal), flag → `result {reason:'timeout'}`, pauses on game end / hidden tab / inactive local tab, low-time callback; skips `online` | any local clocked session |
| registerClockSlots / installClockFeature | util | `src/components/clock/ClockSlots.tsx`, `install.ts` | registers clocks into `stageSlots` per `settings.clock.placement`; installer starts the controller + move sounds (called from `app/boot.ts`) | — |
| resolveClockConfig / describeClockConfig / clockCategory | util | `src/components/clock/clockConfig.ts` | clock settings → `ClockConfig`, `'5+3 d2'`, Bullet/Blitz/Rapid/Classical | time-control labels |
| NewGameModal / GameDialogsHost | feature | `src/components/controls/NewGameModal/` | New game: Analysis / 2 players / vs Bot (→ `openBot`), start position initial / current / FEN, clock + time control, auto-flip, tabletop; host also renders Resign / Draw offer dialogs. `installNewGameFeature()` registers `newGame`, `resign`, `offerDraw` | — |
| newGameForm / startNewGame | util | `src/components/controls/NewGameModal/newGameForm.ts`, `startNewGame.ts` | pure form model (`validateNewGame`, `buildNewGamePlan`) + executor | — |
| startPvpController / autoFlipOrientation | util | `src/components/controls/NewGameModal/pvpController.ts` | local-pvp auto-flip after each new move | — |
| resignSession / agreeDraw | util | `src/components/controls/NewGameModal/GameEndDialogs.tsx` | set `result` resign / draw-agreed | local game end |
| ThemeEditor | feature | `src/components/theme/ThemeEditor.tsx` | clone board/piece theme → edit (colours, texture, highlights, coords, border / piece colours, shading, shadow) → live Board2D preview → save (new or in place) → active; custom list use/edit/rename/delete(undo)/export; JSON import | — |
| BoardThemeCard / PieceThemeCard | feature | `src/components/theme/ThemeCards.tsx` | radio gallery cards: MiniBoard thumbnail / piece strip + author, licence, "Personal use" badge; wrap in `.theme-gallery` | theme pickers |
| PieceSetPreview | feature | `src/components/theme/PieceSetPreview.tsx` | piece strip (roles × white/black) from a sprite + piece theme, optional board squares | piece previews |
| ColorField / AlphaColorField | feature | `src/components/theme/pickers.tsx` | compact ColorPicker field; colour + opacity (rgba) | theme colours |
| themeEditorModel / themeIO / colorAlpha | util | `src/components/theme/` | `startBoardDraft/startPieceDraft/saveThemeDraft`; `exportThemes/importThemes` (validated, re-id'd), `downloadText`, `readFileText`; `parseCssColor/formatCssColor/hexOf` | theme logic |
| InstallPrompt / PwaLayer | feature | `src/components/pwa/` | Dismissible "Install Chess Openings" card (native prompt on Chromium, Share → Add to Home Screen hint on iOS Safari, hidden when standalone). `registerPwaFeature()` mounts `<PwaLayer/>` in `#pwa-layer` + starts the persistence watcher (idempotent; called from `app/boot.ts`) | install UI |

## State stores (`src/state/`, barrel `@/state`)

| Store | Path | Read | Write |
|---|---|---|---|
| registry | `state/registry.ts` | `registeredStores()` | `defineStore`, `initStores`, `flushStores` |
| settings | `state/settings.ts` | `settings`, `settingsLoaded`, `DEFAULT_SETTINGS`, types `AppSettings`, `BoardDisplaySettings`, `ClockSettings` (incl. `custom`, `delayMs`), `animationScale`, `board.arrowColor`, `pieceDepthOverrides` | `updateSettings`, `replaceSetting`, `resetSettings`, `deepMerge` |
| sessions | `state/sessions.ts` | `openSessions`, `activeSession`, `activeId`, `sessionCount`, `sessionsRestored`, `getSession`, `isAtLineEnd`, `isAtStart`, `cursorNode`, `onSessionEvent` | `sessionsActions.*`, `flushSessions` |
| savedGames | `state/savedGames.ts` | `savedGames`, `savedGamesLoaded`, `getSavedGame` | `savedGamesActions.*` |
| favorites | `state/favorites.ts` | `favoriteOpeningIds`, `favoriteGameIds`, `isFavorite` | `toggleFavorite`, `setFavorite` |
| rooms | `state/rooms.ts` | `currentRoom`, `mySeat`, `myColor`, `isMyTurn`, `pendingMove`, `roomChat`, `roomConnection`, `roomError`, `roomsAvailable`, `roomsUnavailableReason`, `roomsClient()` | `roomsActions.*`, `setRoomsClient` (tests) |
| playback | `state/playback.ts` | `activeIsPlaying`, `playback.playing`, `playback.isPlaying(id)` | `playbackActions.play/pause/toggle/setSpeed` |
| themes | `state/themes.ts` | `boardThemes`, `pieceThemes`, `pieceSets`, `customBoardThemes`, `customPieceThemes`, `activeBoardTheme` (+ arrow colour), `baseActivePieceTheme`, `activePieceTheme` (+ colour / depth overrides), `activePieceSet` | `themesActions.saveBoard/savePiece/remove` |
| notes | `state/notes.ts` | `userNotes`, `noteFor`, `isNoteLoaded` | `loadNote`, `saveNote` |
| openingIdentity | `state/openingIdentity.ts` | `openingIdentifier` | `setOpeningIdentifier` |
| openings | `state/openings.ts` | `openingIndex` (`OpeningIndex \| null`), `openingsReady`, `openingsStatus`, `openingsError`, `openingsManifest`, `openingFamilies`, `recentOpeningIds`, `openingSearch()`, `openingById` | `loadOpenings` (idempotent; boot starts it ~300 ms after paint, then sets the opening identifier), `retryLoadOpenings`, `loadDatasetNote(fen)`, `markOpeningViewed`, `clearRecentOpenings` |
| engines | `state/engines.ts` | `engineEntries`, `availableEngines`, `engineEntry`, `downloads`, `analysisPrefs`, `analysisEngineId`, `analysis`, `analysisStatus`, `analysisError`, `isBotThinking`, `botError`, `botTip`, `isAtBotTip`, `getEngineRegistry` | `enginesActions.refresh/download/cancelDownload/remove/importMaia/setDefault`, `analysisActions.setEnabled/toggle/setMultiPv/setEngine`, `botActions.attach/detach/takeback/takebackPlies/updateConfig`, `setEngineRegistry` (tests) |
| auth | `state/auth.ts` | `authUser`, `isLoggedIn`, `authBusy`, `authError`, `guestName`, `displayName`, `accessToken()` | `authActions.login/logout/refresh/ensureAccessToken/roomToken/setGuestName/clearError`, `configureAuth` (tests) |

## Services

| Name | Path | Purpose | Reuse for |
|---|---|---|---|
| repositories | `src/services/db` | `getRepositories()` / `setRepositories()`; Sessions/SavedGames/Favorites/Themes/Notes/Settings/Kv interfaces + Dexie impl (`ChessDb`) | all persisted local data |
| api | `src/services/api` | `api` (delegates Http ↔ Mock by server status), `ApiClient`, `HttpApiAdapter`, `MockApiAdapter`, `ApiRequestError`, `setAuthTokenProvider`, `apiKind` | server-only data |
| mock fixtures | `src/mock/data/*.json` | health, user, explorer, engines, rooms | MockApiAdapter |
| serverConnector | `src/services/server` | probe `/health`; `status`, `url`, `health`, `networkOnline`, `isOnline`; `start/configure/probe/stop` | feature gating |
| sync | `src/services/sync` | `SyncService` (DI'd /sync push + LWW merge + tombstones), app `syncService`, `startSync/stopSync/syncNow`, `syncStatus`, `lastSyncAt`, `lastSyncError`; pure `lwwWinner`, `mergeSync`, `mergeKind` | server sync of saved games + sessions |
| dataCache | `src/services/cache` | TTL cache (`get/peek/set/getOrFetch/load`), IndexedDB/memory backends | fetched/derived data |
| commands | `src/services/commands` | `CommandBus` / `commands` (register stack, dispatch, onDispatch) | shortcuts, menus |
| realtime | `src/services/realtime` | `RoomsClient` (socket.io `/play`, acks, reconnect + resync), `RoomError`, pure `syncTree`/`roomSessionPatch`/`parseRoomRef`/`roomLink` | online rooms, future WS features |
| openings | `src/services/openings` | `loadOpeningsDataset` / `loadManifest` / `loadNotesChunk` (manifest network-first, hashed files cache-first in Cache Storage `chess-openings-data`, stale pruning); `createOpeningSearch` (MiniSearch in a Web Worker, local fallback); pure `createSearchEngine`, `parseSearch` (name / alias / ECO / SAN-sequence queries + filters + sorts) | openings data + search |
| sound | `src/services/sound` | `sound.play(kind)` — synthesized WebAudio move / capture / check / lowTime / gameEnd / notify (no assets); `SoundService` (settings source injected), pure `soundForTransition` | app sounds |
| PlaybackController | `src/services/playback` | DI'd auto-stepper (play/pause/toggle/retime, `playing` signal) | any timed stepping |
| toast | `src/services/toast` | `toast.show/info/success/warn/error/dismiss/clear`, id dedupe, sticky, actions | user feedback |
| sw | `src/services/sw` | `sw.ts` (Workbox precache + runtime caching); `routes.ts` (pure matchers: `isApiRequest`, `isEngineAsset`, `NAVIGATION_DENYLIST`); `registerServiceWorker`, `swNeedRefresh`, `swOfflineReady`, `applyServiceWorkerUpdate`; `install.ts` (`canInstall`, `showInstallPrompt`, `iosInstallHint`, `promptInstall`, `dismissInstall`, `resetInstallDismissal`); `persist.ts` (`requestPersistentStorage`, `watchFirstSaveForPersistence`) | PWA |
| pgn | `src/services/pgn` | `parsePgn` (Web Worker, main-thread fallback), `parsePgnImports`, `savedGameFromImport`, `savedGameToPgn`, `savedGamesToPgn`, `downloadText`, `pgnFileName` (Tags / Annotation headers round-trip) | PGN import/export |
| createSlot | `src/app/slots.tsx` | typed extension slot (`register` → unregister, `Render` with fallback) | new extension points |

## Shared hooks & utilities

| Name | Path | Purpose | Reuse for |
|---|---|---|---|
| useTheme / useApplyAppearance / resolveTheme | `src/hooks/useTheme.ts` | light/dark/system; applies data-theme, density, motion, accent, font scale, animation speed (scales `--dur-*`) | theme toggles |
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
