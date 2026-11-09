# backend-core — analysis

Area: Rust core (`src-tauri/src/lib.rs`, `main.rs`, `modules/mod.rs`, `pty/`, `shell/`, `proc/`, `history/`,
`runtime.rs`, `ipc_body.rs`, `window_presentation.rs`, `vibrancy.rs`), `src-tauri/tests/{common,shell_background.rs}`,
`scripts/pty-smoke/`, `scripts/ipc-profile/`. ~17.3k lines. Item map: `analysis/backend-core.json`.

## How it works today

**Boot** (`lib.rs:165-430`). `run()` first handles the `__terax_notify <agent> <event>` argv subcommand
(lib.rs:170-178: prints an OSC 777 marker to the console and exits; used by agent hooks on Windows), installs
the 2-worker tokio runtime (`runtime.rs`), snapshots the launch cwd (`workspace::init_launch_cwd`, lib.rs:186),
registers plugins (clipboard, menu, process, updater, window-state, autostart, store, os, notification, log,
opener; lib.rs:191-216), two URI schemes (`terax-pty` → `pty::stream_protocol`, `asset` → fs assets;
lib.rs:218-219), page-load cleanup of per-webview state (lib.rs:220-236), starts the agent control server
(lib.rs:243), manages ~17 state objects (lib.rs:260-283) and registers ~140 commands (lib.rs:284-428).
On `WindowEvent::Destroyed` it closes that webview's PTYs, AI streams and control sessions (lib.rs:440-460).

**PTY lifecycle** (`pty/mod.rs`, `pty/session.rs`). `pty_open` (mod.rs:172) resolves cwd off-thread via
`workspace::user_spawn_cwd_or_home` (mod.rs:208; falls back to `None` if not authorized/accessible), then
`session::spawn` builds the command with `shell_init::build_command` and spawns it on `portable_pty`
(ConPTY on Windows). Each session has a writer thread, a reader thread (Unix: `unix_reader.rs` non-blocking),
and a waiter thread (session.rs:384-488). Ids are monotonic from 1 (mod.rs:49). Sessions are owned by a webview
label; a page reload stops their streams (`reset_webview`, mod.rs:97) and `pty_close_all` (called from
`src/main.tsx` at startup) reaps leftovers; window destroy kills them (`destroy_webview`, mod.rs:109).
Session drop runs on a dedicated `terax-pty-drop-*` thread (mod.rs:158) because ConPTY close can block.
`foreground.rs` answers "does the shell have children" cheaply per OS (close-tab guard). `da_filter.rs`
answers terminal queries (DA/colour) in-process using `terminal_colors.rs` (pushed by `pty_set_colors`).
`agent_detect.rs` scans output for OSC 133/9/99/777 to infer agent activity and notifications and emits
`terax:agent-signal` / `terax:terminal-notification` events (session.rs:22-23).

**Output transport v2** (`hub.rs`, `protocol.rs`, `gate.rs`, `wire.rs`, `queue.rs`, `output.rs`,
`presentation.rs`, `wake.rs`). One hub thread for the process (hub.rs:628). Each webview calls
`pty_stream_open` (mod.rs:435) and gets a 64-bit token (hex). The frontend keeps one long-poll
`POST terax-pty://localhost/poll` (Windows: `http://terax-pty.localhost/poll`) outstanding; body =
`[u64 token][u32 count][(u32 pty_id, u64 parsed_bytes)…]` (wire.rs:6-20); response = frames
`data/exit/failed/sync`. `gate.rs` admits requests by route, `Origin` (app origins only), size, framing and a
constant-time token comparison (gate.rs:20-55) because preview iframes can reach the scheme. Flow control is
credit-based (acks of parsed bytes, `MAX_IN_FLIGHT_BYTES`); `pty_set_presentation` sets each PTY's class
(visible/hidden…) which drives coalescing deadlines, so hidden tabs keep running cheaply (TER-005).
Input goes the other way via `pty_write` with a raw body and id header (mod.rs:268-300).

