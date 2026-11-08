# Area analysis: terminal

Scope: `src/modules/terminal/`, `packages/ghostty-core/`, bundled symbol fonts, `src/styles/terminalTheme.ts`,
renderer profiling/visual scripts, `src-tauri/tests/ghostty_artifacts.rs` (343 files, see `terminal.json`).

## How it works today

**Layering (frontend only; PTY processes live in Rust, area backend-core).**

1. `TerminalStack` (`TerminalStack.tsx:28-117`) gets the whole `Tab[]` from the tabs module, keeps the
   live terminal tabs (`selectLiveTerminals`, `lib/liveTerminals.ts:7-9`: kind `terminal` and not `cold`) and renders
   one absolutely positioned layer per tab. Inactive tabs are hidden with `visibility:hidden` + `pointerEvents:none`
   (`TerminalStack.tsx:96-104`) and **never unmounted**. Callbacks are routed through stable per-leaf "bundles"
   held in refs (`TerminalStack.tsx:54-75`) so re-renders don't remount panes. An empty
   `[data-terminal-area]` div (`TerminalStack.tsx:85-89`) is the host the shared WebGPU canvas attaches to.
2. `PaneTreeView` (`PaneTreeView.tsx:31-82`) walks the `PaneNode` tree (`lib/panes.ts:15-23`) recursively:
   leaves render a `TerminalPane`; splits render a `ResizablePanelGroup` (`row`→`horizontal`, `col`→`vertical`,
   `PaneTreeView.tsx:68-70`) keyed by a stable `slotId` so swapping panes does not remount. No ratios are stored;
   panels start equal (`minSize="10%"`, `PaneTreeView.tsx:75`). Resize handles bracket a "resize interaction"
   (`lib/terminalResizeInteraction.ts`) that throttles PTY resizes during drags.
3. `TerminalPane` (`TerminalPane.tsx:200-221`) picks the backend once per pane from the `terminalRenderer`
   preference (`backend/selection.ts:91-99`) and renders `GhosttyTerminalPane`, which calls
   `useGhosttyTerminalSession` and reapplies the theme on theme change (`TerminalPane.tsx:84-90`). It also shows a
   Terax-styled error/retry card (`TerminalPane.tsx:166-194`).
4. `useGhosttyTerminalSession` (1.3k lines) keeps a **module-level `sessions` map keyed by leafId**
   (`ensureSession`, `useGhosttyTerminalSession.ts:516`). Initialization (`~:600-900`): wait for fonts and
   measure metrics, load the Ghostty WASM model (`GhosttyCoreRuntime.ts`), create a WebGPU surface or fall back to
   WebGL (`:752-833`), wire input, then call `openPty(...)` (`:832-858`) with `cols/rows`, `initialCwd`,
   `blocks`, `preferences.terminalShell`, `leafId` and the theme colors. Output bytes go into `model.write`; damage
   triggers presentation through the window frame pacer. `respawnGhosttySession` (`:476-510`) bumps a
   `generation` counter to fence late async work.
5. **Output transport**: `lib/pty-bridge.ts` → one `PtyOutputHub` per webview polling a custom URI scheme
   `terax-pty` with fetch (`pty-bridge.ts:28-60`), framed by `ptyWire.ts`, acknowledged for backpressure, with
   per-leaf presentation classes (`ptyPresentation.ts`) so hidden panes are deprioritised (5.4:5).
   Input goes through `invoke("pty_write", bytes, {headers:{x-pty-id}})` (`pty-bridge.ts:202-208`).
6. **Model** (`packages/ghostty-core`): libghostty-vt compiled to WASM (SIMD + scalar builds) with a Zig bridge
   (`adapted/wasm/src/terax.zig`) that parses VT, keeps scrollback, and emits semantic events (OSC 7 `pwd`,
   OSC 133 prompt/command marks, OSC 52, title, bell, notifications). Scrollback is a global budget
   (192 MiB, floor 2 MiB/terminal; `ghostty/core/scrollbackBudget.ts:5-24`).
7. **Renderers**: WebGPU (`ghostty/gpu/`) draws all panes of a window into **one canvas**
   (`WebGpuWindowCanvas.ts`, `alphaMode:"opaque"` at `:195,:314`) using viewport/scissor per pane; glyph atlases
   are shared per font spec (max 8, `WebGpuTerminalRuntime.ts:34,380-399`). WebGL (`ghostty/webgl/`, adapted from
   xterm.js addon-webgl) uses a pool of up to 12 contexts leased to visible panes (`WebGlTerminalRuntime.ts:22,133-142`).
8. **Semantic events** are routed by `GhosttySemanticEventRouter` (`ghostty/core/GhosttySemanticEventRouter.ts:22-71`):
   OSC 7 only accepted between commands, OSC 133 drives prompt/command state used by blocks, prompt injection
   and resize-prompt hold.
