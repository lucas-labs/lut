# app-shell — analysis

Area scope: app frame and UI shell (`src/app/`, `src/main.tsx`, `index.html`, tabs, header, sidebar, statusbar,
workspace env, command palette, shortcuts, `src/components/`, `src/lib/`, `src/styles/`, `app_menu.rs`).
Inventory: `.docs/plan/analysis/app-shell.json` (33 items).

## How it works today

**Boot.** `src/main.tsx` imports global CSS, marks borderless chrome on non-macOS (`main.tsx:11-13`), optionally loads
the bench driver behind the compile-time flag `__TERAX_BENCH__` (`main.tsx:24-27`), reaps orphaned PTYs with
`invoke("pty_close_all")` (`main.tsx:30`), seeds the launch dir (`main.tsx:33`, `lib/launchDir.ts:5-10`), renders `<App/>`
and shows the initially hidden window with two timeouts (`main.tsx:42-50`). `index.html:8-22` applies the light/dark
class before first paint from `localStorage["terax-ui-theme-shadow"]`.

**App.tsx (1695 lines) is the single coordinator.** It:
- owns the tab model through `useTabs(...)` (`App.tsx:203`) — a React hook, not a global store — and wires it to
  spaces (`useSpaces`, `useSpacesBoot`, `useSpacePersistence`, `App.tsx:262-293`, area state-settings);
- registers every keyboard shortcut in one handler map passed to `useGlobalShortcuts` (`App.tsx:1066`);
- runs the agent launch flow (`invoke("agent_enable_hooks")`, `App.tsx:637`), the control bridge (`App.tsx:1386`),
  the LSP navigator (`App.tsx:1395`), the `terax:open-file` listener (`App.tsx:719`) and launch files (`App.tsx:740`);
- lays out Header (`:1445`), a `ResizablePanelGroup` (`:1475`) with sidebar FileExplorer / SourceControlPanel
  (`:1506`, `:1527`), SidebarRail (`:1541`), WorkspaceSurface (`:1554`), StatusBar (`:1594`), AI bridges and mini window
  (`:1625-1634`), CommandPalette (`:1650`), UpdaterDialog (`:1668`), CloseDialogs (`:1670`);
- wraps everything in `ThemeProvider` (`:1423`) and `AiComposerProvider` (`:1694`).

**Tab model.** `useTabs.ts` keeps `tabs: Tab[]` and `activeId` in `useState` mirrored in refs (`useTabs.ts:586-623`).
`Tab` is a union of 8 kinds (`useTabs.ts:128-136`): `terminal` (owns a `paneTree: PaneNode` and `activeLeafId`,
`useTabs.ts:39-51`), `editor`, `preview`, `markdown`, `ai-diff`, `git-diff`, `git-history`, `git-commit-file`.
Every tab carries `spaceId` and a `cold` flag (restored, not mounted yet; `useTabs.ts:33-37`). Leaf ids and tab ids
share one counter (`nextIdRef`, `useTabs.ts:606`). Max 4 panes per tab, matching the renderer slot pool
(`useTabs.ts:31`). Pure planners (`planFileTabOpen`, `planCloseTabsToRight`, `planSpaceRemoval`, `reorderTabsByGap`, …,
`useTabs.ts:174-585`) are tested in isolation.

**Shortcuts.** `shortcuts.ts` defines the `ShortcutId` union (`shortcuts.ts:8-49`) and metadata; per-OS default
bindings live in `shortcutDefaults.ts:26,94`. `resolveShortcut` prefers user-recorded bindings, then defaults, skipping
disabled matches (`resolveShortcut.ts:21-37`). `useGlobalShortcuts` installs one capture-phase `keydown` listener and
reads overrides from `usePreferencesStore().shortcuts` (`useGlobalShortcuts.ts:21-40`).

**Command palette.** `createCommandItems(ctx)` returns a static list of items (`commands.ts:69-306`); the component adds
modes (`lib/mode.ts`), fuzzy ranking, MRU (`lib/mru.ts`, localStorage), recent files, quick-open over `fs_search` and
content search over `fs_grep_interactive`, and command history from the terminal blocks module.

**Close lifecycle.** `useAppCloseGuard` intercepts `onCloseRequested`, checks foreground processes per leaf and dirty
editors, flushes AI chat history and shows CloseDialogs (`useAppCloseGuard.ts:57-138`). On macOS, `app_menu.rs`
replaces the default Quit with a guarded item that calls `main.close()` so the same guard runs (`app_menu.rs:19-71`).

## Interfaces

