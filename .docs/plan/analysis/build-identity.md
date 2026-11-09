# Analysis — build-identity

Area: build, packaging, updater, tooling and product identity. 112 tracked files (about 60 are binary icons).
JSON: `.docs/plan/analysis/build-identity.json` (16 items).

## How it works today

- **Frontend build.** `package.json` (pnpm 11.9.0 pinned via `packageManager`, `engines.node >=22`) drives Vite 8
  (`vite.config.ts`) with two window entries, `index.html` and `settings.html` (`scripts/dist-graph.mjs:19`).
  `vite.config.ts:12-30` refuses `TERAX_BENCH=1` builds without an isolated `TERAX_BENCH_IDENTIFIER`;
  `vite.config.ts:217` defines `__TERAX_BENCH__` (dead-code-eliminates `src/bench`). Dev server on port 1420
  (`vite.config.ts:222`), matching `tauri.conf.json:7` `devUrl`. Budgets: `.size-limit.json`, plus
  `src/app/dist-budget.test.ts` / `eager-budget.test.ts` built on `scripts/dist-graph.mjs` / `scripts/eager-graph.mjs`.
- **Tauri build.** `tauri.conf.json:6-11`: `beforeDevCommand = pnpm build:cli:dev && pnpm dev`,
  `beforeBuildCommand = pnpm build:cli && pnpm build`. `scripts/build-cli.mjs` (agents area) runs
  `cargo build --locked -p terax-cli` and copies the result to `src-tauri/binaries/terax-cli-<triple>[.exe]`
  (`build-cli.mjs:52-83`), bundled as a sidecar (`tauri.conf.json:38-40`). `src-tauri/build.rs:5-35`
  drops `externalBin` in debug builds when the sidecar is missing and panics in release builds.
- **Rust.** `src-tauri/Cargo.toml`: package/bin `terax` (`:2`, `:8`), lib `terax_lib` (`:31`), workspace with
  `crates/terax-cli` and `crates/terax-control-protocol` (`:11`), Tauri 2 (Cargo.lock: tauri 2.12.2), plugins opener,
  clipboard, log, os, store, process, notification, autostart, updater, window-state; one reqwest 0.13 with
  rustls+ring (`:66-73`); `bench` feature (`:23-26`). Release profile: fat LTO, `opt-level = "s"`, `panic = "abort"`.
  No `rust-toolchain` file: "Rust (stable)" (`.docs/origin-terax/README.md:147`); edition 2021.
- **Ghostty WASM.** Prebuilt and committed: `packages/ghostty-core/{adapted,official}/ghostty-vt*.wasm`
  (terminal area). Rebuilding needs Zig >= 0.16.0 (`packages/ghostty-core/adapted/wasm/build.zig.zon:5`); it is not
  part of the normal build.
- **Packaging.** `bundle.targets = all`; NSIS `currentUser` with `installer-hooks.nsh` (Explorer verbs);
  WebView2 `downloadBootstrapper` (`tauri.conf.json:82-84`); deb/rpm/AppImage dependencies; macOS minimum 13 with
  camera/mic entitlements; `createUpdaterArtifacts: true` (`:48`) produces signed update bundles. The Windows
  override removes decorations and sets transparency (`tauri.windows.conf.json`); the Linux override does the same.
- **Updater lifecycle.** Rust registers `tauri_plugin_updater` unconditionally (`src-tauri/src/lib.rs:198`).
  Frontend: `UpdaterDialog` is mounted in `src/app/App.tsx:1668` and calls `useUpdater()` with `autoCheck = true`
  (`UpdaterDialog.tsx:41`), throttled to 30 min through localStorage `terax:updater:last-check`
  (`useUpdater.ts:7-8,89-91`). On Linux it fetches the GitHub API (`useUpdater.ts:49-72`); elsewhere it calls
  `check()` (`:104`), which reads the `latest.json` endpoint, verifies with the minisign pubkey, then
  `downloadAndInstall` + `relaunch()` (`:116-139`). Settings > About has a manual check (`AboutSection.tsx:27,51`).
- **Bench / app lab.** macOS-only real-app benchmark: `scripts/app-lab/run.py` builds with `TERAX_BENCH=1` and
  `--features bench` under identifier `app.crynta.terax.app-lab` with an isolated HOME (`run.py:58,191,461`);
  `bench.rs:17-45` refuses to run under `app.crynta.terax`. The driver in `src/bench/*` posts reports to a local
  HTTP server (`src/bench/report.ts:28`, `early.ts:71`). Window control is macOS only (`bench.rs:722`).
- **Nix.** `flake.nix` + `nix/package.nix` repackage Terax release binaries downloaded from GitHub (`package.nix:12-26`).
- **Licenses.** `LICENSE` (Apache-2.0); `public/licenses/terax.txt` (provenance + modification notice, copied to
  `dist/` by Vite, not referenced by code); third-party licenses bundled as resources (`tauri.conf.json:41-46`).

## Interfaces

- **Tauri identity contract:** identifier `app.crynta.terax` (`tauri.conf.json:5`) feeds the Tauri path resolver
  (`app_data_dir`, `app_local_data_dir`, used e.g. in `ai_sessions.rs:519`, `secrets.rs:46`), plugin-store files,
  window-state file, and the WebView data directory (localStorage/IndexedDB). Window labels `main`, `settings`.
- **Custom protocol:** `terax-pty:` allowed in CSP (`tauri.conf.json:29`), served by backend-core.
- **Bundle-time files:** sidecar `binaries/terax-cli-<triple>`; resources `licenses/terminal/*.txt`.
- **Windows registry:** `HKCU\Software\Classes\{Directory,Directory\Background,Drive}\shell\OpenInTerax`
  (`installer-hooks.nsh:6-19`), passing `%V` to `terax.exe`, parsed by `lib.rs:67-80`.
- **File associations:** "Terax Document", role Editor, about 60 extensions (`tauri.conf.json:98-113`).
- **No deep-link / URI scheme:** no `tauri-plugin-deep-link` in `Cargo.toml`; the only custom scheme is `terax-pty`.
- **Persisted keys:** localStorage `terax:updater:last-check` (`useUpdater.ts:7`), `terax:bench:*` (bench).
- **Env vars (build/bench):** `TERAX_BENCH`, `TERAX_BENCH_IDENTIFIER`, `TERAX_BENCH_ISOLATED`,
  `TERAX_BENCH_SCENARIO`, `TERAX_BENCH_REPORT_URL`, `TAURI_DEV_HOST`, `ANALYZE`, `INSPECT`, `TERAX_CLI_TARGET`.
- **Public TS API:** `@/modules/updater` exports `UpdaterDialog`, `useUpdater` (`index.ts`); global `__TERAX_BENCH__`.
- **Tauri commands (bench feature only):** `bench_config`, `bench_window`, `bench_exit` (`lib.rs:422-427`).