9. **Blocks mode**: optional per-tab Warp-like mode (`tab.blocks`) with an overlay per command, a custom shell line
   editor (`block/lib/shellEditor.ts`), completions and history. Blocks tabs cannot be split (`useTabs.ts:1364`).

Lifecycle: pane mount → session created/initialized → PTY opened; tab hidden → `visible=false` (surface detached
from presentation, PTY and model live); pane removed from the tree → `disposeSession(leafId)`
(`lib/terminalSessionApi.ts:174-178`) by the tabs module.

## Interfaces

**Tauri commands invoked from this area**: `pty_open`, `pty_write`, `pty_resize`, `pty_set_colors`, `pty_close`,
`pty_stream_open` (`lib/pty-bridge.ts:56,166-176,202-219`); `pty_has_foreground_process`
(`useGhosttyTerminalSession.ts:443`); `fs_stat`, `fs_canonicalize` (`lib/terminalLinks.ts:179,187`).
`pty_open` args: `cols, rows, cwd, workspace, blocks, shell, paneId, presentation, colors`.

**URI scheme**: `terax-pty` (`poll`, `ack`) via `convertFileSrc(path,"terax-pty")` (`pty-bridge.ts:40`).

**Events listened**: `terax:agent-signal` (`lib/agentActivity.ts:142`).

**Tauri plugins used**: opener `revealItemInDir`, os `hostname`, path `homeDir` (`terminalLinks.ts:2-4`).

**Persisted keys**: localStorage `terax.experimental.terminal-backend` (`backend/selection.ts:4`). Preferences read
(owned by settings): `terminalShell`, `terminalRenderer`, `terminalScreenReader`, `terminalFontFamily/Weight/Size`.

**Env vars**: build-time `VITE_TERMINAL_BACKEND` (`selection.ts:26`). The shell sees `TERAX_BLOCKS` set by the
backend (asserted in `shellBlockCompatibility.test.ts:22-30`). Dev scripts read `TERAX_PROFILE_*`, `TERAX_SOAK_*`,
`TERAX_VISUAL_*`, `TERAX_WEBKIT_*`, `TERAX_LAB_*`.

**Files on disk**: bundled WASM (`packages/ghostty-core/adapted/*.wasm`), fonts `src/assets/fonts/*.woff2`,
license texts.

**Public TS API** (`src/modules/terminal/index.ts`): `TerminalStack`, `TerminalPaneHandle`
(`write/writeAtPrompt/focus/getBuffer/getSelection`), pane-tree helpers (`findLeafCwd`, `hasLeaf`, `leafIds`,
`PaneNode`), session helpers (`whenSessionReady`, `writeToSession`, `disposeSession`, `ptyIdForLeaf`,
`leafIdForPty`, `leafHasForegroundProcess`, `clearFocusedTerminal`, `navigateFocusedBlocks`),
`useAgentActivityStore`/`subscribeAgentSignals`, `useTerminalFileDrop`, `isTerminalSurfaceTarget`. Deep imports
also exist (`lib/panes`, `lib/terminalSessionApi`, `lib/agentActivity`, `ghostty/renderScheduling`,
`ghostty/windowPresentation`, `ghostty/input/macOptionAsAlt`, `ghostty/input/terminalWheel`,
`block/lib/history`, `search/TerminalSearchController`).

## Couplings

Outbound (terminal → other areas):

| From | To | Why |
|---|---|---|
| `TerminalStack.tsx:1`, `lib/liveTerminals.ts:1` | tabs (`Tab`, `TerminalTab`) | stack input type, cold tabs |
| `TerminalPane.tsx:1`, `useGhosttyTerminalSession.ts:17`, `lib/useTerminalFont.ts:1`, `lib/terminalDiagnostics.ts:4` | settings/preferences | shell, renderer, fonts, screen reader |
| `backend/selection.ts:1` | settings/store | `TerminalRendererSetting` |
| `TerminalPane.tsx:3`, `lib/useTerminalFont.ts:2`, `block/ShellInput.tsx:4` | theme | resolved mode, font resolution |
| `ghostty/gpu/terminalVisuals.ts:1`, `src/styles/terminalTheme.ts:1` | styles/tokens | terminal colors from CSS tokens |
| `useGhosttyTerminalSession.ts:2-3,730-751` | workspace, spaces | link activation "is current" guard |
| `lib/pty-bridge.ts:21`, `block/lib/pathComplete.ts:2`, `block/lib/shellSyntax.ts:2`, `lib/terminalLinks.ts:18` | workspace | WSL/local env |
| `lib/terminalLinks.ts:17,202` | lsp/editor (`getLspNavigator().openFile`) | open file:line links in editor |
| `lib/terminalLinks.ts:179,187` | backend fs commands | link path stat/canonicalize |
| `block/BlockOverlay.tsx:12,265` | ai (`useChatStore.attachSelection`) | "attach block to chat" |
| `block/BlockWatermark.tsx:2`, `block/ShellInput.tsx:3` | shortcuts | shortcut labels |
| `PaneTreeView.tsx:5`, `block/BlockOverlay.tsx:10` | components/ui | resizable, dropdown |
| `lib/agentActivity.ts:142` | backend agent detector | `terax:agent-signal` |