- **Tauri commands invoked from this area:** `pty_close_all` (`main.tsx:30`), `get_launch_dir`, `workspace_current_dir`,
  `get_launch_files` (`lib/launchDir.ts:7-22`), `pty_shell_name` (`useSystemInfo.ts:16`), `agent_enable_hooks`
  (`App.tsx:637`), `fs_search`, `fs_warm_index` (`useFileSearch.ts:47-106`), `fs_grep_interactive`
  (`useContentSearch.ts:31`), `asset_grant`/`asset_revoke` (`useAssetGrant.ts:21-22`), `wsl_list_distros`, `wsl_home`
  (`workspace/env.ts:38,67`), `native.workspaceAuthorize`/`workspaceCurrentDir` via `modules/ai/lib/native`
  (`useWorkspaceSwitcher.ts:48,68`).
- **Tauri events:** listens `terax:open-file` (`App.tsx:719`). DOM events: `terax:ai-attach-file` (`App.tsx:575`),
  `terax:toggle-block-input` (`WorkspaceInputBar.tsx:29`).
- **Menu:** id `terax.quit` (`app_menu.rs:8`), accelerator `Command+Q`.
- **localStorage keys (webview):** `terax-ui-theme-shadow` (`index.html:11`), `terax.sidebar.width|view|collapsed`
  (`useSidebarPanel.ts:14-16`), `terax-palette-mru` (`mru.ts:4`), `terax-palette-recent-files` (`recentFiles.ts:4`).
- **Build-time env:** `TERAX_BENCH`, `TERAX_BENCH_IDENTIFIER`, `__TERAX_BENCH__` (`main.tsx:24`, `dist-budget.test.ts:196-337`);
  `VITE_REACT_SCAN` (`main.tsx:17`).
- **Globals:** `window.__teraxNewBlockTab` (`useTabs.ts:804-805`).
- **Public TS APIs used by other areas:** `Tab`, `TerminalTab`, `MAX_PANES_PER_TAB`, `DEFAULT_SPACE_ID` (tabs);
  `ShortcutId`, `SHORTCUTS`, `matchBinding`, `useShortcutLabel` (shortcuts, used by settings recorder);
  `useWorkspaceEnvStore`, `currentWorkspaceEnv`, `workspaceScopeKey` (workspace); `cn`, `IS_MAC`, `quoteShellArg`,
  fonts helpers (`src/lib`); every `src/components/ui/*` primitive.

## Couplings

Outgoing (app-shell -> other areas):
- ai: `App.tsx:22-33,369,1625-1634,1694`; `WorkspaceInputBar.tsx:3-6,24`; `useAppCloseGuard.ts:2-6`;
  `useWorkspaceSwitcher.ts:3`; `StatusBar.tsx:6-11`.
- ide-tools: editor `App.tsx:41-46`, `WorkspaceSurface.tsx:3`, `SearchInline.tsx:4`, `DiagnosticsBadge.tsx:1`,
  `TabBar.tsx:19-23`; explorer `App.tsx:47`, `TabBar.tsx:24`, `CommandPalette.tsx:12`; git `useGitBranch.ts:1`,
  git-history `App.tsx:48`, `WorkspaceSurface.tsx:4`; source-control `App.tsx:73-77`; lsp `App.tsx:54`,
  `StatusBar.tsx:12`; preview `App.tsx:55`, `WorkspaceSurface.tsx:6`; markdown `WorkspaceSurface.tsx:5`.
- agents/control: `App.tsx:15-21,40`; `Header.tsx:4-5`; `NewTabMenu.tsx:13-14`; `TabBar.tsx:17-18`; `useTabs.ts:2-5`.
- terminal: `App.tsx:94-112`; `useTabs.ts:6-21`; `useAppCloseGuard.ts:17`; `useCommandHistory.ts:1`.
- state-settings: settings/preferences `App.tsx:56-58`, `useGlobalShortcuts.ts:2`, `CommandPalette.tsx:13`;
  spaces `App.tsx:78-83`; theme `App.tsx:113-119`, `CommandPalette.tsx:20`; `workspace/env.ts:3`.
- build-identity: updater `App.tsx:120,1668`.

Incoming: `src/lib/utils` is imported by 92 files, `src/lib/platform` by 21, `components/ui/button` by 35; spaces
serialize `Tab[]` from `modules/tabs`; settings window uses shortcuts registry and UI primitives.

## "terax" mentions