## Couplings

- app-shell -> updater: `src/app/App.tsx:120,1668`; -> bench: `src/main.tsx:24-25`, `src/app/App.tsx:154-157`.
- state-settings -> updater: `src/settings/sections/AboutSection.tsx:2,27`; About links `AboutSection.tsx:11-12`.
- backend-core: plugin registration `src-tauri/src/lib.rs:196-215`; bench guard `lib.rs:239-240`; launch args
  `lib.rs:67-80`; `__terax_notify` `lib.rs:169-170`.
- agents: sidecar build `scripts/build-cli.mjs:52-83`; launcher `src-tauri/src/modules/control.rs:927,946` (`terax`/`terax.exe`).
- terminal: `@terax/ghostty-core` workspace package (`package.json`, `pnpm-workspace.yaml:2`); license resources;
  `__TERAX_BENCH__` branches in ghostty gpu modules.
- ai / ide-tools: CSP `https:` and `frame-src` (`tauri.conf.json:29`), Vite manualChunks and size budgets, fileAssociations.

## "terax" mentions

In this area (171 occurrences):

- **(a) Phase 0 identity isolation (49):** `app.crynta.terax` (`tauri.conf.json:5`, `bench.rs:17`, `run.py:216`);
  updater endpoint `https://github.com/crynta/terax-ai/releases/latest/download/latest.json` (`tauri.conf.json:121`)
  and pubkey (`:119`); `https://api.github.com/repos/crynta/terax-ai/releases/latest` (`useUpdater.ts:10`);
  `OpenInTerax` registry keys x15 and `terax.exe` x6 (`installer-hooks.nsh`); executable/package `terax`
  (`Cargo.toml:2,8`); sidecar `binaries/terax-cli` (`tauri.conf.json:39`, `build.rs:15`);
  `crates/terax-cli`, `terax-control-protocol` (workspace, Cargo.lock); nix release URLs (`nix/package.nix:12-24`).
- **(b) visual rebranding (42):** `productName` / window `title` "Terax" (`tauri.conf.json:3,17`,
  `tauri.windows.conf.json:15`), `longDescription`, "Terax Document", copyright/publisher "Crynta",
  "Open in Terax" label, Info.plist strings, icons (`src-tauri/icons/`, `terax-icon.png`, `public/logo.png`),
  Cargo `description`, nix `description`/`homepage terax.app`, app-lab "Terax App Lab".
- **(c) internal, rename on touch (80):** npm name `terax`, `terax_lib`, `__TERAX_BENCH__`, `TERAX_BENCH*`,
  `__teraxBenchConfig`, `__teraxSmooth`, `terax:bench:*`, `terax-app-lab*`, `terax:updater:last-check`
  (isolated anyway by the identifier change), comments.
- **Legal (keep verbatim):** `public/licenses/terax.txt`, `LICENSE`.

## Risks

- Changing the identifier without changing `bench.rs:17` / `run.py:216` disables the bench safety guard.
- A `productName`/binary change renames the installer, install dir and exe; `installer-hooks.nsh` and the
  `control.rs` launcher names must change in the same PR, or Explorer verbs and hooks point at a missing binary.
- Removing `tauri-plugin-updater` requires `App.tsx`, `AboutSection.tsx` and `capabilities/desktop.json` to change together.
- CSP `connect-src https:` stays wide until AI removal; tightening it earlier breaks the BYOK AI still present.
- `downloadBootstrapper` makes the Windows installer download WebView2 from Microsoft at install time.
- The sidecar is mandatory for release builds (`build.rs:23-28`): renaming `terax-cli` touches build.rs,
  tauri.conf.json, build-cli.mjs and export-tree.sh at once.

## Open questions

1. Final values: bundle identifier (reverse-DNS the user owns), executable name `lut`, sidecar CLI name. The spec
   says to decide them in Phase 0 ("Identidad del producto").
2. File associations: drop entirely (2.3, "not an editor") or keep a minimal set?
3. macOS camera/microphone entitlements: keep for CLI programs run inside the terminal, or drop with voice input?
4. Keep the macOS-only app lab, or measure F0:11 on Windows another way?
5. Nix flake: remove now, or keep a lut flake for F7?
6. Keep the separate `settings` window (capabilities list it)? Depends on app-shell / state-settings.
7. Keep `.coderabbit.yaml`?
8. Mobile icon sets (android/ios): drop with the icon redesign?

## Answers

### 1. Repo-wide "terax" inventory

Method: case-insensitive token scan of every git-tracked text file outside `.docs/` (regex
`[A-Za-z0-9_.:/@$-]*terax[A-Za-z0-9_.:/@$-]*`), each file mapped to its area through `partition.json`, then
classified with explicit rules (class (a): identifiers that live outside lut's identifier-scoped data dir or are
shared with an installed Terax: bundle id, registry keys, executables, env vars exported to shells/hooks, cache
dirs, hook markers, git refs/files written into user repos, store file names, updater URLs/keys, keyring service).
Totals: **1964 occurrences, 553 distinct tokens**.

| class                         | total | build-identity | backend-core | agents | ide-tools | terminal | ai  | app-shell | state-settings |
| ----------------------------- | ----- | -------------- | ------------ | ------ | --------- | -------- | --- | --------- | -------------- |
| (a) identity isolation        | 368   | 49             | 122          | 85     | 86        | 4        | 13  | 3         | 6              |
| (b) visual rebranding         | 290   | 42             | 50           | 55     | 11        | 77       | 24  | 20        | 11             |
| (c) internal, rename on touch | 1306  | 80             | 341          | 84     | 73        | 552      | 34  | 96        | 46             |
| all                           | 1964  | 171            | 513          | 224    | 170       | 633      | 71  | 119       | 63             |

Notes on (b)/(c): (b) is dominated by the word "Terax" in user text, comments and doc strings (243 occurrences of
bare `Terax`, many in comments that are really (c)); (c) is dominated by `TeraxGhostty*` types (terminal),
`_terax_*` shell functions (backend-core), CSS animation names `terax-*`, `terax_lib::` paths, `terax://` and
`terax:` event names (in-process only) and test fixtures.

Not caught by the token rule but class (a): hook marker `"name": "terax"` in `src-tauri/src/modules/agent.rs:318`;
dirs cache join `cache.join("terax")` (`control.rs:758`, `crates/terax-cli/src/lib.rs:300`, `fs/read_policy.rs:15`);
`home.join(".cache").join("terax")` (`pty/shell_init.rs:449`); launcher `bin_dir.join("terax")` (`control.rs:927,946`).

Full class (a) list (token | occurrences | areas | first occurrence):

