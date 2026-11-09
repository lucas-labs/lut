# Current state: modules and IPC surface

A map of the imported Terax code as it is on `master` at `4059e1a` (2026-11-09), before any refactor (E01-07). It
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
- **Wrapper objects:** `modules/git/api.ts` (`git.*`) and `modules/ai/lib/native.ts` (`native.*`) wrap commands in
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

| Piece            | Entry                                                       | Notes                                                                                                         |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| App process      | `src-tauri/src/main.rs` → `lib.rs::run()`                   | Tauri 2; a 2-worker tokio runtime for async commands (`modules/runtime.rs`).                                  |
| Main window      | label `main`, `index.html` → `src/main.tsx` → `app/App.tsx` | Declared in `tauri.conf.json`, starts hidden; the frontend shows it after the first paint.                    |
| Settings window  | label `settings`, `settings.html` → `src/settings/main.tsx` | Created on demand by `open_settings_window`; a child of `main`.                                               |
| CLI sidecar      | `src-tauri/crates/terax-cli`                                | Bundled as `terax-cli`; talks to the app over the control server (see [Control protocol](#control-protocol)). |
| Control protocol | `src-tauri/crates/terax-control-protocol`                   | Shared request/response and hook types between the app and the CLI.                                           |

`stats.html` at the repository root is not a window: it is the optional bundle report of `ANALYZE=true pnpm build`
(ignored by git).

## Frontend

### Entry points and shared code

| Path              | Role                                                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main.tsx`        | Global CSS, borderless chrome flag, optional bench driver (`__TERAX_BENCH__`), `invoke('pty_close_all')` to reap orphaned PTYs, launch dir seed, renders `<App/>`, shows the window.                                                                                     |
| `app/App.tsx`     | The single coordinator (1484 lines): tab model via `useTabs`, spaces, every shortcut handler, agent launch flow, control bridge, LSP navigator, open-file listener, layout (header, sidebar, workspace surface, status bar, AI bridges, command palette, close dialogs). |
| `app/components/` | `WorkspaceSurface` (the central area), `CloseDialogs`.                                                                                                                                                                                                                   |
| `app/hooks/`      | Close guards (`useAppCloseGuard`, `useTabCloseGuards`, `tabCloseGuards`) and `useWorkspaceSwitcher`.                                                                                                                                                                     |
| `settings/`       | The settings window app (`SettingsApp.tsx`, `sections/`, `components/`).                                                                                                                                                                                                 |
| `lib/`            | Shared helpers: `utils` (`cn`), `platform`, `fonts`, `launchDir`, `useAssetGrant`, `shellQuote`, `homeRelativePath`, `external-link`, `usePresence`, `useZoom`.                                                                                                          |
| `components/`     | `WindowControls.tsx`, shadcn primitives (`ui/`) and AI chat elements (`ai-elements/`); the last two are excluded from lint and format.                                                                                                                                   |
| `bench/`          | The in-app benchmark driver, loaded only when built with `TERAX_BENCH` (`__TERAX_BENCH__`).                                                                                                                                                                              |

### Feature modules (`src/modules/`)

Sizes count non-test `.ts`/`.tsx` files; tests are the `*.test.*` files in the module.

| Module            | Role                                                                                                                                                              | Files | Lines  | Tests |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----- |
| `terminal`        | Panes and sessions: `TerminalStack`, `PaneTreeView`, `TerminalPane`; Ghostty WASM model and WebGPU/WebGL renderers (`ghostty/`); PTY bridge and helpers (`lib/`). | 125   | 23 720 | 115   |
| `ai`              | Built-in BYOK AI: chat, mini window, tools, sessions, keyring, HTTP proxy (removed by E05).                                                                       | 59    | 9 641  | 30    |
| `explorer`        | File tree, file operations, drag and drop, clipboard paste, watcher, inline search.                                                                               | 23    | 6 407  | 9     |
| `editor`          | CodeMirror editor, diff stacks (git and AI), external formatter, file sync.                                                                                       | 36    | 4 801  | 13    |
| `theme`           | Theme provider, built-in and custom themes, theme files, vibrancy, surface layer, window activity.                                                                | 36    | 3 364  | 13    |
| `source-control`  | Git panel: status, stage, commit, push/pull, branches.                                                                                                            | 10    | 3 368  | 5     |
| `tabs`            | Tab model (`lib/useTabs.ts`, 1440 lines, 8 tab kinds), tab bar, tab switcher, new-tab menu.                                                                       | 10    | 2 438  | 13    |
| `agents`          | CLI agent tracking: activity and managed-agent stores, notification bell and bridge, launch requests; `model/` is a reducer not yet wired.                        | 22    | 2 138  | 11    |
| `lsp`             | Language-server client: detection, sessions, transport, runtime store, status pill.                                                                               | 14    | 1 913  | 7     |
| `command-palette` | Palette modes, fuzzy ranking, MRU, quick-open (`fs_search`) and content search (`fs_grep_interactive`).                                                           | 13    | 1 554  | 7     |
| `git-history`     | Commit log pane.                                                                                                                                                  | 7     | 1 365  | 3     |
| `spaces`          | Spaces (workspace groups): store, persistence, boot, switcher.                                                                                                    | 11    | 1 316  | 3     |
| `git`             | Frontend git API (`api.ts`, the `git` wrapper object), change subscription (`changes.ts`), types, dead hunk/scope models (E02-04).                                | 6     | 1 259  | 4     |
| `settings`        | Settings persistence (`store.ts`, `LazyStore`), preferences store, `openSettingsWindow`.                                                                          | 3     | 1 058  | 6     |
| `shortcuts`       | Shortcut registry, per-OS defaults, resolver, the global `keydown` handler.                                                                                       | 8     | 730    | 5     |
| `control`         | Control bridge to the CLI (`useControlBridge`); `agents.ts` and most of `lib/` are a staged agent-event API not yet wired.                                        | 8     | 585    | 6     |
| `markdown`        | Markdown preview tabs.                                                                                                                                            | 9     | 574    | 4     |
| `preview`         | Web preview tabs (iframe with address bar).                                                                                                                       | 5     | 532    | 3     |
| `statusbar`       | Status bar, cwd breadcrumb, diagnostics badge, workspace env selector; `useGitBranch`, `useSystemInfo`, `OsIcon` (not mounted, kept for E12-06).                  | 9     | 515    | 1     |
| `header`          | Title bar and inline search.                                                                                                                                      | 3     | 387    | 0     |
| `sidebar`         | Sidebar rail and panel state.                                                                                                                                     | 4     | 265    | 1     |
| `workspace`       | Workspace environment (local or WSL distro) store and scope keys.                                                                                                 | 2     | 76     | 0     |

### Stores (zustand)

| Store                   | File                                         | Holds                                                  |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------ |
| `usePreferencesStore`   | `modules/settings/preferences.ts`            | User preferences, mirrored from the settings store     |
| `useSpaces`             | `modules/spaces/lib/useSpaces.ts`            | Spaces and the active space                            |
| `useWorkspaceEnvStore`  | `modules/workspace/env.ts`                   | Current workspace environment (local / WSL)            |
| `useAgentActivityStore` | `modules/terminal/lib/agentActivity.ts`      | Per-pane agent activity from `terax:agent-signal`      |
| `useTerminalDropStore`  | `modules/terminal/lib/dropStore.ts`          | File-drop target over terminal panes                   |
| `useAgentStore`         | `modules/agents/store/agentStore.ts`         | CLI agent sessions per pane and notifications          |
| `useManagedAgentsStore` | `modules/agents/store/managedAgentsStore.ts` | Agents started by the agent launch flow (task, rounds) |
| `useDiagnosticsStore`   | `modules/editor/lib/diagnosticsStore.ts`     | LSP diagnostics per file                               |
| `useLspRuntimeStore`    | `modules/lsp/lib/runtimeStore.ts`            | LSP server status                                      |
| `useChatStore`          | `modules/ai/store/chatStore.ts`              | AI chat sessions                                       |
| `useAgentsStore`        | `modules/ai/store/agentsStore.ts`            | AI agent definitions                                   |
| `useSnippetsStore`      | `modules/ai/store/snippetsStore.ts`          | AI prompt snippets                                     |
| `usePlanStore`          | `modules/ai/store/planStore.ts`              | AI plan mode                                           |
| `useTodosStore`         | `modules/ai/store/todoStore.ts`              | AI to-do list                                          |

The tab model is not a store: `useTabs` keeps `tabs` and `activeId` in React state inside `App`. The terminal sessions
live in a module-level map keyed by leaf id (`modules/terminal/ghostty/useGhosttyTerminalSession.ts`).

### Persisted state

- **Tauri store files** (`@tauri-apps/plugin-store`, `LazyStore`): `terax-settings.json` (`modules/settings/store.ts`),
  `terax-spaces.json` (`modules/spaces/lib/store.ts`), `terax-custom-themes.json` (`modules/theme/customThemes.ts`),
  and the AI files `terax-ai-agents.json`, `terax-ai-sessions.json`, `terax-ai-snippets.json`, `terax-ai-todos.json`
  (`modules/ai/lib/`).
- **localStorage:** `terax-ui-theme-shadow` (read by `index.html` and `settings.html` before first paint, written by
  `modules/theme/ThemeProvider.tsx`), `terax-ui-theme-id-shadow` (`ThemeProvider.tsx`), `terax-ui-bg-kind-shadow`,
  `terax-ui-bg-image-shadow`
  (`modules/settings/preferences.ts`), `terax.sidebar.width|view|collapsed` (`modules/sidebar/useSidebarPanel.ts`),
  `terax-palette-mru`, `terax-palette-recent-files` (`modules/command-palette/lib/`), `terax-ui-mini-window-geom`
  (`modules/ai/lib/useMiniWindowGeometry.ts`), `terax.experimental.terminal-backend`
  (`modules/terminal/backend/selection.ts`), and the diagnostics flags `terax:terminal-diagnostics`,
  `terax:terminal-gc-mirror`, `terax:terminal-text-contrast`.
- **Backend files:** AI session files (`modules/ai_sessions.rs`), secrets in the OS keychain (`modules/secrets.rs`), the
  control descriptor and CLI launcher under the cache dir (`modules/control.rs`), shell-integration scripts under the
  cache dir (`modules/pty/shell_init.rs`). E02 moves all of them to lut names.

### Global side effects

**Window globals** (set on `window`):

| Global                                                   | Set in                                              | Purpose                                 |
| -------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| `__teraxTerm`, `__teraxTermSnapshot`, `__teraxTermTrace` | `modules/terminal/lib/terminalDiagnostics.ts`       | Terminal diagnostics from the devtools  |
| `__TERAX_TERMINAL_RESIZE_INTERACTION__`                  | `modules/terminal/lib/terminalResizeInteraction.ts` | Resize-drag state, kept on `globalThis` |
| `__teraxBenchConfig`, `__teraxSmooth`                    | `bench/early.ts`, `bench/smoothHooks.ts`            | Bench builds only                       |

Build-time constants: `__TERAX_BENCH__` (`vite-env.d.ts`, set by Vite from `TERAX_BENCH`). `modules/preview/PreviewPane.tsx`
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
| `resize`                                              | `modules/theme/livePageResize.ts`, `modules/theme/SurfaceLayer.tsx`, `modules/ai/lib/useMiniWindowGeometry.ts`                               |
| `pointermove`/`pointerup`/`pointercancel`, drags      | `modules/explorer/lib/useExplorerDnd.ts`, `modules/terminal/PaneTreeView.tsx`                                                                |
| `mousedown`/`mouseup`/`keydown`, AI selection popup   | `modules/ai/hooks/useSelectionAskAi.ts`, `modules/ai/components/SelectionAskAi.tsx`, `modules/ai/components/AiMiniWindow.tsx`                |

**DOM custom events** (dispatched on `window` by `app/App.tsx`): `terax:ai-attach-file` (listened in `modules/ai/lib/composer.tsx`).

**Tauri window hooks:** `onCloseRequested` (`app/hooks/useAppCloseGuard.ts`), `onResized`
(`components/WindowControls.tsx`), `onFocusChanged` (`modules/agents/lib/useWindowFocus.ts`,
`modules/terminal/ghostty/renderScheduling.ts`), `onDragDropEvent` (`modules/explorer/lib/useExplorerFileDrop.ts`,
`modules/terminal/lib/useTerminalFileDrop.ts`).

## Backend

### Boot (`lib.rs::run()`)

1. Handles the `__terax_notify <agent> <event>` argv subcommand (Windows agent hooks), resolves the launch target
   (directory or files from argv) and snapshots the launch cwd (`workspace::init_launch_cwd`).
2. **Plugins:** clipboard-manager, window-state (without `VISIBLE`), store, os, notification, log (Info),
   opener; on macOS also the app menu (`modules/app_menu.rs`).
3. **URI schemes:** `terax-pty` → `pty::stream_protocol` (terminal output, see [Channels](#channels-and-uri-schemes)),
   `asset` → `fs::assets::serve`.
4. **Page load** (`Started`): revokes the webview's asset grants, cancels its AI streams, resets its PTY streams and
   marks its agent-decision UI as not ready.
5. **Setup:** bench guard (feature `bench`), macOS window-presentation observer, the control server
   (`control::start`), and on macOS destroying `settings` with `main`.
6. **Managed state:** `PtyState`, `AiStreamState`, `SessionFilesState`, `WindowPresentationState`, `ControlState`,
   `ShellState`, `SecretsState`, `FsWatchState`, `AssetGrants`, `GitWatchState`, `LspState`,
   `Supersede`, `FileIndexState`, `WorkspaceRegistry` (bootstrapped, launch dir authorized), `LaunchDir`, `LaunchFiles`.
7. **Run events:** on `WindowEvent::Destroyed` the window's asset grants, AI streams and PTYs are released; on `Exit`
   the LSP servers are killed and the control server shut down; on macOS `Opened` (Open With) the files are stored
   and `terax:open-file` is emitted.

### Rust modules (`src-tauri/src/modules/`)

| Module                   | Role                                                                                                                                                  | Files | Lines  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| `git/`                   | Git CLI wrapper for the panel, history and watcher.                                                                                                   | 14    | 5 731  |
| `pty/`                   | PTY sessions (portable-pty, ConPTY on Windows), output hub and `terax-pty` transport, shell launch and integration scripts, agent detection from OSC. | 16    | 10 905 |
| `fs/`                    | File tree, read/write, mutations, copy, clipboard paths, watcher, search index, grep, assets, AI fs tools, read policy.                               | 19    | 8 846  |
| `control.rs`             | Loopback TCP control server for the CLI: descriptor, per-pane tokens, request routing.                                                                | 1     | 1 533  |
| `agent_events.rs`        | Server side of `terax hook`: validation, normalization, rate limit, decision broker, events to the frontend.                                          | 1     | 1 388  |
| `agent.rs`               | Agent hook installer (Claude, Codex, Gemini, Pi): plan/apply/status.                                                                                  | 1     | 1 358  |
| `workspace.rs`           | Workspace registry (authorized roots), launch cwd, WSL distros and homes.                                                                             | 1     | 1 350  |
| `ai_sessions.rs`         | AI conversation files, one per session (removed by E05).                                                                                              | 1     | 1 243  |
| `net/`, `net.rs`         | AI HTTP proxy with streaming, `lm_ping` (removed by E05).                                                                                             | 4     | 1 978  |
| `lsp/`                   | Language-server processes and JSON-RPC framing.                                                                                                       | 4     | 1 070  |
| `agent_json.rs`          | Format-preserving edits of agents' JSON settings files.                                                                                               | 1     | 910    |
| `shell/`                 | Non-PTY commands, persistent shell sessions and background processes for the AI tools.                                                                | 4     | 904    |
| `bench.rs`               | App benchmark support (feature `bench`).                                                                                                              | 1     | 779    |
| `proc/`                  | Child-output capture, Windows Job Objects, RSS, `hide_console`.                                                                                       | 4     | 525    |
| `secrets.rs`             | Secret storage in the OS keychain (AI keys).                                                                                                          | 1     | 511    |
| `vibrancy.rs`            | Window backdrop (Mica, NSVisualEffectView).                                                                                                           | 1     | 320    |
| `window_presentation.rs` | Live-resize and occlusion state for the renderers.                                                                                                    | 1     | 287    |
| `runtime.rs`             | The async runtime behind commands.                                                                                                                    | 1     | 124    |
| `ipc_body.rs`            | Raw IPC request bodies (AI commands).                                                                                                                 | 1     | 104    |
| `app_menu.rs`            | macOS menu with a guarded Quit.                                                                                                                       | 1     | 83     |

## IPC surface

### Commands

111 commands are registered (3 of them only with the `bench` feature). E02-05 removed the 22 of the git agent-task
backend, E02-18 removed `fs_grep`, `fs_glob` and `git_show_commit`, and E06-06 removed the four `history_*` commands.
The tables below list each one with the frontend files that call it; for the wrapper objects the caller is written as
`` `git.method` → users ``; `workspaceNative` is in `modules/workspace/native.ts`.

**Commands without a real caller (3):**

| Commands                 | Why                                                        | Removed by |
| ------------------------ | ---------------------------------------------------------- | ---------- |
| `pty_has_foreground_job` | No caller                                                  | E14-11     |
| `lm_ping`                | No caller since E05-11 removed the Models settings section | E05-16     |
| `shell_session_close`    | Only `native.shellSessionClose`, which nothing calls       | E05-15     |
| `wsl_default_distro`     | No caller; kept as an input for WSL profile detection      | (E14-06)   |

**Callers the running app never loads:** `agent_decisions_ready` and `agent_decision_respond`
(`modules/control/lib/agentDecisions.ts`) and `agent_disable_hooks`, `agent_hooks_plan`, `agent_hooks_apply` (only
through `modules/control/lib/hooksConfig.ts`) are called from `modules/control/agents.ts` and `modules/agents/model/`,
which no entry imports: they are a staged agent-event API that `knip.json` lists as entries. E19-07 wires the
reducer; E20-08 and E20-10 the hooks manager. `agent_hooks_status` and `agent_enable_hooks` also have live callers.

#### pty

| Command                      | Handler | Frontend caller(s)                                                  |
| ---------------------------- | ------- | ------------------------------------------------------------------- |
| `pty_open`                   | `pty`   | `modules/terminal/lib/pty-bridge.ts`                                |
| `pty_write`                  | `pty`   | `modules/terminal/lib/pty-bridge.ts`                                |
| `pty_stream_open`            | `pty`   | `modules/terminal/lib/pty-bridge.ts`                                |
| `pty_set_presentation`       | `pty`   | `modules/terminal/lib/ptyPresentation.ts`                           |
| `pty_set_colors`             | `pty`   | `modules/terminal/lib/pty-bridge.ts`                                |
| `pty_diagnostics`            | `pty`   | `modules/terminal/lib/terminalDiagnostics.ts`                       |
| `pty_resize`                 | `pty`   | `modules/terminal/lib/pty-bridge.ts`                                |
| `pty_close`                  | `pty`   | `modules/terminal/lib/pty-bridge.ts`                                |
| `pty_close_all`              | `pty`   | `main.tsx`                                                          |
| `pty_has_foreground_process` | `pty`   | `modules/terminal/ghostty/useGhosttyTerminalSession.ts`             |
| `pty_has_foreground_job`     | `pty`   | **no caller**                                                       |
| `pty_shell_name`             | `pty`   | `modules/statusbar/useSystemInfo.ts` (not mounted; kept for E12-06) |
| `pty_session_shell`          | `pty`   | `modules/terminal/lib/useTerminalFileDrop.ts`                       |
| `pty_list_shells`            | `pty`   | `settings/sections/GeneralSection.tsx`                              |

#### fs

| Command                  | Handler              | Frontend caller(s)                                                                                                                                                                                                                                                                                                 |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_subdirs`           | `fs::tree`           | `modules/statusbar/CwdBreadcrumb.tsx`                                                                                                                                                                                                                                                                              |
| `fs_read_dir`            | `fs::tree`           | `modules/explorer/lib/useFileTree.ts`                                                                                                                                                                                                                                                                              |
| `fs_read_file`           | `fs::file`           | `modules/ai/lib/composer.tsx`, `modules/editor/lib/externalFormat.ts`, `modules/editor/lib/useDocument.ts`, `modules/markdown/useMarkdownDocument.ts`, `modules/theme/useThemeFileEditing.ts`                                                                                                                      |
| `ai_read_file`           | `fs::ai`             | `native.readFile` → `modules/ai/components/AgentRunBridge.tsx`, `modules/ai/tools/edit.ts`, `modules/ai/tools/fs.ts`                                                                                                                                                                                               |
| `ai_read_dir`            | `fs::ai`             | `native.readDir` → `modules/ai/tools/fs.ts`                                                                                                                                                                                                                                                                        |
| `ai_grep`                | `fs::ai`             | `native.grep` → `modules/ai/tools/search.ts`                                                                                                                                                                                                                                                                       |
| `ai_glob`                | `fs::ai`             | `native.glob` → `modules/ai/tools/search.ts`                                                                                                                                                                                                                                                                       |
| `asset_grant`            | `fs::assets`         | `lib/useAssetGrant.ts`                                                                                                                                                                                                                                                                                             |
| `asset_revoke`           | `fs::assets`         | `lib/useAssetGrant.ts`                                                                                                                                                                                                                                                                                             |
| `fs_read_project_memory` | `fs::project_memory` | `native.readProjectMemory` → `modules/ai/lib/transport.ts`                                                                                                                                                                                                                                                         |
| `fs_write_file`          | `fs::file`           | `modules/editor/lib/useDocument.ts`, `modules/theme/themeFiles.ts`, `native.writeFile` → `modules/ai/store/planStore.ts`, `modules/ai/tools/edit.ts`, `modules/ai/tools/fs.ts`                                                                                                                                     |
| `fs_stat`                | `fs::file`           | `modules/editor/lib/useDocument.ts`, `modules/terminal/lib/terminalLinks.ts`, `modules/theme/themeFiles.ts`                                                                                                                                                                                                        |
| `fs_canonicalize`        | `fs::file`           | `modules/markdown/useMarkdownDocument.ts`, `modules/terminal/lib/terminalLinks.ts`, `workspaceNative.canonicalize` → `modules/explorer/lib/useGitStatus.ts`, and through `native.canonicalize` → `modules/ai/lib/transport.ts`, `modules/ai/tools/edit.ts`, `modules/ai/tools/fs.ts`, `modules/ai/tools/search.ts` |
| `fs_create_file`         | `fs::mutate`         | `modules/editor/NewEditorDialog.tsx`, `modules/explorer/lib/useFileTree.ts`, `native.createFile` → **unused wrapper**                                                                                                                                                                                              |
| `fs_create_dir`          | `fs::mutate`         | `modules/explorer/lib/useFileTree.ts`, `modules/theme/themeFiles.ts`, `native.createDir` → `modules/ai/store/planStore.ts`, `modules/ai/tools/fs.ts`                                                                                                                                                               |
| `fs_rename`              | `fs::mutate`         | `modules/explorer/lib/useFileTree.ts`                                                                                                                                                                                                                                                                              |
| `fs_move`                | `fs::mutate`         | `modules/explorer/lib/useFileTree.ts`                                                                                                                                                                                                                                                                              |
| `fs_delete`              | `fs::mutate`         | `modules/explorer/lib/useFileTree.ts`, `modules/theme/themeFiles.ts`                                                                                                                                                                                                                                               |
| `fs_delete_batch`        | `fs::mutate`         | `modules/explorer/lib/useFileTree.ts`                                                                                                                                                                                                                                                                              |
| `fs_copy`                | `fs::copy`           | `modules/explorer/lib/clipboardPaste.ts`, `modules/explorer/lib/useExplorerFileDrop.ts`                                                                                                                                                                                                                            |
| `fs_clipboard_paths`     | `fs::clipboard`      | `modules/explorer/lib/clipboardPaste.ts`                                                                                                                                                                                                                                                                           |
| `fs_watch_add`           | `fs::watch`          | `modules/explorer/lib/watch.ts`                                                                                                                                                                                                                                                                                    |
| `fs_watch_remove`        | `fs::watch`          | `modules/explorer/lib/watch.ts`                                                                                                                                                                                                                                                                                    |
| `fs_search`              | `fs::search`         | `modules/command-palette/hooks/useFileSearch.ts`, `modules/explorer/ExplorerSearch.tsx`                                                                                                                                                                                                                            |
| `fs_warm_index`          | `fs::search`         | `modules/command-palette/hooks/useFileSearch.ts`                                                                                                                                                                                                                                                                   |
| `fs_list_files`          | `fs::search`         | `modules/ai/hooks/useWorkspaceFiles.ts`                                                                                                                                                                                                                                                                            |
| `fs_grep_interactive`    | `fs::grep`           | `modules/command-palette/hooks/useContentSearch.ts`                                                                                                                                                                                                                                                                |

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

| Command                | Handler         | Frontend caller(s)                                                                                                                                               |
| ---------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git_resolve_repo`     | `git::commands` | `git.resolveRepo` → `modules/statusbar/useGitBranch.ts`, `modules/source-control/useRepositoryTargeting.ts`, `modules/source-control/useSourceControlContext.ts` |
| `git_panel_snapshot`   | `git::commands` | `git.panelSnapshot` → `modules/source-control/useSourceControl.ts`                                                                                               |
| `git_status`           | `git::commands` | `git.status` → `modules/source-control/useSourceControl.ts`                                                                                                      |
| `git_diff`             | `git::commands` | `git.diff` → `modules/source-control/useSourceControlPanel.ts`                                                                                                   |
| `git_diff_content`     | `git::commands` | `git.diffContent` → `modules/editor/lib/diffCache.ts`                                                                                                            |
| `git_stage`            | `git::commands` | `git.stage` → `modules/source-control/useSourceControlPanel.ts`                                                                                                  |
| `git_unstage`          | `git::commands` | `git.unstage` → `modules/source-control/useSourceControlPanel.ts`                                                                                                |
| `git_discard`          | `git::commands` | `git.discard` → `modules/source-control/useSourceControlPanel.ts`                                                                                                |
| `git_commit`           | `git::commands` | `git.commit` → `modules/source-control/useSourceControlPanel.ts`                                                                                                 |
| `git_fetch`            | `git::commands` | `git.fetch` → `modules/source-control/useSourceControl.ts`                                                                                                       |
| `git_pull_ff_only`     | `git::commands` | `git.pullFfOnly` → `modules/source-control/useSourceControl.ts`                                                                                                  |
| `git_push`             | `git::commands` | `git.push` → `modules/source-control/useSourceControl.ts`                                                                                                        |
| `git_log`              | `git::commands` | `git.log` → `modules/git-history/GitHistoryPane.tsx`                                                                                                             |
| `git_commit_files`     | `git::commands` | `git.commitFiles` → `modules/git-history/GitHistoryPane.tsx`                                                                                                     |
| `git_commit_file_diff` | `git::commands` | `git.commitFileDiff` → `modules/editor/lib/diffCache.ts`                                                                                                         |
| `git_remote_url`       | `git::commands` | `git.remoteUrl` → `modules/git-history/GitHistoryPane.tsx`                                                                                                       |
| `git_list_branches`    | `git::commands` | `git.listBranches` → `modules/source-control/SourceControlPanel.tsx`                                                                                             |
| `git_checkout_branch`  | `git::commands` | `git.checkoutBranch` → `modules/source-control/SourceControlPanel.tsx`                                                                                           |
| `git_watch`            | `git::commands` | `git.watch` → `modules/git/changes.ts`                                                                                                                           |
| `git_unwatch`          | `git::commands` | `git.unwatch` → `modules/git/changes.ts`                                                                                                                         |

#### shell

| Command               | Handler | Frontend caller(s)                                                               |
| --------------------- | ------- | -------------------------------------------------------------------------------- |
| `shell_run_command`   | `shell` | `modules/editor/lib/externalFormat.ts`, `native.runCommand` → **unused wrapper** |
| `shell_session_open`  | `shell` | `native.shellSessionOpen` → `modules/ai/tools/shell.ts`                          |
| `shell_session_run`   | `shell` | `native.shellSessionRun` → `modules/ai/tools/shell.ts`                           |
| `shell_session_close` | `shell` | `native.shellSessionClose` → **unused wrapper**                                  |
| `shell_bg_spawn`      | `shell` | `native.shellBgSpawn` → `modules/ai/tools/shell.ts`                              |
| `shell_bg_logs`       | `shell` | `native.shellBgLogs` → `modules/ai/tools/shell.ts`                               |
| `shell_bg_kill`       | `shell` | `native.shellBgKill` → `modules/ai/tools/shell.ts`                               |
| `shell_bg_list`       | `shell` | `native.shellBgList` → `modules/ai/tools/shell.ts`                               |

#### workspace

| Command                 | Handler          | Frontend caller(s)                                                                                                               |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `wsl_list_distros`      | `workspace`      | `modules/workspace/env.ts`, `settings/sections/GeneralSection.tsx`                                                               |
| `wsl_default_distro`    | `workspace`      | **no caller**                                                                                                                    |
| `wsl_home`              | `workspace::ipc` | `modules/workspace/env.ts`                                                                                                       |
| `workspace_authorize`   | `workspace`      | `workspaceNative.workspaceAuthorize` → `app/App.tsx`, `app/hooks/useWorkspaceSwitcher.ts`, `modules/spaces/lib/useSpacesBoot.ts` |
| `workspace_current_dir` | `workspace`      | `lib/launchDir.ts`, `workspaceNative.workspaceCurrentDir` → `app/hooks/useWorkspaceSwitcher.ts`                                  |

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
| `get_launch_dir`       | `lib.rs` | `lib/launchDir.ts`                       |
| `get_launch_files`     | `lib.rs` | `lib/launchDir.ts`                       |
| `open_settings_window` | `lib.rs` | `modules/settings/openSettingsWindow.ts` |

#### agent

| Command               | Handler | Frontend caller(s)                                                                                                                         |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent_enable_hooks`  | `agent` | `app/App.tsx`, `modules/agents/components/NotificationBell.tsx`, `modules/ai/lib/useAiLiveBridge.ts`, `modules/control/lib/hooksConfig.ts` |
| `agent_disable_hooks` | `agent` | `modules/control/lib/hooksConfig.ts`                                                                                                       |
| `agent_hooks_plan`    | `agent` | `modules/control/lib/hooksConfig.ts`                                                                                                       |
| `agent_hooks_apply`   | `agent` | `modules/control/lib/hooksConfig.ts`                                                                                                       |
| `agent_hooks_status`  | `agent` | `modules/agents/components/NotificationBell.tsx`, `modules/control/lib/hooksConfig.ts`                                                     |

#### secrets

| Command           | Handler   | Frontend caller(s)          |
| ----------------- | --------- | --------------------------- |
| `secrets_get`     | `secrets` | `modules/ai/lib/keyring.ts` |
| `secrets_set`     | `secrets` | `modules/ai/lib/keyring.ts` |
| `secrets_delete`  | `secrets` | `modules/ai/lib/keyring.ts` |
| `secrets_get_all` | `secrets` | `modules/ai/lib/keyring.ts` |

#### net

| Command          | Handler | Frontend caller(s)             |
| ---------------- | ------- | ------------------------------ |
| `lm_ping`        | `net`   | **no caller**                  |
| `ai_http_stream` | `net`   | `modules/ai/lib/proxyFetch.ts` |
| `ai_http_cancel` | `net`   | `modules/ai/lib/proxyFetch.ts` |
| `ai_http_ack`    | `net`   | `modules/ai/lib/proxyFetch.ts` |

#### ai_sessions

| Command                       | Handler       | Frontend caller(s)           |
| ----------------------------- | ------------- | ---------------------------- |
| `ai_session_load`             | `ai_sessions` | `modules/ai/lib/sessions.ts` |
| `ai_session_save`             | `ai_sessions` | `modules/ai/lib/sessions.ts` |
| `ai_session_delete`           | `ai_sessions` | `modules/ai/lib/sessions.ts` |
| `ai_session_finish_migration` | `ai_sessions` | `modules/ai/lib/sessions.ts` |
| `ai_session_prune_backup`     | `ai_sessions` | `modules/ai/lib/sessions.ts` |

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

| Event                         | Emitted by                                                                     | Listened in                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `terax:open-file`             | `lib.rs` (macOS Open With), to all windows                                     | `app/App.tsx`                                                                                                            |
| `terax:settings-tab`          | `lib.rs::open_settings_window`, to `settings`                                  | `settings/SettingsApp.tsx`                                                                                               |
| `terax:control-request`       | `modules/control.rs`, to `main` (CLI `identify` and `open`)                    | `modules/control/useControlBridge.ts`                                                                                    |
| `terax:agent-signal`          | `modules/pty/session.rs` (OSC detection) and `modules/agent_events.rs` (hooks) | `modules/terminal/lib/agentActivity.ts`                                                                                  |
| `terax:agent-event`           | `modules/agent_events.rs`, to the window that owns the pane                    | `modules/control/lib/agentEvents.ts`, not loaded by the app (see above)                                                  |
| `terax:terminal-notification` | `modules/pty/session.rs` (BEL, OSC 9/99/777)                                   | `modules/control/lib/agentEvents.ts`, not loaded by the app (E20-01)                                                     |
| `terax:git-changed`           | `modules/git/watch.rs`                                                         | `modules/git/changes.ts`                                                                                                 |
| `fs:changed`                  | `modules/fs/watch.rs`                                                          | `modules/explorer/lib/watch.ts`                                                                                          |
| `fs:file-written`             | `modules/fs/file.rs` (`fs_write_file`)                                         | `modules/editor/useEditorFileSync.ts`, `modules/markdown/useMarkdownDocument.ts`, `modules/theme/useThemeFileEditing.ts` |
| `terax:window-presentation`   | `modules/window_presentation.rs`                                               | `modules/terminal/ghostty/windowPresentation.ts`                                                                         |

### Events between windows (frontend → frontend)

Emitted with `emit` from `@tauri-apps/api/event` so that the other window (main or settings) reloads its copy:

| Event                           | Emitted and listened in                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `terax://prefs-changed`         | `modules/settings/store.ts`                                                                     |
| `terax://ai-keys-changed`       | `modules/settings/store.ts` (listened only; E05-11 removed the emitter with the Models section) |
| `terax://custom-themes-changed` | `modules/theme/customThemes.ts`                                                                 |
| `terax://theme-edit`            | `modules/theme/themeFiles.ts`                                                                   |
| `terax://ai-agents-changed`     | `modules/ai/store/agentsStore.ts`                                                               |
| `terax://ai-snippets-changed`   | `modules/ai/store/snippetsStore.ts`                                                             |

### Channels and URI schemes

- **`terax-pty` scheme** (`modules/pty/protocol.rs`, `gate.rs`, `hub.rs`, `wire.rs`): all terminal output. Each webview
  gets a token from `pty_stream_open` and keeps one long-poll `POST terax-pty://localhost/poll` open
  (`http://terax-pty.localhost/poll` on Windows) from `modules/terminal/lib/pty-bridge.ts`. Requests are checked for
  route, `Origin`, size, framing and token; flow control is by acknowledged parsed bytes. Input goes the other way
  through `pty_write` with a raw body.
- **`asset` scheme** (`modules/fs/assets.rs`): serves files granted with `asset_grant` (images in the editor and Markdown previews), revoked
  per webview on reload and close.
- **Tauri channels:** `lsp_spawn` takes `on_message` and `on_exit` channels (`modules/lsp/`); `ai_http_stream` takes an
  `on_event` channel for the streamed response (`modules/net.rs`).

### Control protocol

`control::start` binds `127.0.0.1` on a random port with a random token and writes a descriptor to the cache dir. The
CLI (`terax-cli`) connects with JSON lines. Methods (`terax-control-protocol`): `ping`, `capabilities`, `identify`,
`open` and `hook`. `identify` and `open` are forwarded to the main window as `terax:control-request` and answered with
`control_respond`; `hook` is handled by `agent_events.rs` with per-pane tokens exported to each shell
(`TERAX_CONTROL_ADDR`, `TERAX_CONTROL_TOKEN`, `TERAX_PANE_ID`, `TERAX_CLI`). Details: `.docs/plan/analysis/agents.md`.

## Corrections to the area analyses

- The updater and process plugins are gone (#318): `backend-core.md` still lists them, and `app-shell.md` mentions
  `UpdaterDialog` in `App.tsx`.
- `App.tsx` is 1484 lines, not 1695; most `App.tsx:<line>` references in `app-shell.md` have shifted.
- On `WindowEvent::Destroyed` the backend releases asset grants, AI streams and PTYs; control sessions are not closed
  there (`backend-core.md` says they are). Agent-decision readiness is reset on page load instead.
- `fs_grep`, `fs_glob`, `git_show_commit` and `shell_session_close` have no real caller; the analyses list only
  `pty_has_foreground_job`.