(a) **Phase 0 identity isolation** — none is directly shared with an installed Terax by itself. Webview localStorage keys
(`terax-ui-theme-shadow` `index.html:11`; `terax.sidebar.*` `useSidebarPanel.ts:14-16`; `terax-palette-mru`
`mru.ts:4`; `terax-palette-recent-files` `recentFiles.ts:4`) live in the webview profile, which is keyed by the bundle
identifier; they become isolated as soon as build-identity changes the identifier. Must be verified in Phase 0 (13.2:21).
`dist-budget.test.ts:313-316` asserts the bench build refuses `app.crynta.terax`; update it with the new identifier.
`terax:open-file` event name (`App.tsx:719`) is in-process only.

(b) **Visual rebranding:** `<title>Terax</title>` (`index.html:7`), `APP_NAME = "Terax"` (`useWindowTitle.ts:6`),
"Quit Terax?" (`CloseDialogs.tsx:291`), font family "Terax Terminal Symbols[ MDI]" (`fonts.ts:29-30`,
`fonts.css:53-66`, not user visible in practice).

(c) **Internal (rename on touch):** `__TERAX_BENCH__`/`TERAX_BENCH*` (`main.tsx:23-24`, `App.tsx:154-156`,
`dist-budget.test.ts`); `[terax]` log prefixes (`App.tsx:641,652`, `external-link.ts:18`); DOM events
`terax:ai-attach-file`, `terax:toggle-block-input`; element id `terax-command-palette-input`
(`CommandPalette.tsx:178,306`); `window.__teraxNewBlockTab` (`useTabs.ts:804`); menu id `terax.quit`
(`app_menu.rs:8`); ~25 `terax-*` CSS classes/keyframes (`globals.css:244-608`, `TabBar.tsx:349`, `App.tsx:1500-1503`,
`DiagnosticsBadge.tsx:16`, `WorkspaceInputBar.tsx:197`); test fixtures (`tabLabel.test.ts:19-30`,
`pathUtils.test.ts:14-17`, `fonts.test.ts`, `motionBudget.test.ts`, `compositingBudget.test.ts` comments).

## Risks

- Rewriting App.tsx can change the mount tree and unmount `TerminalStack`, killing sessions (5.4:1, 3.4:invariant).
  Lifecycle tests (F1:7) must land before the rewrite.
- `useTabs` is local React state; spaces persistence serializes `Tab[]`. Changing kinds without a migration breaks
  restore (PRJ-014, 6.5:5).
- Removing AI also removes the chat-history flush in close; keep "window always closable".
- UI primitive replacement has very wide fan-in; must be done per primitive with stable props.
- Command palette quick-open depends on ide-tools `fs_search` backend; removing it there silently degrades the palette.
- `fonts.css` contains the terminal symbol `@font-face` rules the renderer needs; replacing global CSS must keep them.

## Open questions

1. Keep shadcn/Radix as the primitive layer (restyle only) or adopt another component library? Affects `app-shell/ui-primitives` size.
2. Do spaces become projects (F4:2) or does the tab model drop `spaceId` in favour of `projectId`? Coordinate with state-settings.
3. Does quick-open (file search) survive in the palette if the explorer is removed/optional?
4. Do terminal "blocks" survive? Determines where `terminal.toggleInput` and `__teraxNewBlockTab` go.
5. Is the custom (borderless) title bar kept on Windows/Linux, or native decorations? Decides window-controls work.
6. TER-013 (compact/expandable tabs, groups): in the first navigator design or later (F6)?

## Answers

**1. Tab model.** Tabs live in the `useTabs` React hook (`useTabs.ts:586-623`) instantiated once in `App.tsx:203`; there
is no zustand store. A terminal tab owns a pane tree (`paneTree: PaneNode`, `activeLeafId`, `useTabs.ts:39-51`); panes
are leaves of that tree (operations from `terminal/lib/panes.ts`, `useTabs.ts:6-21`), max 4 (`useTabs.ts:31`). Each
tab has a `spaceId` (`useTabs.ts:33-37`); new tabs go to `activeSpaceIdRef` (`useTabs.ts:607`); `moveTabToSpace`,
`removeTabsForSpace`, `planSpaceRemoval` handle space membership. Kinds: terminal, editor, preview, markdown, ai-diff,
git-diff, git-history, git-commit-file (`useTabs.ts:128-136`). Agent tabs are terminal tabs created via
`newAgentTab`/`newAgentGroupTab` using `createAgentPanePlan` (`useTabs.ts:2-5`); "private" and "block" are terminal
flags (`useTabs.ts:46-48`).

