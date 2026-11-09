# Phase 0 baseline

Results of every existing test, lint and check command on Windows 11. They were recorded on 2026-11-09 at commit
`5c06b7d`, before any code change other than the updater removal (E01-02), which touches no test or check.
Pre-existing failures are recorded here and **not fixed** in Phase 0's baseline issue.

## Environment and versions

Same machine and toolchain as `.docs/development/build.md` → "Baseline environment":

- Windows 11 Pro 10.0.26200 (x86_64);
- Node 24.19.0 and pnpm 11.9.0;
- rustc and cargo 1.98.1 (`stable-x86_64-pc-windows-msvc`);
- Tauri CLI 2.12.0 and Biome 2.5.14;
- Git for Windows 2.48.1, installed at `D:\Program Files\Git`.

## Build

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `pnpm build` | OK, 18 s |
| `pnpm tauri dev` | OK: the app starts and opens a pwsh PTY |
| `pnpm tauri build` (no signing keys) | OK, 5m46s: `Terax_0.9.0_x64_en-US.msi` (7.1 MiB) and `Terax_0.9.0_x64-setup.exe` (5.9 MiB) |
| `pnpm size` | OK: every budget passes (startup JS 246.6 kB of 540 kB; total client JS 1.48 MB of 1.5 MB) |
| `pnpm check:dist` | OK: startup graph clean. The duplicate-package check is skipped without sourcemaps; `dist-budget.test.ts` runs it in `pnpm test` |

## Results

| Command | Result | Time |
|---|---|---|
| `pnpm test` | ✅ 284 files passed, 2 skipped · 4592 tests passed, 9 skipped | 28 s |
| `pnpm check-types` | ✅ | 8 s |
| `pnpm lint` | ✅ exit 0, with 99 warnings + 1 info | 1 s |
| `pnpm format:check` | ❌ 135 files | 1 s |
| `pnpm knip` | ❌ 1 unused devDependency | 5 s |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` | ✅ 1087 passed, 0 failed, 0 ignored | 13 min |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings` | ❌ 5 errors | 36 s |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all --check` | ❌ 55 hunks in 15 files | 1 s |

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

  | Area | Files |
  |---|---|
  | `ai` | 31 |
  | `terminal` | 27 |
  | `theme` | 25 |
  | `agents` | 10 |
  | others | 1–5 each |

- **Suspected cause:** formatting is not enforced upstream. Terax's quality bar lists `pnpm lint`, but not
  `format:check`. Also, `biome.json` declares schema 2.4.16 while 2.5.14 is installed, so formatter changes between
  those versions may account for part of it.
- **Fixed by:** E01-17, which replaces Biome with Prettier (user decision) and reformats the codebase.

### `pnpm knip`: unused devDependency

- **Error excerpt:** `Unused devDependencies (1): react-compiler-healthcheck  package.json:133:6`.
- **Suspected cause:** a one-off tool (`npx react-compiler-healthcheck`) kept as a dependency with no script that uses it.
- **Fixed by:** E01-04 (#5), which removes it. ✅ Fixed: `pnpm knip` exits 0.

### `cargo clippy -D warnings`: 5 errors

| Location | Error | Suspected cause |
|---|---|---|
| `src/modules/git/followup_tests.rs:8` | unused import `run_git` | only used under `#[cfg(unix)]`: Windows-only warning |
| `src/modules/git/followup_tests.rs:13` | unused import `WorkspaceEnv` | same |
| `src/modules/git/task_worktree_tests.rs:2` | unused import `std::time::Duration` | same (only used by unix-gated code) |
| `src/modules/git/feedback_tests.rs:344` | function `set_mtime` is never used | only called from `#[cfg(unix)]` tests |
| `src/modules/workspace.rs:559` | `chunks_exact_to_as_chunks` (use `as_chunks::<2>()`) | lint new in clippy 1.98, newer than Terax's toolchain |

The first four are in the git agent-task backend, which E02 removes (decision 23).

**Fixed by:** E01-19, so the CI gate (E01-05) is green before E02.

### `cargo fmt --check`: 15 files

Most of the hunks (28 of 55) are in `src/modules/pty/agent_detect.rs`. The rest:

- `pty/da_filter.rs`, `workspace.rs`, `tests/shell_background.rs`: 3 each;
- `git/checkpoint.rs`, `lsp/framing.rs`: 4 each;
- `src/lib.rs`: 2;
- one each in `crates/terax-cli/src/lib.rs`, `crates/terax-control-protocol/src/lib.rs`, `git/branch.rs`,
  `git/operations.rs`, `git/review.rs`, `lsp/mod.rs`, `proc/rss.rs` and `pty/hub.rs`.

**Suspected cause:** `cargo fmt` is not checked upstream either (CONTRIBUTING asks for it, but nothing enforces it).

**Fixed by:** E01-18.

### `pnpm lint`: warnings, not failures

`pnpm lint` exits 0. The most common rules (counted with `--max-diagnostics=none`):

| Rule | Count |
|---|---|
| `useExhaustiveDependencies` | 21 |
| `noNonNullAssertion` | 11 |
| `useTemplate` | 9 |
| `useOptionalChain` | 7 |
| `noTemplateCurlyInString`, `noConfusingVoidType` | 5 each |