Inbound (other areas → terminal): `app/App.tsx:109-112`, `app/components/WorkspaceSurface.tsx:8`,
`app/components/WorkspaceInputBar.tsx:7-8`, `app/hooks/useAppCloseGuard.ts:17`, `app/hooks/useTabCloseGuards.ts:18`,
`tabs/lib/useTabs.ts:20-21`, `tabs/TabBar.tsx:29`, `tabs/lib/tabAgentStatus.ts:5`, `tabs/lib/useWindowTitle.ts:3`,
`spaces/lib/serialize.ts:5`, `spaces/lib/useSpacesBoot.ts:5`, `control/lib/context.ts:2`,
`agents/lib/launcher.ts:1`, `agents/components/AgentNotificationsBridge.tsx:6`, `ai/lib/useAiLiveBridge.ts:9`,
`ai/tools/agent.ts:4`, `ai/hooks/useSelectionAskAi.ts:1`, `explorer/FileExplorer.tsx:63`,
`command-palette/commands.ts:3`, `command-palette/hooks/useCommandHistory.ts:1`, `header/SearchInline.tsx:7`,
`settings/store.ts:27,31`, `settings/sections/GeneralSection.tsx:45`, `src/bench/*`, `src/main.tsx:9`.

## "terax" mentions

**(a) Phase 0 identity isolation** — none is *owned* by this area, but these depend on Phase 0 work elsewhere:
- `terax-pty` URI scheme (`lib/pty-bridge.ts:28-47`): registered by the backend per app; not shared with an
  installed Terax at runtime, but renamed together with backend-core if that area renames it.
- `TERAX_BLOCKS` env var exported to shells (backend-owned; asserted by `ghostty/shellBlockCompatibility.test.ts:22-30`)
  and `_terax_precmd` / `_terax_finish_prompt` shell functions (asserted by `bashPromptHooks.test.ts`,
  `shellReports.test.ts`). These are visible in the user's shell environment; Phase 0 env-var isolation in
  backend-core must update these tests.
- `terax:agent-signal` event name (`lib/agentActivity.ts:142`): in-process only; rename with the backend emitter.
- localStorage `terax.experimental.terminal-backend` (`backend/selection.ts:4`): isolated automatically once the
  bundle id / WebView data dir change (F0:10); otherwise internal.
- `app.crynta.terax.renderer-lab` (`scripts/renderer-profile/Lab.swift`): a dev-only macOS lab bundle id.
  Not shipped; rename on touch.

**(b) Visual rebranding**: `"[terax]"` console prefixes are developer-facing only; no user-visible "Terax" text in
this area's UI (error card strings are generic). Test fixtures use `terax.dev` URLs and OSC titles "Terax"
(`AdaptedGhostty.test.ts:224,675,700,715`) — not user-visible.

**(c) Internal — rename on touch only**: package `@terax/ghostty-core` and all `TeraxGhostty*` types/classes
(~300 occurrences in `packages/ghostty-core/lib/adapted/*` and tests), `terax.zig`, `terax_ghostty_terminfo.zig`,
`terax-ghostty-vt.wasm`; DOM attributes `data-terax-terminal-surface`, `data-terax-terminal-canvas`,
`data-terax-ghostty-surface`, `data-terax-block-prompt`; debug globals `window.__teraxTerm*`,
`__teraxLiveResize`, `__TERAX_BENCH__`, `__TERAX_TERMINAL_RESIZE_INTERACTION__`; font assets
`terax-terminal-symbols(-mdi).woff2`; WebGPU labels "Terax terminal …"; dev-script env vars `TERAX_PROFILE_*`,
`TERAX_SOAK_*`, `TERAX_VISUAL_*`, `TERAX_WEBKIT_*`, `TERAX_LAB_*`, `TERAX_RENDERER_DIST`; comments and
UPSTREAM/FORK docs ("Terax-specific changes").

## Risks

- **Mount invariants**: any new navigation must keep passing the same `TerminalStack` element tree; changing the
  key of a tab layer or a `slotId` remounts panes and respawns PTYs (5.4:1-3, 3.4:invariant).
- **Shared canvas**: WebGPU canvas is opaque and cleared with the first pane's background
  (`WebGpuWindowCanvas.ts:403`); per-pane transparency/background images are not a parameter change.