**2. Command palette and shortcuts.** Commands are a static array built per render by `createCommandItems`
(`commands.ts:69`), not a registry; ids partly mirror shortcut ids. Keybindings: a static `ShortcutId` union + metadata
(`shortcuts.ts:8-49`) and OS defaults (`shortcutDefaults.ts`); handlers are a map in App.tsx (`App.tsx:1066`).
Keybindings are user-configurable: overrides stored in `preferences.shortcuts` and applied by `resolveShortcut`
(`useGlobalShortcuts.ts:21`, `resolveShortcut.ts:21-37`). Belonging to removed areas: palette commands `tab.newEditor`,
`tab.newPreview`, `git.graph`, `git.source`, `search.content`, `explorer.search`, `explorer.toggleHidden`, `ai.toggle`,
`ai.askSelection` (`commands.ts:166-297`); shortcuts `tab.newPreview`, `tab.newEditor`, `explorer.*`, `ai.*`,
`editor.*` (`shortcuts.ts:14-49`).

**3. Logic vs visuals.** Keep/adapt logic: `useTabs` planners and model, `tabCloseGuards`/`useTabCloseGuards`/
`useAppCloseGuard`, `useWorkspaceSwitcher`, shortcuts module (all), command-palette `commands.ts`/`lib`/`hooks`,
`useSidebarPanel`, statusbar `lib/pathUtils`, tabs helpers, `workspace/env.ts`, `src/lib/*`, `tokens.ts`, `main.tsx`
boot order, `app_menu.rs`. Purely visual (replace): `App.tsx` layout JSX, Header, SearchInline UI, TabBar, NewTabMenu,
TabSwitcherHud, SidebarRail, StatusBar/CwdBreadcrumb/WorkspaceEnvSelector, CommandPalette.tsx, CloseDialogs,
WindowControls, OsIcon, `components/ui/*`, `globals.css`/`fonts.css`.

**4. Imports of AI/editor/explorer/git/preview/LSP** (blockers): `App.tsx:22-33,41-48,54-55,73-77`;
`WorkspaceInputBar.tsx:3-6,24`; `WorkspaceSurface.tsx:3-6`; `useGitBranch.ts:1`; `useAppCloseGuard.ts:2-6`;
`useWorkspaceSwitcher.ts:3`; `CommandPalette.tsx:12`; `SearchInline.tsx:4`; `DiagnosticsBadge.tsx:1`;
`StatusBar.tsx:6-12`; `TabBar.tsx:19-24`; tests `feature-loading.test.tsx:4-33`.

**5. src/lib.** Generic, widely used: `utils.ts` (92 importers), `platform.ts` (21), `shellQuote.ts` (7),
`fonts.ts` (7), `homeRelativePath.ts`, `external-link.ts`, `launchDir.ts`, `usePresence.ts` (5, ai + app),
`useZoom.ts` (App only). Tied to removed features: `useAssetGrant.ts` (editor, markdown only). None dead.
Unused UI primitives: alert, card, empty, item, menubar, radio-group, sheet, skeleton, toggle-group (0 importers).

**6. App menu and window controls.** `app_menu.rs` is macOS-specific: it takes `Menu::default`, validates that the
first submenu ends with a predefined "Quit" (`app_menu.rs:20-40`), replaces it with a custom item `terax.quit` with
`Command+Q` (`:42-50`) whose handler unminimizes, shows, focuses and `close()`s the main window so the JS close guard
runs (`:55-71`). `WindowControls.tsx` renders min/max/close only when `USE_CUSTOM_WINDOW_CONTROLS` (non-macOS,
`platform.ts:19`), tracks maximized state via `onResized` (`WindowControls.tsx:21-34`); `closeOnly` is used by the
settings window. macOS keeps native traffic lights via the overlay title bar.

## Draft issues

### app-shell-D01 — Design: app shell layout and tab navigator
```yaml
id: app-shell-D01
depends-on: []
refs: [UX-001, UX-002, UX-003, UX-006, 10.2, 10.3:1, 10.4, TER-003, TER-013]
covers: [UX-001, UX-006]
type: design
scope: ui
size: M
```
**Goal:** The user designs lut's main frame: title bar, horizontal/vertical tab navigator, optional projects sidebar,
status bar and terminal area.

**Acceptance criteria:**
- [ ] Frame layout for both tab orientations and collapsed/expanded sidebar.
- [ ] Tab item states (active, agent badge, cold, close) and context menu entries.
- [ ] Window controls decision for Windows/Linux (custom vs native).

### app-shell-D02 — Design: command palette, dialogs and UI primitives
```yaml
id: app-shell-D02
depends-on: []
refs: [UX-004, UX-006, UX-008, UX-010, F6:1]
covers: [UX-004]
type: design
scope: ui
size: M
```
**Goal:** The user defines the design tokens, primitive components and the command palette / confirm dialog look.

