# Current state: modules and IPC surface

A map of the imported Terax code as it is on `master` at `4059e1a` (2026-11-09), before any refactor (E01-07). The
frontend sections and the callers named in the IPC tables were refreshed after the App split (E09-09). It
reuses the area analyses under `.docs/plan/analysis/` and re-checks their facts against the code; where they disagree,
this file wins (see [Corrections to the area analyses](#corrections-to-the-area-analyses)).

Paths are relative to `src/` for the frontend and to `src-tauri/src/` for the backend unless they start with
`src-tauri/` or another root. Line numbers are avoided on purpose: they drift with every PR.

## How it was verified

- **Commands:** the 140 entries of `tauri::generate_handler!` in `lib.rs` were extracted, and every non-test `.ts`/`.tsx`
  file under `src/` was searched, with comments stripped, for the command name as a string literal (`'name'`, `"name"`
  or `` `name` ``). The only
  `invoke` with a non-literal name (`modules/explorer/lib/useFileTree.ts`, `fs_create_dir`/`fs_create_file`) is matched
  by the same search.
- **Wrapper objects:** `modules/git/api.ts` (`git.*`) and `modules/workspace/native.ts` (`workspaceNative.*`) wrap commands in
  object methods. For those, the callers listed are the files that call the method, including chained calls split
  across lines.
- **Reachability:** an import graph from the two webview entries (`main.tsx`, `settings/main.tsx`), following static
  and dynamic imports, found which callers the running app never loads. `knip.json` declares the same files as extra
  entries.
- **Events:** every `emit`/`emit_to` in `src-tauri/src` and every `listen`/`emit` from `@tauri-apps/api/event` in
  `src/`, matched by event name or by the constant that holds it.

To re-check after a change: `git grep -n "generate_handler" src-tauri/src` gives the command list, and
`git grep -n "'<command>'" src` the callers.

## Processes and windows

| Piece            | Entry                                                       | Notes                                                                                                       |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| App process      | `src-tauri/src/main.rs` → `lib.rs::run()`                   | Tauri 2; a 2-worker tokio runtime for async commands (`modules/runtime.rs`).                                |
| Main window      | label `main`, `index.html` → `src/main.tsx` → `app/App.tsx` | Declared in `tauri.conf.json`, starts hidden; the frontend shows it after the first paint.                  |
| Settings window  | label `settings`, `settings.html` → `src/settings/main.tsx` | Created on demand by `open_settings_window`; a child of `main`.                                             |
| CLI sidecar      | `src-tauri/crates/lut-cli`                                  | Bundled as `lut-cli`; talks to the app over the control server (see [Control protocol](#control-protocol)). |
| Control protocol | `src-tauri/crates/lut-control-protocol`                     | Shared request/response and hook types between the app and the CLI.                                         |

`stats.html` at the repository root is not a window: it is the optional bundle report of `ANALYZE=true pnpm build`
(ignored by git).

## Frontend

### Entry points and shared code

| Path               | Role                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.tsx`         | Imports the global CSS and calls `bootstrap()` with the render of `<App/>`.                                                                                                                                                                                                                                                                                                                    |
| `app/bootstrap.ts` | The boot sequence, in order: window frame flag, optional react-scan, early bench driver (`__LUT_BENCH__`), `invoke('pty_close_all')` to reap orphaned PTYs, launch dir seed, session reconciler, render, show the window, terminal diagnostics.                                                                                                                                                |
| `app/App.tsx`      | The coordinator (about 250 lines): composes the hooks below and lays out `AppShell` with the title bar, tab navigator, sidebar, workspace surface and overlays.                                                                                                                                                                                                                                |
| `app/AppShell.tsx` | The window layout: title bar, sidebar, vertical tab column and workspace in one panel group; keeps the side panels at their width (`lib/sidePanelRestore.ts`).                                                                                                                                                                                                                                 |
| `app/components/`  | `WorkspaceSurface` (the central area), `AppSidebar` (Spaces, Files and Git views with the rail), `AppOverlays` (bridges, switcher, palette, dialogs), `CloseDialogs`.                                                                                                                                                                                                                          |
| `app/hooks/`       | The window's wiring, one concern each: `useAppShortcuts`, `useLaunchFiles`, `useAgentLaunch`, `useWorkspaceCoordinator` (with `useWorkspaceSwitcher`), `useTerminalPanes`, `useEditorPanes`, `usePreviewPanes`, `useSidePanels`, `useFocusMode`, `useAppSourceControl`, `useTabCommands`, `useTabClosing` (with the close guards), `useSearchTarget`, `useCommandPalette`, `useAppCloseGuard`. |
| `app/lib/`         | Pure helpers of the shell: `activeFilePath`, `sidePanelRestore`.                                                                                                                                                                                                                                                                                                                               |
| `settings/`        | The settings window app (`SettingsApp.tsx`, `sections/`, `components/`).                                                                                                                                                                                                                                                                                                                       |
| `lib/`             | Shared helpers: `utils` (`cn`), `fonts`, `useAssetGrant`, `useLatest`, `shellQuote`, `external-link`, `titleBarHold`, `useZoom`, `security/`.                                                                                                                                                                                                                                                  |
| `components/`      | `WindowControls.tsx`, `AppLogo.tsx` and shadcn primitives (`ui/`); `ui/` is excluded from lint and format.                                                                                                                                                                                                                                                                                     |
| `bench/`           | The in-app benchmark driver, loaded only when built with `LUT_BENCH` (`__LUT_BENCH__`).                                                                                                                                                                                                                                                                                                        |

### Feature modules (`src/modules/`)

Sizes count non-test `.ts`/`.tsx` files; tests are the `*.test.*` files in the module.

| Module            | Role                                                                                                                                                                               | Files | Lines  | Tests |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----- |
| `terminal`        | Panes and sessions: `TerminalStack`, `PaneTreeView`, `TerminalPane`; Ghostty WASM model and WebGPU/WebGL renderers (`ghostty/`); PTY bridge and helpers (`lib/`).                  | 126   | 24 230 | 117   |
| `explorer`        | File tree, file operations, drag and drop, clipboard paste, watcher, inline search.                                                                                                | 23    | 6 410  | 9     |
| `editor`          | CodeMirror editor, git diff stacks, external formatter, file sync.                                                                                                                 | 32    | 3 740  | 10    |
| `theme`           | Theme provider, built-in and custom themes, theme files, vibrancy, surface layer, window activity.                                                                                 | 37    | 3 595  | 14    |
| `source-control`  | Git panel: status, stage, commit, push/pull, branches.                                                                                                                             | 10    | 3 120  | 5     |
| `lsp`             | Language-server client: detection, sessions, transport, runtime store, status pill.                                                                                                | 14    | 1 905  | 7     |
| `agents`          | CLI agent tracking: activity and managed-agent stores, notification bell and bridge, launch requests.                                                                              | 20    | 1 902  | 10    |
| `command-palette` | Palette modes, fuzzy ranking, MRU, quick-open (`fs_search`) and content search (`fs_grep_interactive`).                                                                            | 12    | 1 561  | 7     |
| `navigation`      | The tab model (E08): the navigation store with tabs, panes, spaces of tabs and MRU, its planners, tab titles and icons, the navigator types.                                       | 12    | 1 519  | 17    |
| `git-history`     | Commit log pane.                                                                                                                                                                   | 7     | 1 364  | 3     |
| `spaces`          | Spaces (workspace groups): store, persistence, boot, overview.                                                                                                                     | 11    | 1 282  | 3     |
| `markdown`        | Markdown preview tabs.                                                                                                                                                             | 12    | 1 094  | 5     |
| `tabs`            | Tab navigator (strip and column), new-tab menu, Ctrl+Tab switcher, tab column state, window title, workspace cwd; `useTabs` seeds the launch tab.                                  | 12    | 972    | 5     |
| `settings`        | Settings persistence (`store.ts`, `LazyStore`), preferences store, `openSettingsWindow`.                                                                                           | 3     | 822    | 8     |
| `header`          | Title bar, cwd breadcrumb and inline search.                                                                                                                                       | 6     | 765    | 2     |
| `shortcuts`       | Shortcut registry, per-OS defaults, resolver, the global `keydown` handler.                                                                                                        | 8     | 732    | 5     |
| `control`         | Control bridge to the CLI (`useControlBridge`); `agents.ts` and most of `lib/` are a staged agent-event API not yet wired.                                                         | 8     | 576    | 6     |
| `preview`         | Web preview tabs (iframe with address bar).                                                                                                                                        | 6     | 528    | 3     |
| `git`             | Frontend git API (`api.ts`, the `git` wrapper object), change subscription (`changes.ts`), types.                                                                                  | 4     | 372    | 2     |
| `sidebar`         | Sidebar rail and panel state.                                                                                                                                                      | 4     | 273    | 1     |
| `platform`        | OS detection and shortcut formatting (`os`), launch dir and files, window calls and subscriptions (`window`), notification permission, full screen, window frame (E09-05, E09-06). | 7     | 247    | 2     |
| `workspace`       | Workspace environment (local or WSL distro) store and scope keys.                                                                                                                  | 3     | 94     | 0     |
| `sessions`        | Session reconciler: disposes the terminal session of every pane no tab holds any more.                                                                                             | 2     | 28     | 1     |

### Stores (zustand)

| Store                   | File                                     | Holds                                              |
| ----------------------- | ---------------------------------------- | -------------------------------------------------- |
| `useNavigationStore`    | `modules/navigation/store.ts`            | Tabs, active tab and space, MRU, tab/pane actions  |
| `usePreferencesStore`   | `modules/settings/preferences.ts`        | User preferences, mirrored from the settings store |
| `useSpaces`             | `modules/spaces/lib/useSpaces.ts`        | Spaces and the active space                        |
| `useWorkspaceEnvStore`  | `modules/workspace/env.ts`               | Current workspace environment (local / WSL)        |
| `useAgentActivityStore` | `modules/terminal/lib/agentActivity.ts`  | Per-pane agent activity from `lut:agent-signal`    |
| `useTerminalDropStore`  | `modules/terminal/lib/dropStore.ts`      | File-drop target over terminal panes               |
| `useAgentStore`         | `modules/agents/store/agentStore.ts`     | CLI agent sessions per pane and notifications      |
| `useDiagnosticsStore`   | `modules/editor/lib/diagnosticsStore.ts` | LSP diagnostics per file                           |
| `useLspRuntimeStore`    | `modules/lsp/lib/runtimeStore.ts`        | LSP server status                                  |

The tab model lives in `useNavigationStore` (`modules/navigation/store.ts`): tabs, the active tab, the active space, the
MRU order and every tab and pane action. `useTabs` (`modules/tabs/lib/useTabs.ts`) reads it for `App` and owns no tab
state. The terminal sessions live in a module-level map keyed by leaf id
(`modules/terminal/ghostty/useGhosttyTerminalSession.ts`).

### Persisted state

- **Tauri store files** (`@tauri-apps/plugin-store`, `LazyStore`): `lut-settings.json` (`modules/settings/store.ts`),
  `lut-spaces.json` (`modules/spaces/lib/store.ts`), `lut-custom-themes.json` (`modules/theme/customThemes.ts`).
- **localStorage:** `lut-ui-theme-shadow` (read by `index.html` and `settings.html` before first paint, written by
  `modules/theme/ThemeProvider.tsx`), `lut-ui-theme-id-shadow` (`ThemeProvider.tsx`), `lut-ui-bg-kind-shadow`,
  `lut-ui-bg-image-shadow`
  (`modules/settings/preferences.ts`), `lut.sidebar.width|view|collapsed` (`modules/sidebar/useSidebarPanel.ts`),
  `lut-palette-mru`, `lut-palette-recent-files` (`modules/command-palette/lib/`), `lut.experimental.terminal-backend`
  (`modules/terminal/backend/selection.ts`), and the diagnostics flags `lut:terminal-diagnostics`,
  `lut:terminal-gc-mirror`, `lut:terminal-text-contrast`.
- **Backend files:** the control descriptor and CLI launcher under the cache dir (`modules/control.rs`), shell-integration scripts under the
  cache dir (`modules/pty/shell_init.rs`). E02 moves all of them to lut names.

### Global side effects

**Window globals** (set on `window`):

| Global                                             | Set in                                              | Purpose                                 |
| -------------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| `__lutTerm`, `__lutTermSnapshot`, `__lutTermTrace` | `modules/terminal/lib/terminalDiagnostics.ts`       | Terminal diagnostics from the devtools  |
| `__LUT_TERMINAL_RESIZE_INTERACTION__`              | `modules/terminal/lib/terminalResizeInteraction.ts` | Resize-drag state, kept on `globalThis` |
| `__lutBenchConfig`, `__lutSmooth`                  | `bench/early.ts`, `bench/smoothHooks.ts`            | Bench builds only                       |

Build-time constants: `__LUT_BENCH__` (`vite-env.d.ts`, set by Vite from `LUT_BENCH`). `modules/preview/PreviewPane.tsx`
reads `window.__TAURI__`.

**DOM listeners on `window`/`document`**, all added inside hooks or components with cleanup (none at module scope):

| Listener                                              | Where                                                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `keydown` (capture), every global shortcut            | `modules/shortcuts/lib/useGlobalShortcuts.ts`                                                                                                |
| `keydown`/`keyup`/`blur`, Ctrl+Tab switcher           | `modules/tabs/lib/useTabSwitcher.ts`                                                                                                         |
| `keydown`/`keyup`, shortcut recorder                  | `settings/sections/ShortcutsSection.tsx`                                                                                                     |
| `beforeunload`/`blur`/`visibilitychange`, save spaces | `modules/spaces/lib/useSpacePersistence.ts`                                                                                                  |
| `visibilitychange`, renderer and PTY presentation     | `modules/terminal/ghostty/windowPresentation.ts`, `modules/terminal/lib/ptyPresentation.ts`, `modules/theme/SurfaceLayer.tsx`                |
| `focus`/`blur`                                        | `modules/terminal/ghostty/renderScheduling.ts`, `modules/theme/windowActivity.ts`, `modules/source-control/useSourceControl.ts` (focus only) |
| `resize`                                              | `modules/theme/livePageResize.ts`, `modules/theme/SurfaceLayer.tsx`                                                                          |
| `pointermove`/`pointerup`/`pointercancel`, drags      | `modules/explorer/lib/useExplorerDnd.ts`, `modules/terminal/PaneTreeView.tsx`                                                                |

**DOM custom events:** none since E05-06 removed `lut:ai-attach-file`.

**Tauri window hooks:** window calls and subscriptions go through `modules/platform/window.ts` (`onWindowCloseRequested`
for `app/hooks/useAppCloseGuard.ts`, `onWindowResized` for `components/WindowControls.tsx`, `onWindowFocusChanged` for
`modules/agents/lib/useWindowFocus.ts`); the terminal renderer keeps its own `onFocusChanged`
(`modules/terminal/ghostty/renderScheduling.ts`). `onDragDropEvent`: `modules/explorer/lib/useExplorerFileDrop.ts`,
`modules/terminal/lib/useTerminalFileDrop.ts`.

## Backend

### Boot (`lib.rs::run()`)

1. Handles the `__lut_notify <agent> <event>` argv subcommand (Windows agent hooks), resolves the launch target
   (directory or files from argv) and snapshots the launch cwd (`workspace::init_launch_cwd`).
2. **Plugins:** clipboard-manager, window-state (without `VISIBLE`), store, os, notification, log (Info),
   opener; on macOS also the app menu (`modules/app_menu.rs`).
3. **URI schemes:** `lut-pty` → `pty::stream_protocol` (terminal output, see [Channels](#channels-and-uri-schemes)),
   `asset` → `fs::assets::serve`.
4. **Page load** (`Started`): revokes the webview's asset grants, resets its PTY streams and
   marks its agent-decision UI as not ready.
5. **Setup:** bench guard (feature `bench`), macOS window-presentation observer, the control server
   (`control::start`), and on macOS destroying `settings` with `main`.
6. **Managed state:** `PtyState`, `WindowPresentationState`, `ControlState`, `FsWatchState`, `AssetGrants`, `GitWatchState`, `LspState`,
   `Supersede`, `FileIndexState`, `WorkspaceRegistry` (bootstrapped, launch dir authorized), `LaunchDir`, `LaunchFiles`.
7. **Run events:** on `WindowEvent::Destroyed` the window's asset grants and PTYs are released; on `Exit`
   the LSP servers are killed and the control server shut down; on macOS `Opened` (Open With) the files are stored
   and `lut:open-file` is emitted.

### Rust modules (`src-tauri/src/modules/`)

| Module                   | Role                                                                                                                                                | Files | Lines  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| `git/`                   | Git CLI wrapper for the panel, history and watcher.                                                                                                 | 14    | 5 731  |
| `pty/`                   | PTY sessions (portable-pty, ConPTY on Windows), output hub and `lut-pty` transport, shell launch and integration scripts, agent detection from OSC. | 16    | 10 905 |
| `fs/`                    | File tree, read/write, mutations, copy, clipboard paths, watcher, search index, grep, assets, read policy.                                          | 17    | 7 964  |
| `control.rs`             | Loopback TCP control server for the CLI: descriptor, per-pane tokens, request routing.                                                              | 1     | 1 533  |
| `agent_events.rs`        | Server side of `lut hook`: validation, normalization, rate limit, decision broker, events to the frontend.                                          | 1     | 1 388  |
| `agent.rs`               | Agent hook installer (Claude, Codex, Gemini, Pi): plan/apply/status.                                                                                | 1     | 1 358  |
| `workspace.rs`           | Workspace registry (authorized roots), launch cwd, WSL distros and homes.                                                                           | 1     | 1 350  |
| `lsp/`                   | Language-server processes and JSON-RPC framing.                                                                                                     | 4     | 1 070  |
| `agent_json.rs`          | Format-preserving edits of agents' JSON settings files.                                                                                             | 1     | 910    |
| `shell/`                 | One-shot non-PTY commands (the editor's external formatters).                                                                                       | 1     | 210    |
| `bench.rs`               | App benchmark support (feature `bench`).                                                                                                            | 1     | 779    |
| `proc/`                  | Child-output capture, Windows Job Objects, RSS, `hide_console`.                                                                                     | 4     | 525    |
| `vibrancy.rs`            | Window backdrop (Mica, NSVisualEffectView).                                                                                                         | 1     | 320    |
| `window_presentation.rs` | Live-resize and occlusion state for the renderers.                                                                                                  | 1     | 287    |
| `runtime.rs`             | The async runtime behind commands.                                                                                                                  | 1     | 124    |
| `app_menu.rs`            | macOS menu with a guarded Quit.                                                                                                                     | 1     | 83     |

## IPC surface

### Commands

85 commands are registered (3 of them only with the `bench` feature). E02-05 removed the 22 of the git agent-task
backend, E02-18 removed `fs_grep`, `fs_glob` and `git_show_commit`, E06-06 removed the four `history_*` commands,
and E05-14, E05-15 and E05-16 removed the 26 that only the AI used.
The tables below list each one with the frontend files that call it; for the wrapper objects the caller is written as
`` `git.method` → users ``; `workspaceNative` is in `modules/workspace/native.ts`.

**Commands without a real caller (2):**

| Commands                 | Why                                                   | Removed by |
| ------------------------ | ----------------------------------------------------- | ---------- |
| `pty_has_foreground_job` | No caller                                             | E14-11     |
| `wsl_default_distro`     | No caller; kept as an input for WSL profile detection | (E14-06)   |

**Callers the running app never loads:** `agent_decisions_ready` and `agent_decision_respond`
(`modules/control/lib/agentDecisions.ts`) and `agent_disable_hooks`, `agent_hooks_plan`, `agent_hooks_apply` (only
through `modules/control/lib/hooksConfig.ts`) are called from `modules/control/agents.ts` and `modules/agents/model/`,
which no entry imports: they are a staged agent-event API that `knip.json` lists as entries. E19-07 wires the
reducer; E20-08 and E20-10 the hooks manager. `agent_hooks_status` and `agent_enable_hooks` also have live callers.

#### pty

| Command                      | Handler | Frontend caller(s)                                      |
| ---------------------------- | ------- | ------------------------------------------------------- |
| `pty_open`                   | `pty`   | `modules/terminal/lib/pty-bridge.ts`                    |
| `pty_write`                  | `pty`   | `modules/terminal/lib/pty-bridge.ts`                    |
| `pty_stream_open`            | `pty`   | `modules/terminal/lib/pty-bridge.ts`                    |
| `pty_set_presentation`       | `pty`   | `modules/terminal/lib/ptyPresentation.ts`               |
| `pty_set_colors`             | `pty`   | `modules/terminal/lib/pty-bridge.ts`                    |
| `pty_diagnostics`            | `pty`   | `modules/terminal/lib/terminalDiagnostics.ts`           |
| `pty_resize`                 | `pty`   | `modules/terminal/lib/pty-bridge.ts`                    |
| `pty_close`                  | `pty`   | `modules/terminal/lib/pty-bridge.ts`                    |
| `pty_close_all`              | `pty`   | `app/bootstrap.ts`                                      |
| `pty_has_foreground_process` | `pty`   | `modules/terminal/ghostty/useGhosttyTerminalSession.ts` |
| `pty_has_foreground_job`     | `pty`   | **no caller**                                           |
| `pty_session_shell`          | `pty`   | `modules/terminal/lib/useTerminalFileDrop.ts`           |
| `pty_list_shells`            | `pty`   | `settings/sections/GeneralSection.tsx`                  |

#### fs

| Command               | Handler         | Frontend caller(s)                                                                                                                                             |
| --------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_subdirs`        | `fs::tree`      | `modules/header/CwdBreadcrumb.tsx`                                                                                                                             |
| `fs_read_dir`         | `fs::tree`      | `modules/explorer/lib/useFileTree.ts`                                                                                                                          |
| `fs_read_file`        | `fs::file`      | `modules/editor/lib/externalFormat.ts`, `modules/editor/lib/useDocument.ts`, `modules/markdown/useMarkdownDocument.ts`, `modules/theme/useThemeFileEditing.ts` |
| `asset_grant`         | `fs::assets`    | `lib/useAssetGrant.ts`                                                                                                                                         |
| `asset_revoke`        | `fs::assets`    | `lib/useAssetGrant.ts`                                                                                                                                         |
| `fs_write_file`       | `fs::file`      | `modules/editor/lib/useDocument.ts`, `modules/theme/themeFiles.ts`                                                                                             |
| `fs_stat`             | `fs::file`      | `modules/editor/lib/useDocument.ts`, `modules/terminal/lib/terminalLinks.ts`, `modules/theme/themeFiles.ts`                                                    |
| `fs_canonicalize`     | `fs::file`      | `modules/markdown/useMarkdownDocument.ts`, `modules/terminal/lib/terminalLinks.ts`                                                                             |
| `fs_create_file`      | `fs::mutate`    | `modules/editor/NewEditorDialog.tsx`, `modules/explorer/lib/useFileTree.ts`                                                                                    |
| `fs_create_dir`       | `fs::mutate`    | `modules/explorer/lib/useFileTree.ts`, `modules/theme/themeFiles.ts`                                                                                           |
| `fs_rename`           | `fs::mutate`    | `modules/explorer/lib/useFileTree.ts`                                                                                                                          |
| `fs_move`             | `fs::mutate`    | `modules/explorer/lib/useFileTree.ts`                                                                                                                          |
| `fs_delete`           | `fs::mutate`    | `modules/explorer/lib/useFileTree.ts`, `modules/theme/themeFiles.ts`                                                                                           |
| `fs_delete_batch`     | `fs::mutate`    | `modules/explorer/lib/useFileTree.ts`                                                                                                                          |
| `fs_copy`             | `fs::copy`      | `modules/explorer/lib/clipboardPaste.ts`, `modules/explorer/lib/useExplorerFileDrop.ts`                                                                        |
| `fs_clipboard_paths`  | `fs::clipboard` | `modules/explorer/lib/clipboardPaste.ts`                                                                                                                       |
| `fs_watch_add`        | `fs::watch`     | `modules/explorer/lib/watch.ts`                                                                                                                                |
| `fs_watch_remove`     | `fs::watch`     | `modules/explorer/lib/watch.ts`                                                                                                                                |
| `fs_search`           | `fs::search`    | `modules/command-palette/hooks/useFileSearch.ts`, `modules/explorer/ExplorerSearch.tsx`                                                                        |
| `fs_warm_index`       | `fs::search`    | `modules/command-palette/hooks/useFileSearch.ts`                                                                                                               |
| `fs_grep_interactive` | `fs::grep`      | `modules/command-palette/hooks/useContentSearch.ts`                                                                                                            |

#### lsp

| Command            | Handler | Frontend caller(s)                  |
| ------------------ | ------- | ----------------------------------- |
| `lsp_detect`       | `lsp`   | `modules/lsp/lib/detect.ts`         |
| `lsp_host_pid`     | `lsp`   | `modules/lsp/lib/sessionManager.ts` |
| `lsp_resolve_root` | `lsp`   | `modules/lsp/lib/sessionManager.ts` |
| `lsp_spawn`        | `lsp`   | `modules/lsp/lib/transport.ts`      |
| `lsp_send`         | `lsp`   | `modules/lsp/lib/transport.ts`      |
| `lsp_kill`         | `lsp`   | `modules/lsp/lib/transport.ts`      |

#### git

| Command                | Handler         | Frontend caller(s)                                                                                                          |
| ---------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `git_resolve_repo`     | `git::commands` | `git.resolveRepo` → `modules/source-control/useRepositoryTargeting.ts`, `modules/source-control/useSourceControlContext.ts` |
| `git_panel_snapshot`   | `git::commands` | `git.panelSnapshot` → `modules/source-control/useSourceControl.ts`                                                          |
| `git_status`           | `git::commands` | `git.status` → `modules/source-control/useSourceControl.ts`                                                                 |
| `git_diff`             | `git::commands` | `git.diff` → `modules/source-control/useSourceControlPanel.ts`                                                              |
| `git_diff_content`     | `git::commands` | `git.diffContent` → `modules/editor/lib/diffCache.ts`                                                                       |
| `git_stage`            | `git::commands` | `git.stage` → `modules/source-control/useSourceControlPanel.ts`                                                             |
| `git_unstage`          | `git::commands` | `git.unstage` → `modules/source-control/useSourceControlPanel.ts`                                                           |
| `git_discard`          | `git::commands` | `git.discard` → `modules/source-control/useSourceControlPanel.ts`                                                           |
| `git_commit`           | `git::commands` | `git.commit` → `modules/source-control/useSourceControlPanel.ts`                                                            |
| `git_fetch`            | `git::commands` | `git.fetch` → `modules/source-control/useSourceControl.ts`                                                                  |
| `git_pull_ff_only`     | `git::commands` | `git.pullFfOnly` → `modules/source-control/useSourceControl.ts`                                                             |
| `git_push`             | `git::commands` | `git.push` → `modules/source-control/useSourceControl.ts`                                                                   |
| `git_log`              | `git::commands` | `git.log` → `modules/git-history/GitHistoryPane.tsx`                                                                        |
| `git_commit_files`     | `git::commands` | `git.commitFiles` → `modules/git-history/GitHistoryPane.tsx`                                                                |
| `git_commit_file_diff` | `git::commands` | `git.commitFileDiff` → `modules/editor/lib/diffCache.ts`                                                                    |
| `git_remote_url`       | `git::commands` | `git.remoteUrl` → `modules/git-history/GitHistoryPane.tsx`                                                                  |
| `git_list_branches`    | `git::commands` | `git.listBranches` → `modules/source-control/SourceControlPanel.tsx`                                                        |
| `git_checkout_branch`  | `git::commands` | `git.checkoutBranch` → `modules/source-control/SourceControlPanel.tsx`                                                      |
| `git_watch`            | `git::commands` | `git.watch` → `modules/git/changes.ts`                                                                                      |
| `git_unwatch`          | `git::commands` | `git.unwatch` → `modules/git/changes.ts`                                                                                    |

#### shell

| Command             | Handler | Frontend caller(s)                     |
| ------------------- | ------- | -------------------------------------- |
| `shell_run_command` | `shell` | `modules/editor/lib/externalFormat.ts` |

#### workspace

| Command                 | Handler          | Frontend caller(s)                                                                                                                                 |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wsl_list_distros`      | `workspace`      | `modules/workspace/env.ts`, `settings/sections/GeneralSection.tsx`                                                                                 |
| `wsl_default_distro`    | `workspace`      | **no caller**                                                                                                                                      |
| `wsl_home`              | `workspace::ipc` | `modules/workspace/env.ts`                                                                                                                         |
| `workspace_authorize`   | `workspace`      | `workspaceNative.workspaceAuthorize` → `app/hooks/useTerminalPanes.ts`, `app/hooks/useWorkspaceSwitcher.ts`, `modules/spaces/lib/useSpacesBoot.ts` |
| `workspace_current_dir` | `workspace`      | `modules/platform/launchDir.ts`, `workspaceNative.workspaceCurrentDir` → `app/hooks/useWorkspaceSwitcher.ts`                                       |

#### control

| Command                  | Handler   | Frontend caller(s)                    |
| ------------------------ | --------- | ------------------------------------- |
| `control_frontend_ready` | `control` | `modules/control/useControlBridge.ts` |
| `control_respond`        | `control` | `modules/control/useControlBridge.ts` |

#### agent_events

| Command                  | Handler        | Frontend caller(s)                      |
| ------------------------ | -------------- | --------------------------------------- |
| `agent_decisions_ready`  | `agent_events` | `modules/control/lib/agentDecisions.ts` |
| `agent_decision_respond` | `agent_events` | `modules/control/lib/agentDecisions.ts` |

#### lib.rs

| Command                | Handler  | Frontend caller(s)                       |
| ---------------------- | -------- | ---------------------------------------- |
| `get_launch_dir`       | `lib.rs` | `modules/platform/launchDir.ts`          |
| `get_launch_files`     | `lib.rs` | `modules/platform/launchDir.ts`          |
| `open_settings_window` | `lib.rs` | `modules/settings/openSettingsWindow.ts` |

#### agent

| Command               | Handler | Frontend caller(s)                                                                                                    |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `agent_enable_hooks`  | `agent` | `app/hooks/useAgentLaunch.ts`, `modules/agents/components/NotificationBell.tsx`, `modules/control/lib/hooksConfig.ts` |
| `agent_disable_hooks` | `agent` | `modules/control/lib/hooksConfig.ts`                                                                                  |
| `agent_hooks_plan`    | `agent` | `modules/control/lib/hooksConfig.ts`                                                                                  |
| `agent_hooks_apply`   | `agent` | `modules/control/lib/hooksConfig.ts`                                                                                  |
| `agent_hooks_status`  | `agent` | `modules/agents/components/NotificationBell.tsx`, `modules/control/lib/hooksConfig.ts`                                |

#### vibrancy

| Command                | Handler    | Frontend caller(s)          |
| ---------------------- | ---------- | --------------------------- |
| `window_backdrop_kind` | `vibrancy` | `modules/theme/vibrancy.ts` |
| `window_set_backdrop`  | `vibrancy` | `modules/theme/vibrancy.ts` |

#### window_presentation

| Command                     | Handler               | Frontend caller(s)                               |
| --------------------------- | --------------------- | ------------------------------------------------ |
| `window_presentation_state` | `window_presentation` | `modules/terminal/ghostty/windowPresentation.ts` |

#### bench

| Command                | Handler | Frontend caller(s)                     |
| ---------------------- | ------- | -------------------------------------- |
| `bench_config` (bench) | `bench` | `bench/early.ts`                       |
| `bench_window` (bench) | `bench` | `bench/eventLog.ts`, `bench/report.ts` |
| `bench_exit` (bench)   | `bench` | `bench/driver.ts`                      |

### Events (backend → frontend)

| Event                       | Emitted by                                                                     | Listened in                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `lut:open-file`             | `lib.rs` (macOS Open With), to all windows                                     | `app/hooks/useLaunchFiles.ts`                                                                                            |
| `lut:settings-tab`          | `lib.rs::open_settings_window`, to `settings`                                  | `settings/SettingsApp.tsx`                                                                                               |
| `lut:control-request`       | `modules/control.rs`, to `main` (CLI `identify` and `open`)                    | `modules/control/useControlBridge.ts`                                                                                    |
| `lut:agent-signal`          | `modules/pty/session.rs` (OSC detection) and `modules/agent_events.rs` (hooks) | `modules/terminal/lib/agentActivity.ts`                                                                                  |
| `lut:agent-event`           | `modules/agent_events.rs`, to the window that owns the pane                    | `modules/control/lib/agentEvents.ts`, not loaded by the app (see above)                                                  |
| `lut:terminal-notification` | `modules/pty/session.rs` (BEL, OSC 9/99/777)                                   | `modules/control/lib/agentEvents.ts`, not loaded by the app (E20-01)                                                     |
| `lut:git-changed`           | `modules/git/watch.rs`                                                         | `modules/git/changes.ts`                                                                                                 |
| `fs:changed`                | `modules/fs/watch.rs`                                                          | `modules/explorer/lib/watch.ts`                                                                                          |
| `fs:file-written`           | `modules/fs/file.rs` (`fs_write_file`)                                         | `modules/editor/useEditorFileSync.ts`, `modules/markdown/useMarkdownDocument.ts`, `modules/theme/useThemeFileEditing.ts` |
| `lut:window-presentation`   | `modules/window_presentation.rs`                                               | `modules/terminal/ghostty/windowPresentation.ts`                                                                         |

### Events between windows (frontend → frontend)

Emitted with `emit` from `@tauri-apps/api/event` so that the other window (main or settings) reloads its copy:

| Event                         | Emitted and listened in         |
| ----------------------------- | ------------------------------- |
| `lut://prefs-changed`         | `modules/settings/store.ts`     |
| `lut://custom-themes-changed` | `modules/theme/customThemes.ts` |
| `lut://theme-edit`            | `modules/theme/themeFiles.ts`   |

### Channels and URI schemes

- **`lut-pty` scheme** (`modules/pty/protocol.rs`, `gate.rs`, `hub.rs`, `wire.rs`): all terminal output. Each webview
  gets a token from `pty_stream_open` and keeps one long-poll `POST lut-pty://localhost/poll` open
  (`http://lut-pty.localhost/poll` on Windows) from `modules/terminal/lib/pty-bridge.ts`. Requests are checked for
  route, `Origin`, size, framing and token; flow control is by acknowledged parsed bytes. Input goes the other way
  through `pty_write` with a raw body.
- **`asset` scheme** (`modules/fs/assets.rs`): serves files granted with `asset_grant` (images in the editor and Markdown previews), revoked
  per webview on reload and close.
- **Tauri channels:** `lsp_spawn` takes `on_message` and `on_exit` channels (`modules/lsp/`).

### Control protocol

`control::start` binds `127.0.0.1` on a random port with a random token and writes a descriptor to `<cache>/dev.lucode.lut/control.json`
(E02-08). The CLI (`lut-cli`, crate `lut-cli`) connects with JSON lines. Methods (`lut-control-protocol`): `ping`, `capabilities`, `identify`,
`open` and `hook`. `identify` and `open` are forwarded to the main window as `lut:control-request` and answered with
`control_respond`; `hook` is handled by `agent_events.rs` with per-pane tokens exported to each shell
(`LUT_CONTROL_ADDR`, `LUT_CONTROL_TOKEN`, `LUT_PANE_ID`, `LUT_CLI`; inherited `TERAX_*` variables are dropped). Details: `.docs/plan/analysis/agents.md`.

## Corrections to the area analyses

- The updater and process plugins are gone (#318): `backend-core.md` still lists them, and `app-shell.md` mentions
  `UpdaterDialog` in `App.tsx`.
- `App.tsx` was 1484 lines, not 1695, and is about 250 since E09; the `App.tsx:<line>` references in `app-shell.md`
  point to code that now lives in `app/hooks/`, `app/components/` and `modules/platform/`.
- On `WindowEvent::Destroyed` the backend releases asset grants and PTYs; control sessions are not closed
  there (`backend-core.md` says they are). Agent-decision readiness is reset on page load instead.
- `fs_grep`, `fs_glob`, `git_show_commit` and `shell_session_close` had no real caller (removed by E02-18 and E05-15);
  the analyses list only `pty_has_foreground_job`.