**Shell launch** (`pty/shell_init.rs`). `build_command(cwd, workspace, blocks, shell, control)` (53-70):
a shell override is accepted only if it is one of `list_shells()` (115-129). Unix: override → login shell
(passwd) → `$SHELL` → `/bin/zsh`; zsh via a ZDOTDIR wrapper, bash via `--rcfile`, fish via conf.d. Windows:
override or `windows_shell_path()`; PowerShell gets `-NoLogo -NoExit -ExecutionPolicy Bypass -File profile.ps1`,
git-bash gets `--rcfile`, cmd gets a `PROMPT` emitting OSC; WSL workspaces spawn `wsl.exe` with the distro's
login shell and integration files written into the distro (717-845). `apply_common` (187-245) sets
`TERM`, `COLORTERM`, `TERAX_*` env, the control-server credentials, AppImage env cleanup, UTF-8 locale,
and the cwd (explicit → launch cwd → home). Scripts (`pty/scripts/*`) emit OSC 7 (cwd) and OSC 133 A/B/C/D.

**Other modules.** `shell/` runs non-PTY commands, persistent shell sessions and background processes for the
AI agent tools. `proc/` provides capped child-output capture, Windows Job Objects (kill tree on close),
RSS and `hide_console`. `history/` indexes zsh/bash/fish histfiles + PATH for block-mode suggestions.
`window_presentation.rs` reports live-resize/occlusion to renderers. `vibrancy.rs` applies Mica /
NSVisualEffectView. `ipc_body.rs` decodes raw request bodies for AI commands.

## Interfaces

**Tauri commands owned here:** `pty_open, pty_write, pty_stream_open, pty_set_presentation, pty_set_colors,
pty_diagnostics, pty_resize, pty_close, pty_close_all, pty_has_foreground_process, pty_has_foreground_job,
pty_shell_name, pty_session_shell, pty_list_shells` (lib.rs:285-298); `shell_run_command, shell_session_open,
shell_session_run, shell_session_close, shell_bg_spawn, shell_bg_logs, shell_bg_kill, shell_bg_list`
(lib.rs:377-384); `history_suggest, history_commands, history_record, history_list` (lib.rs:412-415);
`window_backdrop_kind, window_set_backdrop, window_presentation_state` (lib.rs:416-418);
`get_launch_dir, get_launch_files, open_settings_window` (lib.rs:395-397). Full map in Answers §1.

**Events:** `terax:agent-signal`, `terax:terminal-notification` (session.rs:22-23), `terax:settings-tab`
(lib.rs:103), plus `terax:open-file`-style launch events (lib.rs, grep `terax:`).

**URI scheme:** `terax-pty` (`/poll`, `/ack`), token from `pty_stream_open`.

**Env vars set on children:** `TERM`, `COLORTERM`, `LANG` (fallback), `TERAX_TERMINAL=1`, `TERAX_BLOCKS=1`,
`TERAX_CONTROL_ADDR`, `TERAX_CONTROL_TOKEN`, `TERAX_PANE_ID`, `TERAX_CLI`, `PATH` (CLI bin dir prepended),
`TERAX_USER_ZDOTDIR`, `ZDOTDIR`, `CHERE_INVOKING` (git-bash), `PROMPT` (cmd), `TERAX_WSL_LOGIN_SHELL`
(internal, removed before spawn; shell_init.rs:81-84).

**Files on disk:** `~/.cache/terax/shell-integration/{zsh,bash,powershell}/…`, fish
`~/.config/fish/conf.d/terax.fish`-style file (shell_init.rs:476), and the same under each WSL distro's
`$HOME/.cache/terax/…` and fish conf.d (shell_init.rs:857,904). Temp files `.__terax_tmp__` (488,1002).

**Read-only inputs:** user histfiles (history/mod.rs:31-60), `/etc/shells` (shell_init.rs:328).

**Public Rust API used by other areas:** `proc::{capture, job, rss, hide_console}`, `pty::PtyState::pane_target`
(agents/control), `pty::shell_init` (pub(crate)), `pty::agent_detect::AgentLink`, `ipc_body::bytes_of` (ai).

## Couplings

- **terminal** → `pty_*` via `src/modules/terminal/lib/pty-bridge.ts` and
  `ghostty/useGhosttyTerminalSession.ts` (pty_has_foreground_process); `window_presentation_state` via
  `ghostty/windowPresentation.ts`; `history_*` via `terminal/block/lib/history.ts`; `pty_session_shell` via
  `terminal/lib/useTerminalFileDrop.ts`; `pty_diagnostics` via `terminal/lib/terminalDiagnostics.ts`.