- **Atlas budget**: each distinct font spec (family/size/weight/letter-spacing × zoom) costs one atlas; >8 distinct
  specs per window throws (`WebGpuTerminalRuntime.ts:383-386`). Per-profile fonts make this reachable.
- **WebGL pool**: >12 visible WebGL panes per window fails (`WebGlTerminalRuntime.ts:22`).
- **Silent link failures** if the fs backend module is removed with the explorer (`terminalLinks.ts:179-191` swallow errors).
- **Session module size** (`useGhosttyTerminalSession.ts` ~1.3k lines) with generation fencing: profile/launch
  changes must be narrow and tested.
- **Shell integration tests** hard-code `TERAX_BLOCKS` and `_terax_*` names; Phase 0 env renames break them.
- **macOS-only tooling** (`scripts/renderer-profile`, `scripts/ghostty-webkit-memory`) can't be run on Windows.

## Open questions

1. Keep or remove the command-blocks mode (Warp-like blocks + custom shell input)? It is not in the proposal and
   its UI is Terax design. (terminal-D13)
2. What does lut call splits in UI and shortcuts? Proposal TER-004 says "horizontales/verticales", which is
   ambiguous (tmux/vim "horizontal split" = stacked). Suggest "split right / split down".
3. Pane limit: keep 4 per tab, raise (e.g. 8), or make it a setting? (owned by tabs/navigation area)
4. Is per-profile opacity / background image required for v1 (7.1 lists `opacity`)? It needs a spike.
5. Should OSC 0/2 titles be allowed to rename tabs (PRO-013 `allowShellTitle`) and should BEL / OSC 9/777
   notifications reach the notifications system? Today they are parsed but dropped.
6. When the editor is not installed/enabled, should file:line links open with the OS default app, reveal in the
   file manager, or open a configurable external editor command?

## Answers

**1. MAX_PANES_PER_TAB.** It is enforced **per tab**, outside this area: defined at `src/modules/tabs/lib/useTabs.ts:31`
(`= 4`), checked in `splitActivePane` (`useTabs.ts:1365`, `leafIds(t.paneTree).length >= MAX_PANES_PER_TAB`) and
used to disable the palette command (`src/modules/command-palette/commands.ts:81`). Nothing in the terminal area
limits panes. Cost of raising/removing: WebGPU draws every pane into one window canvas with per-pane viewport,
so extra panes cost a draw pass + per-surface buffers, not a context; atlases are per font spec, not per pane
(max 8). WebGL fallback is capped at 12 leased contexts per window (`WebGlTerminalRuntime.ts:22`), so the real
hard ceiling under WebGL is ~12 *visible* panes per window. Scrollback uses a global 192 MiB budget shared
fairly with a 2 MiB floor (`scrollbackBudget.ts:17,24`): more panes means less scrollback each, not unbounded
memory. Each pane also has its own WASM model instance (memory) and PTY. Raising to ~8 looks safe; removal
needs a cap tied to the WebGL pool.

**2. Split naming.** `SplitDir = "row" | "col"` (`lib/panes.ts:3`). `row` lays children side by side
(x advances, `panes.ts:204-206`) and maps to `ResizablePanelGroup orientation="horizontal"`
(`PaneTreeView.tsx:68-70`); `col` stacks them vertically. App shortcuts: `pane.splitRight` → `"row"`,
`pane.splitDown` → `"col"` (`src/app/App.tsx:929-930,1290-1291`). `splitLeaf` appends to an existing same-direction
parent instead of nesting (`panes.ts:84-103`). Note the palette keyword mismatch: "split down" lists keyword `row`
(`command-palette/commands.ts:208`).

**3. Theme scope.** The *source* is global: `readTerminalGpuTheme()` reads CSS tokens (`gpu/terminalVisuals.ts:1`,
`src/styles/terminalTheme.ts:3-27`) and every `TerminalPane` re-applies it when the app theme changes
(`TerminalPane.tsx:84-90`). The *application* is per pane: `applyThemeToSession` sets model colors, calls
`surface.setTheme(theme)` and `pty.setColors` (`useGhosttyTerminalSession.ts:326-338`), and each WebGPU surface
draws its own background (`WebGpuTerminalSurface.ts:427,540-548`). Fonts are also per session
(`useGhosttyTerminalSession.ts:161-216`, `updateSessionFont` `:1190-1205`). So per-pane/per-profile theme colors and
font are cheap: pass an override into the session instead of the global resolver (no process restart, 13.2:19);
cost is atlas count (one per distinct font spec, max 8). Background image and opacity are expensive: the window
canvas is `alphaMode:"opaque"` and cleared with the first pane's background (`WebGpuWindowCanvas.ts:195,314,403`);
supporting them needs premultiplied alpha, a transparent Tauri window or DOM image layered under the canvas
per pane rect, alpha in background shaders for both WebGPU and WebGL, and contrast handling — spike first.