**Acceptance criteria:**
- [ ] Token set (colors, spacing, density) for light/dark and custom themes.
- [ ] Primitive list (button, menu, dialog, popover, input, tooltip…) with chosen library.
- [ ] Command palette and close-confirmation dialog designs.

### app-shell-D03 — Remove unused UI primitives
```yaml
id: app-shell-D03
depends-on: []
refs: [F2:7]
covers: [app-shell/ui-unused]
type: task
scope: ui
size: XS
```
**Goal:** Delete shadcn components nobody imports.

**Acceptance criteria:**
- [ ] alert, card, empty, item, menubar, radio-group, sheet, skeleton, toggle-group deleted.
- [ ] No import references remain.

**Verification:** `pnpm tsc --noEmit` and `pnpm test` pass.

### app-shell-D04 — Lifecycle tests for tab switch, split, orientation and sidebar
```yaml
id: app-shell-D04
depends-on: []
refs: [F1:7, 10.3:6, 3.4:invariant, 13.2:5, 13.2:6]
covers: [F1:7, 10.3:6]
type: task
scope: ui
size: M
```
**Goal:** Lock the invariant that navigation changes never unmount terminal sessions, before the shell is rewritten.

**Acceptance criteria:**
- [ ] Tests: switching tabs, splitting, closing, reordering and toggling the sidebar keep `TerminalStack` leaves mounted and PTYs alive (no `pty_close`).
- [ ] Tests run against the current App and survive the later AppShell.

**Verification:** `pnpm test` passes; new tests fail when TerminalStack is conditionally rendered.

### app-shell-D05 — Move shared native wrappers out of modules/ai for the shell
```yaml
id: app-shell-D05
depends-on: []
refs: [F2:3, 9.9:4]
covers: [F2:3]
type: task
scope: ui
size: S
```
**Goal:** `useWorkspaceSwitcher` (and other shell code) stop importing `@/modules/ai/lib/native`.

**Acceptance criteria:**
- [ ] `workspaceAuthorize` / `workspaceCurrentDir` wrappers live in a platform module (e.g. `src/lib/native` or `modules/platform`).
- [ ] `useWorkspaceSwitcher.ts` and spaces boot import from it; behaviour unchanged.

**Verification:** `pnpm tsc --noEmit`, `pnpm test`; `grep -r "modules/ai/lib/native" src/app src/modules/spaces` is empty.

### app-shell-D06 — Decouple close guards from AI chat persistence and editor state
```yaml
id: app-shell-D06
depends-on: [ai-D01?]
refs: [TER-011, 13.2:9, F2:4]
covers: [app-shell/close-guards, TER-011]
type: task
scope: ui
size: S
```
**Goal:** App/tab close guards only depend on terminal state plus optional "dirty content" providers.

**Acceptance criteria:**
- [ ] `useAppCloseGuard` no longer imports `modules/ai`; extra flushes are registered through a hook/callback API.
- [ ] Dirty-content check is a provider interface (editor registers when present).
- [ ] Busy-terminal confirmation and "close anyway" behaviour preserved.

**Verification:** `pnpm test` (`useAppCloseGuard.test.ts`, `tabCloseGuards.test.ts`); manual: quit with `pnpm dev` running asks for confirmation.

### app-shell-D07 — Extract shortcut handler map from App.tsx
```yaml
id: app-shell-D07
depends-on: [app-shell-D04]
refs: [F2:2, 10.2:1, 5.10:7]
covers: [F2:2]
type: task
scope: ui
size: M
```
**Goal:** Refactor only: move the shortcut handler map and `isDisabled` logic into `useAppShortcuts`.

**Acceptance criteria:**
- [ ] `App.tsx` calls one hook; no behaviour change.
- [ ] Unit tests cover the handler map for tab/pane shortcuts.

**Verification:** `pnpm test`; shortcuts manually verified (new tab, split, next tab).

### app-shell-D08 — Extract launch/open-file and agent launch flows from App.tsx
```yaml
id: app-shell-D08
depends-on: [app-shell-D04]
refs: [F2:2, 10.2:1]
covers: [10.2:1]
type: task
scope: ui
size: M
```
**Goal:** Refactor only: move `terax:open-file`/launch-files handling and the agent launch flow into dedicated hooks/services.

**Acceptance criteria:**
- [ ] `useLaunchFiles` and `useAgentLaunch` own the code formerly at `App.tsx:620-745`.
- [ ] No behaviour change.