- **state-settings** → `workspace.rs` (`user_spawn_cwd_or_home` workspace.rs:231, `launch_cwd_snapshot` :301,
  WSL helpers) used by pty/mod.rs:27 and shell_init.rs; settings `GeneralSection.tsx` calls `pty_list_shells`.
- **agents** → `control::ControlState::shell_env/activate_shell` (pty/mod.rs:197,227), `agent::emit_conout_marker`
  (lib.rs:172), `terax_control_protocol::hook::clean_text` (agent_detect.rs:6); terax-cli reads
  `TERAX_CONTROL_*`/`TERAX_PANE_ID` (crates/terax-cli/src/lib.rs:107,285-286).
- **ai** → `shell_*` (src/modules/ai/lib/native.ts), `ipc_body` (net.rs, ai_sessions.rs).
- **ide-tools** → `shell_run_command` (editor/lib/externalFormat.ts), `proc` (git/process.rs, lsp/session.rs),
  `tests/common` (tests/fs_search.rs, tests/git_operations.rs).
- **app-shell** → `useSystemInfo.ts` calls `pty_shell_name`; `theme/vibrancy.ts` calls `window_*backdrop*`;
  `app_menu` and `open_settings_window` registered in lib.rs.
- **build-identity** → plugins/updater registration (lib.rs:198), bench feature (lib.rs:240,422), smoke harness
  reads `tauri.conf.json` (pty-smoke/run.py:98).

## "terax" mentions

**(a) Phase 0 identity isolation (shared with an installed Terax):**

- Integration script dir `~/.cache/terax/shell-integration` (shell_init.rs:449 Unix, :912 Windows) and
  `$HOME/.cache/terax/shell-integration` inside WSL distros (:857), fish file `terax.fish` (:476, :904). Both apps
  write different script versions to the same path with `write_if_changed` → each overwrites the other.
- Env vars injected into children: `TERAX_TERMINAL`, `TERAX_BLOCKS`, `TERAX_CONTROL_ADDR`, `TERAX_CONTROL_TOKEN`,
  `TERAX_PANE_ID`, `TERAX_CLI` (shell_init.rs:195-219,778), `TERAX_USER_ZDOTDIR` (:394,808). A Terax CLI/hook
  run inside a lut pane would talk to lut's control server and vice versa; inherited vars leak across nesting.
- Script guard `__TERAX_HOOKS_LOADED` (bashrc.bash:10, profile.ps1:6, init.fish) and shell function `terax`
  (profile.ps1:10, bashrc.bash, init.fish) — nesting suppresses lut's integration.
- Hook marker: OSC 777 `notify;Terax;` (agent_detect.rs:35) and argv subcommand `__terax_notify` (lib.rs:170).
- Smoke harness temp bundle ids `app.crynta.terax.pty-smoke-*`, `app.crynta.terax.ipc-lab-*`
  (pty-smoke/run.py, ipc-profile/run.py) — app data dirs under Terax's vendor id.

