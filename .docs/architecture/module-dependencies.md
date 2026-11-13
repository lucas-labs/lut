# Module dependencies and contracts

How the frontend modules depend on each other, derived from the import graph, and what each module offers and owns
(E01-08). It complements `current-state.md`, which maps the modules, stores and IPC surface one by one.

## Regenerating

The section between the `module-deps` markers below is generated. After a change that moves imports, stores, commands
or events:

```sh
pnpm docs:deps                          # rewrite the generated section
node scripts/module-deps.mjs --check    # exit 1 if the committed section is out of date
```

The script (`scripts/module-deps.mjs`) reads every non-test `.ts`/`.tsx` file under `src/` and groups files into
modules: `src/modules/<name>`, plus `app` (`src/main.tsx` and `src/app/`), `settings-window` (`src/settings/`), `lib`,
`components`, `bench` and `styles`. `settings` is `src/modules/settings` (stores and persistence), not the window.
Imports are resolved like Vite does (`@/` alias, relative paths, `index` files); `import type` and imports whose every
specifier is a type count as type-only, `import()` as lazy. Tauri commands are matched as in `current-state.md`
(string literals outside comments, plus the `git.*` and `native.*` wrapper methods).

## Findings

- **`app` is the only root.** It imports 23 of the 26 other modules and nothing imports it. Every cross-module flow
  (launch, open file, agents, control, close guards) goes through `App.tsx` (E09 splits it).
- **Shared layers:** `lib` (19 importers), `components` (17), `settings` (18, the preferences store) and `workspace`
  (14, the local/WSL environment) are the base most modules build on. `settings/store.ts` is not a leaf: it imports
  `agents/lib/launcher` and two terminal input helpers to define their preference defaults, so the
  preferences store depends on feature modules.
- **Cycles between core modules:**
  - `tabs` ↔ `terminal`: `tabs` uses the pane tree, session API and agent activity (`useTabs.ts`, `TabBar.tsx`,
    `tabAgentStatus.ts`, `useWindowTitle.ts`); `terminal` imports the `Tab` types (`TerminalStack.tsx`,
    `liveTerminals.ts`, type-only). E07-02 decouples `TerminalStack` from `Tab`.
  - `spaces` ↔ `terminal`: `useGhosttyTerminalSession.ts` reads `useSpaces`.
  - `tabs` ↔ `agents` (the back edge is type-only).
- **`ai` is gone.** It was imported by 12 modules; E05-01, E05-05, E05-09 and E05-10 cut those edges (the shared
  workspace wrappers moved to `workspace/native.ts`) and E05-13 deleted the module.
- **`terminal` reaches `bench`** from four renderer files (`smoothHooks`), active only in `__LUT_BENCH__` builds.
- **`git` is a leaf** (it imports only `workspace`); its users are `source-control`, `git-history`, `editor` (diffs),
  `explorer` (status types) and `app`.