| token                                                                     | n   | areas                                           | first                                                           |
| ------------------------------------------------------------------------- | --- | ----------------------------------------------- | --------------------------------------------------------------- |
| `TERAX_USER_ZDOTDIR`                                                      | 25  | backend-core:25                                 | src-tauri/src/modules/pty/scripts/zprofile.zsh:9                |
| `TERAX_CLI`                                                               | 23  | agents:15, backend-core:8                       | src-tauri/src/modules/agent.rs:272                              |
| `OpenInTerax`                                                             | 15  | build-identity:15                               | src-tauri/installer-hooks.nsh:6                                 |
| `TERAX_BLOCKS`                                                            | 14  | backend-core:13, terminal:1                     | src-tauri/src/modules/pty/scripts/bashrc.bash:30                |
| `terax/project.toml`                                                      | 13  | ide-tools:13                                    | src-tauri/src/modules/git/project_config.rs:121                 |
| `terax-cli`                                                               | 12  | agents:8, build-identity:4                      | scripts/build-cli.mjs:59                                        |
| `$TERAX_CLI`                                                              | 11  | agents:7, backend-core:4                        | src-tauri/src/modules/agent.rs:278                              |
| `terax.exe`                                                               | 10  | build-identity:6, agents:4                      | src-tauri/installer-hooks.nsh:7                                 |
| `$env:TERAX_CLI`                                                          | 10  | agents:7, backend-core:3                        | src-tauri/src/modules/agent.rs:284                              |
| `TERAX_CONTROL_ADDR`                                                      | 8   | agents:6, backend-core:2                        | src-tauri/crates/terax-cli/src/hook.rs:56                       |
| `TERAX_CONTROL_TOKEN`                                                     | 8   | agents:6, backend-core:2                        | src-tauri/crates/terax-cli/src/hook.rs:57                       |
| `terax-shell-integration`                                                 | 8   | backend-core:8                                  | src-tauri/src/modules/pty/scripts/bashrc.bash:1                 |
| `terax-control-protocol`                                                  | 7   | build-identity:4, agents:3                      | src-tauri/Cargo.lock:4945                                       |
| `TERAX_PANE_ID`                                                           | 7   | agents:5, backend-core:2                        | src-tauri/crates/terax-cli/src/hook.rs:55                       |
| `TERAX_TERMINAL`                                                          | 7   | agents:1, backend-core:6                        | src-tauri/src/modules/agent.rs:652                              |
| `terax/worktrees`                                                         | 7   | ide-tools:7                                     | src-tauri/src/modules/git/project_config.rs:35                  |
| `__TERAX_HOOKS_LOADED`                                                    | 7   | backend-core:7                                  | src-tauri/src/modules/pty/scripts/bashrc.bash:10                |
| `app.crynta.terax`                                                        | 6   | build-identity:4, app-shell:1, state-settings:1 | scripts/app-lab/run.py:216                                      |
| `TERAX_WSL_LOGIN_SHELL`                                                   | 6   | backend-core:6                                  | src-tauri/src/modules/pty/session.rs:702                        |
| `__terax_notify`                                                          | 5   | backend-core:1, agents:4                        | src-tauri/src/lib.rs:170                                        |
| `refs/terax/checkpoints`                                                  | 5   | ide-tools:5                                     | src-tauri/src/modules/git/checkpoint.rs:2                       |
| `refs/terax/checkpoints/t/1`                                              | 5   | ide-tools:5                                     | src-tauri/src/modules/git/checkpoint.rs:1544                    |
| `https://github.com/crynta/terax-ai/releases/download/v$`                 | 4   | build-identity:4                                | nix/package.nix:12                                              |
| `git/terax-worktree-id`                                                   | 4   | ide-tools:4                                     | src-tauri/src/modules/git/followup_tests.rs:238                 |
| `refs/terax`                                                              | 4   | ide-tools:4                                     | src-tauri/src/modules/git/hardening_tests.rs:196                |
| `$TERAX_FORK_LOG`                                                         | 4   | backend-core:4                                  | src-tauri/src/modules/pty/scripts/bashrc.test.bash:183          |
| `home/vinicios/.cache/terax/shell-integration/zsh`                        | 4   | backend-core:4                                  | src-tauri/src/modules/pty/shell_init.rs:1023                    |
| `crates/terax-cli`                                                        | 3   | build-identity:3                                | src-tauri/Cargo.toml:11                                         |
| `crates/terax-control-protocol`                                           | 3   | build-identity:3                                | src-tauri/Cargo.toml:11                                         |
| `TERAX_USER_ZDOTDIR:-$HOME`                                               | 3   | backend-core:3                                  | src-tauri/src/modules/pty/scripts/zlogin.zsh:14                 |
| `terax-ai`                                                                | 3   | ai:1, app-shell:2                               | src/modules/ai/config.ts:1                                      |
| `https://github.com/crynta/terax-ai`                                      | 2   | build-identity:1, state-settings:1              | public/licenses/terax.txt:2                                     |
| `TERAX_HOOK_TIMEOUT`                                                      | 2   | agents:2                                        | src-tauri/crates/terax-cli/src/hook.rs:58                       |
| `TERAX_HOOK_WAIT`                                                         | 2   | agents:2                                        | src-tauri/crates/terax-cli/src/hook.rs:68                       |
| `TERAX_HOOK_DEBUG`                                                        | 2   | agents:2                                        | src-tauri/crates/terax-cli/src/hook.rs:69                       |
| `terax-pi-notifications-v2`                                               | 2   | agents:2                                        | src-tauri/src/modules/agent.rs:184                              |
| `process.env.TERAX_CLI`                                                   | 2   | agents:2                                        | src-tauri/src/modules/agent.rs:189                              |
| `process.env.TERAX_PANE_ID`                                               | 2   | agents:2                                        | src-tauri/src/modules/agent.rs:190                              |
| `terax-ai-sessions.json`                                                  | 2   | ai:2                                            | src-tauri/src/modules/ai_sessions.rs:34                         |
| `terax-cli.exe`                                                           | 2   | agents:2                                        | src-tauri/src/modules/control.rs:807                            |
| `home/me/.cache/terax/control.json`                                       | 2   | ide-tools:1, ai:1                               | src-tauri/src/modules/fs/ai.rs:444                              |
| `C:/Users/me/AppData/Local/terax/control.json`                            | 2   | ide-tools:1, ai:1                               | src-tauri/src/modules/fs/ai.rs:445                              |
| `refs/terax/tasks`                                                        | 2   | ide-tools:2                                     | src-tauri/src/modules/git/checkpoint.rs:639                     |
| `repo/.git/terax-no-hooks`                                                | 2   | ide-tools:2                                     | src-tauri/src/modules/git/hardening_tests.rs:582                |
| `refs/terax/checkpoints/task`                                             | 2   | ide-tools:2                                     | src-tauri/src/modules/git/refs.rs:246                           |
| `TERAX_WORKSPACE_PATH`                                                    | 2   | ide-tools:2                                     | src-tauri/src/modules/git/task_worktree.rs:97                   |
| `refs/terax/checkpoints/task-1/1`                                         | 2   | ide-tools:2                                     | src-tauri/src/modules/git/tasks_tests.rs:532                    |
| `TERAX_MARKER`                                                            | 2   | backend-core:2                                  | src-tauri/src/modules/pty/agent_detect.rs:35                    |
| `TERAX_FORK_LOG`                                                          | 2   | backend-core:2                                  | src-tauri/src/modules/pty/scripts/bashrc.test.bash:178          |
| `TERAX_FORK_CWD`                                                          | 2   | backend-core:2                                  | src-tauri/src/modules/pty/scripts/bashrc.test.bash:178          |
| `$global:__TERAX_HOOKS_LOADED`                                            | 2   | backend-core:2                                  | src-tauri/src/modules/pty/scripts/profile.ps1:6                 |
| `terax.fish`                                                              | 2   | backend-core:2                                  | src-tauri/src/modules/pty/shell_init.rs:476                     |
| `cache/terax/shell-integration/zsh`                                       | 2   | backend-core:2                                  | src-tauri/src/modules/pty/shell_init.rs:537                     |
| `home/vinicios/.cache/terax/shell-integration/bash/bashrc`                | 2   | backend-core:2                                  | src-tauri/src/modules/pty/shell_init.rs:1103                    |
| `app/terax-cli`                                                           | 2   | backend-core:2                                  | src-tauri/src/modules/pty/shell_init.rs:1286                    |
| `refs/terax/checkpoints/task-1/2`                                         | 2   | ide-tools:2                                     | src/modules/git/api.test.ts:170                                 |
| `$TERAX_BLOCKS`                                                           | 2   | terminal:2                                      | src/modules/terminal/ghostty/shellBlockCompatibility.test.ts:27 |
| `src-tauri/binaries/terax-cli`                                            | 1   | build-identity:1                                | scripts/app-lab/export-tree.sh:26                               |
| `terax-cli$`                                                              | 1   | agents:1                                        | scripts/build-cli.mjs:76                                        |
| `terax-cli-$`                                                             | 1   | agents:1                                        | scripts/build-cli.mjs:81                                        |
| `terax-pi-notifications-v`                                                | 1   | agents:1                                        | src-tauri/src/modules/agent.rs:136                              |
| `$TERAX_TERMINAL`                                                         | 1   | agents:1                                        | src-tauri/src/modules/agent.rs:1058                             |
| `terax-pi-notifications-v1`                                               | 1   | agents:1                                        | src-tauri/src/modules/agent.rs:1301                             |
| `cache/terax/control.json`                                                | 1   | ide-tools:1                                     | src-tauri/src/modules/fs/project_memory.rs:170                  |
| `terax-worktree-id`                                                       | 1   | ide-tools:1                                     | src-tauri/src/modules/git/checkpoint.rs:39                      |
| `terax-last-restore`                                                      | 1   | ide-tools:1                                     | src-tauri/src/modules/git/checkpoint.rs:40                      |
| `terax-no-hooks`                                                          | 1   | ide-tools:1                                     | src-tauri/src/modules/git/checkpoint.rs:41                      |
| `refs/terax/checkpoints/t1/10`                                            | 1   | ide-tools:1                                     | src-tauri/src/modules/git/checkpoint.rs:1344                    |
| `nrefs/terax/checkpoints/t1/2`                                            | 1   | ide-tools:1                                     | src-tauri/src/modules/git/checkpoint.rs:1344                    |
| `nrefs/terax/checkpoints/t1/x`                                            | 1   | ide-tools:1                                     | src-tauri/src/modules/git/checkpoint.rs:1344                    |
| `git/terax-no-hooks`                                                      | 1   | ide-tools:1                                     | src-tauri/src/modules/git/followup_tests.rs:218                 |
| `git/terax-last-restore`                                                  | 1   | ide-tools:1                                     | src-tauri/src/modules/git/followup_tests.rs:553                 |
| `refs/terax/checkpoints/t/prerestore`                                     | 1   | ide-tools:1                                     | src-tauri/src/modules/git/hardening_tests.rs:114                |
| `$TERAX_PORT`                                                             | 1   | ide-tools:1                                     | src-tauri/src/modules/git/project_config.rs:56                  |
| `refs/terax/checkpoints/task-1/7`                                         | 1   | ide-tools:1                                     | src-tauri/src/modules/git/refs.rs:233                           |
| `refs/terax/checkpoints/task-1`                                           | 1   | ide-tools:1                                     | src-tauri/src/modules/git/refs.rs:237                           |
| `refs/terax/checkpoints/task/x`                                           | 1   | ide-tools:1                                     | src-tauri/src/modules/git/refs.rs:248                           |
| `refs/terax/checkpoints/task/-1`                                          | 1   | ide-tools:1                                     | src-tauri/src/modules/git/refs.rs:249                           |
| `refs/terax/checkpoints/../7`                                             | 1   | ide-tools:1                                     | src-tauri/src/modules/git/refs.rs:250                           |
| `refs/terax/checkpoints/a/b/7`                                            | 1   | ide-tools:1                                     | src-tauri/src/modules/git/refs.rs:251                           |
| `refs/terax/checkpoints/task/99999999999`                                 | 1   | ide-tools:1                                     | src-tauri/src/modules/git/refs.rs:252                           |
| `terax-tasks.lock`                                                        | 1   | ide-tools:1                                     | src-tauri/src/modules/git/task_state.rs:48                      |
| `TERAX_TASK`                                                              | 1   | ide-tools:1                                     | src-tauri/src/modules/git/task_worktree.rs:96                   |
| `TERAX_ROOT_PATH`                                                         | 1   | ide-tools:1                                     | src-tauri/src/modules/git/task_worktree.rs:98                   |
| `TERAX_PORT`                                                              | 1   | ide-tools:1                                     | src-tauri/src/modules/git/task_worktree.rs:99                   |
| `TERAX_PORT_`                                                             | 1   | ide-tools:1                                     | src-tauri/src/modules/git/task_worktree.rs:102                  |
| `terax-empty-hooks`                                                       | 1   | ide-tools:1                                     | src-tauri/src/modules/git/task_worktree.rs:251                  |
| `terax/worktrees-other`                                                   | 1   | ide-tools:1                                     | src-tauri/src/modules/git/task_worktree_tests.rs:88             |
| `terax/worktrees-other/task`                                              | 1   | ide-tools:1                                     | src-tauri/src/modules/git/task_worktree_tests.rs:89             |
| `TERAX_PORT_9`                                                            | 1   | ide-tools:1                                     | src-tauri/src/modules/git/task_worktree_tests.rs:473            |
| `terax/task-worktrees.json`                                               | 1   | ide-tools:1                                     | src-tauri/src/modules/git/task_worktree_tests.rs:842            |
| `refs/terax/checkpoints/x`                                                | 1   | ide-tools:1                                     | src-tauri/src/modules/git/tasks_tests.rs:635                    |
| `refs/terax/checkpoints/../1`                                             | 1   | ide-tools:1                                     | src-tauri/src/modules/git/tasks_tests.rs:636                    |
| `refs/terax/checkpoints/t/2`                                              | 1   | ide-tools:1                                     | src-tauri/src/modules/git/tasks_tests.rs:738                    |
| `terax-task-hooks`                                                        | 1   | ide-tools:1                                     | src-tauri/src/modules/git/worktree.rs:446                       |
| `$TERAX_FORK_CWD`                                                         | 1   | backend-core:1                                  | src-tauri/src/modules/pty/scripts/bashrc.test.bash:180          |
| `__TERAX_HOST`                                                            | 1   | backend-core:1                                  | src-tauri/src/modules/pty/scripts/init.fish:28                  |
| `$__TERAX_HOST`                                                           | 1   | backend-core:1                                  | src-tauri/src/modules/pty/scripts/init.fish:81                  |
| `$env:TERAX_BLOCKS`                                                       | 1   | backend-core:1                                  | src-tauri/src/modules/pty/scripts/profile.ps1:99                |
| `$TERAX_USER_ZDOTDIR`                                                     | 1   | backend-core:1                                  | src-tauri/src/modules/pty/scripts/zshenv.zsh:25                 |
| `TERAX_USER_ZDOTDIR-unset`                                                | 1   | backend-core:1                                  | src-tauri/src/modules/pty/scripts/zshrc.test.py:279             |
| `TERAX_USER_ZDOTDIR:-$`                                                   | 1   | backend-core:1                                  | src-tauri/src/modules/pty/scripts/zshrc.zsh:15                  |
| `cache/terax/shell-integration`                                           | 1   | backend-core:1                                  | src-tauri/src/modules/pty/shell_init.rs:857                     |
| `binaries/terax-cli`                                                      | 1   | build-identity:1                                | src-tauri/tauri.conf.json:39                                    |
| `https://github.com/crynta/terax-ai/releases/latest/download/latest.json` | 1   | build-identity:1                                | src-tauri/tauri.conf.json:121                                   |
| `terax-ai-agents.json`                                                    | 1   | ai:1                                            | src/modules/ai/lib/agents.ts:82                                 |
| `library/caches/terax`                                                    | 1   | ai:1                                            | src/modules/ai/lib/pathPolicy.json:51                           |
| `cache/terax`                                                             | 1   | ai:1                                            | src/modules/ai/lib/pathPolicy.json:52                           |
| `appdata/local/terax`                                                     | 1   | ai:1                                            | src/modules/ai/lib/pathPolicy.json:53                           |
| `appdata/local/app.crynta.terax`                                          | 1   | ai:1                                            | src/modules/ai/lib/pathPolicy.json:54                           |
| `local/share/app.crynta.terax`                                            | 1   | ai:1                                            | src/modules/ai/lib/pathPolicy.json:55                           |
| `terax-ai-snippets.json`                                                  | 1   | ai:1                                            | src/modules/ai/lib/snippets.ts:12                               |
| `terax-ai-todos.json`                                                     | 1   | ai:1                                            | src/modules/ai/lib/todos.ts:12                                  |
| `refs/terax/checkpoints/task-1/12`                                        | 1   | ide-tools:1                                     | src/modules/git/scope.test.ts:195                               |
| `refs/terax/checkpoints/$`                                                | 1   | ide-tools:1                                     | src/modules/git/scope.ts:123                                    |
| `terax-settings.json`                                                     | 1   | state-settings:1                                | src/modules/settings/store.ts:225                               |
| `terax-spaces.json`                                                       | 1   | state-settings:1                                | src/modules/spaces/lib/store.ts:21                              |
| `terax-custom-themes.json`                                                | 1   | state-settings:1                                | src/modules/theme/customThemes.ts:5                             |
| `terax:updater:last-check`                                                | 1   | build-identity:1                                | src/modules/updater/useUpdater.ts:7                             |
| `https://api.github.com/repos/crynta/terax-ai/releases/latest`            | 1   | build-identity:1                                | src/modules/updater/useUpdater.ts:10                            |
| `crynta/terax-ai`                                                         | 1   | state-settings:1                                | src/settings/sections/AboutSection.tsx:106                      |