**(b) Visual rebranding:** "Terax" in comments/log text visible in logs (lib.rs:244 "could not start Terax
control server"), `[terax]` log prefixes; "Terax-spawned" comments in init.fish. Low priority.

**(c) Internal — rename on touch:** `terax-pty` URI scheme (protocol.rs, gate.rs, lib.rs:218; per-process, no
collision), thread names `terax-pty-hub/-drop-/-writer/-reader/-waiter`, `terax-cap-*`; events
`terax:agent-signal`, `terax:terminal-notification`, `terax:settings-tab`; `TERAX_WSL_LOGIN_SHELL` (consumed and
removed before spawn); shell function names `_terax_*`/`__terax_*` (~150 occurrences in scripts);
`.__terax_tmp__`; `terax_lib` crate name in tests/shell_background.rs (owned by build-identity Cargo.toml);
test-only env `TERAX_FORK_*`, `TERAX_PC`, `TERAX_PROBE`, `TERAX_FAKE_BLE`; harness env
`TERAX_SMOKE_*`, `TERAX_IPC_*`.

## Risks

- Phase 0 env/marker rename spans three areas (backend-core scripts+launcher, agents CLI+hook installer,
  agent_detect marker); a partial rename silently breaks agent badges.
- Shared `~/.cache/terax` means lut today _already_ rewrites an installed Terax's shell scripts on first PTY.
- `sanitize_shell_override` (shell_init.rs:115-129) drops any non-enumerated shell silently → profiles with custom
  executables would fall back to the default shell without an error (bad for PRO-010).
- On Windows `apply_common` silently falls back to home if cwd is not a dir; the frontend never learns
  (13.5:7). WSL cwd is translated by wsl.exe; an uninstalled distro yields a spawn error string only.
- Most PTY unit tests are `#[cfg(unix)]` (mod.rs:579, session tests use `/bin/sh`); Windows (first target) has
  little automated PTY coverage. Smoke harnesses are macOS-only.
- `generate_handler!` list is a merge hotspot for all removal PRs.

## Open questions

1. Profile executables: allow any executable path (with validation + user confirmation), or keep an allowlist
   extended by profiles stored in lut's own store? (security vs PRO-002)
2. Rename the `terax-pty` scheme now or never? (recommendation: never/on-touch; it does not collide).
3. Keep block mode + `history/` suggestions? Depends on terminal area decision; PowerShell history unsupported.
4. Keep Mica/vibrancy backdrop? Part of the user's design.
5. Should lut scrub inherited `TERAX_*` vars from its own environment before spawning children (when lut is
   launched from a Terax terminal)? Recommended yes.
6. Runtime cwd tracking relies solely on OSC 7 from integrated shells; cmd.exe and non-integrated shells have
   none. Need a spike for Windows (PEB read) / Linux `/proc/<pid>/cwd` fallback? Probably P2.

## Answers

### 1. Tauri command map (lib.rs:284-428)

| commands                                                                                                                                                                                                          | owner area                                 | lut keeps?                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| pty_open, pty_write, pty_stream_open, pty_set_presentation, pty_set_colors, pty_diagnostics, pty_resize, pty_close, pty_close_all, pty_has_foreground_process, pty_shell_name, pty_session_shell, pty_list_shells | backend-core (consumed by terminal)        | yes (pty_open extended)                                                                                                       |
| pty_has_foreground_job                                                                                                                                                                                            | backend-core                               | no — no frontend caller                                                                                                       |
| fs_* (tree, read/write, stat, canonicalize, mutate, copy, clipboard_paths, watch, search, warm_index, list_files, grep, grep_interactive, glob, read_project_memory), asset_grant/revoke, list_subdirs            | ide-tools                                  | mostly no (file tree/editor removed); keep what project picker needs (list_subdirs/fs_stat/canonicalize?) — ide-tools decides |
| ai_read_file, ai_read_dir, ai_grep, ai_glob                                                                                                                                                                       | ide-tools/ai                               | no (ADR-004)                                                                                                                  |
| lsp_detect, lsp_host_pid, lsp_resolve_root, lsp_spawn, lsp_send, lsp_kill                                                                                                                                         | ide-tools                                  | no                                                                                                                            |
| git_* (status, diff, stage, commit, fetch, pull, push, log, branches, worktrees, checkpoints, watch…), task_*                                                                                                     | ide-tools                                  | no / maybe git_resolve_repo for indicators                                                                                    |
| shell_run_command, shell_session__, shell_bg__                                                                                                                                                                    | backend-core (consumed by ai, editor)      | no                                                                                                                            |
| wsl_list_distros, wsl_default_distro, wsl_home, workspace_authorize, workspace_current_dir                                                                                                                        | state-settings                             | yes (WSL profiles)                                                                                                            |
| control_frontend_ready, control_respond, agent_decisions_ready, agent_decision_respond, agent_enable_hooks, agent_disable_hooks, agent_hooks_plan, agent_hooks_apply, agent_hooks_status                          | agents                                     | yes                                                                                                                           |
| get_launch_dir, get_launch_files                                                                                                                                                                                  | backend-core (lib.rs) / app-shell          | launch_dir yes; launch_files only if files open somewhere                                                                     |
| open_settings_window                                                                                                                                                                                              | app-shell                                  | redesign (UI)                                                                                                                 |
| secrets_get/set/delete/get_all, lm_ping, ai_http_stream/cancel/ack, ai_session_load/save/delete/finish_migration/prune_backup                                                                                     | ai                                         | no (ADR-004)                                                                                                                  |
| history_suggest, history_commands, history_record, history_list                                                                                                                                                   | backend-core (consumed by terminal)        | deferred                                                                                                                      |
| window_backdrop_kind, window_set_backdrop                                                                                                                                                                         | backend-core (consumed by app-shell theme) | deferred to design                                                                                                            |
| window_presentation_state                                                                                                                                                                                         | backend-core (consumed by terminal)        | yes                                                                                                                           |
| bench_config, bench_window, bench_exit (feature `bench`)                                                                                                                                                          | build-identity                             | keep as dev tooling                                                                                                           |

### 2. pty_open interface

`pty_open(cols: u16, rows: u16, cwd?: String, workspace?: WorkspaceEnv, blocks?: bool, shell?: String,
pane_id?: u32, presentation?: PresentationClass, colors?: TerminalColors) -> u32` (mod.rs:172-185).
`shell` is a path that must match `list_shells()` (shell_init.rs:115-129) or it is ignored; no args, no env.
`workspace` = Local | Wsl{distro}; for WSL `shell` and `blocks` are ignored (shell_init.rs:652-653) and the
distro's login shell is used. Missing for profiles: arbitrary executable + args (PRO-002), env overrides with
safe merge (F3:3), WSL distro per pane independent of the Space's workspace (PRO-006), explicit start dir with
configurable fallback and an error/flag back when the fallback was used (PRO-003, PRO-010, 13.5:7), a
`-NoProfile`/"no integration" switch (7.3), a starting title/icon is frontend-only. Errors are plain strings.

### 3. Shell detection

- Windows (`shell_init.rs:933-993`): `pwsh.exe` on PATH or `%ProgramFiles%\PowerShell\7`, Windows PowerShell
  in System32, `cmd.exe`, Git Bash from known install dirs (deliberately not System32 `bash.exe`). Default:
  `windows_shell_path()`. **WSL is not listed as a shell**; it is a workspace env (`WorkspaceEnv::Wsl`) with
  distros from `workspace::wsl_list_distros` (state-settings) and a login shell probed via `wsl_login_shell`.
- Unix (`shell_init.rs:306-350`): login shell from passwd, `$SHELL`, fallback `/bin/zsh`; `list_shells` reads
  `/etc/shells` (only existing files). Integrated: zsh, bash, fish; others spawn bare.
- macOS/Linux share the Unix path; no Homebrew-specific discovery beyond /etc/shells.

### 4. cwd

Initial: the frontend passes `cwd` — App.tsx:1190-1200 uses the active terminal leaf's cwd (inherit from the
focused pane) else home; restored splits carry per-leaf cwd. Backend: `user_spawn_cwd_or_home` authorizes it
(workspace.rs:231-243) or returns None; `apply_common` then uses explicit → launch-cwd snapshot (CLI arg / process
cwd at start, workspace.rs:287-303) → home (shell_init.rs:225-236). Runtime tracking: only OSC 7 emitted by the
integration scripts (profile.ps1:93, bashrc/zsh/fish), parsed in the frontend
(`terminal/ghostty/core/GhosttySemanticEventRouter.ts`). No /proc or Windows-API fallback; cmd.exe gets a
`PROMPT` with OSC (shell_init.rs:671-675) .