**4. Dependencies on editor/explorer/git/preview/AI.**
- Editor: `lib/terminalLinks.ts:17,175,202` — `getLspNavigator()?.openFile(path,line)` for file links. When the editor
  is removed, `navigator` is null and the click silently does nothing. lut: inject an "open path" capability; fallback
  to OS default opener / reveal (terminal-D11).
- fs backend (used by explorer): `terminalLinks.ts:179,187` (`fs_stat`, `fs_canonicalize`). Keep these commands even
  if the explorer goes (cross-area).
- AI: `block/BlockOverlay.tsx:12,265` attach block output to the AI chat. Remove (terminal-D12). Inbound:
  `ai/hooks/useSelectionAskAi.ts:1` (uses `isTerminalSurfaceTarget` for "Ask AI" on terminal selection),
  `ai/lib/useAiLiveBridge.ts:9` and `ai/tools/agent.ts:4` (read/write terminal sessions) — disappear with the AI
  area; no change needed here.
- Explorer: inbound only, `explorer/FileExplorer.tsx:63` uses `TerminalPathDropTarget`; dropping still works from
  the OS.
- Git, preview: no dependency found in this area.
- Spaces/workspace: `useGhosttyTerminalSession.ts:2-3,730-751` only for the link "still current" guard.

**5. Shell integration.** OSC 7 and OSC 133 are parsed inside the WASM bridge (`packages/ghostty-core/adapted/wasm/src/terax.zig`)
and surfaced as events (`pwd`, `prompt-start`, `prompt-end`, `end-of-input`, `end-of-command`) handled by
`GhosttySemanticEventRouter.ts:28-71`; `parseOsc7` (`lib/osc-handlers.ts:5-28`) normalises Windows/cmd/MSYS paths.
The shell-side emitters are the backend's shell integration (pty/session.rs, `TERAX_BLOCKS`). Fallbacks when the shell
emits nothing: cwd stays the `initialCwd` (`useGhosttyTerminalSession.ts:741`); `promptIntegrated` stays false so
`writeAtPrompt` refuses typed injection (`lib/promptInjection.ts:4-20`); foreground-process checks go to native
`pty_has_foreground_process` (`useGhosttyTerminalSession.ts:443`); `whenSessionReady` resolves on PTY+model ready or a
4 s timeout (`terminalSessionApi.ts:25-37`, `useGhosttyTerminalSession.ts:412-424`), never on a prompt. Blocks mode
degrades to plain. OSC title/bell/notification events are parsed but not wired (router callbacks unused).

**6. Renderer selection.** `terminalBackendFor(setting)` (`backend/selection.ts:91-99`): `webgl` → WebGL; `webgpu` →
WebGPU if `navigator.gpu`, else WebGL; `auto` → `VITE_TERMINAL_BACKEND` or localStorage override, default
`ghostty-webgpu`, falling back to WebGL without WebGPU. Chosen once per pane (`TerminalPane.tsx:205-207`). At runtime
WebGPU creation/attachment errors fall back to WebGL preserving the model and PTY (`useGhosttyTerminalSession.ts:752-822`).
xterm.js-derived code: `src/modules/terminal/ghostty/webgl/` (WebGlCellRenderer, WebGlGlyphAtlas, WebGlTerminalSurface,
runtime pool), from `@xterm/addon-webgl` 0.20.0-beta.298 commit 8c9b9fd (`webgl/UPSTREAM.md`). Obligations: MIT —
keep the copyright + permission notice (`webgl/LICENSE.xterm-js`) in source and in distributed binaries'
third-party notices; Ghostty and Restty are also MIT (`packages/ghostty-core/adapted/LICENSE.ghostty`,
`LICENSE.restty`); symbol fonts are OFL-1.1/Nerd Fonts (`src/assets/fonts/OFL.txt`, `LICENSE.nerd-fonts`,
`public/licenses/terminal-symbols.txt`). Modified files also fall under Terax's Apache-2.0 §4b notice (14.3:3).

**7. Opening a tab with a profile.** Entry points, in order:
- Tab/pane model: `PaneNode` leaf (`lib/panes.ts:15-16`) only has `id`, `slotId`, `cwd` → add `profileId`
  (and optional per-pane overrides) so restore keeps it (PRO-009, PRJ-005). Tab title/color/icon belong to the
  navigation model (tabs area) and are read from the resolved profile.