### 2. Updater

- **Endpoint:** `https://github.com/crynta/terax-ai/releases/latest/download/latest.json` (`src-tauri/tauri.conf.json:120-122`).
  Linux uses a second, manual path: `https://api.github.com/repos/crynta/terax-ai/releases/latest` (`src/modules/updater/useUpdater.ts:9-10,52`).
- **Public key:** minisign key id `3BABFD8AB60E3469` (base64 in `tauri.conf.json:119`). Signed artifacts are produced
  because of `bundle.createUpdaterArtifacts: true` (`:48`); building them needs `TAURI_SIGNING_PRIVATE_KEY`.
- **Triggers:** backend registers the plugin at `src-tauri/src/lib.rs:198` (no automatic Rust-side check);
  capability `updater:default` in `src-tauri/capabilities/desktop.json`. Frontend auto-check on mount via
  `UpdaterDialog` (`src/app/App.tsx:1668`, `UpdaterDialog.tsx:41`, `useUpdater.ts:146-149`, throttled 30 min) and
  a manual check in `src/settings/sections/AboutSection.tsx:27,51`.
- **Minimal neutralization (F0:4), one small PR:** delete `plugins.updater` from `tauri.conf.json` and set
  `createUpdaterArtifacts: false`; make `useUpdater` a no-op that never calls `check()` or `fetch` (status stays
  `idle`; About shows "updates disabled"), leaving the plugin crate registered so nothing else breaks. Without
  `plugins.updater` config, `check()` would error anyway, but the Linux `fetch` would still reach GitHub, so the
  hook must be neutralized too. Removing the plugin crate, `updater:default` and `@tauri-apps/plugin-updater`
  belongs to the F7 rebuild (or to the dependency pruning issue).