- **Index bypass is common:** most modules are imported through internal paths rather than their `index.ts` (see
  "Deep imports" in each module's facts). The widest are `tabs/lib/useTabs.ts` (4) and `terminal/lib/panes.ts` (3). `settings` has no index at all.

## Core module contracts

The generated facts list each module's public API, state, commands, events and deep imports. For the core modules,
the contract in words:

| Module     | Offers                                                                             | Owns                                                                         | IPC                                                                                  | Known couplings                                                  |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `app`      | The window: layout, shortcut handlers, launch and close flows                      | No store; the tab model through `useTabs` state                              | `pty_close_all`, `pty_shell_name`, `agent_enable_hooks`; `lut:open-file`             | Imports 25 modules, with deep imports into `terminal` and `tabs` |
| `terminal` | `TerminalStack`, session API (write, dispose, ready, foreground), pane tree        | Sessions map, agent activity and drop stores, renderer flags in localStorage | `pty_*`, `history_*`, `window_presentation_state`; the `lut-pty` scheme              | `tabs` (types), `spaces`, `bench`, `lsp`                         |
| `tabs`     | `useTabs` (tab model, 8 kinds, planners), `TabBar`, tab switcher, window title     | Tabs and active tab in React state                                           | None                                                                                 | `terminal` (pane tree, sessions), `agents`, `editor`, `explorer` |
| `spaces`   | Spaces store, persistence and boot, switcher                                       | `useSpaces`, `lut-spaces.json`                                               | `workspace_authorize` through `workspaceNative`                                      | `tabs` (serializes `Tab[]`), `terminal`, `workspace`             |
| `agents`   | Notification bell and bridge, launcher, attention target                           | `useAgentStore`                                                              | `agent_enable_hooks`, `agent_hooks_status`; `lut:agent-signal` through `terminal`    | `terminal` (activity), `tabs`; `model/` not wired                |
| `control`  | `useControlBridge` (CLI `identify`/`open`); a staged agent-event API (`agents.ts`) | Nothing                                                                      | `control_*`, `agent_decision*`, `agent_hooks_*`; `lut:control-request`, agent events | `tabs`, `terminal` (pane context); only `app` imports it         |
| `editor`   | Editor and git diff stacks                                                         | `useDiagnosticsStore`                                                        | `fs_*` read/write/stat, `shell_run_command` (formatter), git diffs through `git`     | `lsp`, `explorer`, `markdown`, `theme`, `tabs`                   |
| `git`      | The `git` API wrapper, change subscription, types                                  | Nothing                                                                      | `git_*` and `task_*` through wrappers; `lut:git-changed`                             | `workspace` only; many wrappers unused (E02-04)                  |

## Generated

<!-- module-deps:start -->

Generated by `node scripts/module-deps.mjs` from 482 source files in 29 modules.

### Matrix of the core modules

Rows import from columns. A cell is the number of files of the row module that import from the column module; `t` marks edges that are only type imports, `l` edges that are only lazy `import()`.

| from \ to    | app | terminal | tabs | spaces | agents | control | editor | git | other modules                                                                                                                                                                                  |
| ------------ | --- | -------- | ---- | ------ | ------ | ------- | ------ | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **app**      | ·   | 13       | 20   | 6      | 3      | 1       | 6      |     | bench, command-palette, components, explorer, git-history, header, lib, lsp, markdown, navigation, platform, preview, sessions, settings, shortcuts, sidebar, source-control, theme, workspace |
| **terminal** |     | ·        |      | 1      |        |         |        |     | bench, components, lib, lsp, platform, settings, styles, theme, workspace                                                                                                                      |
| **tabs**     |     | 3        | ·    |        | 2      |         |        |     | components, lib, navigation, platform, shortcuts                                                                                                                                               |
| **spaces**   |     | 2        | 2t   | ·      |        |         |        |     | lib, navigation, settings, shortcuts, workspace                                                                                                                                                |
| **agents**   |     | 2        | 1t   |        | ·      |         |        |     | components, lib, platform, settings, shortcuts                                                                                                                                                 |
| **control**  |     | 1        |      | 1      | 2t     | ·       |        |     | navigation, platform                                                                                                                                                                           |
| **editor**   |     |          | 3t   |        |        |         | ·      | 1   | components, explorer, lib, lsp, markdown, navigation, settings, theme, workspace                                                                                                               |
| **git**      |     |          |      |        |        |         |        | ·   | workspace                                                                                                                                                                                      |

### Dependencies of every module

Imports to and from `components` and `lib` (shared UI primitives and helpers) are counted like any other. Counts are importing files.

| Module              | Imports from                                                                                                                                                                                                                                                                                                                                                                                                                                 | Imported by                                                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **agents**          | components 3, lib 2, platform 2, settings 2, shortcuts 1, tabs 1 (1 type-only), terminal 2                                                                                                                                                                                                                                                                                                                                                   | app 3, control 2 (2 type-only), header 1, navigation 1, settings 1, settings-window 1, tabs 2 (1 type-only)                                                                                                                                                       |
| **app**             | agents 3, bench 2 (2 lazy), command-palette 3 (1 type-only), components 5, control 1, editor 6 (2 type-only), explorer 3 (1 type-only), git-history 2 (1 type-only), header 4 (3 type-only), lib 6, lsp 1, markdown 1, navigation 15, platform 9, preview 2 (1 type-only), sessions 1, settings 8, shortcuts 1, sidebar 6 (3 type-only), source-control 2, spaces 6, tabs 20 (12 type-only), terminal 13 (2 type-only), theme 2, workspace 4 | —                                                                                                                                                                                                                                                                 |
| **bench**           | settings 1, tabs 2 (2 type-only), terminal 2                                                                                                                                                                                                                                                                                                                                                                                                 | app 2 (2 lazy), terminal 4                                                                                                                                                                                                                                        |
| **command-palette** | components 1, explorer 1, header 1 (1 type-only), lib 2, navigation 1, settings 1, shortcuts 2 (1 type-only), tabs 1, terminal 1, theme 1, workspace 2                                                                                                                                                                                                                                                                                       | app 3 (1 type-only)                                                                                                                                                                                                                                               |
| **components**      | lib 38, platform 1, theme 1                                                                                                                                                                                                                                                                                                                                                                                                                  | agents 3, app 5, command-palette 1, editor 2, explorer 2, git-history 1, header 3, lsp 1, markdown 1, preview 1, settings-window 8, source-control 1, tabs 2, terminal 1                                                                                          |
| **control**         | agents 2 (2 type-only), navigation 2 (1 type-only), platform 1, spaces 1, terminal 1                                                                                                                                                                                                                                                                                                                                                         | app 1                                                                                                                                                                                                                                                             |
| **editor**          | components 2, explorer 1, git 1, lib 7, lsp 3, markdown 1, navigation 3 (1 type-only), settings 6 (2 type-only), tabs 3 (3 type-only), theme 2, workspace 4                                                                                                                                                                                                                                                                                  | app 6 (2 type-only), header 1 (1 type-only), lsp 1, settings-window 1, source-control 1                                                                                                                                                                           |
| **explorer**        | components 2, git 3 (3 type-only), lib 4, platform 2, settings 3, shortcuts 1, terminal 1 (1 type-only), workspace 7 (1 type-only)                                                                                                                                                                                                                                                                                                           | app 3 (1 type-only), command-palette 1, editor 1, git-history 1, markdown 1, source-control 1                                                                                                                                                                     |
| **git**             | workspace 1                                                                                                                                                                                                                                                                                                                                                                                                                                  | editor 1, explorer 3 (3 type-only), git-history 2 (1 type-only), source-control 6                                                                                                                                                                                 |
| **git-history**     | components 1, explorer 1, git 2 (1 type-only), lib 1, tabs 1 (1 type-only)                                                                                                                                                                                                                                                                                                                                                                   | app 2 (1 type-only)                                                                                                                                                                                                                                               |
| **header**          | agents 1, components 3, editor 1 (1 type-only), lib 2, navigation 1 (1 type-only), platform 2, settings 2, shortcuts 1, tabs 1, terminal 1 (1 type-only), workspace 1                                                                                                                                                                                                                                                                        | app 4 (3 type-only), command-palette 1 (1 type-only)                                                                                                                                                                                                              |
| **lib**             | platform 1, settings 1, workspace 1                                                                                                                                                                                                                                                                                                                                                                                                          | agents 2, app 6, command-palette 2, components 38, editor 7, explorer 4, git-history 1, header 2, lsp 1, markdown 5, navigation 1, preview 1, settings-window 3, sidebar 1, source-control 1, spaces 3, tabs 4, terminal 8                                        |
| **lsp**             | components 1, editor 1, lib 1, settings 5 (1 type-only), workspace 3                                                                                                                                                                                                                                                                                                                                                                         | app 1, editor 3, settings-window 2, terminal 1                                                                                                                                                                                                                    |
| **markdown**        | components 1, explorer 1, lib 5, tabs 1 (1 type-only), workspace 1                                                                                                                                                                                                                                                                                                                                                                           | app 1, editor 1                                                                                                                                                                                                                                                   |
| **navigation**      | agents 1, lib 1, terminal 4                                                                                                                                                                                                                                                                                                                                                                                                                  | app 15, command-palette 1, control 2 (1 type-only), editor 3 (1 type-only), header 1 (1 type-only), sessions 1, spaces 4 (1 type-only), tabs 7 (3 type-only), theme 1                                                                                             |
| **platform**        | —                                                                                                                                                                                                                                                                                                                                                                                                                                            | agents 2, app 9, components 1, control 1, explorer 2, header 2, lib 1, settings-window 5, shortcuts 2, source-control 1, tabs 1, terminal 5                                                                                                                       |
| **preview**         | components 1, lib 1, tabs 1 (1 type-only)                                                                                                                                                                                                                                                                                                                                                                                                    | app 2 (1 type-only)                                                                                                                                                                                                                                               |
| **sessions**        | navigation 1, terminal 1                                                                                                                                                                                                                                                                                                                                                                                                                     | app 1                                                                                                                                                                                                                                                             |
| **settings**        | agents 1, shortcuts 1 (1 type-only), terminal 1                                                                                                                                                                                                                                                                                                                                                                                              | agents 2, app 8, bench 1, command-palette 1, editor 6 (2 type-only), explorer 3, header 2, lib 1, lsp 5 (1 type-only), settings-window 7, shortcuts 3, spaces 2, terminal 5 (1 type-only), theme 5, workspace 1                                                   |
| **settings-window** | agents 1, components 8, editor 1, lib 3, lsp 2, platform 5, settings 7, shortcuts 2, terminal 1, theme 4                                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                 |
| **shortcuts**       | platform 2, settings 3                                                                                                                                                                                                                                                                                                                                                                                                                       | agents 1, app 1, command-palette 2 (1 type-only), explorer 1, header 1, settings 1 (1 type-only), settings-window 2, spaces 1, tabs 2                                                                                                                             |
| **sidebar**         | lib 1                                                                                                                                                                                                                                                                                                                                                                                                                                        | app 6 (3 type-only), source-control 3 (3 type-only)                                                                                                                                                                                                               |
| **source-control**  | components 1, editor 1, explorer 1, git 6, lib 1, platform 1, sidebar 3 (3 type-only), tabs 2 (2 type-only), workspace 1                                                                                                                                                                                                                                                                                                                     | app 2                                                                                                                                                                                                                                                             |
| **spaces**          | lib 3, navigation 4 (1 type-only), settings 2, shortcuts 1, tabs 2 (2 type-only), terminal 2, workspace 4 (2 type-only)                                                                                                                                                                                                                                                                                                                      | app 6, control 1, terminal 1                                                                                                                                                                                                                                      |
| **styles**          | —                                                                                                                                                                                                                                                                                                                                                                                                                                            | terminal 1                                                                                                                                                                                                                                                        |
| **tabs**            | agents 2 (1 type-only), components 2, lib 4, navigation 7 (3 type-only), platform 1, shortcuts 2, terminal 3 (1 type-only)                                                                                                                                                                                                                                                                                                                   | agents 1 (1 type-only), app 20 (12 type-only), bench 2 (2 type-only), command-palette 1, editor 3 (3 type-only), git-history 1 (1 type-only), header 1, markdown 1 (1 type-only), preview 1 (1 type-only), source-control 2 (2 type-only), spaces 2 (2 type-only) |
| **terminal**        | bench 4, components 1, lib 8, lsp 1, platform 5, settings 5 (1 type-only), spaces 1, styles 1, theme 2, workspace 3                                                                                                                                                                                                                                                                                                                          | agents 2, app 13 (2 type-only), bench 2, command-palette 1, control 1, explorer 1 (1 type-only), header 1 (1 type-only), navigation 4, sessions 1, settings 1, settings-window 1, spaces 2, tabs 3 (1 type-only)                                                  |
| **theme**           | navigation 1, settings 5, workspace 2                                                                                                                                                                                                                                                                                                                                                                                                        | app 2, command-palette 1, components 1, editor 2, settings-window 4, terminal 2                                                                                                                                                                                   |
| **workspace**       | settings 1                                                                                                                                                                                                                                                                                                                                                                                                                                   | app 4, command-palette 2, editor 4, explorer 7 (1 type-only), git 1, header 1, lib 1, lsp 3, markdown 1, source-control 1, spaces 4 (2 type-only), terminal 3, theme 2                                                                                            |

### Contract facts per module

Public API: what `index.ts` exports. Owned state: zustand stores, plugin-store files and localStorage keys declared in the module. IPC: Tauri commands called directly or through the `git`/`native` wrappers, and event names referenced. Deep imports: files of the module imported by other modules without going through its `index.ts`.

#### agents

- **Public API** (`modules/agents/index.ts`): `AgentLaunchRequest`, `AgentNotificationsBridge`, `NotificationBell`, `findAgentLauncher`, `nextAttentionTarget`, `validateAgentLaunchCommand`
- **Owned state:** `useAgentStore`
- **Commands:** `agent_enable_hooks`, `agent_hooks_status`
- **Events:** —
- **Deep imports:** `components/AgentLauncherPanel.tsx` (tabs), `lib/launcher.ts` (header, navigation, settings, tabs), `lib/notify.ts` (settings-window), `model/index.ts` (control)

#### app

- **Public API** (no index): —
- **Owned state:** —
- **Commands:** `agent_enable_hooks`, `pty_close_all`; through wrappers: `workspace_authorize`, `workspace_current_dir`
- **Events:** `lut:open-file`
- **Deep imports:** —

#### bench

- **Public API** (no index): —
- **Owned state:** `lut:bench:` (localStorage), `lut:terminal-diagnostics` (localStorage)
- **Commands:** `bench_config`, `bench_exit`, `bench_window`
- **Events:** —
- **Deep imports:** —

#### command-palette

- **Public API** (`modules/command-palette/index.ts`): `CommandPalette`, `OpenFileTarget`, `PaletteInitialMode`, `createCommandItems`
- **Owned state:** `lut-palette-mru` (localStorage), `lut-palette-recent-files` (localStorage)
- **Commands:** `fs_grep_interactive`, `fs_search`, `fs_warm_index`
- **Events:** —
- **Deep imports:** —

#### components

- **Public API** (no index): —
- **Owned state:** —
- **Commands:** —
- **Events:** —
- **Deep imports:** —

#### control

- **Public API** (`modules/control/index.ts`): `useControlBridge`
- **Owned state:** —
- **Commands:** `agent_decision_respond`, `agent_decisions_ready`, `agent_disable_hooks`, `agent_enable_hooks`, `agent_hooks_apply`, `agent_hooks_plan`, `agent_hooks_status`, `control_frontend_ready`, `control_respond`
- **Events:** `lut:agent-event`, `lut:control-request`, `lut:terminal-notification`
- **Deep imports:** —

#### editor

- **Public API** (`modules/editor/index.ts`): `EditorPaneHandle`, `EditorStack`, `GitDiffStack`, `NewEditorDialog`, `useApplyEditorFontSize`, `useEditorFileSync`
- **Owned state:** `useDiagnosticsStore`
- **Commands:** `fs_create_file`, `fs_read_file`, `fs_stat`, `fs_write_file`, `shell_run_command`; through wrappers: `git_commit_file_diff`, `git_diff_content`
- **Events:** `fs:file-written`
- **Deep imports:** `lib/diffCache.ts` (source-control), `lib/externalFormat.ts` (settings-window), `lib/languageDefinitions.ts` (app, settings-window), `lib/languageResolver.ts` (app, lsp)

#### explorer

- **Public API** (`modules/explorer/index.ts`): `FileExplorer`, `FileExplorerHandle`
- **Owned state:** —
- **Commands:** `fs_clipboard_paths`, `fs_copy`, `fs_create_dir`, `fs_create_file`, `fs_delete`, `fs_delete_batch`, `fs_move`, `fs_read_dir`, `fs_rename`, `fs_search`, `fs_watch_add`, `fs_watch_remove`; through wrappers: `fs_canonicalize`
- **Events:** `fs:changed`
- **Deep imports:** `FileIcon.tsx` (app, command-palette, git-history, source-control), `lib/contextActions.ts` (source-control), `lib/menuItemClass.ts` (source-control), `lib/useFileTree.ts` (source-control), `lib/watch.ts` (editor, markdown)

#### git

- **Public API** (`modules/git/index.ts`): `* from ./changes`, `* from ./types`, `git`
- **Owned state:** —
- **Commands:** —; through wrappers: `git_unwatch`, `git_watch`
- **Events:** `lut:git-changed`
- **Deep imports:** —

#### git-history

- **Public API** (`modules/git-history/index.ts`): `GitHistorySearchHandle`, `GitHistoryStack`
- **Owned state:** —
- **Commands:** —; through wrappers: `git_commit_files`, `git_log`, `git_remote_url`
- **Events:** —
- **Deep imports:** —

#### header

- **Public API** (`modules/header/index.ts`): `SearchInlineHandle`, `SearchTarget`, `TitleBar`, `TitleBarPlacement`
- **Owned state:** —
- **Commands:** `list_subdirs`
- **Events:** —
- **Deep imports:** —

#### lib

- **Public API** (no index): —
- **Owned state:** —
- **Commands:** `asset_grant`, `asset_revoke`
- **Events:** —
- **Deep imports:** —

#### lsp

- **Public API** (`modules/lsp/index.ts`): `LspPreset`, `LspStatusPill`, `allServers`, `detectBinary`, `lspFormatDocument`, `notifyDocumentSaved`, `redetectBinary`, `setLspNavigator`, `useLspExtension`, `useLspRuntimeStore`
- **Owned state:** `useLspRuntimeStore`
- **Commands:** `lsp_detect`, `lsp_host_pid`, `lsp_kill`, `lsp_resolve_root`, `lsp_send`, `lsp_spawn`
- **Events:** —
- **Deep imports:** `lib/navigator.ts` (terminal)

#### markdown

- **Public API** (`modules/markdown/index.ts`): `MarkdownStack`, `MarkdownViewToggle`
- **Owned state:** —
- **Commands:** `fs_canonicalize`, `fs_read_file`
- **Events:** `fs:file-written`
- **Deep imports:** —

#### navigation

- **Public API** (`modules/navigation/index.ts`): `CloseTabsPlan`, `DEFAULT_SPACE_ID`, `EditorTab`, `GitCommitFileDiffTab`, `GitDiffOpenInput`, `GitDiffTab`, `GitHistoryTab`, `MAX_PANES_PER_TAB`, `MarkdownTab`, `NavigationState`, `PreviewTab`, `Tab`, `TabIcon`, `TabNavigatorActions`, `TabNavigatorItem`, `TabNavigatorOrientation`, `TabStatus`, `TerminalTab`, `applyCloseTabsPlan`, `hasUnsavedChanges`, `initialNavigationData`, `labelFor`, `neighborTerminalTab`, `nextActiveInSpace`, `pickTabBySpaceIndex`, `planCloseOtherTabs`, `planCloseTabsToRight`, `planCommitHistoryOpen`, `planFileTabOpen`, `planGitDiffOpen`, `planMarkdownTabOpen`, `planSingleTabClose`, `planSpaceRemoval`, `registerDirtyContentProvider`, `registerTabPresenter`, `reorderTabsByGap`, `switcherOrder`, `useNavigationStore`, `useNavigatorItems`
- **Owned state:** `useNavigationStore`
- **Commands:** —
- **Events:** —
- **Deep imports:** —

#### platform

- **Public API** (`modules/platform/index.ts`): `IS_MAC`, `IS_WINDOWS`, `KEY_SEP`, `MOD_PROP`, `USE_CUSTOM_WINDOW_CONTROLS`, `bringWindowToFront`, `closeWindow`, `consumeLaunchFiles`, `dragRegion`, `ensureNotificationPermission`, `fmtShortcut`, `getLaunchDir`, `initLaunchDir`, `initWindowFrame`, `isPrimaryModifierPressed`, `isWindowFullScreen`, `isWindowMaximized`, `minimizeWindow`, `onWindowCloseRequested`, `onWindowFocusChanged`, `onWindowResized`, `setWindowFullScreen`, `setWindowTitle`, `showHiddenWindow`, `toggleMaximizeWindow`, `useWindowFullScreen`
- **Owned state:** —
- **Commands:** `get_launch_dir`, `get_launch_files`, `workspace_current_dir`
- **Events:** —
- **Deep imports:** —

#### preview

- **Public API** (`modules/preview/index.ts`): `PreviewPaneHandle`, `PreviewStack`
- **Owned state:** —
- **Commands:** —
- **Events:** —
- **Deep imports:** —

#### sessions

- **Public API** (`modules/sessions/index.ts`): `startSessionReconciler`
- **Owned state:** —
- **Commands:** —
- **Events:** —
- **Deep imports:** —

#### settings

- **Public API** (no index): —
- **Owned state:** `lut-settings.json` (store file), `lut-ui-bg-image-shadow` (localStorage), `lut-ui-bg-kind-shadow` (localStorage), `usePreferencesStore`
- **Commands:** `open_settings_window`
- **Events:** `lut://prefs-changed`
- **Deep imports:** `openSettingsWindow.ts` (app, settings-window), `preferences.ts` (agents, app, command-palette, editor, explorer, header, lib, lsp, settings-window, shortcuts, spaces, terminal, theme), `store.ts` (agents, app, bench, editor, lib, lsp, settings-window, terminal, theme, workspace)

#### settings-window

- **Public API** (no index): —
- **Owned state:** —
- **Commands:** `pty_list_shells`, `wsl_list_distros`
- **Events:** `lut:settings-tab`
- **Deep imports:** —

#### shortcuts

- **Public API** (`modules/shortcuts/index.ts`): `KeyBinding`, `SHORTCUTS`, `ShortcutHandlers`, `ShortcutId`, `getBindingTokens`, `shortcutLabel`, `shouldDisablePaneSwapShortcut`, `tabDigit`, `useGlobalShortcuts`, `useShortcutHint`, `useShortcutLabel`
- **Owned state:** —
- **Commands:** —
- **Events:** —
- **Deep imports:** `shortcuts.ts` (header, settings, settings-window)

#### sidebar

- **Public API** (`modules/sidebar/index.ts`): `SIDEBAR_MAX_WIDTH`, `SIDEBAR_MIN_WIDTH`, `SidebarRail`, `SidebarViewId`, `useSidebarPanel`
- **Owned state:** `lut.sidebar.collapsed` (localStorage), `lut.sidebar.view` (localStorage), `lut.sidebar.width` (localStorage)
- **Commands:** —
- **Events:** —
- **Deep imports:** —

#### source-control

- **Public API** (`modules/source-control/index.ts`): `SourceControlPanel`, `useRepositoryTargeting`, `useSourceControlContext`
- **Owned state:** —
- **Commands:** —; through wrappers: `git_checkout_branch`, `git_commit`, `git_discard`, `git_fetch`, `git_list_branches`, `git_panel_snapshot`, `git_pull_ff_only`, `git_push`, `git_resolve_repo`, `git_stage`, `git_status`, `git_unstage`
- **Events:** —
- **Deep imports:** —

#### spaces

- **Public API** (`modules/spaces/index.ts`): `SpacesView`, `useSpacePersistence`, `useSpaces`, `useSpacesBoot`
- **Owned state:** `lut-spaces.json` (store file), `useSpaces`
- **Commands:** —; through wrappers: `workspace_authorize`
- **Events:** —
- **Deep imports:** `lib/useSpaces.ts` (terminal)

#### styles

- **Public API** (no index): —
- **Owned state:** —
- **Commands:** —
- **Events:** —
- **Deep imports:** —

#### tabs

- **Public API** (`modules/tabs/index.ts`): `CloseTabsPlan`, `EditorTab`, `GitCommitFileDiffTab`, `GitDiffTab`, `GitHistoryTab`, `MAX_PANES_PER_TAB`, `MarkdownTab`, `PreviewTab`, `TABS_COLUMN_MAX_WIDTH`, `TABS_COLUMN_MIN_WIDTH`, `Tab`, `TabNavigator`, `TabSwitcher`, `nextActiveInSpace`, `planCloseOtherTabs`, `planCloseTabsToRight`, `selectLiveTerminals`, `selectTabAgentStatus`, `useTabSwitcher`, `useTabs`, `useTabsColumn`, `useWindowTitle`, `useWorkspaceCwd`
- **Owned state:** `lut.tabs.columnCollapsed` (localStorage), `lut.tabs.columnWidth` (localStorage)
- **Commands:** —
- **Events:** —
- **Deep imports:** —

#### terminal

- **Public API** (`modules/terminal/index.ts`): `PaneBounds`, `TerminalPaneHandle`, `TerminalPathDropTarget`, `TerminalStack`, `TerminalStackEntry`, `clearFocusedTerminal`, `findLeafCwd`, `hasLeaf`, `isTerminalSurfaceTarget`, `leafHasForegroundProcess`, `leafIdForPty`, `leafIds`, `ptyIdForLeaf`, `subscribeAgentSignals`, `useAgentActivityStore`, `useTerminalFileDrop`, `whenSessionReady`, `writeToSession`
- **Owned state:** `lut.experimental.terminal-backend` (localStorage), `lut:terminal-diagnostics` (localStorage), `lut:terminal-gc-mirror` (localStorage), `lut:terminal-text-contrast` (localStorage), `useAgentActivityStore`, `useTerminalDropStore`
- **Commands:** `font_face_data`, `font_face_find`, `fs_canonicalize`, `fs_stat`, `pty_close`, `pty_diagnostics`, `pty_has_foreground_process`, `pty_open`, `pty_resize`, `pty_session_shell`, `pty_set_colors`, `pty_set_presentation`, `pty_stream_open`, `pty_write`, `window_presentation_state`
- **Events:** `lut:agent-signal`, `lut:window-presentation`
- **Deep imports:** `ghostty/input/macOptionAsAlt.ts` (settings, settings-window), `ghostty/input/terminalWheel.ts` (settings), `ghostty/renderScheduling.ts` (app), `ghostty/windowPresentation.ts` (app), `lib/agentActivity.ts` (tabs), `lib/panes.ts` (agents, control, navigation, sessions, spaces, tabs), `lib/terminalClipboard.ts` (bench), `lib/terminalDiagnostics.ts` (app, bench), `lib/terminalDiagnosticsEnabled.ts` (app), `lib/terminalSessionApi.ts` (sessions), `search/TerminalSearchController.ts` (app, header)

#### theme

- **Public API** (`modules/theme/index.ts`): `LivePageResizeBridge`, `ThemeProvider`, `WindowActivityBridge`, `WindowVibrancyBridge`, `listBuiltinThemes`, `resolveEditorThemeId`, `resolveTerminalFont`, `useTheme`, `useThemeFileEditing`
- **Owned state:** `lut-custom-themes.json` (store file), `lut-ui-theme-id-shadow` (localStorage), `lut-ui-theme-shadow` (localStorage)
- **Commands:** `fs_create_dir`, `fs_delete`, `fs_read_file`, `fs_stat`, `fs_write_file`, `window_backdrop_kind`, `window_set_backdrop`
- **Events:** `fs:file-written`, `lut://custom-themes-changed`, `lut://theme-edit`
- **Deep imports:** `bgImageStore.ts` (settings-window), `customThemes.ts` (settings-window), `themeFiles.ts` (settings-window), `themes/index.ts` (settings-window), `types.ts` (settings-window), `validateTheme.ts` (settings-window), `vibrancy.ts` (settings-window), `WindowActivityBridge.tsx` (editor)

#### workspace

- **Public API** (`modules/workspace/index.ts`): `LOCAL_WORKSPACE`, `WorkspaceEnv`, `currentWorkspaceEnv`, `currentWorkspaceScopeKey`, `getWslHome`, `parseWorkspaceScopeKey`, `useWorkspaceEnvStore`, `workspaceNative`, `workspaceScopeKey`
- **Owned state:** `useWorkspaceEnvStore`
- **Commands:** `wsl_home`, `wsl_list_distros`
- **Events:** —
- **Deep imports:** —

<!-- module-deps:end -->