### 5. PTY transport v2

See "How it works": `pty_stream_open` issues a per-webview u64 token (hub owns issue/revoke; `gate::StreamTokens`
publishes it for lock-free checks), the frontend long-polls `terax-pty://localhost/poll` (Windows
`http://terax-pty.localhost/poll`) with the token in a binary body; `gate.rs` checks route, Origin (app origins
resolved from config, mod.rs:52), size, framing, token (constant time). Reopening supersedes the old stream.
"terax"-named identifiers: scheme `terax-pty`, thread names, error text "unknown terax-pty endpoint"
(gate.rs:166). None collides with an installed Terax: URI schemes are registered per webview inside the process
and the token is in-memory. Rename on touch only.

### 6. history/ and proc/

`history/` builds an in-memory index of zsh (demetafied), bash and fish history plus PATH executables
(history/mod.rs:31-60, parse.rs) and ranks suggestions (`index.rs`); `history_record` adds commands typed in
lut. Only user: terminal block-mode autosuggest (`src/modules/terminal/block/lib/history.ts`). `proc/`:
`capture.rs` spawns a child with capped stdout/stderr and optional stdin (threads `terax-cap-*`), `job.rs`
Windows Job Object with KILL_ON_JOB_CLOSE, `rss.rs` resident memory per pid, `mod.rs::hide_console`
(CREATE_NO_WINDOW). Users: pty, shell, git, lsp, workspace.

### 7. Tests and smoke scripts