### 3. Network audit (F0:5)

| #   | call                                                                                  | where                                                                         | owner area         | target                               | lut decision                                                  |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------ | ------------------------------------ | ------------------------------------------------------------- |
| 1   | Tauri updater `check()` / `downloadAndInstall`                                        | `useUpdater.ts:104,123`; config `tauri.conf.json:118-123`                     | build-identity     | github.com/crynta/terax-ai           | neutralize (F0:4)                                             |
| 2   | `fetch` GitHub releases API (Linux)                                                   | `useUpdater.ts:52`                                                            | build-identity     | api.github.com/repos/crynta/terax-ai | neutralize (F0:4)                                             |
| 3   | `ai_http_stream` / reqwest                                                            | `src-tauri/src/modules/net.rs:240-270`, clients `net/clients.rs:186`          | ai (backend `net`) | any provider URL chosen by the user  | removed with AI (ADR-004, 9.9)                                |
| 4   | `lm_ping`                                                                             | `net.rs:147-163`                                                              | ai                 | local model servers                  | removed with AI                                               |
| 5   | AI SDK provider defaults + headers `HTTP-Referer: https://terax.ai`, `X-Title: Terax` | `src/modules/ai/lib/agent.ts:130-159`                                         | ai                 | deepseek, mistral, openrouter, …     | removed with AI; until then, the referer leaks Terax identity |
| 6   | Speech-to-text                                                                        | `src/modules/ai/lib/stt.ts:3,15`                                              | ai                 | api.groq.com                         | removed with AI                                               |
| 7   | Web preview probe + iframe                                                            | `src/modules/preview/PreviewAddressBar.tsx:224`; CSP `frame-src http: https:` | ide-tools          | user-entered URL                     | depends on preview decision                                   |
| 8   | `git fetch` (spawns git)                                                              | `src/modules/source-control/useSourceControl.ts:425,511`                      | ide-tools          | user's remotes                       | user-initiated only                                           |
| 9   | Bench report server                                                                   | `src/bench/report.ts:28,45`, `early.ts:71`                                    | build-identity     | localhost (bench builds only)        | compiled out of product builds                                |
| 10  | WebView2 bootstrapper at install                                                      | `tauri.conf.json:82-84`                                                       | build-identity     | Microsoft                            | keep (or `embedBootstrapper`; open question)                  |
| 11  | Local only, not outbound: `terax-pty:` protocol, `/notification.mp3`                  | `src/modules/terminal/lib/pty-bridge.ts:39`, `agents/lib/sound.ts:7`          | terminal / agents  | in-app                               | n/a                                                           |
| 12  | External links opened in the browser (About repo/website)                             | `AboutSection.tsx:11-12`                                                      | state-settings     | github/terax.app                     | rebrand (identity:2)                                          |