**Verification:** `pnpm test`; opening a file via CLI arg and launching Claude from the new-tab menu still work.

### app-shell-D09 — Remove WorkspaceInputBar and root AiComposerProvider
```yaml
id: app-shell-D09
depends-on: [ai-D01?, app-shell-D07]
refs: [F2:4, 9.9:5, 5.10:11]
covers: [app-shell/workspace-input-bar, 9.9:5, F2:4]
type: task
scope: ui
size: S
```
**Goal:** The built-in AI composer is no longer mounted by the shell.

**Acceptance criteria:**
- [ ] `WorkspaceInputBar.tsx` deleted; `AiComposerProvider` no longer wraps the app (`App.tsx:1694`).
- [ ] Block-input toggle re-homed in terminal (or removed if blocks are dropped).

**Verification:** `pnpm tsc --noEmit`, `pnpm test`; app starts with no AI key and terminals work (13.2:17).

### app-shell-D10 — NavigationStore: extract tab model from useTabs
```yaml
id: app-shell-D10
depends-on: [app-shell-D04]
refs: [5.10:6, 6.2:3, 10.3:2, 10.3:3, 10.4]
covers: [F2:1, 10.3:2, 10.3:3, 5.10:6, 6.2:3, 10.4]
type: task
scope: ui
size: L
size-exception: useTabs.ts is 1532 lines; moving state into a store is mechanical but touches every consumer signature. Pure planners move first in the same PR without logic changes.
```
**Goal:** One navigation store (tabs, active id, order, spaces membership) with a `terminalTabs` selector, replacing local React state.

**Acceptance criteria:**
- [ ] Store holds tabs/activeId; `useTabs` becomes a thin facade with the same API.
- [ ] `terminalTabs` selector exposes the TabNavigator contract (id, title, icon, state, active).
- [ ] `window.__teraxNewBlockTab` replaced by a store action.
- [ ] Existing planner tests unchanged and green.

**Verification:** `pnpm test`; manual: tabs/splits/spaces behave as before, PTYs survive.

### app-shell-D11 — Move non-terminal tab kinds behind an optional ContentTab capability
```yaml
id: app-shell-D11
depends-on: [app-shell-D10, ide-tools-D01?]
refs: [10.3:4, 10.3:5, 6.2:8, F1:6, PRJ-014]
covers: [app-shell/tabs-model, 10.3:4, 10.3:5]
type: task
scope: ui
size: M
```
**Goal:** Editor/preview/markdown/git/ai-diff kinds are registered by their modules, not hard-coded in the tab union.

**Acceptance criteria:**
- [ ] `Tab` union = terminal + generic `ContentTab` with a kind registry.
- [ ] Spaces serialization migrates old kinds (or drops removed ones) with a test.
- [ ] Removed modules no longer referenced from `modules/tabs`.

**Verification:** `pnpm test`; restoring a saved space with an old editor tab does not crash.

### app-shell-D12 — Terminal-default WorkspaceSurface
```yaml
id: app-shell-D12
depends-on: [app-shell-D11, app-shell-D01]
refs: [10.2:5, F1:6, 16:23]
covers: [app-shell/workspace-surface, 10.2:5, F1:6]
type: task
scope: ui
size: M
```
**Goal:** The workspace renders terminals by default and only lazy-mounts content tabs registered by optional tools.

**Acceptance criteria:**
- [ ] No static import of editor/preview/markdown/git stacks from `src/app`.
- [ ] Hidden terminal tabs keep running (TER-005).

**Verification:** `pnpm test` incl. budget tests; manual: `pnpm dev` in hidden tab continues (13.2:8).

### app-shell-D13 — New AppShell with central terminal area
```yaml
id: app-shell-D13
depends-on: [app-shell-D01, app-shell-D07, app-shell-D08, app-shell-D09, app-shell-D12]
refs: [F1:1, F1:2, 5.10:7, 5.4:1, 3.4:invariant, UX-001]
covers: [app-shell/app-root, F1:1, F1:2, 5.4:1, 3.4:invariant, 16:22]
type: task
scope: ui
size: L
size-exception: Replaces the App.tsx layout tree in one go; logic was already extracted by D07/D08/D10, so the diff is mostly JSX moves.
```
**Goal:** `AppShell` renders title bar, navigator, optional sidebar, terminal stack and status bar per design; `App.tsx` becomes a small coordinator.

**Acceptance criteria:**
- [ ] TerminalStack mounted once, never re-parented by orientation/sidebar changes.
- [ ] No imports from ai/editor/explorer/git/lsp/preview in `src/app`.
- [ ] D04 tests pass.