- Rust unit tests inline: pty (mod.rs:579+ `cfg(all(test, unix))`, session.rs:550+ uses `/bin/sh`, hub/queue/
  wire/gate/protocol/da_filter/agent_detect/presentation pure tests run everywhere), shell_init (Unix+Windows
  launch-spec tests), history/parse, vibrancy, window_presentation. Run: `cargo test --manifest-path
src-tauri/Cargo.toml`. Real PTY needed: mod.rs tests, session.rs tests (Unix only).
- Integration: `src-tauri/tests/shell_background.rs` (`#![cfg(unix)]`, spawns real processes, no PTY).
- Shell script tests (real shells, no PTY): `bash src-tauri/src/modules/pty/scripts/bashrc.test.bash`,
  `python3 src-tauri/src/modules/pty/scripts/zshrc.test.py`, `fish …/init.test.fish`. Not wired into package.json.
- `scripts/pty-smoke/run.py [--fast] [--only latency,spinners,flood,idle] [--driver driver-new.ts]`: builds a
  debug Tauri app with a temp config and drives the real PTY transport in the webview — real PTY, macOS only.
- `scripts/ipc-profile/run.py`: builds the app and profiles fs/lsp/AI-session IPC; macOS only; no PTY.

## Draft issues

### backend-core-D01 — Isolate shell-integration install directory from Terax

```yaml
id: backend-core-D01
depends-on: [build-identity-D01?]
refs: [F0:10, identity:1, 13.2:21, .docs/plan/analysis/backend-core.md]
covers: [F0:10, backend-core/shell-integration-launch]
type: task
scope: be
size: S
```

**Goal:** lut never reads or overwrites Terax's shell-integration scripts.

**Acceptance criteria:**

- [ ] Unix, Windows and WSL integration roots move from `.cache/terax/shell-integration` to a lut-owned dir (shell_init.rs:449,857,912), fish conf.d file renamed from `terax.fish` (:476,:904).
- [ ] Temp file suffix `.__terax_tmp__` renamed (rename-on-touch).
- [ ] Unit tests referencing `/cache/terax/...` paths updated.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml shell_init`; open a pwsh and a WSL pane, confirm scripts appear only under the lut dir and `~/.cache/terax` is untouched (mtime).

### backend-core-D02 — Rename child-process env vars and script guards to lut names

```yaml
id: backend-core-D02
depends-on: [backend-core-D01]
refs: [F0:10, 13.2:21, 7.3]
covers: [F0:10, backend-core/shell-integration-scripts]
type: task
scope: be
size: M
```

**Goal:** lut children never expose or consume `TERAX_*` variables, so Terax tooling cannot attach to lut panes and nested shells keep their own integration.

**Acceptance criteria:**

- [ ] `TERAX_TERMINAL/BLOCKS/CONTROL_ADDR/CONTROL_TOKEN/PANE_ID/CLI/USER_ZDOTDIR` renamed in shell_init.rs and all scripts; `__TERAX_HOOKS_LOADED` guard renamed.
- [ ] Inherited `TERAX_*` vars are removed from the child env (lut launched from a Terax terminal).
- [ ] The `terax` shell wrapper function becomes the lut CLI name, coordinated with agents-D?? (CLI reads the new vars).
- [ ] Script tests updated and passing.

**Verification:** `bash …/bashrc.test.bash`, `python3 …/zshrc.test.py`, `cargo test`; in a lut pwsh pane `Get-ChildItem env:TERAX*` returns nothing.

**Notes:** must land in the same release as the agents CLI rename (agents-D0x?).

### backend-core-D03 — Replace the Terax hook marker and notify subcommand

```yaml
id: backend-core-D03
depends-on: [agents-D01?]
refs: [F0:10, 13.2:21, AGT-001]
covers: [backend-core/agent-detect, F0:10]
type: task
scope: be
size: S
```

**Goal:** agent markers from Terax hooks are not taken as lut events and vice versa.

**Acceptance criteria:**

- [ ] `TERAX_MARKER` `notify;Terax;` (agent_detect.rs:35) replaced by a lut marker; emitter (`agent::emit_conout_marker`) and argv subcommand `__terax_notify` (lib.rs:170) renamed in the same PR.
- [ ] Tests `terax_marker_*` renamed and a test proves the old Terax marker is ignored.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml agent_detect`.

### backend-core-D04 — Remove unused pty_has_foreground_job command