No telemetry, analytics, crash reporting, remote fonts or CDN: fonts are bundled through `@fontsource*`
(`package.json`), CSP `font-src 'self' data:` (`tauri.conf.json:29`), and grep finds no sentry/posthog/analytics
code. The CSP `connect-src ... https:` is the wide door that should close after AI removal.

### 4. Toolchain and build steps (F0:6, F0:7)

- Node >= 22 (`package.json` `engines`; README of the plan tooling also needs Node 22). pnpm **11.9.0** exact
  (`packageManager`, use `corepack enable`). Rust stable (no `rust-toolchain`; edition 2021; lock pins tauri 2.12.2).
  `@tauri-apps/cli ^2.12.0` (devDependency, run via `pnpm tauri`). Zig >= 0.16.0 only to rebuild the WASM (prebuilt is committed).
  Python 3 only for profilers/app-lab (macOS).
- Platform prerequisites: Windows: MSVC build tools + WebView2 (present on Win 11); macOS: Xcode CLT, macOS >= 13
  target; Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev` and the usual Tauri list (runtime deps in `tauri.conf.json:64-75`).
- Commands (same on all three OSes, run from the repo root):
  - `pnpm install --frozen-lockfile`
  - Dev: `pnpm tauri dev` (runs `pnpm build:cli:dev && pnpm dev` first, `tauri.conf.json:7`).
  - Release bundle: `pnpm tauri build` (runs `pnpm build:cli && pnpm build`, i.e. `node scripts/build-cli.mjs --release`, `tsc && vite build`).
    Must not set updater signing keys while `createUpdaterArtifacts` is true, or it fails; after F0:4 it is false.
  - Tests: `pnpm test` (vitest), `pnpm check-types`, `pnpm lint`, `pnpm format:check`, `pnpm knip`, `pnpm size` (after build),
    `pnpm check:dist`; Rust: `cd src-tauri && cargo test --locked --workspace` and
    `cargo clippy --all-targets --locked -- -D warnings` (`.docs/origin-terax/README.md:163`).
- Prebuild steps: CLI sidecar `scripts/build-cli.mjs` (automatic via `beforeDevCommand`/`beforeBuildCommand`;
  `TERAX_CLI_TARGET` for cross targets). Ghostty WASM: none (committed binaries).
- Windows caveats: `dev:inspect` and `analyze:bundle` scripts use POSIX `VAR=x cmd` syntax and fail in cmd/pwsh;
  `profile:*` scripts are macOS-only.

### 5. Bundle identity (F0:10)

| field                                                                   | value                                                         | file:line                             | Phase 0?                                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| identifier                                                              | `app.crynta.terax`                                            | `tauri.conf.json:5`                   | **yes**: derives app data/config/local-data dirs, stores, window-state and WebView localStorage                   |
| productName                                                             | `Terax`                                                       | `tauri.conf.json:3`                   | binary/installer name: yes (exe and NSIS install dir collide with Terax's per-user install); label text is visual |
| Cargo bin                                                               | `terax` (`default-run`)                                       | `Cargo.toml:2,8`                      | yes (exe `terax.exe` used by installer hooks and `control.rs:927`)                                                |
| sidecar                                                                 | `binaries/terax-cli`                                          | `tauri.conf.json:39`, `build.rs:15`   | yes (hook CLI, F0:10 "CLI auxiliar de hooks"); coordinated with agents                                            |
| data dirs not derived from identifier                                   | `dirs::cache_dir()/terax`, `~/.cache/terax/shell-integration` | `control.rs:758`, `shell_init.rs:449` | yes, but owned by agents/backend-core                                                                             |
| deep links / URI schemes                                                | none (only internal `terax-pty` protocol)                     | `tauri.conf.json:29`                  | no                                                                                                                |
| file associations                                                       | "Terax Document", 60 exts                                     | `tauri.conf.json:98-113`              | yes: on Windows they register ProgIDs per productName; remove (2.3)                                               |
| installer hooks                                                         | `OpenInTerax` HKCU verbs                                      | `installer-hooks.nsh:6-25`            | **yes**: shared keys; lut's uninstaller would delete Terax's verbs                                                |
| updater                                                                 | endpoint + pubkey                                             | `tauri.conf.json:118-123`             | yes (F0:4)                                                                                                        |
| window titles, descriptions, copyright, publisher, icons, plist strings | Terax / Crynta                                                | various                               | no, visual (identity:2)                                                                                           |

### 6. Capabilities

- `default.json` (windows `main`, `settings`): core window ops (drag, close, destroy, minimize, maximize, show,
  focus, set-title), event listen/unlisten, `opener:default`, `log:default`, `os:default`, `notification:default`,
  `store:default`, `autostart:allow-enable|disable|is-enabled`.
- `desktop.json` (desktop platforms, `main`, `settings`): `autostart:default`, `window-state:default`,
  `updater:default`, `process:default`.
- `clipboard.json` (`main`): `clipboard-manager:allow-read-text|write-text`.
- Belonging to removed/changed concerns: `updater:default` (F0:4 then F7 rebuild); `process:default` is only used by
  the updater's `relaunch()` (`useUpdater.ts:2,138`) and `autostart` checks (`src/lib/platform.ts`, verify); the
  `settings` window label depends on the settings redesign; `autostart` relates to spec risk 8.5. No capability is
  exclusive to AI or the editor (their access is through custom commands, gated by `removeUnusedCommands`).

### 7. License / notice obligations (F0:2, 14.3)

- Terax has no `NOTICE` file; obligation is Apache-2.0 §4(a) copy of the license, §4(b) modification notices,
  §4(c) retain attributions. `LICENSE` (repo root) and `public/licenses/terax.txt` (license + provenance + "files
  have been modified" statement, lines 1-4) satisfy §4(a)/(b) in source and in `dist/` (Vite copies `public/`).
- Bundled binaries: `bundle.resources` ships `licenses/terminal/{ghostty-web,ghostty,restty,xterm-js}.txt`
  (`tauri.conf.json:41-46`); `public/licenses/terminal-symbols.txt` (fonts, other area) ships through `dist/`.
- Gaps: `bundle.license = Apache-2.0` and `copyright` "Crynta" (`:49-51`) must become lut's own copyright while
  keeping Terax attribution; Rust/npm dependency licenses (MIT/Apache) are not collected into the bundle (no
  third-party notices file); decide whether to generate one (e.g. `cargo about` / `license-checker`), open question
  for the license strategy deliverable (F0:entregable). The README credit note (14.3:1) is outside this area.

## Draft issues

### build-identity-D01 — Neutralize the Terax updater

```yaml
id: build-identity-D01
depends-on: []
refs: [F0, F7:auto-actualizacion-de-lut, 13.2:22]
covers: [F0:4]
type: task
scope: be
size: S
```

**Goal:** lut must never contact Terax's release infrastructure nor install a Terax binary.

**Acceptance criteria:**

- [ ] `plugins.updater` (endpoint and pubkey) removed from `src-tauri/tauri.conf.json`; `createUpdaterArtifacts` set to `false`.
- [ ] `useUpdater` never calls `check()` nor fetches the GitHub API; automatic and manual checks report "updates disabled".
- [ ] No remaining reference to `crynta/terax-ai` releases in `src/` or `src-tauri/` (grep).

**Verification:** `pnpm check-types && pnpm test`; `pnpm tauri build` succeeds without signing keys; app start with a network monitor shows no request to github.com.

### build-identity-D02 — Outbound network audit report

```yaml
id: build-identity-D02
depends-on: [build-identity-D01]
refs: [F0, ADR-004, 9.9]
covers: [F0:5]
type: task
scope: none
size: S
```

**Goal:** a committed list of every outbound network call, its owner and its fate in lut.

**Acceptance criteria:**

- [ ] `.docs/` gains a network audit table (call, file:line, target, decision) based on this analysis, re-checked against the code.
- [ ] Calls to Terax services (updater, `HTTP-Referer: https://terax.ai`) are either removed or linked to the issue that removes them.
- [ ] Confirms no telemetry/CDN/remote fonts.