**Since E01-16 (#319), `pnpm lint` runs ESLint** (`eslint.config.js`). It exits 0 with 170 warnings in 73 files, which is also its budget (`--max-warnings 170`: a PR may not add warnings). Every
rule with pre-existing violations is a warning; the other rules are errors. Counts:

| Rule | Count | Origin |
|---|---|---|
| `react-hooks/refs` | 50 | new (React Compiler rules) |
| `react-hooks/set-state-in-effect` | 46 | new (React Compiler rules) |
| `prefer-template` | 11 | Biome `useTemplate` |
| `@typescript-eslint/no-non-null-assertion` | 11 | Biome `noNonNullAssertion` |
| `jsx-a11y/prefer-tag-over-role` | 10 | Biome `useSemanticElements` |
| `react-hooks/exhaustive-deps` | 6 | Biome `useExhaustiveDependencies` |
| `jsx-a11y/click-events-have-key-events`, `jsx-a11y/interactive-supports-focus` | 4 each | Biome a11y warnings |
| `react-hooks/rules-of-hooks`, `react/no-array-index-key`, `react-hooks/immutability` | 3 each | Biome warnings / new |
| `react-hooks/preserve-manual-memoization`, `react-hooks/incompatible-library`, `prefer-const`, `radix`, `jsx-a11y/no-static-element-interactions`, `jsx-a11y/no-noninteractive-tabindex` | 2 each | mixed |
| `react-hooks/globals`, `no-empty`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-empty-object-type`, `jsx-a11y/no-autofocus`, `jsx-a11y/label-has-associated-control`, `jsx-a11y/no-noninteractive-element-interactions` | 1 each | mixed |

The React Compiler warnings (`react-hooks/*`, 105 in total) left after the BYOK AI, blocks and App-split cleanups are resolved by E09-10 (#326).

## Test registry

### Frontend: Vitest (`pnpm test`)

286 test files (`*.test.ts` / `*.test.tsx`) live next to the code they test. Per area:

| Area | Files | Area | Files |
|---|---|---|---|
| `modules/terminal` | 125 | `modules/lsp` | 7 |
| `modules/ai` | 30 | `lib/` | 7 |
| `modules/editor` | 13 | `modules/control`, `modules/settings` | 6 each |
| `modules/tabs` | 13 | `app/`, `modules/shortcuts`, `modules/source-control` | 5 each |
| `modules/theme` | 13 | `modules/git`, `modules/markdown` | 4 each |
| `modules/agents` | 11 | `modules/git-history`, `modules/preview`, `modules/spaces` | 3 each |
| `modules/explorer` | 9 | `settings/`, `styles/` | 2 each |
| `modules/command-palette` | 7 | `components/`, `modules/sidebar`, `modules/statusbar` | 1 each |

`src/app/dist-budget.test.ts` locks the bundle graph and the duplicate-package rule.

**Tests that skip depending on the environment** (2 files and 9 tests skipped on this machine):

| Test | Condition | On this machine |
|---|---|---|
| `terminal/ghostty/bashPromptHooks.test.ts` (7 tests) | needs `C:/Program Files/Git/bin/bash.exe` (hardcoded) | skipped: Git is installed on `D:`. Fixed by E01-20 |
| `terminal/ghostty/shellBlockCompatibility.test.ts` (1) | skipped on `win32` | skipped |
| `terminal/lib/quoteShellPath.test.ts`, fish round trip (1) | needs `fish` | skipped |
| `terminal/block/lib/pathComplete.shell.test.ts` | one suite per shell among bash, zsh, pwsh, powershell that starts | runs for the shells found |

### Backend: Rust (`cargo test --workspace`)

- **Unit tests** are `#[cfg(test)]` modules and `*_tests.rs` files inside `src-tauri/src/modules/`. The largest
  groups by `#[test]` count:

  | Module | Tests |
  |---|---|
  | `git` | 333 |
  | `pty` | 245 |
  | `fs` | 165 |
  | `workspace.rs` | 44 |
  | `net` + `net.rs` | 55 |
  | `ai_sessions.rs` | 30 |
  | `lsp` | 28 |
  | `agent.rs` | 25 |
  | `agent_events.rs` | 23 |
  | `control.rs` | 22 |

- **Integration tests** live in `src-tauri/tests/`, with shared helpers in `common/`: `fs_search.rs`,
  `ghostty_artifacts.rs`, `git_operations.rs` and `shell_background.rs` (unix only).
- **Crate tests:** `crates/terax-cli` (27) and `crates/terax-control-protocol` (44).

### Other harnesses (not part of the commands above)

| Harness | Command | Platform |
|---|---|---|
| Ghostty benchmark | `pnpm bench:ghostty` (`AdaptedGhostty.bench.ts`) | any |
| Ghostty soak | `pnpm soak:ghostty` | any |
| Ghostty profile | `pnpm profile:ghostty` | any |
| Terminal scaling visual check | `pnpm test:terminal-scaling` (`scripts/terminal-visual/`, Playwright) | any |
| Renderer, app and IPC labs | `profile:renderer:*`, `profile:app`, `test:ipc:macos` | macOS only |
| PTY smoke test | `scripts/pty-smoke/run.py` | macOS only |
| WebKit memory | `scripts/ghostty-webkit-memory.mjs` | macOS only |

## Performance

Filled by E01-11 and E01-12.