```yaml
id: backend-core-D04
depends-on: []
refs: [F0:12]
covers: [backend-core/pty-session]
type: task
scope: be
size: XS
```

**Goal:** drop dead IPC surface.

**Acceptance criteria:**

- [ ] `pty_has_foreground_job` (pty/mod.rs:384) and its registration (lib.rs:295) removed; helper code only it used removed.

**Verification:** `cargo check`, `pnpm typecheck`; `rg pty_has_foreground_job` finds nothing.

### backend-core-D05 — Remove the non-PTY shell execution module

```yaml
id: backend-core-D05
depends-on: [ai-D01?, ide-tools-D01?]
refs: [ADR-004, ADR-002]
covers: [backend-core/shell-exec]
type: task
scope: be
size: L
size-exception: mechanical deletion of a whole module (~1000 lines) and its test
```

**Goal:** delete `modules/shell/` once AI tools and editor formatting are gone.

**Acceptance criteria:**

- [ ] `src-tauri/src/modules/shell/`, `tests/shell_background.rs`, `ShellState` (lib.rs:265) and the 8 `shell_*` registrations removed.
- [ ] No frontend reference to `shell_*` commands remains.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml`; `rg "shell_(run_command|session_|bg_)" src src-tauri` empty.

### backend-core-D06 — Remove ipc_body and the ipc-profile harness

```yaml
id: backend-core-D06
depends-on: [ai-D01?, ide-tools-D01?]
refs: [ADR-004]
covers: [backend-core/ipc-body, backend-core/ipc-profile]
type: task
scope: be
size: S
```

**Goal:** delete AI-only IPC helpers and the profiler for removed commands.

**Acceptance criteria:**

- [ ] `modules/ipc_body.rs` and its `mod` line removed (no users left after AI removal).
- [ ] `scripts/ipc-profile/` removed.

**Verification:** `cargo check --manifest-path src-tauri/Cargo.toml`.

### backend-core-D07 — Prune app entry after module removals

```yaml
id: backend-core-D07
depends-on: [backend-core-D05, backend-core-D06]
refs: [F0:12, ADR-004]
covers: [backend-core/app-entry]
type: task
scope: be
size: S
```

**Goal:** `lib.rs` only registers state, plugins and commands lut uses.

**Acceptance criteria:**

- [ ] No leftover `manage(...)`, page-load or `WindowEvent::Destroyed` cleanup for removed modules (lib.rs:220-283,440-460).
- [ ] Control-server log text and other user-visible "Terax" strings in lib.rs use lut wording.
- [ ] A command inventory (name → area) is recorded in `.docs/` (F0:12).

**Verification:** `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`; app starts, a terminal opens.

### backend-core-D08 — Launch spec in pty_open: executable and arguments

```yaml
id: backend-core-D08
depends-on: [state-settings-D??]
refs: [F3:3, PRO-002, 5.7, 7.1]
covers: [PRO-002, F3:3]
type: task
scope: be
size: M
```

**Goal:** a profile can start any program with arguments, keeping today's shell integration for known shells.

**Acceptance criteria:**

- [ ] `pty_open` accepts an optional `launch { program, args[] }` (serde, camelCase); old `shell` param keeps working.
- [ ] Known shells (pwsh/powershell/bash/zsh/fish/cmd) still get integration; extra user args are appended safely; unknown programs spawn bare.
- [ ] The enumerated-shell allowlist (shell_init.rs:115-129) is replaced by the policy decided in Open question 1; a missing program returns a typed error (no silent fallback).
- [ ] Unit tests for command construction on Unix and Windows.

**Verification:** `cargo test shell_init`; open `pwsh -NoLogo` and `python -q` panes from a test profile.

### backend-core-D09 — Launch spec: environment overrides

```yaml
id: backend-core-D09
depends-on: [backend-core-D08]
refs: [F3:3, 7.1]
covers: [F3:3]
type: task
scope: be
size: S
```

**Goal:** profiles set/unset env vars without overriding lut's own integration vars.

**Acceptance criteria:**

- [ ] `launch.env` map (value or null to unset) applied after inherited env, before lut-reserved vars; reserved names cannot be overridden.
- [ ] Applied to WSL via `WSLENV` or `env` prefix (document the chosen mechanism).
- [ ] Tests.

**Verification:** `cargo test`; a pane with `FOO=bar` prints it in pwsh and WSL.

### backend-core-D10 — WSL distro and start directory per launch, with typed errors

```yaml
id: backend-core-D10
depends-on: [backend-core-D08]
refs: [PRO-003, PRO-006, PRO-010, PRJ-003, 8.4:2, 13.5:7, 13.2:2, 13.2:12]
covers: [PRO-003, PRO-006, PRJ-003, 13.5:7]
type: task
scope: be
size: M
```

**Goal:** each pane can target a WSL distro and a start dir; failures are reported, not hidden.

**Acceptance criteria:**

- [ ] Launch spec carries `distro` independent of the Space workspace; profile args honoured for WSL (today ignored, shell_init.rs:652-653).
- [ ] Explicit cwd unusable → fallback per configurable policy (home / profile dir / fail) and the result reports which cwd was used.
- [ ] Errors are a typed enum (`ExecutableNotFound`, `CwdUnavailable`, `DistroNotInstalled`, `SpawnFailed`) serialized to the frontend.

**Verification:** `cargo test`; open a pane in an uninstalled distro → typed error, no crash; missing `D:\x` cwd → home + flag.

### backend-core-D11 — Shell discovery for profile seeds (WSL distros, more shells)

```yaml
id: backend-core-D11
depends-on: []
refs: [F3:6, PRO-006, 13.3:1, 13.3:2, 13.3:3]
covers: [F3:6]
type: task
scope: be
size: S
```

**Goal:** `pty_list_shells` returns everything a default profile set needs.

**Acceptance criteria:**

- [ ] Windows: includes each installed WSL distro (via workspace::wsl_list_distros) as an entry with `distro`.
- [ ] Unix: /etc/shells plus common Homebrew paths; entries deduplicated by canonical path.
- [ ] Each entry reports `integrated`.

**Verification:** `cargo test shell_init`; on Windows 11 with Ubuntu, the list shows pwsh, Windows PowerShell, cmd, Git Bash (if installed), Ubuntu.

### backend-core-D12 — Per-PTY shell-ready signal

```yaml
id: backend-core-D12
depends-on: []
refs: [8.4:6, 13.5:8]
covers: [8.4:6]
type: task
scope: be
size: S
```

**Goal:** startup commands wait for the first prompt instead of a sleep.

**Acceptance criteria:**

- [ ] First OSC 133;A (or 133;B) per session emits a `ready` event/flag queryable by pty id; non-integrated shells report `unsupported` immediately.
- [ ] Timeout handling documented for callers (13.5:8).

**Verification:** `cargo test agent_detect`/session tests; pwsh pane logs ready within the first prompt.

### backend-core-D13 — Port the PTY smoke harness to Windows and lut identifiers

```yaml
id: backend-core-D13
depends-on: [build-identity-D01?]
refs: [F0:11, 13.4:2, 13.4:3, 13.3:1]
covers: [backend-core/pty-smoke]
type: task
scope: be
size: M
```

**Goal:** a reproducible PTY latency/throughput baseline on Windows 11.

**Acceptance criteria:**

- [ ] `run.py` runs on Windows (and still on macOS); temp bundle id uses lut's vendor prefix.
- [ ] `driver-old.ts` removed; `TERAX_SMOKE_*` env renamed.
- [ ] Usage documented.

**Verification:** `python scripts/pty-smoke/run.py --fast` on Windows produces a results JSON.

### backend-core-D14 — Decide history/ suggestions

```yaml
id: backend-core-D14
depends-on: [terminal-D??]
refs: [TER-007]
covers: [backend-core/history]
type: spike
scope: be
size: XS
```

**Goal:** keep (and add PowerShell PSReadLine history) or remove `history/` with terminal block mode.

**Acceptance criteria:**

- [ ] Decision recorded in plan.md; follow-up issue added (remove module, or add PSReadLine parser).

**Verification:** plan.md updated.

### backend-core-D15 — Decide window backdrop support after UI design

```yaml
id: backend-core-D15
depends-on: [app-shell-D01?]
refs: [ADR-002]
covers: [backend-core/vibrancy]
type: spike
scope: be
size: XS
```

**Goal:** keep or remove `vibrancy.rs` according to the user's design.

**Acceptance criteria:**

- [ ] Design issue states whether lut uses Mica/vibrancy; follow-up issue to remove module and commands, or keep.

**Verification:** plan.md updated.