**Verification:** `pnpm test`; manual 13.2:5/13.2:6 on Windows.

### app-shell-D14 — Orientable tab navigator (horizontal/vertical)
```yaml
id: app-shell-D14
depends-on: [app-shell-D01, app-shell-D10]
refs: [TER-003, UX-002, F1:3, 10.2:3, 10.3:1, 10.4, 13.2:5, 16:3]
covers: [app-shell/tabs-ui, TER-003, UX-002, F1:3, 10.2:3, 10.3:1, 13.2:5, 16:3]
type: task
scope: ui
size: M
```
**Goal:** One `TabNavigator` over the navigation store with horizontal and vertical presentations.

**Acceptance criteria:**
- [ ] Orientation persisted in preferences; switching never restarts PTYs.
- [ ] Reorder, close, rename, agent status badge (via `tabAgentStatus`).
- [ ] Old TabBar/TabSwitcherHud removed.

**Verification:** `pnpm test`; manual switch with nvim running in a tab.

### app-shell-D15 — Tab and pane context menus
```yaml
id: app-shell-D15
depends-on: [app-shell-D14]
refs: [UX-007, F6:2]
covers: [UX-007, F6:2]
type: task
scope: ui
size: S
```
**Goal:** Context menus for tabs and panes (close, close others/right, rename, split, move).

**Acceptance criteria:**
- [ ] Actions call existing navigation-store planners.

**Verification:** `pnpm test`; manual.

### app-shell-D16 — New-tab menu as profile catalog
```yaml
id: app-shell-D16
depends-on: [app-shell-D14, state-settings-D01?]
refs: [10.2:4, PRO-011, F3:4]
covers: [10.2:4, PRO-011]
type: task
scope: ui
size: S
```
**Goal:** New-tab menu lists profiles (and agent launchers) instead of IDE tools.

**Acceptance criteria:**
- [ ] Opening a tab with a chosen profile; default profile on plain new tab.
- [ ] Old NewTabMenu removed.

**Verification:** `pnpm test`; manual pwsh + WSL profiles.

### app-shell-D17 — Projects sidebar placeholder
```yaml
id: app-shell-D17
depends-on: [app-shell-D01, app-shell-D13]
refs: [UX-003, F1:4, 10.2:6, 13.2:6]
covers: [app-shell/sidebar-logic, app-shell/sidebar-ui, UX-003, F1:4, 10.2:6, 13.2:6]
type: task
scope: ui
size: S
```
**Goal:** Collapsible projects sidebar with persisted width replacing explorer/source-control rail.

**Acceptance criteria:**
- [ ] `SidebarViewId` no longer references explorer/source-control; SidebarRail removed.
- [ ] Collapse/expand never stops processes.

**Verification:** `pnpm test` (`useSidebarPanel.test.ts`); manual collapse with running TUI.

### app-shell-D18 — Header/title bar and window controls
```yaml
id: app-shell-D18
depends-on: [app-shell-D01, app-shell-D13]
refs: [10.2:2, 6.2:10, TER-006]
covers: [app-shell/header, app-shell/window-controls, 10.2:2]
type: task
scope: ui
size: M
```
**Goal:** New title bar per design with search entry routed to terminal search and platform window controls.

**Acceptance criteria:**
- [ ] No editor imports in header; search works for terminal panes.
- [ ] Custom window controls on Windows/Linux (or native if decided); macOS traffic lights intact.

**Verification:** manual on Windows 11 (min/max/close, drag region); `pnpm test`.

### app-shell-D19 — Status bar rebuild
```yaml
id: app-shell-D19
depends-on: [app-shell-D01, app-shell-D09]
refs: [8.5:3, 16:23]
covers: [app-shell/statusbar-ui, app-shell/diagnostics-badge, app-shell/os-icon, 8.5:3]
type: task
scope: ui
size: S
```
**Goal:** Status bar shows cwd, shell/WSL context; no AI/LSP/diagnostics controls.

**Acceptance criteria:**
- [ ] DiagnosticsBadge, AI pills and LSP pill removed from the shell status bar.
- [ ] Context indicators use `pathUtils` and `useSystemInfo`.

**Verification:** `pnpm test`; manual.

### app-shell-D20 — Prune command palette and shortcuts of removed features
```yaml
id: app-shell-D20
depends-on: [app-shell-D09, ide-tools-D01?]
refs: [UX-008, TER-008, F1:5, F6:6]
covers: [app-shell/shortcuts, TER-008, F1:5]
type: task
scope: ui
size: S
```
**Goal:** Registry contains only commands/shortcuts whose features exist; user overrides for removed ids are ignored safely.