- `TerminalStack`→`PaneTreeView`→`TerminalPane` props (`PaneTreeView.tsx:45-55`, `TerminalPane.tsx:30-45`) pass only
  `initialCwd`, `blocks` → add a resolved `launch` (executable, args, env, cwd, environment native/WSL) and
  `appearance` (theme id/colors, font, cursor, scrollback).
- `useGhosttyTerminalSession` → `openPty` (`useGhosttyTerminalSession.ts:832-858`) reads `preferences.terminalShell`
  globally → use the launch spec; `font` (`:161-170`) and `applyThemeToSession` (`:326`) → use the appearance spec.
- `openPty`/`pty_open` (`lib/pty-bridge.ts:110-176`) has `shell` but no `args`/`env` and `workspace` comes from
  global `currentWorkspaceEnv()` (`pty-bridge.ts:169`) → needs per-launch environment; backend `pty_open` must accept
  `args`, `env` (backend-core).
- Scrollback per profile: model creation in `GhosttyCoreRuntime.ts` (budget request).
- Icon / tab title / tab color: not terminal concerns; navigation consumes the profile.

## Draft issues

### terminal-D01 — Design: terminal pane chrome (error state, split divider, drop target)
```yaml
id: terminal-D01
depends-on: []
refs: [UX-006, UX-010, UX-011, 5.4]
covers: [UX-010]
type: design
scope: ui
size: S
```
**Goal:** The user designs how a pane looks in its non-content states: renderer/PTY error with retry, split
divider and its hover/drag state, focused vs unfocused pane, file-drop target.

**Acceptance criteria:**
- [ ] Design for error/retry state (renderer vs startup failure).
- [ ] Design for split divider, focused pane indication and drop target.

### terminal-D02 — Decouple TerminalStack from the tabs `Tab` type
```yaml
id: terminal-D02
depends-on: []
refs: [5.4, 5.10:3, 10.1:1, 10.3:1, 6.2:2]
covers: [terminal/pane-host, 5.4:3, 10.1:1, F1:2]
type: task
scope: ui
size: S
```
**Goal:** `TerminalStack` takes a minimal `TerminalStackEntry { id, paneTree, activeLeafId, blocks }[]` instead of
`Tab[]`, so the new navigation can feed it without importing tabs internals. Pure refactor.

**Acceptance criteria:**
- [ ] `TerminalStack.tsx` and `lib/liveTerminals.ts` no longer import from `@/modules/tabs`.
- [ ] Cold-tab filtering moves to the caller (or a selector exported by tabs/navigation).
- [ ] No pane remounts when switching tabs (existing behaviour unchanged).

**Verification:** `pnpm vitest run src/modules/terminal` passes; manual: open 2 tabs with `top` running, switch back and forth, processes keep running.

### terminal-D03 — Implement pane chrome per design
```yaml
id: terminal-D03
depends-on: [terminal-D01, terminal-D02]
refs: [UX-010, 5.4]
covers: [terminal/pane-host, terminal/pane-tree-view]
type: task
scope: ui
size: S
```
**Goal:** Replace Terax's error card (`TerminalPane.tsx:166-194`), resize handle styling (`PaneTreeView.tsx:126`) and
drop overlay (`PaneTreeView.tsx:138-145`) with the user's design. Logic (retry, resize interaction, drop target store)
is unchanged.

**Acceptance criteria:**
- [ ] Visuals match terminal-D01.
- [ ] Retry still re-creates the renderer without restarting the PTY for renderer errors.

**Verification:** `pnpm vitest run src/modules/terminal`; manual: force WebGPU failure (`VITE_TERMINAL_BACKEND`), drag a divider, drop a file.

### terminal-D04 — Persistable split ratios in the pane tree
```yaml
id: terminal-D04
depends-on: []
refs: [PRJ-006, 6.2:4, F4:4]
covers: [PRJ-006, terminal/pane-tree-model, terminal/pane-tree-view]
type: task
scope: ui
size: M
```
**Goal:** Split nodes carry optional `sizes: number[]`; `PaneTreeView` uses them as `defaultSize` and reports layout
changes back so navigation/projects can persist them.

**Acceptance criteria:**
- [ ] `PaneNode` split gains optional `sizes`; `splitLeaf`/`removeLeaf`/`swapLeafInDirection` keep sizes consistent (unit tests).
- [ ] `PaneTreeView` applies sizes and emits `onLayout(splitId, sizes)` after a drag ends (not per frame).
- [ ] Trees without `sizes` render as today (equal split).

**Verification:** `pnpm vitest run src/modules/terminal/lib/panes.test.ts`; manual: drag a divider, the callback fires once at the end.

### terminal-D05 — openPty launch object with args and env
```yaml
id: terminal-D05
depends-on: [backend-core-D??]
refs: [F3:3, PRO-002, PRO-004, 7.1, 14.1:1]
covers: [terminal/pty-bridge, F3:3]
type: task
scope: ui
size: S
```
**Goal:** Replace the positional `openPty(cols, rows, handlers, cwd, blocks, shell, paneId, colors)` with an options
object `{ cwd, blocks, shell, args, env, environment, paneId, colors }` passed to the extended `pty_open`.