**Verification:** grep for `fetch(`, `reqwest`, `https://` reproduces the table; reviewer cross-checks.

### build-identity-D03 — Document toolchain and effective build commands

```yaml
id: build-identity-D03
depends-on: []
refs: [F0, .docs/origin-terax/README.md, .docs/origin-terax/CONTRIBUTING.md]
covers: [F0:6, F0:7]
type: task
scope: none
size: S
```

**Goal:** reproducible build instructions for Windows, macOS and Linux.

**Acceptance criteria:**

- [ ] `.docs/` documents Node >= 22, pnpm 11.9.0 (corepack), Rust stable, Tauri CLI 2.12, optional Zig 0.16 for WASM, OS prerequisites.
- [ ] Commands for install, dev, release build, tests, lint, Rust tests/clippy, with the sidecar prebuild explained.
- [ ] Records the OS/toolchain versions actually used for the Phase 0 baseline and the POSIX-only scripts.

**Verification:** a clean checkout on Windows 11 builds and starts following only the document.

### build-identity-D04 — Isolate the bundle identifier and data directory

```yaml
id: build-identity-D04
depends-on: [build-identity-D01]
refs: [identity, ADR-008, F0, 13.2:21]
covers: [F0:10, identity:1, ADR-008, build-identity/bench-app-lab]
type: task
scope: be
size: S
```

**Goal:** lut's app data, stores, window state and WebView storage live under its own identifier.

**Acceptance criteria:**

- [ ] `identifier` in `tauri.conf.json` set to the value chosen by the user.
- [ ] Bench guard (`src-tauri/src/modules/bench.rs:17`, tests `:731-739`) and `scripts/app-lab/run.py:58,216` follow the new identifier.
- [ ] Startup on a machine with Terax installed creates a new data dir and does not read Terax's.

**Verification:** `cargo test --features bench bench` passes; launch app, inspect `%APPDATA%`/`%LOCALAPPDATA%` (or platform equivalent) for the new dir only.

### build-identity-D05 — Rename executable and Explorer verbs

```yaml
id: build-identity-D05
depends-on: [build-identity-D04, agents-D01?]
refs: [identity, ADR-008, 13.2:21]
covers: [build-identity/cargo-manifest, build-identity/windows-installer-hooks]
type: task
scope: be
size: S
```

**Goal:** the installed binary and Windows shell verbs never collide with Terax's.

**Acceptance criteria:**

- [ ] Cargo bin/`default-run` renamed to `lut`; `productName` gives a non-Terax installer/install dir.
- [ ] `installer-hooks.nsh` uses lut-owned registry keys and `lut.exe`; uninstall removes only those keys.
- [ ] `control.rs` launcher names updated (coordinated with agents isolation).

**Verification:** NSIS install of lut next to Terax: both "Open in" verbs present; uninstalling lut leaves Terax's keys (regedit).

### build-identity-D06 — Remove Terax-only packaging and review configs

```yaml
id: build-identity-D06
depends-on: []
refs: [F0, 16:26]
covers: [build-identity/nix-package, build-identity/coderabbit]
type: task
scope: none
size: XS
```

**Goal:** no file in the repo distributes Terax binaries or configures Terax's services.