**Acceptance criteria:**
- [ ] `ai.*`, `editor.*`, `explorer.*`, `tab.newEditor`, `tab.newPreview` removed (or moved to optional modules' own registration).
- [ ] Orientation toggle and split shortcuts present.
- [ ] Stored overrides for unknown ids dropped without error.

**Verification:** `pnpm test` (`shortcuts.test.ts`, `shortcutDefaults.test.ts`, `resolveShortcut.test.ts`).

### app-shell-D21 — Terminal/project oriented command palette
```yaml
id: app-shell-D21
depends-on: [app-shell-D02, app-shell-D20]
refs: [UX-008, F6:1]
covers: [app-shell/command-palette-logic, app-shell/command-palette-ui, UX-008, F6:1]
type: task
scope: ui
size: M
```
**Goal:** Palette built on the new design, with terminal, tab, profile and project actions; file search only when the optional tool exists.

**Acceptance criteria:**
- [ ] Command list driven by a registry that optional modules can extend.
- [ ] MRU/fuzzy libs reused; no explorer import.

**Verification:** `pnpm test` (palette lib tests); manual.

### app-shell-D22 — Close confirmation dialogs on new design
```yaml
id: app-shell-D22
depends-on: [app-shell-D02, app-shell-D06]
refs: [TER-011, 13.2:9]
covers: [app-shell/close-dialogs, 13.2:9]
type: task
scope: ui
size: S
```
**Goal:** Close-tab/close-app confirmation dialogs rebuilt per design.

**Acceptance criteria:**
- [ ] Same opt-out and "close anyway" semantics.

**Verification:** manual close with running process.

### app-shell-D23 — Design-system primitives and global styles
```yaml
id: app-shell-D23
depends-on: [app-shell-D02, app-shell-D03]
refs: [UX-004, UX-006, 5.10:9]
covers: [app-shell/ui-primitives, app-shell/styles]
type: task
scope: ui
size: L
size-exception: Primitive restyle has wide fan-in; split per primitive group when the design is known (one PR per group).
```
**Goal:** Replace Terax styling of primitives and globals.css with the user's tokens, keeping terminal font-face rules and the motion/compositing budget tests.

**Acceptance criteria:**
- [ ] Terax `terax-*` animations removed or renamed per design.
- [ ] `@font-face` for terminal symbol fonts preserved.
- [ ] Motion/compositing budget tests adapted and green.

**Verification:** `pnpm test`; visual check light/dark.

### app-shell-D24 — Visible app name and Terax storage keys in the shell
```yaml
id: app-shell-D24
depends-on: [build-identity-D01?]
refs: [identity:1, identity:2, 13.2:21]
covers: [app-shell/main-entry, app-shell/window-title]
type: task
scope: ui
size: XS
```
**Goal:** The shell shows "lut" and its webview keys are confirmed isolated from Terax.

**Acceptance criteria:**
- [ ] `index.html` title and `useWindowTitle` APP_NAME read "lut"; "Quit Terax?" text updated.
- [ ] Verified that webview localStorage is under lut's data dir after the bundle id change (documented).

**Verification:** run lut next to an installed Terax; sidebar width / palette MRU are independent.

### app-shell-D25 — Update budget tests after AI/editor removal and bundle id change
```yaml
id: app-shell-D25
depends-on: [app-shell-D09, build-identity-D01?]
refs: [F2:8, 13.4:1]
covers: [app-shell/budget-tests, F2:8]
type: task
scope: ui
size: S
```
**Goal:** dist/eager/feature-loading tests reflect the reduced bundle and the new identifier.

**Acceptance criteria:**
- [ ] Forbidden-chunk lists and lazy-stack expectations match remaining modules.
- [ ] Bench identifier guard uses lut's identifier.

**Verification:** `pnpm test src/app`.

### app-shell-D26 — Decide IDE-tied shell helpers
```yaml
id: app-shell-D26
depends-on: [ide-tools-D01?]
refs: [F2:6, UX-009]
covers: [app-shell/git-branch-hook, app-shell/lib-asset-grant, app-shell/code-highlight-css]
type: task
scope: ui
size: XS
```
**Goal:** Move `useGitBranch`, `useAssetGrant` and `code-highlight.css` into their owning optional modules, or delete them with those modules.

**Acceptance criteria:**
- [ ] None of these remain in `src/app`, `src/lib` or `src/styles` without a consumer.

**Verification:** `pnpm tsc --noEmit`, `pnpm test`.