**Acceptance criteria:**
- [ ] `args` is an array (never a joined string); `env` is a record; both optional and omitted when absent.
- [ ] `environment` (native/WSL) is per call, falling back to `currentWorkspaceEnv()`.
- [ ] `pty-bridge.test.ts` covers the new payload.

**Verification:** `pnpm vitest run src/modules/terminal/lib/pty-bridge.test.ts`; manual: new tab still opens the default shell.

### terminal-D06 — Launch a pane from a resolved profile
```yaml
id: terminal-D06
depends-on: [terminal-D05, terminal-D02, profiles-D??]
refs: [PRO-011, PRO-009, F3:3, F3:4, 6.2:5, 7.1]
covers: [PRO-011, PRO-009, terminal/session-lifecycle, terminal/pane-tree-model, terminal/pane-host]
type: task
scope: ui
size: M
```
**Goal:** Leaves carry `profileId`; `TerminalPane` receives a resolved launch spec and `useGhosttyTerminalSession`
uses it instead of `preferences.terminalShell` (`useGhosttyTerminalSession.ts:855`).

**Acceptance criteria:**
- [ ] `PaneNode` leaf has optional `profileId`; `splitLeaf` accepts it.
- [ ] Session init opens the PTY with the profile's executable, args, env, cwd and environment.
- [ ] Missing profile → falls back to default profile and reports a repairable error (13.2:12).
- [ ] Respawn (`respawnGhosttySession`) reuses the same launch spec.

**Verification:** `pnpm vitest run src/modules/terminal`; manual: open a pwsh and a WSL pane in the same tab.

### terminal-D07 — Per-session appearance overrides (theme colors, font)
```yaml
id: terminal-D07
depends-on: [terminal-D06]
refs: [PRO-005, F3:5, 13.2:19, UX-004, UX-005, 7.1]
covers: [PRO-005, F3:5, terminal/theme-font, terminal/session-lifecycle]
type: task
scope: ui
size: M
```
**Goal:** Resolve appearance as global → profile → pane and feed it to the existing per-session paths
(`applyThemeToSession`, `updateSessionFont`) without restarting the PTY.

**Acceptance criteria:**
- [ ] `buildTerminalTheme`/`useTerminalFont` accept an override layer; global changes still apply to panes without overrides.
- [ ] Changing a profile's font/colors updates open panes using it without respawn.
- [ ] Exceeding the atlas budget (8 font specs) degrades gracefully (falls back to the default font spec with a warning).

**Verification:** `pnpm vitest run src/modules/terminal`; manual: two panes with different font sizes and color schemes; `top` keeps running while changing them.

### terminal-D08 — Spike: per-pane opacity and background image
```yaml
id: terminal-D08
depends-on: []
refs: [7.1, PRO-005, 5.4:2, 5.4:7]
covers: [7.1]
type: spike
scope: ui
size: S
```
**Goal:** Decide whether profile `opacity` / background image are feasible with the single opaque WebGPU canvas and the WebGL fallback, and estimate cost.

**Acceptance criteria:**
- [ ] Written findings: required changes to `WebGpuWindowCanvas` alpha mode, background shader, WebGL renderer and Tauri window transparency on Windows/macOS/Linux.
- [ ] Recommendation (do/defer) with performance impact measured on a prototype branch (not merged).

**Verification:** findings note added to `.docs/`; plan.md updated with the decision.

### terminal-D09 — Prompt-ready contract for session startup
```yaml
id: terminal-D09
depends-on: []
refs: [8.4:6, 7.3, F4:5]
covers: [8.4:6, terminal/session-api, terminal/session-lifecycle]
type: task
scope: ui
size: S
```
**Goal:** Expose `whenPromptReady(leafId, timeout)` resolving on the first OSC 133 prompt (via the semantic router),
with an explicit result `{ kind: "prompt" | "timeout" | "no-integration" | "exited" }` instead of a silent 4 s poll.

**Acceptance criteria:**
- [ ] Resolves on first `prompt-start`/`prompt-end` event.
- [ ] Returns `timeout` when the shell never emits OSC 133; never throws.
- [ ] `whenSessionReady` callers unchanged (new function, separate).

**Verification:** `pnpm vitest run src/modules/terminal` with new unit tests using fake events; manual with pwsh and a shell without integration (`cmd.exe`).

