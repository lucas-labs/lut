# Phase 0 baseline

Results of every existing test, lint and check command on Windows 11. They were recorded on 2026-11-09 at commit
`5c06b7d`, before any code change other than the updater removal (E01-02), which touches no test or check.
Pre-existing failures are recorded here and **not fixed** in Phase 0's baseline issue.

## Phase 0 deliverable

Phase 0 (F0) is complete when each part below exists; this is the summary checked before the repository goes public
(E04-10).

| Part                                                    | Where                                                                                    | Issue  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| Reproducible build                                      | [Building lut](../development/build.md)                                                  | E01-01 |
| Baseline of tests, lint and checks, with known failures | [Results](#results) and [Known failures](#known-failures)                                | E01-03 |
| Phase 0 gate                                            | [Phase 0 gate (E01-14)](#phase-0-gate-e01-14)                                            | E01-14 |
| Test registry                                           | [Test registry](#test-registry)                                                          | E01-03 |
| Module dependency matrix and contracts                  | [Module dependencies and contracts](../architecture/module-dependencies.md)              | E01-08 |
| Licensing strategy and inventory                        | [Licensing](../licensing.md), [`NOTICE`](../../NOTICE)                                   | E03-02 |
| Identity isolated from Terax                            | [Coexistence with Terax (E04-13)](#coexistence-with-terax-e04-13)                        | E04-13 |
| Terax updater removed                                   | [Network audit: checked and absent](../architecture/network-audit.md#checked-and-absent) | E01-02 |

## Environment and versions

Same machine and toolchain as `.docs/development/build.md` → "Baseline environment":

- Windows 11 Pro 10.0.26200 (x86_64);
- Node 24.19.0 and pnpm 11.9.0;
- rustc and cargo 1.98.1 (`stable-x86_64-pc-windows-msvc`);
- Tauri CLI 2.12.0 and Biome 2.5.14;
- Git for Windows 2.48.1, installed at `D:\Program Files\Git`.

## Build

| Command                              | Result                                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`     | OK                                                                                                                               |
| `pnpm build`                         | OK, 18 s                                                                                                                         |
| `pnpm tauri dev`                     | OK: the app starts and opens a pwsh PTY                                                                                          |
| `pnpm tauri build` (no signing keys) | OK, 5m46s: `Terax_0.9.0_x64_en-US.msi` (7.1 MiB) and `Terax_0.9.0_x64-setup.exe` (5.9 MiB)                                       |
| `pnpm size`                          | OK: every budget passes (startup JS 246.6 kB of 540 kB; total client JS 1.48 MB of 1.5 MB)                                       |
| `pnpm check:dist`                    | OK: startup graph clean. The duplicate-package check is skipped without sourcemaps; `dist-budget.test.ts` runs it in `pnpm test` |

## Results

| Command                                                                                               | Result                                                        | Time   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------ |
| `pnpm test`                                                                                           | ✅ 284 files passed, 2 skipped · 4592 tests passed, 9 skipped | 28 s   |
| `pnpm check-types`                                                                                    | ✅                                                            | 8 s    |
| `pnpm lint`                                                                                           | ✅ exit 0, with 99 warnings + 1 info                          | 1 s    |
| `pnpm format:check`                                                                                   | ❌ 135 files                                                  | 1 s    |
| `pnpm knip`                                                                                           | ❌ 1 unused devDependency                                     | 5 s    |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`                                | ✅ 1087 passed, 0 failed, 0 ignored                           | 13 min |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings` | ❌ 5 errors                                                   | 36 s   |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all --check`                                        | ❌ 55 hunks in 15 files                                       | 1 s    |

How `cargo test` splits up:

- **`terax_lib` unit tests (956):** they take 633 s. Three git agent-task tests run for more than 60 s each:
  - `edge_tests::checkpoints_taken_while_an_agent_writes_stay_valid_and_report_their_consistency`;
  - `followup_tests::diff_prefix_settings_of_the_user_never_change_what_the_header_parser_sees`;
  - `tasks_tests::checkpoint_creation_is_fast_on_a_wide_repository`.

  Their module is removed in E02 (decision 23).

- **Integration tests (60):** `fs_search` 25, `ghostty_artifacts` 2, `git_operations` 33.
- **`shell_background`:** 0 tests here, because it is `#![cfg(unix)]`.
- **CLI crate:** 27 tests.
- **Control-protocol crate:** 44 tests.

## Known failures

### `pnpm format:check`: 135 files not formatted

- **Error excerpt:** `Formatter would have printed the following content` (line width 80), for example in
  `src/app/App.tsx:671`: a `description:` string that must wrap.
- **Files by area:**

  | Area       | Files    |
  | ---------- | -------- |
  | `ai`       | 31       |
  | `terminal` | 27       |
  | `theme`    | 25       |
  | `agents`   | 10       |
  | others     | 1–5 each |

- **Suspected cause:** formatting is not enforced upstream. Terax's quality bar lists `pnpm lint`, but not
  `format:check`. Also, `biome.json` declares schema 2.4.16 while 2.5.14 is installed, so formatter changes between
  those versions may account for part of it.
- **Fixed by:** E01-17 (#320), which replaces Biome with Prettier (user decision) and reformats the codebase. ✅ Fixed: `pnpm format:check` exits 0.

### `pnpm knip`: unused devDependency

- **Error excerpt:** `Unused devDependencies (1): react-compiler-healthcheck  package.json:133:6`.
- **Suspected cause:** a one-off tool (`npx react-compiler-healthcheck`) kept as a dependency with no script that uses it.
- **Fixed by:** E01-04 (#5), which removes it. ✅ Fixed: `pnpm knip` exits 0.

### `cargo clippy -D warnings`: 5 errors

| Location                                   | Error                                                | Suspected cause                                       |
| ------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------- |
| `src/modules/git/followup_tests.rs:8`      | unused import `run_git`                              | only used under `#[cfg(unix)]`: Windows-only warning  |
| `src/modules/git/followup_tests.rs:13`     | unused import `WorkspaceEnv`                         | same                                                  |
| `src/modules/git/task_worktree_tests.rs:2` | unused import `std::time::Duration`                  | same (only used by unix-gated code)                   |
| `src/modules/git/feedback_tests.rs:344`    | function `set_mtime` is never used                   | only called from `#[cfg(unix)]` tests                 |
| `src/modules/workspace.rs:559`             | `chunks_exact_to_as_chunks` (use `as_chunks::<2>()`) | lint new in clippy 1.98, newer than Terax's toolchain |

The first four are in the git agent-task backend, which E02 removes (decision 23).

**Fixed by:** E01-19 (#322), so the CI gate (E01-05) is green before E02. ✅ Fixed: `cargo clippy --all-targets -- -D warnings` exits 0 on Windows. The four test-only items are gated with `#[cfg(unix)]` (plus `SystemTime` in `feedback_tests.rs`, which became unused on Windows with them), and `workspace.rs` uses `as_chunks::<2>()`.

### `cargo fmt --check`: 15 files

Most of the hunks (28 of 55) are in `src/modules/pty/agent_detect.rs`. The rest:

- `pty/da_filter.rs`, `workspace.rs`, `tests/shell_background.rs`: 3 each;
- `git/checkpoint.rs`, `lsp/framing.rs`: 4 each;
- `src/lib.rs`: 2;
- one each in `crates/terax-cli/src/lib.rs`, `crates/terax-control-protocol/src/lib.rs`, `git/branch.rs`,
  `git/operations.rs`, `git/review.rs`, `lsp/mod.rs`, `proc/rss.rs` and `pty/hub.rs`.

**Suspected cause:** `cargo fmt` is not checked upstream either (CONTRIBUTING asks for it, but nothing enforces it).

**Fixed by:** E01-18 (#321). ✅ Fixed: `cargo fmt --check` exits 0.

### `cargo test`: flaky `fs::index` test

- **Test:** `modules::fs::index::tests::unrelated_cold_roots_build_without_waiting_for_each_other`.
- **Error excerpt:** `panicked at src\modules\fs\index.rs:516:13: B must finish while A is paused`.
- **When:** it failed once in a full `cargo test --workspace` run during E01-18, a formatting-only change to other files.
  It passed 5 of 5 times on its own and in the next full run. It did not fail in the E01-03 baseline run.
- **Suspected cause:** the test gives index B 2 s to finish, and the rest of the suite (the git agent-task tests above all)
  loads the machine enough to exceed it.
- **Fixed by:** E01-21 (#329). ✅ Fixed: the six waits in `fs::index` tests share a 30 s bound (`WAIT`) instead of 2 s; with get_or_build forced to serialize roots the test still fails, after 30 s.

### `cargo test`: flaky git agent-task test

- **Test:** `modules::git::edge_tests::checkpoints_taken_while_an_agent_writes_stay_valid_and_report_their_consistency`.
- **Error excerpt:** `panicked at src\modules\git\edge_tests.rs:338:86` (`checkpoint::create(...).unwrap()` on an error).
- **When:** it failed once in a full `cargo test --workspace` run during E01-19, a change that does not touch it. All other
  tests passed.
- **Suspected cause:** the test creates checkpoints while another thread keeps writing and deleting files, and on Windows
  this can hit a locked file.
- **Fixed by:** E02-05 (#22). ✅ Fixed: the whole git agent-task backend is deleted (decision 23), with its tests.
- **Later runs:** during E01-21, a full run failed in more than 20 other tests of the same backend (`hardening_tests`,
  `followup_tests`…), each passing on its own (for example
  `hardening_tests::a_directory_path_is_never_treated_as_an_untracked_file` in 2.8 s).
- **Cost:** this backend is also what makes the suite slow on Windows. The `terax` lib tests take 10–15 min in full and
  **8 s** with `--skip modules::git` (632 tests). The git module has 324 tests, 227 of them in agent-task files.
- **After E02-05:** the CI gate runs `cargo test --workspace` with no skip list. The `terax` lib tests are 730 and take
  **54 s**; the whole workspace run passes 860 tests.

### `pnpm lint`: warnings, not failures

`pnpm lint` exits 0. The most common rules (counted with `--max-diagnostics=none`):

| Rule                                             | Count  |
| ------------------------------------------------ | ------ |
| `useExhaustiveDependencies`                      | 21     |
| `noNonNullAssertion`                             | 11     |
| `useTemplate`                                    | 9      |
| `useOptionalChain`                               | 7      |
| `noTemplateCurlyInString`, `noConfusingVoidType` | 5 each |

**Since E01-16 (#319), `pnpm lint` runs ESLint** (`eslint.config.js`). It exits 0 with 170 warnings in 73 files, which is also its budget (`--max-warnings 170`: a PR may not add warnings). Every
rule with pre-existing violations is a warning; the other rules are errors. Counts:

| Rule                                                                                                                                                                                                                                   | Count  | Origin                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------- |
| `react-hooks/refs`                                                                                                                                                                                                                     | 50     | new (React Compiler rules)        |
| `react-hooks/set-state-in-effect`                                                                                                                                                                                                      | 46     | new (React Compiler rules)        |
| `prefer-template`                                                                                                                                                                                                                      | 11     | Biome `useTemplate`               |
| `@typescript-eslint/no-non-null-assertion`                                                                                                                                                                                             | 11     | Biome `noNonNullAssertion`        |
| `jsx-a11y/prefer-tag-over-role`                                                                                                                                                                                                        | 10     | Biome `useSemanticElements`       |
| `react-hooks/exhaustive-deps`                                                                                                                                                                                                          | 6      | Biome `useExhaustiveDependencies` |
| `jsx-a11y/click-events-have-key-events`, `jsx-a11y/interactive-supports-focus`                                                                                                                                                         | 4 each | Biome a11y warnings               |
| `react-hooks/rules-of-hooks`, `react/no-array-index-key`, `react-hooks/immutability`                                                                                                                                                   | 3 each | Biome warnings / new              |
| `react-hooks/preserve-manual-memoization`, `react-hooks/incompatible-library`, `prefer-const`, `radix`, `jsx-a11y/no-static-element-interactions`, `jsx-a11y/no-noninteractive-tabindex`                                               | 2 each | mixed                             |
| `react-hooks/globals`, `no-empty`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-empty-object-type`, `jsx-a11y/no-autofocus`, `jsx-a11y/label-has-associated-control`, `jsx-a11y/no-noninteractive-element-interactions` | 1 each | mixed                             |

The React Compiler warnings (`react-hooks/*`, 105 in total) left after the BYOK AI, blocks and App-split cleanups are resolved by E09-10 (#326).

### Smoke test: zoom shortcuts depend on the keyboard layout

- **Reproduce:** Windows with a Spanish layout. `Ctrl++` (main row or numpad) types `+` into the prompt;
  `Ctrl+Shift+-` does nothing; `Ctrl+Shift++` on the numpad zooms in; `Ctrl+0` resets. There is no way to zoom out from
  the keyboard.
- **Suspected cause:** the defaults in `src/modules/shortcuts/shortcutDefaults.ts` are `Ctrl+=` / `Ctrl+Shift++` (in)
  and `Ctrl+Shift+-` (out), which match the US layout only.
- **Fixed by:** E13-12.

### Smoke test: extra line after a `Write-Host` PowerShell prompt

- **Reproduce:** pwsh with a prompt that prints itself with `Write-Host` (pshazz, two lines ending in `$`). In lut the
  cursor sits one line below the `$`; in Windows Terminal it follows it.
- **Suspected cause:** `src-tauri/src/modules/pty/scripts/profile.ps1` returns `OSC 133 D/A + OSC 7 + <user prompt> +
OSC 133 B`, but a `Write-Host` prompt has already printed, so 133;A (prompt start) arrives after the visible prompt and
  the terminal moves to a fresh line. Read from the code; not reproduced with a fix yet.
- **Fixed by:** E14-19.

### Smoke test: text less sharp than Windows Terminal

- **Reproduce:** the same font and size in lut and in Windows Terminal at 100% scale; magnified, lut's glyph edges are
  grayscale, Windows Terminal's have ClearType colour fringes, and lut looks slightly blurry.
- **Suspected cause:** the renderers rasterize glyphs with single-channel (grayscale) coverage; Windows Terminal uses
  DirectWrite ClearType (subpixel) antialiasing. Not a regression: it is how the imported renderer works.
- **Fixed by:** E13-13 (spike, then a decision).

### `pnpm test`: one failure under heavy load, test not identified

- **When:** during the gate check (E01-14), `pnpm test` exited 1 once while `cargo clippy` and `cargo test` were
  compiling in parallel. The output was not kept, so the failing test is unknown. The next run, on an idle machine,
  passed: 285 files, 4599 tests.
- **Suspected cause:** a timing-sensitive test that exceeds its bound when the CPU is saturated, like the Rust
  `fs::index` case above.
- **Next step:** if it shows up again (locally or in CI), record the test name here and open an issue.
- **Update (E01-23):** the first full CI run timed out in `terminal/lib/quoteShellPath.test.ts` "round trips literal
  paths through the platform shell", which starts `powershell.exe`; Windows PowerShell can take more than vitest's
  default 5 s to start. The test now has a 30 s timeout.

## Test registry

### Frontend: Vitest (`pnpm test`)

286 test files (`*.test.ts` / `*.test.tsx`) live next to the code they test. Per area:

| Area                      | Files | Area                                                       | Files  |
| ------------------------- | ----- | ---------------------------------------------------------- | ------ |
| `modules/terminal`        | 125   | `modules/lsp`                                              | 7      |
| `modules/ai`              | 30    | `lib/`                                                     | 7      |
| `modules/editor`          | 13    | `modules/control`, `modules/settings`                      | 6 each |
| `modules/tabs`            | 13    | `app/`, `modules/shortcuts`, `modules/source-control`      | 5 each |
| `modules/theme`           | 13    | `modules/git`, `modules/markdown`                          | 4 each |
| `modules/agents`          | 11    | `modules/git-history`, `modules/preview`, `modules/spaces` | 3 each |
| `modules/explorer`        | 9     | `settings/`, `styles/`                                     | 2 each |
| `modules/command-palette` | 7     | `components/`, `modules/sidebar`, `modules/statusbar`      | 1 each |

`src/app/dist-budget.test.ts` locks the bundle graph and the duplicate-package rule.

**Tests that skip depending on the environment** (2 files and 9 tests skipped on this machine at E01-03; since E01-20, 1 file and 2 tests):

| Test                                                       | Condition                                                                    | On this machine                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------- |
| `terminal/ghostty/bashPromptHooks.test.ts` (7 tests)       | needs Git Bash, found from `git --exec-path` or `git` on PATH (E01-20, #323) | ✅ runs: Git Bash found on `D:` |
| `terminal/ghostty/bashCommandStart.test.ts` (1)            | skipped on `win32` (E06-05 renamed it from `shellBlockCompatibility`)        | skipped                         |
| `terminal/lib/quoteShellPath.test.ts`, fish round trip (1) | needs `fish`                                                                 | skipped                         |
| `terminal/block/lib/pathComplete.shell.test.ts`            | one suite per shell among bash, zsh, pwsh, powershell that starts            | runs for the shells found       |

### Backend: Rust (`cargo test --workspace`)

- **Unit tests** are `#[cfg(test)]` modules and `*_tests.rs` files inside `src-tauri/src/modules/`. The largest
  groups by `#[test]` count:

  | Module            | Tests |
  | ----------------- | ----- |
  | `git`             | 333   |
  | `pty`             | 245   |
  | `fs`              | 165   |
  | `workspace.rs`    | 44    |
  | `net` + `net.rs`  | 55    |
  | `ai_sessions.rs`  | 30    |
  | `lsp`             | 28    |
  | `agent.rs`        | 25    |
  | `agent_events.rs` | 23    |
  | `control.rs`      | 22    |

- **Integration tests** live in `src-tauri/tests/`, with shared helpers in `common/`: `fs_search.rs`,
  `ghostty_artifacts.rs`, `git_operations.rs` and `shell_background.rs` (unix only).
- **Crate tests:** `crates/terax-cli` (27) and `crates/terax-control-protocol` (44).

### Other harnesses (not part of the commands above)

| Harness                       | Command                                                               | Platform   |
| ----------------------------- | --------------------------------------------------------------------- | ---------- |
| Ghostty benchmark             | `pnpm bench:ghostty` (`AdaptedGhostty.bench.ts`)                      | any        |
| Ghostty soak                  | `pnpm soak:ghostty`                                                   | any        |
| Ghostty profile               | `pnpm profile:ghostty`                                                | any        |
| Terminal scaling visual check | `pnpm test:terminal-scaling` (`scripts/terminal-visual/`, Playwright) | any        |
| Renderer, app and IPC labs    | `profile:renderer:*`, `profile:app`, `test:ipc:macos`                 | macOS only |
| PTY smoke test                | `scripts/pty-smoke/run.py`                                            | macOS only |
| WebKit memory                 | `scripts/ghostty-webkit-memory.mjs`                                   | macOS only |
| Windows performance baseline  | `scripts/baseline/measure.ps1` (see Performance)                      | Windows    |

## Performance

Recorded on 2026-11-09 at commit `1631260`, release build (`pnpm tauri build --no-bundle`), on the baseline machine:
Intel Core i7-12700K, NVIDIA GeForce GTX 1050 Ti, Windows 11 Pro, display at 100%, default settings and clean app data
for every start. Nothing was optimised. The values are the reference for later regressions; thresholds come later
(IR-96).

### Method

The app-lab benchmark (`src/bench/`, `src-tauri/src/modules/bench.rs`, `scripts/app-lab/run.py`) is macOS-only: its
window control is implemented only for macOS (`bench.rs`, `platform::run` returns "implemented for macOS only"
elsewhere), and `run.py` builds a macOS bundle and samples with `footprint`, `vmmap` and rusage. Porting it is not
needed for a baseline (E01-10), so Windows uses `scripts/baseline/measure.ps1`, which drives the release app from
outside:

- it moves the app data dirs (`%APPDATA%` and `%LOCALAPPDATA%` `\<Identifier>`: `app.crynta.terax` when this baseline was taken, `dev.lucode.lut` since E02-06) aside and
  restores them at the end;
- startup: from `Start-Process` to the main window being visible with a real client area, to a shell process existing
  in the app's process tree (polled, ±50 ms), and to the window content settling (no change larger than a cursor cell
  for 1 s);
- input latency: `SendInput` of a character into the prompt, then screen captures of the prompt row until it changes.
  Each capture takes about 6 ms, so that is the resolution; values include the compositor, as a user sees it;
- throughput: `cmd /c type` of a 50 MB text file in pwsh, timed by the shell itself, with the number of screen changes
  per second in the terminal area meanwhile;
- memory: private working set (Task Manager's "Memory" column) of the app and every process it started (WebView2,
  shells, conhost), and GPU dedicated memory from the `GPU Process Memory` counters. The memory values come from a
  second run with `-MemoryOnly`: the first run summed plain working sets, which count shared pages once per process;
- CPU: processor time of the whole process tree over 20 s, as a percentage of one logical core;
- tab switch: `Ctrl+Tab` between two idle tabs until the terminal area changes.

Commands:

```powershell
pnpm tauri build --no-bundle
pwsh scripts/baseline/measure.ps1 -Exe src-tauri/target/release/lut.exe -Out results.json
pwsh scripts/baseline/measure.ps1 -Exe src-tauri/target/release/lut.exe -MemoryOnly -Out memory.json
```

Do not touch the keyboard or mouse while it runs: it types into the app and reads the screen.

### Sizes

| Artifact                                          | Size          |
| ------------------------------------------------- | ------------- |
| `terax.exe` (release, frontend embedded)          | 11.54 MB      |
| `terax-cli` sidecar (`src-tauri/binaries/`)       | 0.32 MB       |
| `dist/` total                                     | 7.13 MB       |
| `dist/` JavaScript                                | 4.59 MB       |
| `dist/` WebAssembly (Ghostty)                     | 1.44 MB       |
| `dist/` CSS                                       | 0.18 MB       |
| `dist/` other (fonts, images, sounds)             | 0.92 MB       |
| NSIS installer / MSI (E01-03, `pnpm tauri build`) | 5.9 / 7.1 MiB |

A change that grows the executable or `dist/` by more than a few hundred kB should explain why in its PR.

### Startup, input and output

| Metric                                | Value                                              | Runs           |
| ------------------------------------- | -------------------------------------------------- | -------------- |
| Window visible                        | 476–530 ms (first run 530 ms)                      | 5              |
| Shell process started                 | 1081–1180 ms                                       | 5              |
| Window content settled (prompt drawn) | 1109–2117 ms                                       | 5              |
| Input latency (key to screen)         | p50 36.7 ms, p95 68.4 ms, p99 71.6 ms, max 71.6 ms | 194 (6 missed) |
| Output throughput (`type`, 50 MB)     | 2.1–2.2 MB/s (22.9–23.6 s)                         | 3              |
| Screen updates during that output     | 32–39 per second                                   | 3              |
| Tab switch (`Ctrl+Tab`, idle tabs)    | p50 30 ms, p95 40.8 ms, max 62.8 ms                | 20             |

In 6 of 200 keystrokes no change was detected within 1 s (a dropped key or a change the capture missed).

### Memory and CPU

| State                                    | Private working set | WebView2 | Shells + conhost | App     | GPU dedicated |
| ---------------------------------------- | ------------------- | -------- | ---------------- | ------- | ------------- |
| Started, 1 pane                          | 260.5 MB            | 204.1 MB | 44.2 MB          | 12.3 MB | 96.8 MB       |
| After 50 MB of output, 1 pane            | 272.3 MB            | 211.5 MB | 47.3 MB          | 13.5 MB | 59.9 MB       |
| 4 panes (4 pwsh)                         | 408.3 MB            | 214.2 MB | 180.4 MB         | 13.8 MB | 62.6 MB       |
| Plus a second tab after 250 MB of output | 446.1 MB            | 204.5 MB | 227.7 MB         | 13.8 MB | 61.0 MB       |

| Metric                                 | Value            |
| -------------------------------------- | ---------------- |
| CPU, idle, 1 pane                      | 1.4% of one core |
| CPU, a hidden tab printing every 50 ms | 9.5% of one core |

- Each pwsh pane costs about 45 MB, almost all of it the shell itself.
- 250 MB of output did not grow WebView2 memory: the scrollback budget holds.
- Release after closing a tab: not measured. The scripted `Ctrl+Shift+W` did not close the tab in either run (the shell
  count did not drop), while closing it by hand works and shows no dialog. Closing by hand after 150 MB of output left
  memory flat within a few MB; the WebView's JavaScript heap is not returned at once.

### Resize, zoom and DPI

Checked by hand during the smoke test: resizing the window, zooming and switching the Windows display scale from 100%
to 125% showed no reflow errors or rendering artifacts. Zoom shortcuts depend on the keyboard layout (see Known failures).

## Smoke test (Windows 11)

Run by hand on 2026-11-09 with the release build of `1631260` (E01-13).

| Item                                                       | Result                                   |
| ---------------------------------------------------------- | ---------------------------------------- |
| pwsh: type, `ls`, `cls`                                    | ✅                                       |
| WSL (Ubuntu) from the workspace environment selector       | ✅                                       |
| Splits: right, down, close one pane, the others stay alive | ✅                                       |
| Tabs: new, switch, reorder, close (no dialog)              | ✅                                       |
| Memory on closing a tab after long output                  | ✅ (see Performance)                     |
| Renderer: WebGPU (default) and WebGL (Settings → General)  | ✅                                       |
| Agent (Claude Code) in a pane, hooks disabled              | ✅                                       |
| Resize, zoom, display scale 100% → 125%                    | ✅, with the zoom shortcut failure below |

Agents with hooks enabled are not part of this test: lut will stop writing agent configs and ship its hooks as plugins the user installs by hand (E20-15), whose manual test runs them.

When lut is started from a Claude Code session, the shells inherit `CLAUDE_CODE_CHILD_SESSION` and Claude Code inside
them warns that transcript saving is off. That is the inherited environment, not a lut defect; start lut from the
Explorer or another terminal to avoid it.

## Coexistence with Terax (E04-13)

Run on 2026-11-09 on Windows 11 with Terax 0.9.0 installed (not running), using the release NSIS bundle of the E04-13
branch, installed and uninstalled silently (`/S`). The registry (`HKCU\Software\Classes`, the Uninstall keys, the
`HKCU\Software` subkeys), the dirs under `%APPDATA%`, `%LOCALAPPDATA%`, `~/.cache` and `~`, and a fingerprint (paths,
sizes, modification times) of Terax's install dir, data and cache dirs and of the agents' config files
(`~/.claude/settings.json`, `~/.codex`, `~/.gemini/settings.json`) were compared before, after installing, after
running and after uninstalling.

| Check                                                                     | Result                                                                                                                                                                      |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terax's install dir, data and cache dirs, Start-menu entry, uninstall key | ✅ unchanged at every step                                                                                                                                                  |
| Terax's `OpenInTerax` verbs and `Terax Document` ProgID                   | ✅ unchanged at every step                                                                                                                                                  |
| File-type defaults (`.json`, `.md`, `.ts`, …)                             | Point to `lut Document` while lut is installed (Tauri's file associations, with `Terax Document` as backup); restored to `Terax Document` on uninstall                      |
| What lut creates                                                          | `%LOCALAPPDATA%\lut` (install dir), `HKCU\Software\lucode`, its Uninstall key, the `OpenInLut` verbs and `lut Document`; app data only under `dev.lucode.lut`               |
| Agent config files while lut runs                                         | ✅ unchanged (lut writes them only when hooks are enabled; E20-15 removes that path)                                                                                        |
| Network while lut runs (20 s, TCP endpoints of lut's process tree)        | Only the WebView2 browser process: Microsoft (AS8075) and `chrome.cloudflare-dns.com` (DNS over HTTPS, the machine's resolver is 1.1.1.1); nothing to GitHub or `terax.app` |
| After uninstalling                                                        | ✅ no lut key, value, dir or file left; registry identical to before except Windows' own `PCT`/`PTT` timestamps                                                             |
| Keychain                                                                  | ✅ no keychain code left (the BYOK AI and its `terax-ai` service were removed in E02)                                                                                       |

## Phase 0 gate (E01-14)

Evaluated on 2026-11-09 at `1631260`.

| Check                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline executable   | Yes: dev and release builds run on Windows 11; smoke test and performance baseline recorded above.                                                                                                                                                                                                                                                                                                                                                                                             |
| CI status             | Not verified on GitHub: since the workflow was added (E01-05) every run ends in `startup_failure`, an account billing block unrelated to the repository. The same checks were run locally at this commit: `pnpm lint`, `format:check`, `check-types`, `build`, `knip`, `cargo fmt --check`, `cargo clippy -D warnings` and the CI `cargo test` with its skip list (869 passed) all pass; `pnpm test` passed on an idle machine (4599 tests) after one failure under load (see Known failures). |
| Undocumented failures | None. Every failure found in Phase 0 is listed under Known failures, with its fixing issue or next step.                                                                                                                                                                                                                                                                                                                                                                                       |

**Gate: passed**, with one pending item: confirming the CI workflow on GitHub once Actions runs again (tracked on #6).
The Phase 0 deletions (E02-01, E02-02, E02-04, E02-05) and the E05/E06 removals may start.
