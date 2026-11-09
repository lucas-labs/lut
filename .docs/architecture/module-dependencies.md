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
- **`terminal` reaches `bench`** from four renderer files (`smoothHooks`), active only in `__TERAX_BENCH__` builds.
- **`git` is a leaf** (it imports only `workspace`); its users are `source-control`, `git-history`, `editor` (diffs),
  `explorer` (status types) and `app`.
- **Index bypass is common:** most modules are imported through internal paths rather than their `index.ts` (see
  "Deep imports" in each module's facts). The widest are `tabs/lib/useTabs.ts` (4) and `terminal/lib/panes.ts` (3). `settings` has no index at all.

## Core module contracts

The generated facts list each module's public API, state, commands, events and deep imports. For the core modules,
the contract in words:

| Module     | Offers                                                                             | Owns                                                                         | IPC                                                                                    | Known couplings                                                  |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `app`      | The window: layout, shortcut handlers, launch and close flows                      | No store; the tab model through `useTabs` state                              | `pty_close_all`, `pty_shell_name`, `agent_enable_hooks`; `terax:open-file`             | Imports 25 modules, with deep imports into `terminal` and `tabs` |
| `terminal` | `TerminalStack`, session API (write, dispose, ready, foreground), pane tree        | Sessions map, agent activity and drop stores, renderer flags in localStorage | `pty_*`, `history_*`, `window_presentation_state`; the `terax-pty` scheme              | `tabs` (types), `spaces`, `bench`, `lsp`                         |
| `tabs`     | `useTabs` (tab model, 8 kinds, planners), `TabBar`, tab switcher, window title     | Tabs and active tab in React state                                           | None                                                                                   | `terminal` (pane tree, sessions), `agents`, `editor`, `explorer` |
| `spaces`   | Spaces store, persistence and boot, switcher                                       | `useSpaces`, `lut-spaces.json`                                               | `workspace_authorize` through `workspaceNative`                                        | `tabs` (serializes `Tab[]`), `terminal`, `workspace`             |
| `agents`   | Notification bell and bridge, launcher, attention target                           | `useAgentStore`                                                              | `agent_enable_hooks`, `agent_hooks_status`; `terax:agent-signal` through `terminal`    | `terminal` (activity), `tabs`; `model/` not wired                |
| `control`  | `useControlBridge` (CLI `identify`/`open`); a staged agent-event API (`agents.ts`) | Nothing                                                                      | `control_*`, `agent_decision*`, `agent_hooks_*`; `terax:control-request`, agent events | `tabs`, `terminal` (pane context); only `app` imports it         |
| `editor`   | Editor and git diff stacks                                                         | `useDiagnosticsStore`                                                        | `fs_*` read/write/stat, `shell_run_command` (formatter), git diffs through `git`       | `lsp`, `explorer`, `markdown`, `theme`, `tabs`                   |
| `git`      | The `git` API wrapper, change subscription, types                                  | Nothing                                                                      | `git_*` and `task_*` through wrappers; `terax:git-changed`                             | `workspace` only; many wrappers unused (E02-04)                  |

## Generated

<!-- module-deps:start -->

Generated by `node scripts/module-deps.mjs` from 437 source files in 27 modules.

### Matrix of the core modules

Rows import from columns. A cell is the number of files of the row module that import from the column module; `t` marks edges that are only type imports, `l` edges that are only lazy `import()`.

| from \ to    | app | terminal | tabs | spaces | agents | control | editor | git | other modules                                                                                                                                                             |
| ------------ | --- | -------- | ---- | ------ | ------ | ------- | ------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **app**      | ·   | 5        | 7    | 1      | 1      | 1       | 2      |     | bench, command-palette, components, explorer, git-history, header, lib, lsp, markdown, preview, settings, shortcuts, sidebar, source-control, statusbar, theme, workspace |
| **terminal** |     | ·        | 2t   | 1      |        |         |        |     | bench, components, lib, lsp, settings, styles, theme, workspace                                                                                                           |
| **tabs**     |     | 4        | ·    |        | 3      |         | 1      |     | components, explorer, lib, shortcuts                                                                                                                                      |
| **spaces**   |     | 2        | 4    | ·      |        |         |        |     | components, lib, settings, shortcuts, workspace                                                                                                                           |
| **agents**   |     | 2        | 1t   |        | ·      |         |        |     | components, lib, settings, shortcuts                                                                                                                                      |
| **control**  |     | 1        | 2    |        | 2t     | ·       |        |     | —                                                                                                                                                                         |
| **editor**   |     |          | 3t   |        |        |         | ·      | 1   | components, explorer, lib, lsp, markdown, settings, theme, workspace                                                                                                      |
| **git**      |     |          |      |        |        |         |        | ·   | workspace                                                                                                                                                                 |

### Dependencies of every module

Imports to and from `components` and `lib` (shared UI primitives and helpers) are counted like any other. Counts are importing files.

| Module              | Imports from                                                                                                                                                                                                                                                                                                                | Imported by                                                                                                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **agents**          | components 2, lib 2, settings 2, shortcuts 1, tabs 1 (1 type-only), terminal 2 (1 type-only)                                                                                                                                                                                                                                | app 1, control 2 (2 type-only), header 1, settings 1, settings-window 1, tabs 3                                                                                                                                                                                                                                                           |
| **app**             | agents 1, bench 2 (2 lazy), command-palette 1, components 2, control 1, editor 2, explorer 1, git-history 2 (1 type-only), header 1, lib 3, lsp 1, markdown 1, preview 2 (1 type-only), settings 4, shortcuts 1, sidebar 1, source-control 1, spaces 1, statusbar 1, tabs 7 (5 type-only), terminal 5, theme 1, workspace 2 | —                                                                                                                                                                                                                                                                                                                                         |
| **bench**           | settings 1, tabs 2 (2 type-only), terminal 2                                                                                                                                                                                                                                                                                | app 2 (2 lazy), terminal 4                                                                                                                                                                                                                                                                                                                |
| **command-palette** | components 1, explorer 1, header 1 (1 type-only), lib 1, settings 1, shortcuts 2 (1 type-only), tabs 1, terminal 1, theme 1, workspace 2                                                                                                                                                                                    | app 1                                                                                                                                                                                                                                                                                                                                     |
| **components**      | lib 38, theme 1                                                                                                                                                                                                                                                                                                             | agents 2, app 2, command-palette 1, editor 2, explorer 2, git-history 1, header 2, lsp 1, markdown 1, preview 1, settings-window 8, source-control 1, spaces 1, statusbar 3, tabs 2, terminal 1                                                                                                                                           |
| **control**         | agents 2 (2 type-only), tabs 2 (1 type-only), terminal 1                                                                                                                                                                                                                                                                    | app 1                                                                                                                                                                                                                                                                                                                                     |
| **editor**          | components 2, explorer 1, git 1, lib 6, lsp 2, markdown 1, settings 6 (2 type-only), tabs 3 (3 type-only), theme 2, workspace 4                                                                                                                                                                                             | app 2, header 1 (1 type-only), lsp 1, settings-window 1, source-control 1, statusbar 1, tabs 1                                                                                                                                                                                                                                            |
| **explorer**        | components 2, git 3 (3 type-only), lib 4, settings 3, shortcuts 1, terminal 1 (1 type-only), workspace 7 (1 type-only)                                                                                                                                                                                                      | app 1, command-palette 1, editor 1, git-history 1, markdown 1, source-control 1, tabs 1                                                                                                                                                                                                                                                   |
| **git**             | workspace 1                                                                                                                                                                                                                                                                                                                 | editor 1, explorer 3 (3 type-only), git-history 2 (1 type-only), source-control 6, statusbar 1                                                                                                                                                                                                                                            |
| **git-history**     | components 1, explorer 1, git 2 (1 type-only), lib 1, tabs 1 (1 type-only)                                                                                                                                                                                                                                                  | app 2 (1 type-only)                                                                                                                                                                                                                                                                                                                       |
| **header**          | agents 1, components 2, editor 1 (1 type-only), lib 2, settings 1, shortcuts 1, tabs 1, terminal 1 (1 type-only)                                                                                                                                                                                                            | app 1, command-palette 1 (1 type-only)                                                                                                                                                                                                                                                                                                    |
| **lib**             | settings 1, workspace 1                                                                                                                                                                                                                                                                                                     | agents 2, app 3, command-palette 1, components 38, editor 6, explorer 4, git-history 1, header 2, markdown 5, preview 1, settings-window 5, shortcuts 2, sidebar 1, source-control 1, spaces 3, statusbar 2, tabs 3, terminal 10                                                                                                          |
| **lsp**             | components 1, editor 1, settings 5 (1 type-only), workspace 3                                                                                                                                                                                                                                                               | app 1, editor 2, settings-window 2, statusbar 1, terminal 1                                                                                                                                                                                                                                                                               |
| **markdown**        | components 1, explorer 1, lib 5, tabs 1 (1 type-only), workspace 1                                                                                                                                                                                                                                                          | app 1, editor 1                                                                                                                                                                                                                                                                                                                           |
| **preview**         | components 1, lib 1, tabs 1 (1 type-only)                                                                                                                                                                                                                                                                                   | app 2 (1 type-only)                                                                                                                                                                                                                                                                                                                       |
| **settings**        | agents 1, shortcuts 1 (1 type-only), terminal 1                                                                                                                                                                                                                                                                             | agents 2, app 4, bench 1, command-palette 1, editor 6 (2 type-only), explorer 3, header 1, lib 1, lsp 5 (1 type-only), settings-window 7, shortcuts 3, spaces 2, statusbar 1, terminal 5 (1 type-only), theme 5, workspace 1                                                                                                              |
| **settings-window** | agents 1, components 8, editor 1, lib 5, lsp 2, settings 7, shortcuts 2, terminal 1, theme 4                                                                                                                                                                                                                                | —                                                                                                                                                                                                                                                                                                                                         |
| **shortcuts**       | lib 2, settings 3                                                                                                                                                                                                                                                                                                           | agents 1, app 1, command-palette 2 (1 type-only), explorer 1, header 1, settings 1 (1 type-only), settings-window 2, spaces 1, tabs 1                                                                                                                                                                                                     |
| **sidebar**         | lib 1                                                                                                                                                                                                                                                                                                                       | app 1, source-control 3 (3 type-only)                                                                                                                                                                                                                                                                                                     |
| **source-control**  | components 1, editor 1, explorer 1, git 6, lib 1, sidebar 3 (3 type-only), tabs 2 (2 type-only), workspace 1                                                                                                                                                                                                                | app 1                                                                                                                                                                                                                                                                                                                                     |
| **spaces**          | components 1, lib 3, settings 2, shortcuts 1, tabs 4 (2 type-only), terminal 2, workspace 4 (2 type-only)                                                                                                                                                                                                                   | app 1, terminal 1                                                                                                                                                                                                                                                                                                                         |
| **statusbar**       | components 3, editor 1, git 1, lib 2, lsp 1, settings 1, workspace 3 (1 type-only)                                                                                                                                                                                                                                          | app 1                                                                                                                                                                                                                                                                                                                                     |
| **styles**          | —                                                                                                                                                                                                                                                                                                                           | terminal 1                                                                                                                                                                                                                                                                                                                                |
| **tabs**            | agents 3, components 2, editor 1, explorer 1, lib 3, shortcuts 1, terminal 4                                                                                                                                                                                                                                                | agents 1 (1 type-only), app 7 (5 type-only), bench 2 (2 type-only), command-palette 1, control 2 (1 type-only), editor 3 (3 type-only), git-history 1 (1 type-only), header 1, markdown 1 (1 type-only), preview 1 (1 type-only), source-control 2 (2 type-only), spaces 4 (2 type-only), terminal 2 (2 type-only), theme 1 (1 type-only) |
| **terminal**        | bench 4, components 1, lib 10, lsp 1, settings 5 (1 type-only), spaces 1, styles 1, tabs 2 (2 type-only), theme 2, workspace 3                                                                                                                                                                                              | agents 2 (1 type-only), app 5, bench 2, command-palette 1, control 1, explorer 1 (1 type-only), header 1 (1 type-only), settings 1, settings-window 1, spaces 2, tabs 4                                                                                                                                                                   |
| **theme**           | settings 5, tabs 1 (1 type-only), workspace 2                                                                                                                                                                                                                                                                               | app 1, command-palette 1, components 1, editor 2, settings-window 4, terminal 2                                                                                                                                                                                                                                                           |
| **workspace**       | settings 1                                                                                                                                                                                                                                                                                                                  | app 2, command-palette 2, editor 4, explorer 7 (1 type-only), git 1, lib 1, lsp 3, markdown 1, source-control 1, spaces 4 (2 type-only), statusbar 3 (1 type-only), terminal 3, theme 2                                                                                                                                                   |

### Contract facts per module

Public API: what `index.ts` exports. Owned state: zustand stores, plugin-store files and localStorage keys declared in the module. IPC: Tauri commands called directly or through the `git`/`native` wrappers, and event names referenced. Deep imports: files of the module imported by other modules without going through its `index.ts`.

#### agents

- **Public API** (`modules/agents/index.ts`): `AgentLaunchRequest`, `AgentNotificationsBridge`, `NotificationBell`, `findAgentLauncher`, `nextAttentionTarget`, `validateAgentLaunchCommand`
- **Owned state:** `useAgentStore`
- **Commands:** `agent_enable_hooks`, `agent_hooks_status`
- **Events:** —
- **Deep imports:** `components/AgentLauncherPanel.tsx` (tabs), `lib/agentIcon.tsx` (tabs), `lib/launcher.ts` (header, settings, tabs), `lib/notify.ts` (settings-window), `model/index.ts` (control)

#### app

- **Public API** (no index): —
- **Owned state:** —
- **Commands:** `agent_enable_hooks`, `pty_close_all`; through wrappers: `workspace_authorize`, `workspace_current_dir`
- **Events:** `terax:open-file`
- **Deep imports:** —

#### bench

- **Public API** (no index): —
- **Owned state:** `terax:bench:` (localStorage), `terax:terminal-diagnostics` (localStorage)
- **Commands:** `bench_config`, `bench_exit`, `bench_window`
- **Events:** —
- **Deep imports:** —

#### command-palette

- **Public API** (`modules/command-palette/index.ts`): `CommandPalette`, `OpenFileTarget`, `PaletteInitialMode`, `createCommandItems`
- **Owned state:** `terax-palette-mru` (localStorage), `terax-palette-recent-files` (localStorage)
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
- **Events:** `terax:agent-event`, `terax:control-request`, `terax:terminal-notification`
- **Deep imports:** —

#### editor

- **Public API** (`modules/editor/index.ts`): `EditorPaneHandle`, `EditorStack`, `GitDiffStack`, `NewEditorDialog`, `useApplyEditorFontSize`, `useDiagnosticsStore`, `useEditorFileSync`
- **Owned state:** `useDiagnosticsStore`
- **Commands:** `fs_create_file`, `fs_read_file`, `fs_stat`, `fs_write_file`, `shell_run_command`; through wrappers: `git_commit_file_diff`, `git_diff_content`
- **Events:** `fs:file-written`
- **Deep imports:** `lib/diffCache.ts` (source-control), `lib/externalFormat.ts` (settings-window), `lib/languageDefinitions.ts` (settings-window, tabs), `lib/languageResolver.ts` (lsp, tabs)

#### explorer

- **Public API** (`modules/explorer/index.ts`): `FileExplorer`, `FileExplorerHandle`
- **Owned state:** —
- **Commands:** `fs_clipboard_paths`, `fs_copy`, `fs_create_dir`, `fs_create_file`, `fs_delete`, `fs_delete_batch`, `fs_move`, `fs_read_dir`, `fs_rename`, `fs_search`, `fs_watch_add`, `fs_watch_remove`; through wrappers: `fs_canonicalize`
- **Events:** `fs:changed`
- **Deep imports:** `FileIcon.tsx` (command-palette, git-history, source-control, tabs), `lib/contextActions.ts` (source-control), `lib/menuItemClass.ts` (source-control), `lib/useFileTree.ts` (source-control), `lib/watch.ts` (editor, markdown)

#### git

- **Public API** (`modules/git/index.ts`): `* from ./changes`, `* from ./types`, `git`
- **Owned state:** —
- **Commands:** —; through wrappers: `git_unwatch`, `git_watch`
- **Events:** `terax:git-changed`
- **Deep imports:** —

#### git-history

- **Public API** (`modules/git-history/index.ts`): `GitHistorySearchHandle`, `GitHistoryStack`
- **Owned state:** —
- **Commands:** —; through wrappers: `git_commit_files`, `git_log`, `git_remote_url`
- **Events:** —
- **Deep imports:** —

#### header

- **Public API** (`modules/header/index.ts`): `Header`, `SearchInlineHandle`, `SearchTarget`
- **Owned state:** —
- **Commands:** —
- **Events:** —
- **Deep imports:** —

#### lib

- **Public API** (no index): —
- **Owned state:** —
- **Commands:** `asset_grant`, `asset_revoke`, `get_launch_dir`, `get_launch_files`, `workspace_current_dir`
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

#### preview

- **Public API** (`modules/preview/index.ts`): `PreviewPaneHandle`, `PreviewStack`
- **Owned state:** —
- **Commands:** —
- **Events:** —
- **Deep imports:** —

#### settings

- **Public API** (no index): —
- **Owned state:** `lut-settings.json` (store file), `lut-ui-bg-image-shadow` (localStorage), `lut-ui-bg-kind-shadow` (localStorage), `usePreferencesStore`
- **Commands:** `open_settings_window`
- **Events:** `terax://prefs-changed`
- **Deep imports:** `openSettingsWindow.ts` (app, settings-window), `preferences.ts` (agents, app, command-palette, editor, explorer, header, lib, lsp, settings-window, shortcuts, spaces, statusbar, terminal, theme), `store.ts` (agents, app, bench, editor, lib, lsp, settings-window, terminal, theme, workspace)

#### settings-window

- **Public API** (no index): —
- **Owned state:** —
- **Commands:** `pty_list_shells`, `wsl_list_distros`
- **Events:** `terax:settings-tab`
- **Deep imports:** —

#### shortcuts

- **Public API** (`modules/shortcuts/index.ts`): `KeyBinding`, `SHORTCUTS`, `ShortcutHandlers`, `ShortcutId`, `getBindingTokens`, `shortcutLabel`, `shouldDisablePaneSwapShortcut`, `tabDigit`, `useGlobalShortcuts`, `useShortcutHint`, `useShortcutLabel`
- **Owned state:** —
- **Commands:** —
- **Events:** —
- **Deep imports:** `shortcuts.ts` (header, settings, settings-window)

#### sidebar

- **Public API** (`modules/sidebar/index.ts`): `SIDEBAR_MAX_WIDTH`, `SIDEBAR_MIN_WIDTH`, `SidebarRail`, `SidebarViewId`, `useSidebarPanel`
- **Owned state:** `terax.sidebar.collapsed` (localStorage), `terax.sidebar.view` (localStorage), `terax.sidebar.width` (localStorage)
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

- **Public API** (`modules/spaces/index.ts`): `SpaceSwitcher`, `useSpacePersistence`, `useSpaces`, `useSpacesBoot`
- **Owned state:** `lut-spaces.json` (store file), `useSpaces`
- **Commands:** —; through wrappers: `workspace_authorize`
- **Events:** —
- **Deep imports:** `lib/useSpaces.ts` (terminal)

#### statusbar

- **Public API** (`modules/statusbar/index.ts`): `StatusBar`
- **Owned state:** —
- **Commands:** `list_subdirs`, `pty_shell_name`; through wrappers: `git_resolve_repo`
- **Events:** —
- **Deep imports:** —

#### styles

- **Public API** (no index): —
- **Owned state:** —
- **Commands:** —
- **Events:** —
- **Deep imports:** —

#### tabs

- **Public API** (`modules/tabs/index.ts`): `CloseTabsPlan`, `EditorTab`, `GitCommitFileDiffTab`, `GitDiffTab`, `GitHistoryTab`, `MAX_PANES_PER_TAB`, `MarkdownTab`, `PreviewTab`, `Tab`, `TabBar`, `TabIcon`, `TabSwitcherHud`, `labelFor`, `nextActiveInSpace`, `planCloseOtherTabs`, `planCloseTabsToRight`, `useTabSwitcher`, `useTabs`, `useWindowTitle`, `useWorkspaceCwd`
- **Owned state:** —
- **Commands:** —
- **Events:** —
- **Deep imports:** `lib/useTabs.ts` (app, control, spaces, terminal)

#### terminal

- **Public API** (`modules/terminal/index.ts`): `PaneBounds`, `PaneNode`, `TerminalPaneHandle`, `TerminalPathDropTarget`, `TerminalStack`, `clearFocusedTerminal`, `disposeSession`, `findLeafCwd`, `hasLeaf`, `isTerminalSurfaceTarget`, `leafHasForegroundProcess`, `leafIdForPty`, `leafIds`, `ptyIdForLeaf`, `subscribeAgentSignals`, `useAgentActivityStore`, `useTerminalFileDrop`, `whenSessionReady`, `writeToSession`
- **Owned state:** `terax.experimental.terminal-backend` (localStorage), `terax:terminal-diagnostics` (localStorage), `terax:terminal-gc-mirror` (localStorage), `terax:terminal-text-contrast` (localStorage), `useAgentActivityStore`, `useTerminalDropStore`
- **Commands:** `fs_canonicalize`, `fs_stat`, `pty_close`, `pty_diagnostics`, `pty_has_foreground_process`, `pty_open`, `pty_resize`, `pty_session_shell`, `pty_set_colors`, `pty_set_presentation`, `pty_stream_open`, `pty_write`, `window_presentation_state`
- **Events:** `terax:agent-signal`, `terax:window-presentation`
- **Deep imports:** `ghostty/input/macOptionAsAlt.ts` (settings, settings-window), `ghostty/input/terminalWheel.ts` (settings), `ghostty/renderScheduling.ts` (app), `ghostty/windowPresentation.ts` (app), `lib/agentActivity.ts` (tabs), `lib/panes.ts` (control, spaces, tabs), `lib/terminalClipboard.ts` (bench), `lib/terminalDiagnostics.ts` (app, bench), `lib/terminalDiagnosticsEnabled.ts` (app), `lib/terminalSessionApi.ts` (tabs), `search/TerminalSearchController.ts` (app, header)

#### theme

- **Public API** (`modules/theme/index.ts`): `LivePageResizeBridge`, `ThemeProvider`, `WindowActivityBridge`, `WindowVibrancyBridge`, `listBuiltinThemes`, `resolveEditorThemeId`, `resolveTerminalFont`, `useTheme`, `useThemeFileEditing`
- **Owned state:** `lut-custom-themes.json` (store file), `lut-ui-theme-id-shadow` (localStorage), `lut-ui-theme-shadow` (localStorage)
- **Commands:** `fs_create_dir`, `fs_delete`, `fs_read_file`, `fs_stat`, `fs_write_file`, `window_backdrop_kind`, `window_set_backdrop`
- **Events:** `fs:file-written`, `terax://custom-themes-changed`, `terax://theme-edit`
- **Deep imports:** `bgImageStore.ts` (settings-window), `customThemes.ts` (settings-window), `themeFiles.ts` (settings-window), `themes/index.ts` (settings-window), `types.ts` (settings-window), `validateTheme.ts` (settings-window), `vibrancy.ts` (settings-window), `WindowActivityBridge.tsx` (editor)

#### workspace

- **Public API** (`modules/workspace/index.ts`): `LOCAL_WORKSPACE`, `WorkspaceEnv`, `currentWorkspaceEnv`, `currentWorkspaceScopeKey`, `getWslHome`, `parseWorkspaceScopeKey`, `useWorkspaceEnvStore`, `workspaceNative`, `workspaceScopeKey`
- **Owned state:** `useWorkspaceEnvStore`
- **Commands:** `wsl_home`, `wsl_list_distros`
- **Events:** —
- **Deep imports:** —

<!-- module-deps:end -->