### terminal-D10 — Wire OSC title and bell events to the pane API
```yaml
id: terminal-D10
depends-on: []
refs: [PRO-013, TER-012, 7.1]
covers: [PRO-013]
type: task
scope: ui
size: S
```
**Goal:** Forward `onTitle` and `onBell` from `GhosttySemanticEventRouter` through `TerminalStack` callbacks
(`onTitle(leafId, title)`, `onBell(leafId)`) so navigation can honour `allowShellTitle` and show indicators.

**Acceptance criteria:**
- [ ] Titles are length-capped and control characters stripped.
- [ ] Events from hidden tabs are delivered.
- [ ] No consumer behaviour change until navigation subscribes.

**Verification:** `pnpm vitest run src/modules/terminal`; manual: `printf '\e]0;hello\a'` triggers the callback.

### terminal-D11 — File links without the editor
```yaml
id: terminal-D11
depends-on: []
refs: [5.10:12, F2:6, 14.1:9, 6.2:8]
covers: [terminal/links, terminal/session-lifecycle]
type: task
scope: ui
size: S
```
**Goal:** Terminal file links no longer import `@/modules/lsp`; an optional "open path" capability is injected, with a
fallback to the OS default app / reveal when no editor is registered. Remove the `spaces` import from the link guard.

**Acceptance criteria:**
- [ ] `lib/terminalLinks.ts` has no import from `@/modules/lsp`; `useGhosttyTerminalSession.ts` no import from `@/modules/spaces`.
- [ ] With no editor capability, file:line links open via the OS opener (after the existing confirm rules).
- [ ] Existing link safety tests still pass.

**Verification:** `pnpm vitest run src/modules/terminal/lib/terminalLinks.test.ts src/modules/terminal/ghostty/core`; manual: ctrl-click a `src/foo.ts:10` path with the editor disabled.

### terminal-D12 — Remove "attach to AI chat" from command blocks
```yaml
id: terminal-D12
depends-on: []
refs: [F2:4, 5.10:11]
covers: [terminal/blocks-ui]
type: task
scope: ui
size: XS
```
**Goal:** Drop the AI chat attach action in `block/BlockOverlay.tsx:12,265` so the terminal area has no dependency on `modules/ai`.

**Acceptance criteria:**
- [ ] No import from `@/modules/ai` in `src/modules/terminal`.
- [ ] Block menu keeps its other actions.

**Verification:** `grep -r "modules/ai" src/modules/terminal` returns nothing; `pnpm vitest run src/modules/terminal/block`.

### terminal-D13 — Decide: keep or remove command-blocks mode
```yaml
id: terminal-D13
depends-on: []
refs: [ADR-002, UX-006]
covers: [terminal/blocks-logic, terminal/blocks-ui]
type: spike
scope: none
size: XS
```
**Goal:** The user decides whether lut keeps Terax's blocks mode (Warp-like command blocks with custom shell input).
Outcome: either a removal issue (mechanical deletion of `block/`, `GhosttyBlocks*`, `ghosttyBlockSessions*`,
`blockController.ts`, tab `blocks` flag, `TERAX_BLOCKS` env) or a design issue for its UI.

**Acceptance criteria:**
- [ ] Decision recorded in `proposal.md`/plan.md.
- [ ] Follow-up issue(s) added to plan.md.

**Verification:** plan.md contains the follow-up issue.

### terminal-D14 — Move agent activity store to the agents module
```yaml
id: terminal-D14
depends-on: []
refs: [6.2:7, 9.3, 9.5, F2:5]
covers: [terminal/agent-activity]
type: task
scope: ui
size: S
```
**Goal:** Relocate `lib/agentActivity.ts` (+tests) to `src/modules/agents`; `pty-bridge` keeps calling
`ensureAgentActivityListener`/`clearAgentActivity` through the agents public API. Pure move.

**Acceptance criteria:**
- [ ] `src/modules/terminal/index.ts` no longer re-exports agent activity; consumers import from agents.
- [ ] No behaviour change; tests moved and passing.

**Verification:** `pnpm vitest run src/modules/agents src/modules/terminal src/modules/tabs`; `pnpm tsc --noEmit`.

### terminal-D15 — Renderer and TUI verification on Windows baseline
```yaml
id: terminal-D15
depends-on: []
refs: [F0:9, 5.4:6, 13.2, 13.3:1]
covers: [13.5:11, 5.4:6]
type: task
scope: none
size: S
```
**Goal:** Record that the imported renderer works on Windows 11: WebGPU default, forced WebGL fallback, DPI change,
continuous resize, Neovim and lazygit.

**Acceptance criteria:**
- [ ] Checklist results recorded in the baseline report (WebGPU, WebGL via `VITE_TERMINAL_BACKEND=ghostty-webgl`, DPI switch, resize, nvim, lazygit).
- [ ] Failures filed as issues.

**Verification:** `pnpm vitest run src/modules/terminal` green or failures documented; manual checklist completed.