**Acceptance criteria:**

- [ ] `flake.nix`, `flake.lock`, `nix/` removed.
- [ ] `.coderabbit.yaml` removed (unless the user keeps it).

**Verification:** `git grep -i "releases/download"` returns nothing; build unaffected.

### build-identity-D07 — Verify and complete license bundling

```yaml
id: build-identity-D07
depends-on: [build-identity-D03]
refs: [14.3, F0:entregable]
covers: [F0:2, 14.3:2, 14.3:3, 14.3:4]
type: task
scope: be
size: S
```

**Goal:** every shipped bundle carries the Apache-2.0 license, the Terax provenance/modification notice and third-party licenses.

**Acceptance criteria:**

- [ ] Bundle contains `licenses/terminal/*.txt`, and the Terax notice (`public/licenses/terax.txt` in dist or as a bundle resource).
- [ ] `bundle.copyright` reflects lut while retaining the Terax attribution in the notice.
- [ ] Decision recorded on a generated third-party notices file for Rust/npm deps.

**Verification:** inspect the built installer/app resources on Windows; files present.

### build-identity-D08 — Least-privilege capabilities after removals

```yaml
id: build-identity-D08
depends-on: [build-identity-D01, ai-D01?]
refs: [F0:12]
covers: [build-identity/capabilities]
type: task
scope: be
size: XS
```

**Goal:** capabilities grant only what remaining features use.

**Acceptance criteria:**

- [ ] `updater:default` removed (until F7), `process:default` only if still used; `settings` window label kept or removed per settings decision.
- [ ] Each remaining permission maps to a used plugin API (listed in PR).

**Verification:** `pnpm tauri dev`; exercise clipboard, notifications, autostart, window controls with no permission errors in the log.

### build-identity-D09 — Prune dependencies and build config after area removals

```yaml
id: build-identity-D09
depends-on: [ai-D01?, ide-tools-D01?]
refs: [9.9, F2:8]
covers: [9.9:6, build-identity/node-package, build-identity/frontend-build-config]
type: task
scope: none
size: M
```

**Goal:** package.json, Cargo deps, Vite chunks and size budgets reflect only remaining code.

**Acceptance criteria:**

- [ ] Unused npm deps removed after `pnpm knip` and the eager/dist graph confirm no importers.
- [ ] `vite.config.ts` manualChunks and `.size-limit.json` entries for removed chunks removed; budgets retightened.
- [ ] POSIX-only scripts made cross-platform or documented.

**Verification:** `pnpm install --frozen-lockfile && pnpm build && pnpm size && pnpm test && pnpm knip` pass.

### build-identity-D10 — Drop editor file associations and tighten CSP

```yaml
id: build-identity-D10
depends-on: [ai-D01?]
refs: [2.3, ADR-004]
covers: [build-identity/tauri-config]
type: task
scope: be
size: XS
```

**Goal:** lut does not register as an editor for code files nor allow arbitrary https connections.

**Acceptance criteria:**

- [ ] `bundle.fileAssociations` removed (or reduced per user decision).
- [ ] CSP `connect-src` drops `https:` once AI is removed; `frame-src` follows the preview decision.

**Verification:** install on Windows: no "Terax Document"/lut entries in "Open with"; app works with no CSP violations in devtools.

### build-identity-D11 — Design: lut visual identity (icon, names)

```yaml
id: build-identity-D11
depends-on: []
refs: [identity, ADR-008]
covers: [identity:2]
type: design
scope: ui
size: S
```

**Goal:** the user defines the lut icon, product display name casing, window title and installer texts.

**Acceptance criteria:**

- [ ] Icon source (1024px) and display strings delivered.

### build-identity-D12 — Apply lut visual identity to the bundle

```yaml
id: build-identity-D12
depends-on: [build-identity-D11, build-identity-D05]
refs: [identity]
covers: [build-identity/icons-logos, build-identity/macos-plists]
type: task
scope: be
size: S
```

**Goal:** bundle metadata and icons show lut.

**Acceptance criteria:**

- [ ] Icons regenerated with `pnpm tauri icon`; android/ios sets removed; `terax-icon.png`, `public/logo.png` replaced.
- [ ] productName/title/descriptions/copyright/publisher and Info.plist strings say lut; entitlements per user decision.

**Verification:** `pnpm tauri build`; installer and window show lut icon and name.

### build-identity-D13 — Design: update experience

```yaml
id: build-identity-D13
depends-on: []
refs: [F7:auto-actualizacion-de-lut]
covers: [build-identity/updater-dialog]
type: design
scope: ui
size: S
```

**Goal:** the user designs how update availability, channel and opt-out are shown.

**Acceptance criteria:**

- [ ] Design for notification, progress, restart and settings (channel stable/beta, disable).

### build-identity-D14 — Release pipeline and lut signing key (spike)

```yaml
id: build-identity-D14
depends-on: [build-identity-D05]
refs: [F7, F7:auto-actualizacion-de-lut]
covers: [F7:6]
type: spike
scope: none
size: S
```

**Goal:** decide where lut releases are hosted, how bundles are signed and how the update manifest is published.

**Acceptance criteria:**

- [ ] Hosting and endpoint chosen; new minisign key generated and stored outside the repo; per-OS code-signing options listed.

**Verification:** a test release manifest validates with the new public key.

### build-identity-D15 — lut auto-updater

```yaml
id: build-identity-D15
depends-on: [build-identity-D13, build-identity-D14]
refs: [F7:auto-actualizacion-de-lut, 13.2:22]
covers: [F7:auto-actualizacion-de-lut, 13.2:22, 16:27, build-identity/updater-logic]
type: task
scope: ui
size: M
```

**Goal:** updates only from lut's endpoint, signature verification mandatory, configurable channel and opt-out.

**Acceptance criteria:**

- [ ] `plugins.updater` points to lut's endpoint and key; Linux path uses lut's release API.
- [ ] Channel and disable settings respected; unsigned/wrongly signed bundle is rejected.
- [ ] UI follows the design from build-identity-D13.

**Verification:** install old build, publish newer test release: update applies; tampered bundle rejected.

### build-identity-D16 — Verify side-by-side isolation from Terax

```yaml
id: build-identity-D16
depends-on: [build-identity-D04, build-identity-D05, build-identity-D01]
refs: [13.2:21, 16:26, F0]
covers: [13.2:21, 16:26]
type: task
scope: none
size: S
```

**Goal:** prove lut shares no data, hooks, env vars or updater with an installed Terax.

**Acceptance criteria:**

- [ ] Checklist run with Terax installed: data dirs, cache dirs, registry verbs, hook entries in Claude/Codex settings, env vars in a lut shell, update requests.
- [ ] Results recorded in `.docs/`.

**Verification:** documented checklist; all items pass on Windows 11.
