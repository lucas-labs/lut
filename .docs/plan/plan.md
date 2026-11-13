# lut development plan

Epics and issues for lut, derived from `.docs/proposal.md`, the per-area analyses in `.docs/plan/analysis/` and the
user decisions in `.docs/plan/analysis/decisions.md` (which override everything else). The format is described in
`.docs/plan/README.md` and checked by `node .docs/plan/tools/validate.mjs`. GitHub epics and issues are generated from this file.

## E01 — Phase 0: baseline and build reproducibility

```yaml
id: E01
depends-on: []
refs: [F0, 13.4, 15, ADR-007, .docs/plan/analysis/build-identity.md]
```

Make the imported code build reproducibly on Windows 11, record the baseline of tests and performance, document module
contracts and real dependencies, and add a CI quality gate. Nothing is optimised or removed here.

### E01-01 — Document the toolchain and effective build commands

```yaml
id: E01-01
depends-on: []
refs: [F0, .docs/plan/analysis/build-identity.md, .docs/origin-terax/README.md]
covers: [F0:6, F0:7]
type: task
scope: none
size: S
```

**Goal:** A clean checkout on Windows 11 builds and starts by following one document, with the toolchain versions actually used recorded.

**Acceptance criteria:**

- [ ] `.docs/development/build.md` lists Node >= 22, pnpm 11.9.0 via `corepack enable`, Rust stable (edition 2021), `@tauri-apps/cli` 2.12, optional Zig (0.16.0 for the adapted Ghostty WASM, 0.15.2 for the legacy one; only to rebuild the committed WASM), Python 3 (profilers only) and per-OS prerequisites (MSVC build tools + WebView2; Xcode CLT; webkit2gtk/gtk on Linux).
- [ ] Commands for install (`pnpm install --frozen-lockfile`), dev (`pnpm tauri dev`), release (`pnpm tauri build`), tests, lint, Rust tests and clippy; the CLI sidecar prebuild (`scripts/build-cli.mjs`) is explained.
- [ ] The OS and toolchain versions used for the Phase 0 baseline are recorded, and POSIX-only / macOS-only scripts are flagged.

**Verification:** follow only `.docs/development/build.md` on a clean Windows 11 checkout: `pnpm install --frozen-lockfile`, `pnpm build:cli:dev`, `pnpm build` and `cargo build --manifest-path src-tauri/Cargo.toml --locked` succeed. The app is not launched here: it still auto-checks Terax's updater on start (F0:4), so the launch check is part of E01-02.

### E01-02 — Remove the Terax updater plugin

```yaml
id: E01-02
depends-on: [E01-01]
refs: [F0:4, F7:auto-actualizacion-de-lut, .docs/plan/analysis/build-identity.md, .docs/plan/analysis/decisions.md]
covers: [F0:4, build-identity/updater-logic, build-identity/updater-dialog, build-identity/capabilities, build-identity/node-package, build-identity/tauri-config]
type: task
scope: be
size: S
```

**Goal:** lut never contacts Terax's release infrastructure nor installs a Terax binary (decision 5): `tauri-plugin-updater` is removed entirely and re-added in F7 with lut's own endpoint and key.

**Acceptance criteria:**

- [ ] `plugins.updater` (endpoint + pubkey) removed from `src-tauri/tauri.conf.json` (:118-123) and `createUpdaterArtifacts` removed/false (:48).
- [ ] `tauri-plugin-updater` removed from `src-tauri/Cargo.toml` (:154) and its registration from `src-tauri/src/lib.rs:198`; `@tauri-apps/plugin-updater` removed from `package.json`.
- [ ] `src/modules/updater/` deleted; `UpdaterDialog` unmounted from `src/app/App.tsx:120,1668`; the manual check in `src/settings/sections/AboutSection.tsx:27,51` removed (no replacement UI).
- [ ] `updater:default` removed from `src-tauri/capabilities/desktop.json`; `process:default` kept only if another caller of `@tauri-apps/plugin-process` remains (list it in the PR).
- [ ] `git grep -n "crynta/terax-ai/releases\|plugin-updater\|terax:updater"` in `src/` and `src-tauri/` returns nothing.
- [ ] Following only `.docs/development/build.md`, `pnpm tauri dev` starts the app (launch check deferred from E01-01).

**Verification:** `pnpm install && pnpm check-types && pnpm test`; `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`; `pnpm tauri build` succeeds without signing keys; launch the app with a network monitor and confirm no request to github.com.

### E01-03 — Record the baseline of existing tests, lint and checks

```yaml
id: E01-03
depends-on: [E01-01]
refs: [F0, .docs/plan/analysis/build-identity.md]
covers: [F0:8, 15:6]
type: task
scope: none
size: S
```

**Goal:** Every existing test/lint/check command is run on Windows 11 and its result, including pre-existing failures, is recorded before any other code change (only the updater removal, E01-02, may land first: it does not touch tests or checks).

**Acceptance criteria:**

- [ ] `.docs/testing/baseline.md` created with sections: environment and versions, build, test registry, known failures, performance (filled by E01-11/E01-12).
- [ ] Results recorded for `pnpm test`, `pnpm check-types`, `pnpm lint`, `pnpm format:check`, `pnpm knip`, `pnpm build`, `pnpm size`, `pnpm check:dist`, and from `src-tauri/` `cargo test --locked --workspace` and `cargo clippy --all-targets --locked -- -D warnings`.
- [ ] Each pre-existing failure is listed with command, error excerpt and suspected cause; none is fixed in this PR.

**Verification:** re-run the listed commands; outcomes match `.docs/testing/baseline.md`.

### E01-04 — Make frontend build scripts work on Windows

```yaml
id: E01-04
depends-on: [E01-03]
refs: [.docs/plan/analysis/build-identity.md]
covers: [build-identity/frontend-build-config]
type: task
scope: none
size: S
```

**Goal:** Developer scripts and the frontend build configuration run on Windows shells, so the quality gate behaves the same on every OS.

**Acceptance criteria:**

- [ ] `dev:inspect` and `analyze:bundle` no longer use POSIX `VAR=x cmd` syntax (cross-platform env setter or a Node wrapper); behaviour unchanged.
- [ ] `vite.config.ts`, `biome.json`, `knip.json` and `.size-limit.json` commands pass on Windows, or remaining failures are recorded in `.docs/testing/baseline.md` with the issue that will fix them.
- [ ] `pnpm knip` passes: the unused devDependency `react-compiler-healthcheck` is removed (it can still be run with `npx` when needed), and the knip entry in `.docs/testing/baseline.md` is marked fixed.
- [ ] No dependency upgrades beyond what the fix strictly needs (IR-45).

**Verification:** in pwsh: `pnpm dev:inspect` starts, `pnpm analyze:bundle` produces the report, `pnpm knip` and `pnpm size` (after `pnpm build`) give the same result as on POSIX.

**Out of scope:** updating budgets/manual chunks for removed areas (done with each removal).

### E01-05 — Add the CI quality gate workflow

```yaml
id: E01-05
depends-on: [E01-04, E01-17, E01-19, E01-20, E01-21]
refs: [ADR-007, .docs/plan/analysis/proposal.md]
covers: [ADR-007]
type: task
scope: none
size: M
```

**Goal:** Every PR to `master` runs lint, typecheck, tests and clippy automatically (IR-95), so changes pass a reproducible gate.

**Acceptance criteria:**

- [ ] `.github/workflows/ci.yml` runs on pull requests and pushes to `master`: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`, `pnpm check-types`, `pnpm test`, `pnpm build`, `pnpm knip`, and from `src-tauri/` `cargo fmt --all --check`, `cargo test --locked --workspace` and `cargo clippy --all-targets --locked -- -D warnings`.
- [ ] Runs on `windows-latest` (primary platform). macOS and Linux jobs are added by E24-01 (decision 20); this issue does not add them.
- [ ] Pre-existing failures recorded in the baseline are fixed in their own issues or explicitly allowed to fail with a link to the baseline entry; nothing is skipped silently.
- [ ] Until E02-05 deletes the git agent-task backend, `cargo test` skips its tests explicitly: one `--skip modules::git::<module>` per module of `ide-tools/git-agent-tasks` (checkpoint, worktree, task_worktree, task_state, project_config, commands_tasks, commands_review, review, diff, patch, branch, edge_tests, feedback_tests, followup_tests, hardening_tests, review_tests, tasks_tests, task_worktree_tests), listed in one place in the workflow with a comment linking E02-05 and the baseline entry. They are the slowest and the flaky tests of the suite (without `modules::git` the lib tests take ~8 s instead of 10–15 min on Windows).
- [ ] pnpm and cargo caches configured; toolchain versions match `.docs/development/build.md`.

**Verification:** open a test PR; all jobs run and their status matches `.docs/testing/baseline.md`.

### E01-06 — Add the PR template and change-control rules

```yaml
id: E01-06
depends-on: [E01-05]
refs: [ADR-007, .docs/plan/analysis/proposal.md]
covers: [ADR-007]
type: task
scope: none
size: XS
```

**Goal:** Every PR reports goal, changed files, functional changes, risks, tests run and compatibility (IR-93, IR-91), and contract changes come with an ADR (IR-41).

**Acceptance criteria:**

- [ ] `.github/pull_request_template.md` with sections: goal, files changed, functional changes, risks, tests executed (commands and results), compatibility, screenshots only if UI is affected, linked issue.
- [ ] Checklist item: "ADR added under `.docs/decisions/` if a contract, persisted model or platform constraint changed".
- [ ] `.docs/development/change-control.md` states the rules: one issue per PR, refactors separate from behaviour, tests move with moved pure functions, no mass dependency upgrades in F0-F2.

**Verification:** open a draft PR; the template is pre-filled.

### E01-07 — Map the current module state and IPC surface

```yaml
id: E01-07
depends-on: [E01-01]
refs: [15, .docs/plan/analysis/app-shell.md, .docs/plan/analysis/backend-core.md, .docs/plan/analysis/terminal.md]
covers: [15:1]
type: task
scope: none
size: M
```

**Goal:** A verified map of the real React/Rust modules, stores, side effects and IPC exists before any refactor.

**Acceptance criteria:**

- [ ] `.docs/architecture/current-state.md` lists React modules, stores, global side effects (window globals, listeners), Rust modules, Tauri commands and events, with verified paths.
- [ ] Every Tauri command registered in `src-tauri/src/lib.rs` appears with its frontend caller(s) or "no caller".
- [ ] Facts reuse the area analyses under `.docs/plan/analysis/` and are re-checked against the code.

**Verification:** `git grep -n "generate_handler" src-tauri/src` and spot-check 10 entries against the code.

### E01-08 — Generate the module dependency matrix and contracts list

```yaml
id: E01-08
depends-on: [E01-07]
refs: [15, F0]
covers: [F0:12, 15:2]
type: task
scope: none
size: M
```

**Goal:** The real dependencies between `app`, `terminal`, `tabs`, `spaces`, `agents`, `control`, `ai`, `editor` and `git` are documented from the import graph, with the list of module contracts.

**Acceptance criteria:**

- [ ] `.docs/architecture/module-dependencies.md` has a module-to-module matrix derived from the import graph (script output, e.g. based on `scripts/eager-graph.mjs`), plus the Tauri commands each module uses.
- [ ] Each module has a contract entry: public API, owned state, IPC used, known couplings.
- [ ] The command that regenerates the matrix is documented.

**Verification:** run the documented regeneration command; output matches the committed matrix.

### E01-09 — Write the target architecture and migration plan documents

```yaml
id: E01-09
depends-on: [E01-08]
refs: [15, .docs/plan/analysis/proposal.md]
covers: [15:3, 15:4]
type: task
scope: none
size: M
```

**Goal:** Proposed contracts, invariants, process flow and renderer, and the PR/test sequence of the refactor are written down as the reference for later epics.

**Acceptance criteria:**

- [ ] `.docs/architecture/target-architecture.md` describes target contracts, invariants (§5.4, §6), process flow and renderer, linking the proposal sections.
- [ ] `.docs/architecture/migration-plan.md` lists the refactor sequence by PRs and tests, pointing to epics/issues of `.docs/plan/plan.md` instead of duplicating them.
- [ ] No requirement beyond `.docs/proposal.md` and `.docs/plan/analysis/decisions.md`.

**Verification:** links resolve; order checked against the epics of `.docs/plan/plan.md`.

### E01-10 — Make the real-application benchmark usable on Windows

```yaml
id: E01-10
depends-on: [E01-02, E01-03]
refs: [13.4, .docs/plan/analysis/build-identity.md]
covers: [build-identity/bench-app-lab]
type: spike
scope: be
size: M
```

**Goal:** Decide and implement the minimum needed so the app-lab benchmark (`src/bench/`, `src-tauri/src/modules/bench.rs`, `scripts/app-lab/`) produces the §13.4 measurements on Windows 11, or document the manual procedure that replaces it.

**Acceptance criteria:**

- [ ] Findings recorded: which parts are macOS-only (window control, `bench.rs:722`; `scripts/app-lab/run.py`) and what Windows needs.
- [ ] Either the bench driver runs on Windows for the §13.4 metrics, or `.docs/testing/baseline.md` documents a reproducible manual procedure per metric (tools, steps).
- [ ] The bench safety guard keeps refusing to run against a non-bench product identifier (`bench.rs:17`, `run.py:58,216`). The identifier values are switched to lut's later, by E02-06; this issue keeps the guard logic identifier-agnostic.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --features bench bench`; one bench run (or the manual procedure) on Windows produces a result.

### E01-11 — Measure startup, input latency and output throughput baseline

```yaml
id: E01-11
depends-on: [E01-10]
refs: [13.4, F0]
covers: [F0:11, 13.4:1, 13.4:2, 13.4:3]
type: task
scope: none
size: S
```

**Goal:** Record the initial cold start, input latency and high-volume output behaviour on Windows 11, without optimising anything.

**Acceptance criteria:**

- [ ] `.docs/testing/baseline.md` records: cold start, first terminal visible and time to prompt (pwsh); input-to-echo latency with P95/P99 stalls; FPS and visual stability during high-volume output.
- [ ] Each value states machine, build type (release), method/command and number of runs.

**Verification:** re-run one measurement following the document; result within the recorded variance.

### E01-12 — Measure memory, CPU, scrollback and resize baseline

```yaml
id: E01-12
depends-on: [E01-10]
refs: [13.4, F0]
covers: [F0:11, 13.4:4, 13.4:5, 13.4:6, 13.4:7]
type: task
scope: none
size: S
```

**Goal:** Record RAM/GPU, idle CPU, long-run scrollback memory and resize/zoom/DPI behaviour on Windows 11, without optimising anything.

**Acceptance criteria:**

- [ ] Recorded: RAM and GPU at start, with 1 and 4 panes and after closing all; CPU idle and with hidden tabs; scrollback memory over a long run and release after close; reflow and errors during resize, zoom and DPI change; tab switching time.
- [ ] Method, machine and runs stated for each value; regression thresholds left for later (IR-96).

**Verification:** re-run one measurement following the document; result within the recorded variance.

### E01-13 — Run the Windows 11 manual smoke test

```yaml
id: E01-13
depends-on: [E01-02, E01-03]
refs: [F0, .docs/plan/analysis/terminal.md, .docs/plan/analysis/agents.md]
covers: [F0:9]
type: task
scope: none
size: S
```

**Goal:** The app is built and opened on Windows 11 and its core paths are exercised manually, with results recorded in the baseline.

**Acceptance criteria:**

- [ ] `.docs/testing/baseline.md` records results for: pwsh, WSL, splits, tabs, Ghostty renderer on WebGPU and WebGL fallback, agents with hooks disabled.
- [ ] Agents with hooks **enabled** are not tested here: the imported hook installer still uses Terax markers. That part of F0:9 is run by E04-13, after E02-11 makes the markers lut-owned.
- [ ] Every failure is listed as a known failure with reproduction steps.

**Verification:** `pnpm tauri dev` on Windows 11; checklist in the PR with pass/fail per item.

### E01-14 — Evaluate the Phase 0 baseline gate

```yaml
id: E01-14
depends-on: [E01-03, E01-05, E01-11, E01-12, E01-13]
refs: [F0, 15]
covers: [F0:gate]
type: task
scope: none
size: XS
```

**Goal:** Evaluate the F0 gate before any module deletion: the baseline is executable and every pre-existing failure is documented. The deletions of Phase 0 (E02-01, E02-02, E02-04, E02-05) and the BYOK AI and command-blocks removals (E05, E06, which depend on epic E01) start only after this issue is closed.

**Acceptance criteria:**

- [ ] `.docs/testing/baseline.md` has a gate section: baseline executable (yes/no), CI status, and the list of undocumented failures (must be empty).
- [ ] If the gate fails, the blocking items are added to `plan.md` and this issue stays open.
- [ ] The full Phase 0 deliverable (identity isolation, licensing, etc.) is assembled later by E04-10; this issue checks only the baseline.

**Verification:** CI green or failing only on documented baseline entries; manual review of the gate section.

### E01-16 — Replace the Biome linter with ESLint

```yaml
id: E01-16
depends-on: [E01-04]
refs: [ADR-007, .docs/testing/baseline.md]
covers: [build-identity/frontend-build-config, build-identity/node-package, ADR-007]
type: task
scope: none
size: M
```

**Goal:** `pnpm lint` runs ESLint instead of Biome (user decision: Biome is dropped for Prettier + ESLint), with at least the same checks as today.

**Acceptance criteria:**

- [ ] `eslint.config.js` (flat config) with `typescript-eslint`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`; same file scope as `biome.json` today (`src/**/*.{ts,tsx}`, `packages/ghostty-core/lib/official/**/*.ts`, excluding `src/components/ui/**` and `src/components/ai-elements/**`).
- [ ] Rules that are errors in Biome today stay errors: type-only imports and exports (`useImportType`, `useExportType`) and banned `@ts-ignore` (`noTsIgnore`). Biome's warning-level rules map to their ESLint equivalents as warnings.
- [ ] Import ordering is enforced by a lint rule with Biome's current groups: node builtins, `@/`, packages, aliases, relative paths.
- [ ] The 23 `biome-ignore` comments (13 files) are converted to `eslint-disable-next-line` with the same justification.
- [ ] `pnpm lint` and `pnpm lint:fix` run ESLint and exit 0. Rules with pre-existing violations are warnings, with their counts recorded in `.docs/testing/baseline.md`.
- [ ] No behaviour change: only lint configuration, comments, and mechanical import-type or import-order fixes.

**Verification:** `pnpm lint` exits 0; `pnpm check-types && pnpm test` pass; adding `// @ts-ignore` to a file makes `pnpm lint` fail.

**Notes:** Biome stays installed until E01-17 removes it together with the formatter. The in-app editor's Biome format-on-save option (`src/modules/editor/lib/externalFormat.ts`) is a product feature and is not touched.

### E01-17 — Replace the Biome formatter with Prettier and remove Biome

```yaml
id: E01-17
depends-on: [E01-16]
refs: [ADR-007, .docs/testing/baseline.md, .docs/development/build.md]
covers: [build-identity/frontend-build-config, build-identity/node-package, build-identity/repo-tooling, ADR-007]
type: task
scope: none
size: L
size-exception: Reformatting the whole codebase is mechanical; the config change and the reformat are separate commits so the config can be reviewed on its own.
```

**Goal:** Prettier formats the code and Markdown docs with the user's style, and Biome is no longer a dependency of the repo.

**Acceptance criteria:**

- [ ] Prettier config: `singleQuote: true`, `semi: true`, `trailingComma: 'all'`. Line width 100 for `*.ts`, 120 for `*.tsx`, 120 for `*.md`, the last two through `overrides`.
- [ ] Scope: the ESLint file scope from E01-16, plus `.docs/**/*.md` except `.docs/origin-terax/**` (imported Terax docs stay untouched). Markdown uses `proseWrap: 'preserve'`.
- [ ] `pnpm format` and `pnpm format:check` run Prettier. `pnpm format:check` passes after one commit that only reformats.
- [ ] `@biomejs/biome` and `biome.json` removed. `.vscode/settings.json` and `.vscode/extensions.json` point to Prettier and ESLint.
- [ ] `.docs/development/build.md` updated (lint/format row), and the `format:check` entry in `.docs/testing/baseline.md` marked fixed with a link to this issue.
- [ ] The in-app editor's Biome format-on-save option is kept (product feature).

**Verification:** `pnpm format:check` and `pnpm lint` exit 0; `pnpm check-types && pnpm test && pnpm build` pass; `git grep -n biome -- ':!src/modules/editor' ':!.docs' ':!pnpm-lock.yaml'` returns nothing.

### E01-18 — Apply rustfmt to the backend

```yaml
id: E01-18
depends-on: [E01-03]
refs: [ADR-007, .docs/testing/baseline.md]
covers: [ADR-007]
type: task
scope: be
size: S
size-exception: Mechanical formatting only (55 hunks in 15 files).
```

**Goal:** `cargo fmt --check` passes, so the CI gate can enforce it.

**Acceptance criteria:**

- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml --all` applied, with no other change in the PR.
- [ ] The `cargo fmt --check` entry in `.docs/testing/baseline.md` is marked fixed with a link to this issue.

**Verification:** `cargo fmt --manifest-path src-tauri/Cargo.toml --all --check` exits 0; `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` passes.

### E01-19 — Fix the pre-existing clippy errors

```yaml
id: E01-19
depends-on: [E01-18]
refs: [ADR-007, .docs/testing/baseline.md]
covers: [ADR-007]
type: task
scope: be
size: XS
```

**Goal:** `cargo clippy --all-targets --locked -- -D warnings` passes on Windows, so the CI gate can enforce it.

**Acceptance criteria:**

- [ ] The four Windows-only errors in the git agent-task tests (`followup_tests.rs:8,13`, `task_worktree_tests.rs:2`, `feedback_tests.rs:344`) are fixed by gating the imports and the helper with `#[cfg(unix)]`. That module is deleted by E02-05; this keeps the gate green until then.
- [ ] `src/modules/workspace.rs:559` uses `as_chunks::<2>()` instead of `chunks_exact(2)` (`clippy::chunks_exact_to_as_chunks`), with unchanged behaviour (the existing UTF-16 decoding tests pass).
- [ ] The clippy entry in `.docs/testing/baseline.md` is marked fixed with a link to this issue.

**Verification:** `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings` exits 0; `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` passes.

### E01-20 — Find Git Bash through PATH in the Bash prompt-hook tests

```yaml
id: E01-20
depends-on: [E01-17]
refs: [.docs/testing/baseline.md]
covers: [terminal/session-lifecycle, F0:8]
type: task
scope: ui
size: XS
```

**Goal:** The Bash shell-integration tests run on every Windows machine with Git Bash, not only when it is installed in `C:\Program Files\Git`.

**Acceptance criteria:**

- [ ] `src/modules/terminal/ghostty/bashPromptHooks.test.ts` resolves Git Bash on Windows from `git --exec-path` or `PATH` (never WSL's `bash.exe` in `System32`), with the hardcoded path only as a fallback.
- [ ] The tests are still skipped, not failed, when no Git Bash exists.
- [ ] The skipped-tests table in `.docs/testing/baseline.md` is updated.

**Verification:** on a machine with Git installed in `D:\Program Files\Git`, `pnpm exec vitest run src/modules/terminal/ghostty/bashPromptHooks.test.ts` runs the 7 tests and they pass.

### E01-21 — Make the cold-roots file-index test independent of machine load

```yaml
id: E01-21
depends-on: [E01-18]
refs: [ADR-007, .docs/testing/baseline.md]
covers: [ide-tools/fs-search-index, ADR-007]
type: task
scope: be
size: XS
```

**Goal:** `cargo test --workspace` does not fail at random, so the CI gate (E01-05) is reliable.

**Acceptance criteria:**

- [ ] `modules::fs::index::tests::unrelated_cold_roots_build_without_waiting_for_each_other` no longer depends on finishing within 2 s while the rest of the suite loads the machine. It failed once in a full run during E01-18 ("B must finish while A is paused") and passed 5 of 5 times on its own. For example: a timeout far above the real build time (A stays blocked until released, so the bound only limits a hang), or a deterministic signal instead of a timeout.
- [ ] What the test checks is unchanged: index B is built while the build of index A is paused.
- [ ] The flaky-test entry in `.docs/testing/baseline.md` is marked fixed with a link to this issue.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` passes three times in a row; the test fails if `get_or_build` is made to wait for other roots (checked locally, not committed).

### E01-22 — Make knip pass with the Git Bash lookup in the prompt-hook tests

```yaml
id: E01-22
depends-on: [E01-20]
refs: [.docs/development/build.md]
covers: [F0:8]
type: task
scope: ui
size: XS
```

**Goal:** the CI `knip` step (E01-05) passes on `master`. Since E01-20, `findGitBash()` in `src/modules/terminal/ghostty/bashPromptHooks.test.ts` runs `where git`, and `pnpm knip` fails with "Unlisted binaries: where". It went unnoticed because CI could not run.

**Acceptance criteria:**

- [ ] `pnpm knip` exits 0: `where` is added to `ignoreBinaries` in `knip.json` (a Windows system command, like the macOS-only `footprint` and `swiftc` already listed), or the lookup stops spawning it.
- [ ] The prompt-hook tests still find Git Bash on Windows and still skip when it is missing.

**Verification:** `pnpm knip` and `pnpm test src/modules/terminal/ghostty/bashPromptHooks.test.ts` pass.

### E01-23 — Make the CI workflow pass on the Windows runner

```yaml
id: E01-23
depends-on: [E01-05]
refs: [ADR-007]
covers: [ADR-007]
type: task
scope: none
size: XS
```

**Goal:** The CI workflow passes on `windows-latest`. Every earlier run ended in `startup_failure`; the first real one
(#362) failed in two format checks that pass locally.

**Acceptance criteria:**

- [ ] LF is fixed everywhere: `.gitattributes` (`* text=auto eol=lf`), Prettier `endOfLine: lf`, rustfmt `newline_style = "Unix"` and `.editorconfig`. The runner defaults to `core.autocrlf=true`, so every file had CRLF and `pnpm format:check` failed on 665 files.
- [ ] `src-tauri/src/modules/fs/read_policy.rs` is formatted with rustfmt (left unformatted by E05-14).
- [ ] `quoteShellPath.test.ts` gives its PowerShell round trip a 30 s timeout: the first full CI run timed out there (recorded in `baseline.md`).
- [ ] Every CI job passes on the PR.

**Verification:** the CI run of the PR is green.

### E01-24 — Run the frontend CI job on Ubuntu

```yaml
id: E01-24
depends-on: [E01-23]
refs: [ADR-007]
covers: [ADR-007]
type: task
scope: none
size: XS
```

**Goal:** The frontend job runs on `ubuntu-latest`, which is faster and costs half the Windows minutes. Lint, format,
types, Vitest, the Vite build and knip do not depend on the OS. The backend stays on Windows, the primary platform
(decision 20); Linux and macOS backend jobs are E24-01.

**Acceptance criteria:**

- [ ] The `frontend` job in `.github/workflows/ci.yml` runs on `ubuntu-latest` with the same steps.
- [ ] The tests with a Windows-only path still run on Windows in CI: `terminal/lib/quoteShellPath.test.ts` (the
      PowerShell round trip) and `terminal/ghostty/bashPromptHooks.test.ts` (Git Bash), in a Windows job.
- [ ] Tests that fail on Linux are fixed or recorded in `.docs/testing/baseline.md` with an issue; none is skipped silently.

**Verification:** the CI run of the PR is green; the job log shows both Windows tests ran (not skipped).

### E01-25 — Run each CI job only when its files change

```yaml
id: E01-25
depends-on: [E01-24]
refs: [ADR-007]
covers: [ADR-007]
type: task
scope: none
size: S
```

**Goal:** A pull request that only touches the frontend does not run the backend job, and the other way round. A push to
`master` still runs every job, as a safety net and to keep `master`'s cache complete.

**Acceptance criteria:**

- [ ] A first `changes` job decides which jobs run; the jobs use `if:`, so a skipped job counts as passed if branch
      protection is added later (separate workflows with `paths:` would leave a required check pending).
- [ ] The backend job runs when `src-tauri/**`, `src/lib/security/pathPolicy.json` (read by `include_str!`),
      `scripts/build-cli.mjs` or the workflow change.
- [ ] The frontend jobs run unless every change is Rust only (`*.rs`, `Cargo.toml`, `Cargo.lock`,
      `src-tauri/crates/**`): frontend tests and `vite.config.ts` read files under `src-tauri`.
- [ ] On push to `master` every job runs. The `paths-ignore` for docs stays.
- [ ] A third-party action, if used, is pinned by commit SHA.

**Verification:** a test PR touching only `src/` skips the backend job; one touching only a `.rs` file skips the
frontend jobs; the push to `master` runs all.

### E01-15 — Close-out: Phase 0 baseline

```yaml
id: E01-15
depends-on: [E01-01, E01-02, E01-03, E01-04, E01-05, E01-06, E01-07, E01-08, E01-09, E01-10, E01-11, E01-12, E01-13, E01-14, E01-16, E01-17, E01-18, E01-19, E01-20, E01-21, E01-22, E01-23, E01-24, E01-25]
refs: [F0]
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E02 — Phase 0: identity isolation and Terax neutralisation

```yaml
id: E02
depends-on: [E01]
refs: [identity, ADR-008, F0, 13.2:21, 16:26, .docs/plan/analysis/build-identity.md, .docs/plan/analysis/agents.md, .docs/plan/analysis/backend-core.md, .docs/plan/analysis/decisions.md]
```

lut never shares data, hooks, env vars, control server, cache dirs or updater with a Terax installation. Removes the
updater and autostart plugins, the Nix and CodeRabbit configs and the unwired git agent-task backend, and moves every
shared identifier to lut's names (`dev.lucode.lut`, `lut`, `lut-cli`, `LUT_`, `<cache>/dev.lucode.lut`).

### E02-01 — Remove the autostart plugin

```yaml
id: E02-01
depends-on: [E01-02, E01-14]
refs: [8.5, .docs/plan/analysis/decisions.md, .docs/plan/analysis/_review.md]
covers: [build-identity/capabilities, build-identity/node-package, build-identity/cargo-manifest, backend-core/app-entry]
type: task
scope: be
size: S
```

**Goal:** lut does not register itself to start with the OS (decision 15); the autostart plugin and its setting are removed.

**Acceptance criteria:**

- [ ] `tauri-plugin-autostart` removed from `src-tauri/Cargo.toml:140` and `src-tauri/src/lib.rs:207`; `@tauri-apps/plugin-autostart` removed from `package.json`.
- [ ] `autostart:*` permissions removed from `src-tauri/capabilities/default.json` and `desktop.json`.
- [ ] The `autostart` preference (`src/modules/settings/store.ts:142,237,333,446,688,1011`) and the toggle in `src/settings/sections/GeneralSection.tsx:54,105,159-184,609` removed; a stored `autostart` key is ignored on load.

**Verification:** `pnpm check-types && pnpm test && pnpm knip`; `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`; `pnpm tauri dev` starts with no capability errors in the log.

**Notes:** Users who enabled autostart under Terax are unaffected (lut never touches Terax's registration).

### E02-02 — Remove the Nix flake and the Terax CodeRabbit config

```yaml
id: E02-02
depends-on: [E01-14]
refs: [F0:5, 16:26, .docs/plan/analysis/decisions.md]
covers: [build-identity/nix-package, build-identity/coderabbit]
type: task
scope: none
size: XS
```

**Goal:** no file in the repo distributes Terax binaries or configures Terax's external services (decisions 21e, 21f).

**Acceptance criteria:**

- [ ] `flake.nix`, `flake.lock` and `nix/` deleted.
- [ ] `.coderabbit.yaml` deleted.
- [ ] `git grep -n "releases/download"` returns nothing outside `.docs/`.

**Verification:** `pnpm install --frozen-lockfile && pnpm build` unaffected.

**Out of scope:** a lut Nix package (F7, "possible proposal to review") and a lut CodeRabbit config (going public, E04).

### E02-03 — Move git_watch/git_unwatch out of the review commands module

```yaml
id: E02-03
depends-on: []
refs: [.docs/plan/analysis/ide-tools.md]
covers: [ide-tools/git-agent-tasks]
type: task
scope: be
size: XS
```

**Goal:** pure move so the agent-task backend can be deleted without breaking the live git watcher used by the Git panel (`src/modules/source-control/watchSourceControl.ts`).

**Acceptance criteria:**

- [ ] `git_watch`/`git_unwatch` (`src-tauri/src/modules/git/commands_review.rs:261-290`) and their helpers move to `git/commands.rs`; `lib.rs:375-376` registrations updated.
- [ ] No behaviour change; command names unchanged.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`; `pnpm tauri dev`, open the Git panel on a repo, commit from a terminal and the panel's change list refreshes.

### E02-04 — Remove the dead frontend git review models

```yaml
id: E02-04
depends-on: [E01-14]
refs: [F2:7, .docs/plan/analysis/ide-tools.md, .docs/plan/analysis/decisions.md]
covers: [ide-tools/git-frontend-review-models, ide-tools/git-frontend-api]
type: task
scope: ui
size: S
```

**Goal:** delete the frontend half of the unwired review/checkpoint feature (decision 23), including the dead wrappers of the frontend git API.

**Acceptance criteria:**

- [ ] `src/modules/git/hunks.ts`, `hunks.test.ts`, `scope.ts`, `scope.test.ts` deleted; `src/modules/git/index.ts:4-5` re-exports removed.
- [ ] Unused review/worktree/checkpoint/branch wrappers and types in `src/modules/git/api.ts` (~230-325) / `types.ts` (and their tests, e.g. `api.test.ts:170`) removed; wrappers used by source control, Git history, explorer status and `useGitBranch` are kept.
- [ ] No consumer outside `src/modules/git` changes; source control, history and explorer still compile.

**Verification:** `pnpm check-types && pnpm test && pnpm knip` show no new errors.

### E02-05 — Delete the unwired git agent-task backend

```yaml
id: E02-05
depends-on: [E02-03, E02-04, E01-14]
refs: [F0:10, .docs/plan/analysis/ide-tools.md, .docs/plan/analysis/decisions.md]
covers: [ide-tools/git-agent-tasks]
type: task
scope: be
size: XL
size-exception: mechanical deletion of ~14k lines (checkpoint/worktree/task/review modules and their interdependent test files) with no behaviour change to wired features
```

**Goal:** remove task worktrees, checkpoints, hunk review and branch commands that no UI calls (decision 23), which also eliminates `refs/terax`, `~/.terax`, `.terax/project.toml` and `TERAX_TASK/PORT/*` identity.

**Acceptance criteria:**

- [ ] The files of `ide-tools/git-agent-tasks` (checkpoint, worktree, task_worktree, task_state, project_config, commands_tasks, commands_review, review, diff, patch, branch and their `*_tests.rs`) deleted; registrations at `lib.rs:353-374` removed; `refs.rs` checkpoint prefix removed if unused.
- [ ] `src-tauri/tests/git_operations.rs` worktree/checkpoint cases removed or rewritten.
- [ ] The `--skip` list for the agent-task tests is removed from the CI workflow (added by E01-05), and the baseline entry is updated.
- [ ] `git grep -n -i "refs/terax\|\.terax/\|TERAX_PORT\|TERAX_TASK\|terax/worktrees" src-tauri` returns nothing.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` and `cargo clippy --all-targets --locked -- -D warnings` pass; app starts and the Git panel still refreshes its change list after a commit (`git_watch`).

### E02-06 — Change the bundle identifier to dev.lucode.lut

```yaml
id: E02-06
depends-on: [E01-02, E01-03]
refs: [identity, ADR-008, 13.2:21, .docs/plan/analysis/build-identity.md, .docs/plan/analysis/_review.md]
covers: [identity:1, ADR-008, build-identity/tauri-config, app-shell/budget-tests, build-identity/bench-app-lab]
type: task
scope: be
size: S
```

**Goal:** lut's app data, config, stores, window state and WebView storage (localStorage/IndexedDB) live under its own identifier, never Terax's `app.crynta.terax`.

**Acceptance criteria:**

- [ ] `identifier` in `src-tauri/tauri.conf.json:5` is `dev.lucode.lut`.
- [ ] Bench guard `src-tauri/src/modules/bench.rs:17-45` (and tests `:731-739`), `vite.config.ts:17-28` and `scripts/app-lab/run.py:58,216` use the new identifier and a lut bench identifier.
- [ ] `src/app/dist-budget.test.ts:313-318` updated in the same PR to assert that `dev.lucode.lut` is rejected as bench identifier (otherwise the test breaks).
- [ ] No code reads any Terax data dir or store (no import/migration, decision "no relationship with Terax"). The keychain is per OS user, not per bundle id, so the AI keychain service is handled separately by E02-15.

**Verification:** `pnpm test src/app`; `cargo test --manifest-path src-tauri/Cargo.toml --features bench bench`; launch the app and check that only a `dev.lucode.lut` dir appears under `%APPDATA%`/`%LOCALAPPDATA%` (platform equivalent elsewhere) and that Terax's dirs keep their mtime.

### E02-07 — Rename the executable, productName and file-association name to lut

```yaml
id: E02-07
depends-on: [E02-06]
refs: [ADR-008, identity, 13.2:21, .docs/plan/analysis/build-identity.md, .docs/plan/analysis/plan-review.md]
covers: [build-identity/cargo-manifest, build-identity/node-package, build-identity/tauri-config, identity:1]
type: task
scope: be
size: M
```

**Goal:** the built executable, the installer and the Windows registrations are lut's, so installing or uninstalling lut never
overwrites or removes Terax's installation. On Windows the NSIS install dir, Start-menu entry, uninstall registry key and
file-association ProgIDs derive from `productName`, and the bundled exe name derives from `productName`/`mainBinaryName`
(Tauri 2), so these are identity, not branding.

**Acceptance criteria:**

- [ ] `src-tauri/Cargo.toml` package name, bin name and `default-run` are `lut` (lib/crate names stay; rename on touch); `Cargo.lock` regenerated.
- [ ] `package.json` `name` is `lut`.
- [ ] `src-tauri/tauri.conf.json:3` `productName` is `lut` and an explicit `mainBinaryName: "lut"` is set.
- [ ] `bundle.fileAssociations[0].name` (`tauri.conf.json:98-113`) is `lut Document` (the extension list is kept, decision 2: the editor stays); the user is asked in the PR whether to reduce the list.
- [ ] Every path that launches the executable by name (`src-tauri/installer-hooks.nsh` `terax.exe`, `src-tauri/src/modules/control.rs:927`, `scripts/`) points to `lut.exe`; Explorer verb registry keys are left to E04-02.

**Verification:** `pnpm tauri build` produces `lut.exe` (Windows) / `lut` (macOS/Linux bundle) and an NSIS installer that installs into a `lut` directory with a `lut` Start-menu entry and uninstall key; `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` passes. With Terax installed, installing and uninstalling lut leaves Terax's install dir, Start-menu entry, uninstall key and file associations unchanged (regedit).

### E02-08 — Move the control descriptor to lut's cache dir and deny it in the read policy

```yaml
id: E02-08
depends-on: []
refs: [F0:10, identity:1, 9.2, .docs/plan/analysis/agents.md, .docs/plan/analysis/ide-tools.md, .docs/plan/analysis/_review.md]
covers: [agents/control-server, ide-tools/fs-read-policy, F0:10]
type: task
scope: be
size: S
```

**Goal:** lut's control server never shares (or overwrites) Terax's `<cache>/terax/control.json`, and the fs read commands can never read lut's control token. Both changes land in one PR to avoid a window where the token is readable.

**Acceptance criteria:**

- [ ] One shared function returns lut's runtime dir `<cache>/dev.lucode.lut` (owner decision: the bundle identifier, because `<cache>/lut` is `%LOCALAPPDATA%\lut` on Windows, the NSIS install dir); `control.rs:755-768` writes the descriptor there and the launcher dir becomes `<cache>/dev.lucode.lut/run/<pid>/bin` (`control.rs:910-943`).
- [ ] The CLI fallback (`crates/terax-cli/src/lib.rs:300`) reads `<cache>/dev.lucode.lut/control.json`.
- [ ] `src-tauri/src/modules/fs/read_policy.rs:15` denies `<cache>/dev.lucode.lut` and still denies `<cache>/terax`; tests cover both, including an aliased/relocated cache path.
- [ ] Nothing in lut writes under `<cache>/terax`.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`; with lut running, `<cache>/dev.lucode.lut/control.json` exists and `<cache>/terax/control.json` (if any) is unchanged; an `asset_grant` on the descriptor is refused.

### E02-09 — Rename child-process and CLI env vars from TERAX_ to LUT_

```yaml
id: E02-09
depends-on: [E02-08]
refs: [F0:10, 13.2:21, 7.3, .docs/plan/analysis/agents.md, .docs/plan/analysis/backend-core.md, .docs/plan/analysis/_review.md]
covers: [agents/cli-sidecar, backend-core/shell-integration-scripts, F0:10]
type: task
scope: be
size: M
```

**Goal:** lut panes and lut's CLI only export and read `LUT_*` variables, in one atomic PR (the CLI reads what `shell_init.rs` exports), so Terax tooling cannot attach to lut panes and vice versa.

**Acceptance criteria:**

- [ ] `TERAX_CONTROL_ADDR/TOKEN`, `TERAX_PANE_ID`, `TERAX_CLI`, `TERAX_TERMINAL`, `TERAX_USER_ZDOTDIR`, `TERAX_WSL_LOGIN_SHELL`, `TERAX_HOOK_TIMEOUT/WAIT/DEBUG` renamed to `LUT_*` in the CLI (`hook.rs:55-69`, `lib.rs:107,285-286`), `pty/shell_init.rs:195-219`, `pty/session.rs`, all `pty/scripts/*` and the hook/Pi templates in `agent.rs` (`$TERAX_CLI`, `$env:TERAX_CLI`, `process.env.*`); `__TERAX_HOOKS_LOADED` guards renamed.
- [ ] Inherited `TERAX_*` variables are removed from the child environment (lut launched from a Terax pane).
- [ ] The `terax` shell functions that wrap the CLI (`bashrc.bash`, `zshrc.zsh`, `init.fish`, `profile.ps1`) become `lut`, matching the `lut` launcher E02-07 puts on each pane's PATH.
- [ ] `TERAX_BLOCKS` is renamed too unless command-blocks mode is already removed (E06).
- [ ] A unit test asserts that no exported PTY variable starts with `TERAX_`; script tests (`bashrc.test.bash`, `zshrc.test.py`) updated.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`; `bash src-tauri/src/modules/pty/scripts/bashrc.test.bash`; in a lut pwsh pane `Get-ChildItem env:TERAX*` returns nothing and `lut-cli ping` (or the current CLI name) reaches the control server.

### E02-10 — Move the shell-integration install dir to lut's cache dir

```yaml
id: E02-10
depends-on: [E02-09]
refs: [F0:10, identity:1, .docs/plan/analysis/backend-core.md]
covers: [backend-core/shell-integration-launch, F0:10]
type: task
scope: be
size: S
```

**Goal:** lut never reads or overwrites Terax's shell-integration scripts.

**Acceptance criteria:**

- [ ] Unix, Windows and WSL integration roots move from `~/.cache/terax/shell-integration` to `<cache>/dev.lucode.lut/shell-integration` (`shell_init.rs:449,857,912`); fish conf.d file `terax.fish` renamed `lut.fish` (`:476,:904`); temp suffix `.__terax_tmp__` renamed.
- [ ] Unit tests with `/cache/terax/...` paths updated.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml shell_init`; open a pwsh and a WSL pane: scripts exist only under the lut dir and `~/.cache/terax` is untouched (mtime).

### E02-11 — Make lut hook markers distinct and never touch Terax hooks

```yaml
id: E02-11
depends-on: [E02-09]
refs: [F0:10, 13.2:21, 16:26, 13.2:15, .docs/plan/analysis/agents.md, .docs/plan/analysis/backend-core.md, .docs/plan/analysis/_review.md]
covers: [backend-core/agent-detect, backend-core/app-entry, agents/hook-installer, 13.2:21, 16:26]
type: task
scope: be
size: M
```

**Goal:** agent markers and hook entries written by lut are distinguishable from Terax's, so installing/uninstalling lut hooks preserves Terax's and third-party hooks, and Terax hook events are never taken as lut events.

**Acceptance criteria:**

- [ ] OSC 777 marker `notify;Terax;` (`agent_detect.rs:35,421`, `agent.rs:644,1058`) replaced by a lut marker; the `__terax_notify` argv subcommand (`lib.rs:169-180`) and its emitter renamed in the same PR; control-server log text (`lib.rs:244`) says lut.
- [ ] Hook ownership marker uses `LUT_CLI`; Gemini hook name `lut` (`agent.rs:318`); Pi file/family `lut-notifications.ts` / `lut-pi-notifications-v*` (`agent.rs:136,184,1301`); temp suffix `.lut-tmp-` (`agent.rs:552,1221`).
- [ ] `LEGACY_MARKERS` (`agent.rs:255`) no longer matches Terax entries: lut never edits or removes them.
- [ ] Tests: a config containing Terax groups (current and legacy markers) plus third-party groups is byte-identical outside lut's groups after lut install + uninstall; the Terax OSC marker is ignored by `agent_detect`.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml agent` including the new coexistence tests.

### E02-12 — Rename the CLI sidecar to lut-cli

```yaml
id: E02-12
depends-on: [E02-07, E02-09]
refs: [F0:10, identity, ADR-008, .docs/plan/analysis/agents.md, .docs/plan/analysis/_review.md]
covers: [agents/cli-sidecar, agents/control-protocol, build-identity/cargo-manifest, build-identity/tauri-config]
type: task
scope: be
size: S
```

**Goal:** lut ships its own sidecar `lut-cli` and PATH launcher `lut`, never `terax-cli`/`terax`.

**Acceptance criteria:**

- [ ] `scripts/build-cli.mjs:50-81` outputs `src-tauri/binaries/lut-cli-<triple>` (env `LUT_CLI_TARGET`); CLI binary name in `crates/terax-cli/Cargo.toml:13`; `externalBin` in `tauri.conf.json:38-40`; `build.rs:15`.
- [ ] `find_bundled_cli` (`control.rs:805-829`) and the launcher name (`control.rs:927,946`) use `lut-cli`/`lut`.
- [ ] Shell wrapper functions (`bashrc.bash:35`, `profile.ps1`, `zshrc.zsh`, `init.fish`) expose `lut`, not `terax`.
- [ ] User-visible protocol string "Denied in Terax" (`crates/terax-control-protocol/src/render.rs:46`) says lut; crate names stay (rename on touch).

**Verification:** `pnpm build:cli` produces `src-tauri/binaries/lut-cli-<triple>`; `pnpm tauri build` bundles it; `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`; in a lut pane `lut ping` works and `terax` is not defined.

### E02-13 — Audit outbound network calls and drop the terax.ai provider headers

```yaml
id: E02-13
depends-on: [E01-02, E02-02]
refs: [F0:5, ADR-004, 9.9, .docs/plan/analysis/build-identity.md, .docs/plan/analysis/decisions.md]
covers: [F0:5]
type: task
scope: ui
size: S
```

**Goal:** a committed list of every outbound network call, its owner and its fate in lut. Calls to Terax services are gone or
linked to the issue that removes them, and the BYOK AI no longer identifies itself as Terax to providers (decision 25).

**Acceptance criteria:**

- [ ] `.docs/` gains a network audit table (call, file:line, target, decision) re-checked against the code.
- [ ] The `HTTP-Referer: https://terax.ai` and `X-Title: Terax` headers sent to AI providers (`src/modules/ai/lib/agent.ts:158-159`) are removed in this PR (decision 25); the rest of the BYOK AI is removed by E05.
- [ ] Every other call to a Terax service (updater: E01-02) is removed or linked to its removing issue.
- [ ] Confirms there is no telemetry, CDN or remote font.

**Verification:** `pnpm check-types && pnpm test`; `git grep -n -E "fetch\(|reqwest|https://" src src-tauri/src` reproduces the table; `git grep -n "terax.ai" src src-tauri/src` returns nothing; reviewer cross-checks.

**Notes:** The `HTTP-Referer`/`X-Title` criterion is met by E05: the AI code that sent them was deleted (#358). The audit table and the no-telemetry check remain.

### E02-14 — Rename persisted store files and webview storage keys to lut

```yaml
id: E02-14
depends-on: [E02-06]
refs: [identity, F0:10, .docs/plan/analysis/state-settings.md, .docs/plan/analysis/_review.md]
covers: [F0:10, identity:1]
type: task
scope: ui
size: S
```

**Goal:** No persisted lut state uses a Terax file or key name (former state-settings-D01). lut starts clean: nothing is read
from or migrated out of Terax files.

**Acceptance criteria:**

- [ ] `terax-settings.json`, `terax-spaces.json` and `terax-custom-themes.json` renamed to `lut-*` (constants in
      `src/modules/settings/store.ts:225`, `src/modules/spaces/lib/store.ts:21`, `src/modules/theme/customThemes.ts:5`).
- [ ] localStorage theme shadow keys renamed consistently in `ThemeProvider.tsx:47-48`, `preferences.ts:17-18`,
      `settings.html:11` **and `index.html:11`** in the same PR (otherwise the main window pre-paint reads a key that is never
      written and the theme flashes).
- [ ] IndexedDB name in `bgImageStore.ts:1` renamed.
- [ ] No code reads a `terax-*` file or key (no migration from Terax).

**Verification:** `pnpm test`; `rg -n "terax-(settings|spaces|custom-themes|ui-|bg-images)" src settings.html index.html`
returns nothing; launch the app and check the app data dir contains only `lut-*` store files.

### E02-15 — Stop lut from reading Terax's AI keychain service

```yaml
id: E02-15
depends-on: []
refs: [identity, 13.2:21, 16:26, .docs/plan/analysis/ai.md, .docs/plan/analysis/plan-review.md]
covers: [identity:1, F0:10]
type: task
scope: ui
size: XS
```

**Goal:** until E05 removes the BYOK AI, lut must not read Terax's API keys. `useAiBootstrap` (mounted in `App.tsx`) calls
`getAllKeys()` at startup with `KEYRING_SERVICE = "terax-ai"` (`src/modules/ai/config.ts:1`, `lib/keyring.ts:34`), and the
OS keychain is per user, not per bundle id, so a lut started next to Terax reads Terax's keys. Smallest change: lut uses
its own service name.

**Acceptance criteria:**

- [ ] `KEYRING_SERVICE` is `"lut-ai"`; every `secrets_*` call in `src/modules/ai/lib/keyring.ts` uses it.
- [ ] Nothing reads, migrates or deletes entries of the `terax-ai` service (decision "no relationship with Terax": old entries are left alone).
- [ ] A unit test asserts the service name used by the keyring wrappers is not `terax-ai`.

**Verification:** `pnpm check-types && pnpm test`; `git grep -n -E 'KEYRING_SERVICE = "terax-ai"|service: *"terax-ai"' src src-tauri/src` returns nothing; manual: with a `terax-ai` entry in the Windows Credential Manager, lut starts with no API key configured.

**Notes:** Closed without a PR: E05 removed the BYOK AI, `keyring.ts`, the `secrets_*` commands and the `keyring` dependency (#358, #359), so nothing in lut reads the OS keychain.

**Notes:** the AI store files (`terax-ai-*.json`) live in lut's own app data dir after E02-06 and are deleted with the AI (E05), so they are not renamed here.

### E02-18 — Remove the uncalled fs_grep, fs_glob and git_show_commit commands

```yaml
id: E02-18
depends-on: [E01-14]
refs: [.docs/architecture/current-state.md, .docs/plan/analysis/ide-tools.md]
covers: [ide-tools/fs-search-index, ide-tools/git-backend-core]
type: task
scope: be
size: S
```

**Goal:** dead-code cleanup found by the IPC map (E01-07): three registered commands that nothing in the frontend calls. The palette's content search uses `fs_grep_interactive`, which stays.

**Acceptance criteria:**

- [ ] `fs_grep` and `fs_glob` (`src-tauri/src/modules/fs/grep.rs`) and their registrations in `lib.rs` are removed, with `run_grep`, `run_glob` and any helper or type (`GlobHit`, `GlobResponse`) only they use; their cases in `src-tauri/tests/fs_search.rs` go with them. `fs_grep_interactive` and its tests are unchanged.
- [ ] `git_show_commit` (`src-tauri/src/modules/git/commands.rs`), its registration, `operations::show_commit_diff` if unused, and the unused `git.showCommit` wrapper in `src/modules/git/api.ts` are removed.
- [ ] `.docs/architecture/current-state.md` no longer lists the three commands.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`, `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings`, `pnpm check-types` and `pnpm test` pass; `git grep -n -w "fs_grep\|fs_glob\|git_show_commit\|showCommit" src src-tauri` is empty; the palette's content search still returns results.

### E02-17 — Close-out: identity isolation

```yaml
id: E02-17
depends-on: [E02-01, E02-02, E02-03, E02-04, E02-05, E02-06, E02-07, E02-08, E02-09, E02-10, E02-11, E02-12, E02-13, E02-14, E02-15, E02-18]
refs: []
type: closeout
scope: none
size: XS
covers: []
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E03 — Phase 0: licensing, provenance and project docs

```yaml
id: E03
depends-on: [E01]
refs: [ADR-001, 14.3, 14.4, 15, .docs/plan/analysis/build-identity.md]
```

Meet the Apache-2.0 obligations inherited from Terax, give lut a README with the Terax credit note, and set up the ADR
process and requirements traceability.

### E03-01 — Write the lut README with first run, contribution and Terax credit

```yaml
id: E03-01
depends-on: [E01-01]
refs: [ADR-001, 14.3, 14.4, 15, .docs/origin-terax/README.md]
covers: [ADR-001, 14.3:1, 14.4:1, 15:8]
type: task
scope: none
size: S
```

**Goal:** The repository has a root `README.md` for lut that explains what it is, how to run it the first time and how to contribute, with a `> [!NOTE]` crediting Terax as the origin.

**Acceptance criteria:**

- [ ] Root `README.md` exists: short description, first run (pointing to the build doc of E01), contribution section (issue/PR flow, link to the PR template).
- [ ] A `> [!NOTE]` states that lut started from Terax, links the Terax repository and gives the origin SHA, recorded only as provenance/attribution data.
- [ ] Technical base stated per ADR-001 (Tauri 2 + React/TS, Ghostty WASM renderer, portable-pty); no claim of compatibility with Terax.

**Verification:** render `README.md` in a Markdown preview; the note, link and SHA are present and match the import provenance.

### E03-02 — Verify and complete license and modification notices

```yaml
id: E03-02
depends-on: [E03-01]
refs: [14.3, F0, .docs/plan/analysis/build-identity.md]
covers: [F0:2, 14.3:2, 14.3:3, 14.3:4, 16:25]
type: task
scope: none
size: S
```

**Goal:** The repo and every shipped bundle carry Terax's Apache-2.0 license, the modification notice (Apache-2.0 §4b) and the licenses of Ghostty/restty, xterm.js-derived code and other bundled components.

**Acceptance criteria:**

- [ ] Terax's Apache-2.0 license kept (`LICENSE`); a lut `NOTICE` states that derived files were modified from Terax and includes Terax's notices, if any.
- [ ] Inventory of bundled third-party components and their licenses (Ghostty/restty, xterm.js-derived code, `public/licenses/*`, fonts) recorded in `.docs/licensing.md`, with each license file present in the repo.
- [ ] The built bundle includes `public/licenses/terax.txt` and the terminal licenses (as dist files or bundle resources).
- [ ] The generated third-party notices file for Rust/npm dependencies is recorded as deferred to F7 (decision 21g).

**Verification:** `pnpm tauri build`; inspect the Windows installer/app resources for the license files; README still has the credit note.

### E03-03 — Set up the ADR process and record ADR-001

```yaml
id: E03-03
depends-on: []
refs: [15, ADR-001]
covers: [15:5, ADR-001]
type: task
scope: none
size: XS
```

**Goal:** `.docs/decisions/` exists with a template and the rule of when an ADR is required (IR-41), seeded with the technical-base decision.

**Acceptance criteria:**

- [ ] `.docs/decisions/README.md` explains numbering, status and when an ADR is mandatory (contract, persisted model or platform constraint change).
- [ ] `.docs/decisions/0000-template.md` and ADR-001 (technical base) recorded, referring to `.docs/proposal.md` instead of copying it.

**Verification:** files present; links resolve.

### E03-04 — Document the provenance and change policy

```yaml
id: E03-04
depends-on: [E03-01]
refs: [14.4]
covers: [14.4:2, 14.4:3, 14.4:4]
type: task
scope: none
size: XS
```

**Goal:** Contributors know lut has no upstream: Terax fixes are ported manually as lut changes with their own test, code may be freely renamed/moved/rewritten, and visual changes are committed separately from engine changes.

**Acceptance criteria:**

- [ ] `.docs/development/provenance.md` (linked from the README contribution section) states the three rules of §14.4.
- [ ] The rule "visual customisation and engine (PTY/renderer/control protocol) changes in separate commits" is also referenced by the change-control document of E01.

**Verification:** document present and linked from `README.md`.

### E03-05 — Create the requirements traceability document

```yaml
id: E03-05
depends-on: [E03-03]
refs: [15, .docs/plan/plan.md]
covers: [15:7]
type: task
scope: none
size: S
```

**Goal:** Every TER/PRO/PRJ/UX/AGT requirement id maps to the issues that implement it and the tests that verify it.

**Acceptance criteria:**

- [ ] `.docs/product/requirements.md` lists every requirement id of `.docs/proposal.md` with priority, owning epic/issue (from `.docs/plan/plan.md`), implementation location (filled when done) and test(s).
- [ ] Generated or checked by a script under `.docs/plan/tools/` so ids cannot drift from `inventory/proposal-items.json`.

**Verification:** `node .docs/plan/tools/validate.mjs` passes and the traceability check reports no missing ids.

### E03-06 — Close-out: licensing and docs

```yaml
id: E03-06
depends-on: [E03-01, E03-02, E03-03, E03-04, E03-05]
refs: [14.3, 15]
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E04 — Phase 0: user-visible names and going public

```yaml
id: E04
depends-on: [E02, E03, E01]
refs: [identity, .docs/plan/analysis/decisions.md, .docs/plan/analysis/build-identity.md]
```

Simple text replaces so every user-visible name says lut (binary, installer, publisher, window titles, About, CLI help),
then make the repository public with a history secret scan, a lut CodeRabbit config and branch protection on `master`.
Internal identifiers, logo/icons and design are out of scope (decision 22).

### E04-01 — Rename the product descriptions, copyright and publisher to lut

```yaml
id: E04-01
depends-on: [E02-07]
refs: [identity, .docs/plan/analysis/build-identity.md]
covers: [identity:2]
type: task
scope: be
size: XS
```

**Goal:** The installer and bundle metadata describe lut. The executable, `productName`, `mainBinaryName` and the file-association name are already lut (E02-07, identity isolation).

**Acceptance criteria:**

- [ ] `src-tauri/Cargo.toml` package `description` uses lut; `tauri.conf.json` `longDescription`, `shortDescription`, `copyright` and `publisher` describe lut (Terax attribution stays in `NOTICE`).
- [ ] Publisher and copyright holder are **lucode** (owner decision): `publisher: "lucode"`, so the installer's manufacturer key is `HKCU\Software\lucode\lut` instead of Terax's `Crynta`; `Cargo.toml` `authors` too.
- [ ] Internal crate/lib names (`terax_lib`, `terax-control-protocol`) are not renamed here.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml`; `pnpm tauri build`; the installer's properties and the Windows "Apps" entry show lut's description and publisher.

### E04-02 — Rename the Windows Explorer verbs to lut-owned keys

```yaml
id: E04-02
depends-on: [E02-07]
refs: [identity, 13.2:21, .docs/plan/analysis/build-identity.md]
covers: [build-identity/windows-installer-hooks]
type: task
scope: be
size: XS
```

**Goal:** The "Open in" Explorer verbs use lut-owned registry keys, the label "Open in lut" and `lut.exe`, so installing or uninstalling lut never touches another app's keys.

**Acceptance criteria:**

- [ ] `src-tauri/installer-hooks.nsh` writes `HKCU\Software\Classes\{Directory,Directory\Background,Drive}\shell\OpenInLut` pointing to `lut.exe "%V"`; uninstall deletes only those keys.
- [ ] The launch argument still reaches `parse_launch_target` (`src-tauri/src/lib.rs:67-80`).

**Verification:** install the NSIS bundle; right-click a folder, "Open in lut" opens lut there; uninstall removes only the `OpenInLut` keys (regedit).

### E04-03 — Replace Terax with lut in window titles and in-app texts

```yaml
id: E04-03
depends-on: []
refs: [identity, .docs/plan/analysis/app-shell.md, .docs/plan/analysis/state-settings.md]
covers: [identity:2]
type: task
scope: ui
size: S
```

**Goal:** Window titles, the About section, dialogs (e.g. "Quit Terax?"), the BYOK AI texts and other user-visible strings say lut. Simple text replaces only; no visual change, so no design dependency (decision 22). The repo can go public before E05 removes the AI, so its visible texts are replaced too (decision 25).

**Acceptance criteria:**

- [ ] `tauri.conf.json` window `title`, **`src-tauri/tauri.windows.conf.json:14` `title`** (it overrides `tauri.conf.json` on Windows), `index.html`/`settings.html` titles and `useWindowTitle` APP_NAME read "lut".
- [ ] `src/app/components/CloseDialogs.tsx`, `src/modules/agents/components/NotificationBell.tsx`, `src/modules/lsp/components/LspStatusPill.tsx`, `src/settings/components/LspInstallDialog.tsx` and the About section (`AboutSection.tsx`) say lut; About links point to the lut repository.
- [ ] BYOK AI user-visible texts say lut (decision 25): "Ask Terax anything" (`AiComposerInput.tsx:260`), `AiMiniWindow.tsx:546`, "Terax finished" / "Terax needs your approval" (`LocalAgentNotificationsBridge.tsx:66-70`) and any other visible AI string found by the grep below. Files already deleted by E05 (no order between E04 and E05) are skipped.
- [ ] AI texts left after E05: the About tagline "Open-source AI-native terminal emulator" (`AboutSection.tsx`) and the `AI` shortcut group (`shortcuts.ts`), which only holds `agent.focusAttention`, are replaced.
- [ ] The updater UI is already deleted (E01-02) and is not touched.

**Verification:** `pnpm check-types && pnpm test`; `git grep -n "Terax" -- src src-tauri/*.conf.json index.html settings.html` returns only internal identifiers (listed in the PR); manual on Windows: the window title reads lut.

### E04-04 — Replace Terax with lut in CLI help and messages

```yaml
id: E04-04
depends-on: [E02-12]
refs: [identity, .docs/plan/analysis/agents.md]
covers: [identity:2]
type: task
scope: be
size: XS
```

**Goal:** The hooks CLI's help, usage and error messages refer to lut.

**Acceptance criteria:**

- [ ] `src-tauri/crates/terax-cli` command name/about/help strings and printed messages say lut / `lut-cli`; crate and module names unchanged.
- [ ] Tests asserting the old strings updated.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --workspace`; `lut-cli --help` shows lut.

### E04-05 — Replace Terax with lut in macOS plist strings

```yaml
id: E04-05
depends-on: []
refs: [identity, .docs/plan/analysis/build-identity.md]
covers: [build-identity/macos-plists]
type: task
scope: be
size: XS
```

**Goal:** macOS permission prompts name lut; entitlements stay as they are (decision 21d).

**Acceptance criteria:**

- [ ] `src-tauri/Info.plist` camera/microphone usage strings (`:6,8`) say lut and describe programs run in the terminal.
- [ ] `src-tauri/entitlements.plist` unchanged.

**Verification:** the plist still parses: `python -c "import plistlib; plistlib.load(open('src-tauri/Info.plist','rb'))"` (any OS; `plutil -lint` on a Mac if available). macOS CI jobs come later with E24-01.

### E04-06 — Audit that no user-visible name says Terax

```yaml
id: E04-06
depends-on: [E04-01, E04-02, E04-03, E04-04, E04-05]
refs: [identity, .docs/plan/analysis/decisions.md]
covers: [identity:2]
type: task
scope: none
size: XS
```

**Goal:** Confirm the go-public precondition of decision 22: binary, bundle id, productName, window titles, About, installer, CLI help and publisher say lut.

**Acceptance criteria:**

- [ ] A `git grep -in terax` review (including `src-tauri/tauri.windows.conf.json` and `bundle.fileAssociations`) classifies every remaining hit as internal identifier, logo/icon/design (later), provenance/license, or bug; bugs are fixed or added to `plan.md`. User-visible text of code that a later epic removes (BYOK AI, command blocks) is **not** an accepted class: it must say lut (decision 25).
- [ ] Brand casing (IR-02): `git grep -n -E "\bLUT\b|\bLuT\b|\bluT\b"` outside env-var names (`LUT_*`) returns nothing user-visible.
- [ ] Old working name (IR-04): `git grep -n -i "Terminal Workspace"` returns nothing outside `.docs/proposal.md`.
- [ ] Manual run of the Windows installer and app shows lut everywhere listed above, including the window title and the "Open with" file-association name.

**Verification:** `pnpm tauri build`, install, launch; checklist recorded in the PR.

### E04-07 — Scan the git history for secrets

```yaml
id: E04-07
depends-on: []
refs: [.docs/plan/analysis/decisions.md]
covers: [14.1:4]
type: task
scope: none
size: XS
```

**Goal:** No secret (keys, tokens, signing material) exists anywhere in the history before the repository becomes public.

**Acceptance criteria:**

- [ ] Full-history scan run (e.g. `gitleaks detect --log-opts="--all"`); findings triaged and recorded in the PR.
- [ ] Any real secret is revoked, and a history rewrite (if needed) is agreed with the user before going public.

**Verification:** the scan reports no unresolved findings.

### E04-08 — Add the lut CodeRabbit configuration

```yaml
id: E04-08
depends-on: [E02-02, E01-06, E04-09]
refs: [.docs/plan/analysis/decisions.md]
covers: [ADR-007]
type: task
scope: none
size: XS
```

**Goal:** A lut-specific `.coderabbit.yaml` (decision 21f) reviews PRs once the repository is public. It comes after
E04-09: CodeRabbit is free only for public repositories, so it cannot be enabled while the repository is private.

**Acceptance criteria:**

- [ ] `.coderabbit.yaml` written for lut: English reviews, path filters excluding lockfiles and committed WASM, review instructions pointing to `.docs/development/change-control.md`.
- [ ] No Terax-specific settings.
- [ ] CodeRabbit app enabled for the repository; a PR opened after the change gets a CodeRabbit review.

**Verification:** the file validates against CodeRabbit's published schema (`https://coderabbit.ai/integrations/schema.v2.json`, e.g. with `npx ajv-cli validate` after converting the YAML to JSON); result recorded in the PR.

### E04-09 — Make the repository public and protect master

```yaml
id: E04-09
depends-on: [E04-06, E04-07, E04-10, E01-05, E03-01, E03-02]
refs: [.docs/plan/analysis/decisions.md]
covers: [ADR-007]
type: task
scope: none
size: XS
```

**Goal:** The repository becomes public at the end of Phase 0 with `master` protected.

**Acceptance criteria:**

- [ ] Repository visibility set to public (`gh repo edit --visibility public --accept-visibility-change-consequences`).
- [ ] Branch protection on `master`: PR required, required CI checks from the CI workflow, no force pushes or deletion.
- [ ] CodeRabbit is set up afterwards by E04-08 (free only for public repositories).

**Verification:** `gh api repos/{owner}/{repo}/branches/master/protection` shows the rules; a direct push to `master` is rejected.

### E04-10 — Assemble the Phase 0 deliverable report

```yaml
id: E04-10
depends-on: [E01-08, E01-14, E04-13, E03-02]
refs: [F0, 15]
covers: [F0:entregable]
type: task
scope: none
size: XS
```

**Goal:** The Phase 0 deliverable exists as one summary before the repository goes public: reproducible build, baseline report,
test registry, dependency matrix, licensing strategy, identity isolated from Terax and Terax updater removed.

**Acceptance criteria:**

- [ ] `.docs/testing/baseline.md` gets a "Phase 0 deliverable" summary that links: the build doc (E01-01), the baseline and gate result (E01-03, E01-14), the test registry, the dependency matrix (E01-08), the licensing inventory (E03-02), the identity-isolation results (E04-13) and the updater removal (E01-02).
- [ ] Every link resolves; any missing part is added to `plan.md` as a blocking item of E04-09.

**Verification:** links resolve; manual review of the summary.

### E04-12 — Rename every remaining terax identifier to lut

```yaml
id: E04-12
depends-on: [E02-06, E02-07, E02-09, E02-10, E02-11, E02-12, E02-14, E04-03, E04-04]
refs: [identity:1, F0:10]
covers: [identity:1, F0:10]
type: task
scope: none
size: L
size-exception: Mechanical rename across the repo; split by area, the shell scripts, the wasm and the host would disagree on protocol names between PRs.
```

**Goal:** Nothing in lut's own code, scripts, assets or protocol is named terax any more. The issues this depends on
rename the identity (bundle id, executable, env vars, install dirs, hook markers, CLI, stores) and the user-visible
texts; this one renames what is left (about 1500 lines when it was written, E06-05).

**Acceptance criteria:**

- [ ] Shell integration: the `_terax_*` and `__terax_*` functions and variables in `pty/scripts/*`, and their tests.
- [ ] The OSC 133 prompt-end option `terax_blocks=0` (Bash before 4.4, no PS0) gets a lut name in `bashrc.bash` and in
      `packages/ghostty-core/adapted/wasm/src/terax.zig`; the wasm (`ghostty-vt.wasm`, `ghostty-vt-scalar.wasm`) is
      rebuilt and its build is recorded in `UPSTREAM.md`.
- [ ] Files and modules: `terax.zig`, `TeraxGhostty.ts`, the `terax-cli` and `terax-control-protocol` crates (unless
      E02-12 already renamed them), `terax-default` theme, `terax-terminal-symbols*` fonts, `terax-icon.png`.
- [ ] Code identifiers, CSS names, log prefixes (`[terax]`), temp-file prefixes and comments in `src`, `src-tauri`,
      `packages` and `scripts`.
- [ ] Kept on purpose and listed in the PR: credit and licence (`public/licenses/terax.txt`, README credit, notices),
      `.docs/origin-terax/`, and the places that must name Terax to stay apart from it (E02-11 hooks, E02-15
      keychain, E04-13 coexistence).

**Verification:** `git grep -i terax -- . ':!.docs'` returns only the kept list; `pnpm test`, `cargo test`, the
script tests (`bashrc.test.bash`, `zshrc.test.py`, `init.test.fish`) and `bashCommandStart.test.ts` pass; manual:
pwsh, bash and WSL prompts and cwd tracking still work, and old Bash still blocks injected commands.

### E04-13 — Verify coexistence with an installed Terax

```yaml
id: E04-13
depends-on: [E02-05, E02-06, E02-07, E02-10, E02-11, E02-12, E02-13, E02-14, E02-15, E04-02]
refs: [13.2:21, 16:26, F0:9, F0:10, .docs/plan/analysis/build-identity.md]
covers: [13.2:21, 16:26, F0:10, identity:1]
type: task
scope: none
size: S
```

**Goal:** (Moved from E02-16 so E02 can close; it needs E04-02, because until then the lut installer owns Terax's `OpenInTerax` keys.) Prove the acceptance tests 13.2:21 and 16:26: lut neither reads nor writes Terax data, stores, keychain entries, installer registrations, hooks or variables. Hook install/uninstall is not exercised: E20-15 removes every lut write to agent configs, so lut can never overwrite Terax's hooks (the F0:9 agent check moves to E20-15's manual test).

**Acceptance criteria:**

- [ ] `git grep -n -i` over the class (a) tokens of `.docs/plan/analysis/build-identity.md` (plus `notify;Terax;`, `.terax-tmp-`, `"name": "terax"`, `cache.join("terax")`) shows only intended leftovers (the read-policy deny of `<cache>/terax`, E06-owned block code, internal rename-on-touch names), each listed in the PR.
- [ ] Keychain: `git grep -n '"terax-ai"' src src-tauri/src` returns no keychain service name (only unrelated test strings, listed in the PR); nothing that runs at startup reads the `terax-ai` service.
- [ ] Installer: `productName`/`mainBinaryName` are `lut`; installing and uninstalling the lut NSIS bundle leaves Terax's install dir, Start-menu entry, uninstall key and file-association ProgIDs unchanged.
- [ ] Manual run on Windows with Terax installed: lut creates only its own data/cache dirs, Terax's dirs and `~/.claude`/`~/.codex` Terax entries keep their content, and no request goes to Terax infrastructure.
- [ ] Uninstalling lut leaves nothing behind: `NSIS_HOOK_POSTUNINSTALL` also deletes the manufacturer key (`HKCU\Software\lucode\lut` after E04-01) and the `lut Document_backup` values Tauri's file-association macro writes under each `HKCU\Software\Classes\.<ext>` (both left by the E04-02 install test).
- [ ] Results recorded in the PR and in the Phase 0 baseline report.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace && pnpm test`; the manual checklist above.

### E04-11 — Close-out: names and going public

```yaml
id: E04-11
depends-on: [E04-01, E04-02, E04-03, E04-04, E04-05, E04-06, E04-07, E04-08, E04-09, E04-10, E04-12, E04-13]
refs: [identity]
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E05 — Remove the built-in BYOK AI

```yaml
id: E05
depends-on: [E01, E02, E06]
refs: [ADR-004, 9.9, F2, .docs/plan/analysis/ai.md, .docs/plan/analysis/_review.md]
```

Decouple and delete the in-app BYOK AI (ADR-004, §9.9) without breaking CLI agents, hooks or the kept IDE tools. Order: move
shared helpers out of `modules/ai`, cut every call site, delete the frontend module, then the Rust modules, then dependencies.
The AI composer of `WorkspaceInputBar` and the "attach to AI chat" block action are deleted together with command blocks
(E06), so the frontend AI module is deleted after E06.

### E05-01 — Move shared native wrappers out of modules/ai

```yaml
id: E05-01
depends-on: []
refs: [9.9:4, F2:3, .docs/plan/analysis/ai.md]
covers: [ai/native-wrappers, F2:3, 9.9:4]
type: task
scope: ui
size: S
```

**Goal:** Non-AI code stops importing `native` from `@/modules/ai`. Pure refactor, no behaviour change.

**Acceptance criteria:**

- [ ] A neutral module (e.g. `src/lib/native/workspace.ts`) exposes `workspaceAuthorize`, `workspaceCurrentDir` and any other non-AI wrapper used outside `modules/ai`.
- [ ] `src/modules/spaces/lib/useSpacesBoot.ts:1`, `src/app/hooks/useWorkspaceSwitcher.ts:3`, `src/app/App.tsx:33` and `src/modules/explorer/lib/useGitStatus.ts:1` import from the neutral module.
- [ ] `src/modules/ai/lib/native.ts` keeps only AI-only wrappers (`ai_*`, `shell_session_*`, `shell_bg_*`, `fs_read_project_memory`).

**Verification:** `pnpm check-types` and `pnpm test` pass; `rg "modules/ai" src/modules/spaces src/modules/explorer src/app/hooks` is empty; manual: Spaces restore still authorizes restored cwds.

### E05-02 — Move the sensitive-path policy out of modules/ai

```yaml
id: E05-02
depends-on: []
refs: [14.1:4, .docs/plan/analysis/ai.md]
covers: [ai/path-policy]
type: task
scope: be
size: S
```

**Goal:** The read policy shared by the Rust fs read policy and the markdown preview no longer lives in the AI folder. Pure move.

**Acceptance criteria:**

- [ ] `security.ts`, `security.test.ts` and `pathPolicy.json` move to a neutral module (e.g. `src/lib/security/`).
- [ ] The `include_str!` path in `src-tauri/src/modules/fs/read_policy.rs:20` points to the new location.
- [ ] `src/modules/markdown/MarkdownPreviewPane.tsx:2` and `src/modules/markdown/lib/assetPath.test.ts:2` import `checkReadable` from the new module.
- [ ] Policy content unchanged (adding lut's own dirs is done by the read-policy identity work, not here).

**Verification:** `pnpm test` and `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` pass.

### E05-03 — Decouple markdown preview code blocks from the AI chat store

```yaml
id: E05-03
depends-on: []
refs: [F2:4, .docs/plan/analysis/ai.md]
covers: [ai/markdown-code]
type: task
scope: ui
size: S
```

**Goal:** Markdown preview code blocks work without `useChatStore`; the shared renderer leaves `components/ai-elements`.

**Acceptance criteria:**

- [ ] `markdown-code.tsx` (+test), `chat-code.tsx`, `chat-code-lezer.ts` and `shimmer.tsx` move into the markdown module.
- [ ] No import of `@/modules/ai` remains in them (`chat-code.tsx:5`); chat-only actions (e.g. "send to chat") are dropped.
- [ ] No visual change (the redesign comes later with the secondary-tools design).

**Verification:** `pnpm test` passes, including `markdown-code.test.tsx`; manual: markdown preview still highlights code.

### E05-04 — Separate localAgent state from the CLI agent store

```yaml
id: E05-04
depends-on: []
refs: [F2:5, 9.9:3, .docs/plan/analysis/agents.md]
covers: [agents/legacy-session-store, F2:5, 9.9:3]
type: task
scope: ui
size: S
```

**Goal:** `agentStore.ts` only holds CLI agent sessions and notifications; the BYOK `localAgent` state lives with the AI module so it disappears with it.

**Acceptance criteria:**

- [ ] `localAgent` and `setLocalAgent` (`agentStore.ts:13-26`) are removed from `src/modules/agents/store/agentStore.ts`; the AI side (`LocalAgentNotificationsBridge.tsx:3`) keeps its own state inside `modules/ai`.
- [ ] `NotificationBell.tsx` no longer reads `localAgent`; CLI agent notifications behave as before.
- [ ] `agentStore.test.ts` updated.

**Verification:** `pnpm check-types` and `pnpm test` pass; manual: a Claude Code hook event still shows in the notification bell.

### E05-05 — Remove CLI-agent review rounds that feed the AI chat

```yaml
id: E05-05
depends-on: []
refs: [AGT-003, 9.9:2, .docs/plan/analysis/_review.md]
covers: [agents/managed-agents]
type: task
scope: ui
size: S
```

**Goal:** Break the agents → AI dependency (review.ts imports chatStore/chatRuntime) before the AI module is deleted (_review.md cycle agents-D09 ↔ ai-D09, part a).

**Acceptance criteria:**

- [ ] `src/modules/agents/lib/review.ts` and `review.test.ts` are deleted, with their callers in `AgentNotificationsBridge.tsx`.
- [ ] `rg "modules/ai" src/modules/agents src/modules/control` is empty.
- [ ] `managedAgentsStore.ts` is left in place (still imported by the AI module; it is deleted in E05-13).

**Verification:** `pnpm check-types` and `pnpm test` pass; manual: Claude Code hook notifications still arrive.

### E05-06 — Unmount the BYOK AI from the app root

```yaml
id: E05-06
depends-on: [E05-01, E05-04]
refs: [9.9:1, 9.9:5, F2:4, 5.10:11, F1:6]
covers: [F2:4, 9.9:1, 9.9:5, 5.10:11]
type: task
scope: ui
size: M
```

**Goal:** `App.tsx` no longer mounts the BYOK chat; only providers really needed remain at the root.

**Acceptance criteria:**

- [ ] `AiComposerProvider` (`App.tsx:1694`), `useAiBootstrap` (`:369`), `useAiLiveBridge` (`:1410`), selection-ask hooks, `AgentRunBridge`, `LocalAgentNotificationsBridge`, `AiMiniWindow` and `SelectionAskAi` (`:1625-1637`) are removed from `App.tsx`.
- [ ] The `terax:ai-attach-file` dispatch (`App.tsx:575`) is removed.
- [ ] `useAppCloseGuard.ts:2,6` no longer imports `flushPersist`/sessions from `modules/ai`; busy-terminal confirmation unchanged.
- [ ] The silent hook-install path in `useAiLiveBridge.ts:131` disappears with the unmount; the explicit CLI-agent paths are untouched.
- [ ] CLI agent notifications still fire (hook events).

**Verification:** `pnpm check-types` and `pnpm test` pass; manual: app starts, terminals work, a Claude Code hook event still notifies, quitting with a busy terminal still asks for confirmation.

### E05-07 — Remove AI entry points from status bar, shortcuts and command palette

```yaml
id: E05-07
depends-on: [E05-06]
refs: [F1:6, F2:4, .docs/plan/analysis/ai.md]
covers: [5.10:11]
type: task
scope: ui
size: S
```

**Goal:** No status-bar control, shortcut or palette command opens the BYOK AI.

**Acceptance criteria:**

- [ ] `StatusBar.tsx:6-11` no longer imports `useChatStore`, `AgentStatusPill` or `AiStatusBarControls`.
- [ ] Shortcuts `ai.toggle`, `ai.toggleMini`, `ai.askSelection` are removed from `shortcutDefaults.ts:62-64,128-130` and `shortcuts.ts:45-46`, with their tests; stored overrides for these ids are ignored without error.
- [ ] Palette commands `toggleAi`, `askAiSelection` and `ai.toggle` (`command-palette/commands.ts:56-57,288`) are removed.

**Verification:** `pnpm check-types` and `pnpm test` pass; `rg "modules/ai" src/modules/statusbar src/modules/shortcuts src/modules/command-palette` is empty.

### E05-08 — Remove AI diff panes and the ai-diff tab kind

```yaml
id: E05-08
depends-on: [E05-06]
refs: [F2:4, 9.9:1, .docs/plan/analysis/ide-tools.md]
covers: [ide-tools/editor-ai]
type: task
scope: ui
size: S
```

**Goal:** The AI write/edit approval diff (only opened by AI tools) is gone; the editor and tabs keep working.

**Acceptance criteria:**

- [ ] `src/modules/editor/AiDiffPane.tsx`, `AiDiffStack.tsx` and `AiDiffStackLazy.tsx` are deleted.
- [ ] The `ai-diff` tab kind is removed from `src/modules/tabs/lib/useTabs.ts:86,925-960`; a persisted layout containing an `ai-diff` tab loads without error (the tab is dropped).
- [ ] `WorkspaceSurface.tsx:3` and `feature-loading.test.tsx:5` no longer reference `AiDiffStack`.

**Verification:** `pnpm check-types` and `pnpm test` pass; manual: open a file in the editor and a terminal tab, both work.

### E05-09 — Remove inline AI autocomplete from the editor

```yaml
id: E05-09
depends-on: []
refs: [F2:4, .docs/plan/analysis/ide-tools.md]
covers: [ide-tools/editor-ai]
type: task
scope: ui
size: S
```

**Goal:** The editor (kept as a secondary tool) no longer reads provider keys or calls an AI model.

**Acceptance criteria:**

- [ ] `src/modules/editor/lib/autocomplete/` is deleted.
- [ ] `EditorPane.tsx:1-2` has no `@/modules/ai` import; editing, saving and LSP features are unchanged.

**Verification:** `pnpm check-types` and `pnpm test` pass; manual: type in the editor with no AI request in the network log.

### E05-10 — Remove AI commit-message generation from source control

```yaml
id: E05-10
depends-on: []
refs: [F2:4, .docs/plan/analysis/ide-tools.md]
covers: [ide-tools/source-control-logic]
type: task
scope: ui
size: S
```

**Goal:** The Git panel (kept) no longer imports `chatStore`, `ai/config` or `ai/lib/agent`.

**Acceptance criteria:**

- [ ] The AI commit-message path in `useSourceControlPanel.ts:8,13,874-875` and its trigger in the panel are removed.
- [ ] The manual commit flow is unchanged.

**Verification:** `pnpm check-types` and `pnpm test` pass; manual: commit from the Git panel still works.

### E05-11 — Remove AI provider and AI-agent settings sections

```yaml
id: E05-11
depends-on: []
refs: [AGT-003, 16:16, .docs/plan/analysis/state-settings.md]
covers: [state-settings/settings-ai]
type: task
scope: ui
size: M
```

**Goal:** Settings no longer offer API keys, models, local model servers or AI chat personas.

**Acceptance criteria:**

- [ ] `ModelsSection.tsx` (+test), `AgentsSection.tsx`, `ProviderIcon.tsx` and `ProviderKeyCard.tsx` are deleted (AgentsSection is AI personas, not CLI agents).
- [ ] The `SettingsTab` union and the settings TABS no longer list them; a deep link to a removed tab falls back to the general section.
- [ ] No caller of `lm_ping` remains in `src/`.

**Verification:** `pnpm check-types` and `pnpm test` pass; manual: open settings, every remaining section renders.

### E05-12 — Remove AI preference keys from the settings store

```yaml
id: E05-12
depends-on: [E05-11, E05-13]
refs: [16:16, .docs/plan/analysis/state-settings.md]
covers: [state-settings/settings-store]
type: task
scope: ui
size: S
```

**Goal:** `Preferences` holds no AI fields and the settings store no longer imports AI config (`settings/store.ts:8-16`).

**Acceptance criteria:**

- [ ] AI keys, setters, defaults and the keys-changed event (`store.ts:1088`) are removed.
- [ ] A persisted settings file that still contains AI keys loads without errors and the keys are ignored.
- [ ] Non-AI preferences (editor, LSP, explorer) are untouched.

**Verification:** `pnpm check-types` and `pnpm test` pass (with a test for legacy AI keys); manual: app boots with an old settings file.

**Notes:** the AI module reads these preferences until it is deleted, so this lands with or after E05-13 (found in E05-11, which already removed the setters left without callers).

### E05-13 — Delete the frontend AI module and chat elements

```yaml
id: E05-13
depends-on: [E05-01, E05-02, E05-03, E05-05, E05-06, E05-07, E05-08, E05-09, E05-10, E05-11, E06-02, E06-04]
refs: [ADR-004, 9.9:2, .docs/plan/analysis/ai.md]
covers: [ai/chat-elements, ai/chat-ui, ai/provider-config, ai/agent-runtime, ai/stores, ai/tools-and-subagents, agents/managed-agents, ADR-004, 9.9:2]
type: task
scope: ui
size: XL
size-exception: Mechanical deletion of a whole module (~18k lines) after every call site is cut; no behaviour change remains in it.
```

**Goal:** `src/modules/ai` and the chat-only `src/components/ai-elements` files are gone (IR-09: removed, not hidden).

**Acceptance criteria:**

- [ ] `src/modules/ai/` and the remaining `src/components/ai-elements/` files are deleted; `rg "modules/ai|ai-elements" src` is empty.
- [ ] `src/modules/agents/store/managedAgentsStore.ts` (only used by the AI module) is deleted.
- [ ] `src/modules/agents`, `src/modules/control` and the Rust agent modules (`agent.rs`, `agent_events.rs`, protocol crates) are otherwise untouched (9.9:2).
- [ ] `compositingBudget.test.ts:42,46` entries for deleted files are removed.

**Verification:** `pnpm check-types`, `pnpm test` and `pnpm build` pass; manual: app starts, terminals and Claude Code hooks work.

### E05-14 — Remove AI-only fs commands

```yaml
id: E05-14
depends-on: [E05-13]
refs: [ADR-004, .docs/plan/analysis/ide-tools.md]
covers: [ide-tools/fs-ai-tools]
type: task
scope: be
size: M
```

**Goal:** The backend no longer exposes `ai_read_file`, `ai_read_dir`, `ai_grep`, `ai_glob` or the `TERAX.md` project-memory reader.

**Acceptance criteria:**

- [ ] `src-tauri/src/modules/fs/ai.rs` and `fs/project_memory.rs` are deleted, with their registrations (`lib.rs:302-305,308`).
- [ ] The read-policy tests in `fs/ai.rs:440-452` move to `fs/read_policy.rs` and still pass.
- [ ] Commands used by kept tools (explorer, editor, palette search) are unchanged.
- [ ] `fs_list_files` (`fs::search`, `run_list_files`), left without a caller when E05-13 deleted the AI file picker, is removed; `scripts/ipc-profile/smoke.ts` keeps the main thread busy with `fs_search` alone.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` and `pnpm test` pass; `rg "ai_(read_file|read_dir|grep|glob)|project_memory" src src-tauri` is empty.

### E05-15 — Remove AI shell session and background commands

```yaml
id: E05-15
depends-on: [E05-13]
refs: [ADR-004, .docs/plan/analysis/backend-core.md, .docs/plan/analysis/_review.md]
covers: [backend-core/shell-exec]
type: task
scope: be
size: L
size-exception: Mechanical deletion of the shell session/background subsystem and its integration test (~800 lines).
```

**Goal:** Remove the non-PTY shell commands that only the AI tools used. `shell_run_command` stays because the kept editor uses it for external formatting (`editor/lib/externalFormat.ts`, decision 2).

**Acceptance criteria:**

- [ ] `shell_session_open/run/close` and `shell_bg_spawn/logs/kill/list`, their state and registrations are removed from `src-tauri/src/modules/shell/` and `lib.rs`.
- [ ] `src-tauri/tests/shell_background.rs` is deleted.
- [ ] `shell_run_command` and its tests still work; external formatting in the editor still runs.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` and `pnpm test` pass; `rg "shell_(session_|bg_)" src src-tauri` is empty; manual: format a file with an external formatter in the editor.

### E05-16 — Delete the Rust AI proxy, AI sessions, secrets and ipc_body modules

```yaml
id: E05-16
depends-on: [E05-13]
refs: [F2:7, F0:5, .docs/plan/analysis/ai.md, .docs/plan/analysis/backend-core.md]
covers: [ai/sessions-backend, ai/net-proxy, ai/secrets-backend, backend-core/ipc-body]
type: task
scope: be
size: L
size-exception: Mechanical deletion of four self-contained modules (~3.8k lines) plus their registration in lib.rs.
```

**Goal:** The backend no longer ships the AI HTTP proxy, AI session storage, the secrets store or `ipc_body` (used only by `net.rs` and `ai_sessions.rs`).

**Acceptance criteria:**

- [ ] `ai_sessions.rs`, `net.rs` + `net/`, `secrets.rs` and `ipc_body.rs` are deleted and removed from `modules/mod.rs`.
- [ ] Their managed state, commands (`secrets_*`, `lm_ping`, `ai_http_*`, `ai_session_*`) and stream cleanup hooks are removed from `lib.rs` (`:6,223,261-266,402-414,439`).
- [ ] No old keychain entries are read, written or deleted (decision: leave them alone).
- [ ] Whether a rustls crypto provider must be installed explicitly (`net/clients.rs:119`) is noted for lut's own updater (F7).

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` and `cargo clippy --all-targets --locked -- -D warnings` pass; `pnpm tauri dev` starts the app.

### E05-17 — Drop AI-session checks from the ipc-profile harness

```yaml
id: E05-17
depends-on: [E05-13]
refs: [.docs/plan/analysis/backend-core.md]
covers: [backend-core/ipc-profile]
type: task
scope: none
size: XS
```

**Goal:** `scripts/ipc-profile/` only exercises commands that still exist (fs, lsp); AI-session parts are removed.

**Acceptance criteria:**

- [ ] AI session calls in `scripts/ipc-profile/smoke.ts:1-90` (and helpers) are removed; fs and lsp probes stay.
- [ ] No reference to removed commands (`ai_session_*`, `ai_*`) remains in `scripts/ipc-profile/`.

**Verification:** `rg "ai_session|ai_read|ai_grep" scripts/ipc-profile` is empty; `pnpm check-types` passes.

### E05-18 — Remove AI dependencies and stale build/budget entries

```yaml
id: E05-18
depends-on: [E05-14, E05-15, E05-16, E05-17]
refs: [9.9:6, F2:7, .docs/plan/analysis/ai.md]
covers: [9.9:6, F2:7]
type: task
scope: none
size: S
```

**Goal:** No dependency remains that only served the AI, each removal confirmed by the import graph (9.9:6, IR-42).

**Acceptance criteria:**

- [ ] npm: `ai`, every `@ai-sdk/*`, `use-stick-to-bottom` and `zod` (only if `rg` finds no other consumer) are removed.
- [ ] Cargo: `keyring` (both targets), `bytes`, `futures-util`, direct `reqwest` (both entries) and direct `rustls` are removed, each confirmed unused by `rg` and `cargo check`.
- [ ] `vite.config.ts:86-92` manualChunks entries and `dist-budget.test.ts` / `eager-budget.test.ts` AI entries are removed; `streamdown` and editor packages stay.
- [ ] `pnpm knip` reports no unused AI leftovers.

**Verification:** `pnpm install --frozen-lockfile` (after lockfile update), `pnpm build`, `pnpm test`, `pnpm knip` and `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` succeed.

### E05-19 — Verify the Phase 2 gate: no API key, shell selection and saved Spaces

```yaml
id: E05-19
depends-on: [E05-18, E05-21]
refs: [F2:gate, 13.2:17, 16:16, AGT-003, F2:8]
covers: [F2:8, F2:gate, 13.2:17, 16:16, AGT-003]
type: task
scope: none
size: XS
```

**Goal:** Prove the whole Phase 2 gate: lut works with no API key, makes no AI provider request, and the current shell selection and saved Spaces still work after the AI removal.

**Acceptance criteria:**

- [ ] Full test suites pass and a bundle analysis (`pnpm build`, `pnpm size`, `pnpm check:dist`) shows no AI SDK chunk; results recorded in the PR.
- [ ] On a clean profile with no keys: the app starts, terminals work, Claude Code/Codex hooks deliver events and notifications.
- [ ] The network log shows no request to any AI provider.
- [ ] Shell selection: a new tab honours the global `terminalShell` preference (pwsh and a WSL shell checked).
- [ ] Saved Spaces: an existing `lut-spaces.json` written before the AI removal restores its spaces, tabs and cwds after it (manual, plus a fixture test if the serializer changed).

**Verification:** `pnpm test`, `pnpm build`, `pnpm size`, `pnpm check:dist`, `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`; manual test on Windows 11 with the result recorded in the PR.

### E05-21 — Restore preference loading in the main window

```yaml
id: E05-21
depends-on: [E05-06]
refs: [F2:gate, .docs/testing/phase2-gate.md]
covers: [F2:gate]
type: task
scope: ui
size: XS
```

**Goal:** The main window loads the saved preferences and follows changes made in Settings again. E05-06 removed
`useAiBootstrap`, which was the only place that loaded them when saved Spaces exist; the Phase 2 gate found it.

**Acceptance criteria:**

- [ ] `App.tsx` loads the preference store on mount (`usePreferencesStore` `init`), so with saved Spaces a new tab honours `terminalShell` and the other terminal preferences.
- [ ] A change made in Settings reaches the open main window without a reload.
- [ ] UI text left over from the AI is updated: the notification bell's empty state and the workspace environment description; the palette's unused `AI` group is removed.

**Verification:** `pnpm check-types` and `pnpm test` pass; manual: with saved Spaces, change the shell in Settings and open a new tab.

### E05-20 — Close-out: BYOK AI removal

```yaml
id: E05-20
depends-on: [E05-01, E05-02, E05-03, E05-04, E05-05, E05-06, E05-07, E05-08, E05-09, E05-10, E05-11, E05-12, E05-13, E05-14, E05-15, E05-16, E05-17, E05-18, E05-19, E05-21]
refs: [ADR-004, 9.9]
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E06 — Remove command-blocks mode

```yaml
id: E06
depends-on: [E01, E02]
refs: [.docs/plan/analysis/decisions.md, .docs/plan/analysis/terminal.md, .docs/plan/analysis/backend-core.md]
```

Delete the Warp-like command-blocks mode (user decision 3): its tab kind, input bar, UI, frontend logic, shell-side
support and the Rust history index it shares with the palette history mode. Runs before the BYOK AI removal (E05): deleting
`WorkspaceInputBar` and `block/` also deletes the AI composer and the "attach to AI chat" block action they host.

### E06-01 — Remove the command palette history mode

```yaml
id: E06-01
depends-on: []
refs: [.docs/plan/analysis/_review.md, .docs/plan/analysis/decisions.md]
covers: [terminal/blocks-logic]
type: task
scope: ui
size: S
```

**Goal:** The palette no longer depends on `terminal/block/lib/history` (`history_list`), so blocks and `history/` can be deleted (_review.md removal order #7).

**Acceptance criteria:**

- [ ] `src/modules/command-palette/hooks/useCommandHistory.ts` is deleted; the `history` mode is removed from `CommandPalette.tsx:99-101,220,284-285` and the query parser.
- [ ] The `history.open` item is removed; other palette modes (commands, files, themes) are unchanged.
- [ ] Palette tests updated.

**Verification:** `pnpm check-types` and `pnpm test` pass; `rg "useCommandHistory|historyList" src/modules/command-palette` is empty.

### E06-02 — Remove the block-input toggle and WorkspaceInputBar

```yaml
id: E06-02
depends-on: [E01-14]
refs: [.docs/plan/analysis/app-shell.md, .docs/plan/analysis/decisions.md]
covers: [app-shell/workspace-input-bar, terminal/blocks-ui]
type: task
scope: ui
size: S
```

**Goal:** The bar that hosts the block shell input and the BYOK AI composer, and the `terminal.toggleInput` shortcut, are gone. The AI composer goes with the bar (it is removed anyway by E05), so no intermediate "strip the composer" step is needed.

**Acceptance criteria:**

- [ ] `src/app/components/WorkspaceInputBar.tsx` (including its lazy `AiComposerInput` import and the shell/AI mode switch) is deleted with its mount in `App.tsx:1576` and the `TOGGLE_BLOCK_INPUT_EVENT` import/dispatch (`App.tsx:141,941-942,1044`).
- [ ] Props and locals of the `App.tsx` call site that only fed the bar (`hasComposer`, `panelOpen`, `keysLoaded`, `onConnect`) are removed; the rest of the BYOK AI stays mounted until E05.
- [ ] The `terminal.toggleInput` shortcut is removed from `shortcutDefaults.ts:51,117` and its tests (`shortcutDefaults.test.ts`, `shortcutLabel.test.ts`); a stored override for it is ignored without error.
- [ ] `useGitBranch`, `OsIcon.tsx` and `useSystemInfo.ts` are **kept** and moved next to the status bar components (pure move), because E12-06 rebuilds the status bar indicators (git branch, OS/shell) on them. No working feature is lost (decisions.md, general rules).

**Verification:** `pnpm check-types` and `pnpm test` pass; `rg "TOGGLE_BLOCK_INPUT|WorkspaceInputBar|terminal.toggleInput" src` is empty.

### E06-03 — Remove the blocks tab kind

```yaml
id: E06-03
depends-on: [E06-02]
refs: [.docs/plan/analysis/terminal.md, .docs/plan/analysis/app-shell.md]
covers: [terminal/blocks-logic]
type: task
scope: ui
size: M
```

**Goal:** No code path can create a block tab; terminal tabs are the only terminal kind.

**Acceptance criteria:**

- [ ] `newBlockTab` and the `window.__teraxNewBlockTab` global (`useTabs.ts:792,804-805`) are removed, with any caller.
- [ ] The `blocks` flag is removed from tabs, `PaneTreeView.tsx:27` and `pty-bridge.ts:171` (+ `pty-bridge.test.ts:182`).
- [ ] `spaces/lib/serialize.ts:77,164` no longer writes `blocks`; a persisted layout with `blocks: true` restores as a normal terminal tab (test in `serialize.test.ts`).
- [ ] The split restriction for blocks tabs (`useTabs.ts:1364`) is removed.

**Verification:** `pnpm check-types` and `pnpm test` pass; `rg "__teraxNewBlockTab|newBlockTab|blocks: true" src` is empty; manual: restore a saved layout that had a blocks tab.

### E06-04 — Delete the command-blocks frontend modules

```yaml
id: E06-04
depends-on: [E06-01, E06-02, E06-03]
refs: [.docs/plan/analysis/terminal.md]
covers: [terminal/blocks-logic, terminal/blocks-ui]
type: task
scope: ui
size: XL
size-exception: Mechanical deletion of whole modules (block/, GhosttyBlocks*, ghosttyBlockSessions*, blockController) once no caller remains.
```

**Goal:** All command-blocks UI and logic is gone from the frontend.

**Acceptance criteria:**

- [ ] `src/modules/terminal/block/` (UI, `block.css`, `lib/`) is deleted.
- [ ] `ghostty/GhosttyBlocks*`, `ghostty/ghosttyBlockSessions*`, `ghostty/GhosttyBlockOverlay.tsx` and `lib/blockController.ts` are deleted.
- [ ] `ghostty/sessionDiagnostics.ts:10` no longer reports `blocks`; any theme or compositing-budget entries for deleted files are removed.
- [ ] `rg "terminal/block|GhosttyBlock|blockController|ghosttyBlockSessions" src` is empty.

**Verification:** `pnpm check-types`, `pnpm test` and `pnpm build` pass; manual: terminals, splits and OSC 133 prompt marks still work.

### E06-05 — Remove shell-side block support

```yaml
id: E06-05
depends-on: [E06-03]
refs: [.docs/plan/analysis/backend-core.md, .docs/plan/analysis/terminal.md]
covers: [terminal/blocks-logic]
type: task
scope: be
size: M
```

**Goal:** The PTY layer and the shell integration scripts no longer know about blocks mode.

**Acceptance criteria:**

- [ ] The `blocks: Option<bool>` spawn parameter (`src-tauri/src/modules/pty/mod.rs:181`) and the export of `TERAX_BLOCKS` (or its `LUT_` rename from Phase 0) are removed.
- [ ] Block-only branches are removed from `pty/scripts/bashrc.bash:30,79,184`, `init.fish:65,72`, `zshrc.zsh` and `profile.ps1` (incl. `_terax_block_seen`); OSC 7/133 and agent hook integration are unchanged.
- [ ] Script tests (`bashrc.test.bash`, `init.test.fish`, `zshrc.test.py`) are updated; `src/modules/terminal/ghostty/shellBlockCompatibility.test.ts` loses its block-mode part and becomes `bashCommandStart.test.ts`: it is the only automated check of the PS0 command-start marker and of the old-Bash marker below.
- [ ] The `OSC 133;B;terax_blocks=0` option for Bash before 4.4 stays: it tells the host the shell cannot report command start, and `promptInjection.ts` then never types a command on the user's behalf. Only its name comes from block mode.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` and `pnpm test` pass; `rg "BLOCKS|_block_seen" src-tauri/src/modules/pty src` is empty; manual: bash/zsh/pwsh prompts and cwd tracking still work.

### E06-06 — Delete the Rust history module

```yaml
id: E06-06
depends-on: [E06-01, E06-04]
refs: [.docs/plan/analysis/backend-core.md, .docs/plan/analysis/decisions.md]
covers: [backend-core/history]
type: task
scope: be
size: M
```

**Goal:** `src-tauri/src/modules/history/` (histfile index used only by blocks and the palette history mode) is removed.

**Acceptance criteria:**

- [ ] `history/{mod.rs,index.rs,parse.rs}` are deleted, with the `mod` line and the `history::history_list` registration (`lib.rs:418`) and any managed state.
- [ ] No frontend caller of `history_list` remains.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace` and `cargo clippy --all-targets --locked -- -D warnings` pass; `rg "history_list" src src-tauri` is empty.

### E06-07 — Close-out: command-blocks removal

```yaml
id: E06-07
depends-on: [E06-01, E06-02, E06-03, E06-04, E06-05, E06-06]
refs: [.docs/plan/analysis/decisions.md]
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E07 — Terminal-first shell proof of concept (F1)

```yaml
id: E07
depends-on: [E02]
refs: [F1, 3.4, 5.4, 10.1, 10.2, .docs/plan/analysis/app-shell.md, .docs/plan/analysis/terminal.md]
```

Phase 1 proof of concept: an `AppShell` with the terminal as main surface, built from existing components as-is, where tab
orientation, sidebar collapse and theme changes never remount sessions or restart PTYs. Optional IDE tools are hidden from startup.

### E07-01 — Add lifecycle regression tests for the terminal mount invariant

```yaml
id: E07-01
depends-on: []
refs: [3.4:invariant, 5.4, F1:7, .docs/plan/analysis/app-shell.md]
covers: [TER-005, 5.4:1, 5.4:3]
type: task
scope: ui
size: M
```

**Goal:** Lock the invariant that navigation changes never unmount terminal sessions before any shell restructuring starts.

**Acceptance criteria:**

- [ ] Vitest tests mount `TerminalStack` (inside `WorkspaceSurface`) with a mocked PTY bridge, not the whole `App.tsx` tree (which mounts the AI, updater and every tool provider), and assert that switching tabs, splitting and closing a sibling pane keep every other `TerminalPane` mounted (no unmount, no `pty_close`, no new `pty_open`).
- [ ] Mounts and unmounts are counted through a small test-only instrumentation hook on `TerminalPane` (IR-84), reusable by later shell changes.
- [ ] Hidden (non-active) terminal tabs stay mounted and keep receiving output events.
- [ ] A test fails when `TerminalStack` is rendered conditionally or re-parented (checked by temporarily breaking it locally).

**Verification:** `pnpm test` passes; `pnpm check-types` passes.

### E07-02 — Decouple TerminalStack from the tabs Tab type

```yaml
id: E07-02
depends-on: [E07-01]
refs: [5.10:3, 10.1:1, 10.1:2, 6.2:1, .docs/plan/analysis/terminal.md]
covers: [terminal/pane-host, 10.1:1, 10.1:2, 5.10:3, F1:2, 6.2:1]
type: task
scope: ui
size: S
```

**Goal:** Refactor only: `TerminalStack` takes a minimal `TerminalStackEntry { id, paneTree, activeLeafId }[]` contract instead of `Tab[]`, so a new shell can feed it without tabs internals.

**Acceptance criteria:**

- [ ] `TerminalStack.tsx` and `lib/liveTerminals.ts` no longer import from `@/modules/tabs`.
- [ ] Cold-tab filtering moves to the caller (a selector in tabs).
- [ ] Callbacks and lifecycle (notification, resize, model/PTY sync) unchanged; E07-01 tests green.

**Verification:** `pnpm test`; `pnpm check-types`; manual: two tabs running `top`, switch back and forth, processes keep running.

**Notes:** TerminalStack.tsx:1, liveTerminals.ts:1.

### E07-03 — Introduce AppShell with the terminal stack as main surface

```yaml
id: E07-03
depends-on: [E07-02]
refs: [F1:1, 10.2:1, 5.10:7, .docs/plan/analysis/app-shell.md]
covers: [F1:1]
type: task
scope: ui
size: M
```

**Goal:** Add `src/app/AppShell.tsx` that composes the existing title bar, tab bar, sidebar and status bar around a single, stably positioned `TerminalStack`; `App.tsx` renders it.

**Acceptance criteria:**

- [ ] `TerminalStack` is mounted exactly once at a fixed position of the tree; chrome regions are siblings that can change without re-parenting it.
- [ ] Existing components are reused as-is (no new visuals).
- [ ] E07-01 tests pass unchanged.

**Verification:** `pnpm test`; `pnpm check-types`; `pnpm tauri dev` starts with a working terminal.

### E07-04 — Hide optional IDE tools from startup and make the workspace terminal-default

```yaml
id: E07-04
depends-on: [E07-03]
refs: [F1:6, 10.2:5, .docs/plan/analysis/decisions.md]
covers: [F1:6, 10.2:5]
type: task
scope: ui
size: M
```

**Goal:** On startup lut shows only terminals; editor, explorer, Source Control and other tool chrome are hidden and loaded on demand, without deleting their code or backend.

**Acceptance criteria:**

- [ ] `WorkspaceSurface` renders terminals by default; editor/preview/markdown/git surfaces are `React.lazy` and mount only when a content tab or panel is opened.
- [ ] Explorer and Source Control panels are hidden by default and reachable through the existing shortcuts/commands.
- [ ] No IDE tool or backend command is removed (decision 2).

**Verification:** `pnpm test`; `pnpm build` then `pnpm size` shows editor/CodeMirror modules out of the main chunk; manual: open a file from the CLI, the editor loads lazily.

### E07-05 — Add a global horizontal/vertical tab orientation toggle

```yaml
id: E07-05
depends-on: [E07-03]
refs: [F1:3, TER-003, 10.4, .docs/plan/analysis/decisions.md]
covers: [F1:3]
type: task
scope: ui
size: M
```

**Goal:** Tabs can be shown horizontally or vertically (global preference, decision 11) by reusing the existing tab components in both layouts, without remounting sessions.

**Acceptance criteria:**

- [ ] Preference `tabOrientation: "horizontal" | "vertical"` persisted with the existing preferences store.
- [ ] Toggle via command/shortcut; order, active tab, close and identity are preserved.
- [ ] Switching orientation does not unmount `TerminalPane`s nor call `pty_close`/`pty_open` (test).

**Verification:** `pnpm test`; manual: run `nvim` in a tab, toggle orientation twice, the session is intact.

### E07-06 — Add Spaces as a sidebar view

```yaml
id: E07-06
depends-on: [E07-03]
refs: [F1:4, 3.4:invariant]
covers: [F1:4]
type: task
scope: ui
size: S
```

**Goal:** The spaces list moves from the title-bar popover into the sidebar as its first view (Spaces / Git / Files), shown and hidden with the sidebar. "Spaces" is the UI name of what this plan calls projects (E16–E18).

**Acceptance criteria:**

- [ ] The sidebar rail shows Spaces, Git and Files; the Spaces view reuses the current spaces list as-is (switch, rename, new tab, delete, drag to reorder spaces or move tabs).
- [ ] The title-bar space button and its popover are removed; `space.overview` (Ctrl+Shift+S) and its palette command open the sidebar on Spaces, expanding it when collapsed.
- [ ] No new persistence: the sidebar keeps its stored width, collapsed state and view.
- [ ] Switching sidebar views and collapsing/expanding the sidebar does not unmount sessions (test).

**Verification:** `pnpm test`; manual: `pnpm dev` running, collapse/expand and switch views repeatedly, the dev server keeps running.

### E07-07 — Wire basic theming and tab/split shortcuts into AppShell

```yaml
id: E07-07
depends-on: [E07-05, E07-06]
refs: [F1:5]
covers: [F1:5]
type: task
scope: ui
size: S
```

**Goal:** Existing theme switching and tab/split shortcuts work in the AppShell, including the new orientation and sidebar toggles.

**Acceptance criteria:**

- [ ] Shortcuts: new tab, close, next/previous tab, split right/down, focus pane, toggle orientation, toggle sidebar.
- [ ] Theme switch (light/dark/custom) re-themes terminals without recreating the canvas or PTY.

**Verification:** `pnpm test`; manual: each shortcut, and a theme switch with a TUI running.

### E07-08 — Verify renderer invariants: resize, DPI, hidden panes and WebGPU fallback

```yaml
id: E07-08
depends-on: [E07-03]
refs: [ADR-003, 5.4, 10.1, .docs/plan/analysis/terminal.md]
covers: [ADR-003, 5.4:2, 5.4:4, 5.4:5, 5.4:6, 5.4:7, 5.10:2, 10.1:3, 10.1:4, 10.1:5, 10.1:6, 10.1:7, 13.5:11, 13.2:7]
type: task
scope: ui
size: S
```

**Goal:** Confirm the AppShell keeps the Ghostty WASM/GPU renderer and PTY transport untouched and correct; fix only regressions found.

**Acceptance criteria:**

- [ ] No changes to `src/modules/terminal/ghostty/`, the WASM, the font atlas or `src-tauri/src/modules/pty/` in this epic (diff check).
- [ ] Hidden panes do not render frames (test or render-loop instrumentation).
- [ ] Continuous split resize keeps one session per pane and consistent cols/rows (`stty size`).
- [ ] Moving the window between monitors with different DPI re-renders crisply.
- [ ] Forcing WebGPU unavailable falls back to WebGL with a working terminal.
- [ ] Tab visual changes do not create new canvases.

**Verification:** `pnpm test`; manual checklist above on Windows, results recorded in the PR.

### E07-09 — Add PoC tests for orientation, sidebar, reorder and hidden tabs (F1 gate)

```yaml
id: E07-09
depends-on: [E07-04, E07-07, E07-08]
refs: [F1:7, F1:gate, 13.2, 16]
covers: [F1:7, F1:gate, 3.4:invariant, 13.2:5, 13.2:6, 13.2:8, 16:3, 16:4]
type: task
scope: ui
size: M
```

**Goal:** Automated tests and a manual gate run prove that changing tabs, orientation, theme and sidebar never closes or restarts processes, and TUIs keep working.

**Acceptance criteria:**

- [ ] Tests for tab switch, split, reorder, orientation toggle, sidebar collapse and theme change assert no unmount and no PTY close/open.
- [ ] Test: a hidden tab keeps receiving output and shows uncorrupted output when reactivated.
- [ ] Manual gate on Windows: `pnpm dev` in a hidden tab and `nvim` in another survive orientation/sidebar/theme changes.

**Verification:** `pnpm test`; `pnpm check-types`; `pnpm lint`; manual gate checklist recorded in the PR.

### E07-10 — Close-out: Terminal-first PoC

```yaml
id: E07-10
depends-on: [E07-01, E07-02, E07-03, E07-04, E07-05, E07-06, E07-07, E07-08, E07-09]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E08 — Navigation model: tabs and splits

```yaml
id: E08
depends-on: [E07, E05, E06]
refs: [F2:1, 6.2, 10.3, 10.4, .docs/plan/analysis/app-shell.md, .docs/plan/analysis/terminal.md]
```

One navigation store and minimal contracts extracted from `useTabs`, separated from session lifecycle; split trees with
ratios, moving sessions between tabs and safe close.

### E08-01 — Move pure tab planners out of useTabs

```yaml
id: E08-01
depends-on: []
refs: [10.3:3, .docs/plan/analysis/app-shell.md]
covers: [10.3:3]
type: task
scope: ui
size: M
```

**Goal:** Refactor only: move the pure planners (close, reorder, next active, space removal…) from `useTabs.ts` into `src/modules/navigation/` with no logic changes.

**Acceptance criteria:**

- [ ] Planners live in their own files; `useTabs.ts` imports them.
- [ ] Existing planner tests move with them and stay unchanged and green.

**Verification:** `pnpm test`; `pnpm check-types`.

### E08-02 — Extract NavigationStore from useTabs React state

```yaml
id: E08-02
depends-on: [E08-01, E06-03]
refs: [F2:1, 5.10:6, 6.2:3, 10.4]
covers: [F2:1, 5.10:6, 6.2:3, 10.4, TER-002, app-shell/tabs-model]
type: task
scope: ui
size: L
size-exception: Moving the hook's useState/refs state into a store is mechanical but touches the whole hook body; the public API is kept so consumers do not change.
```

**Goal:** One navigation store (tabs, active id, order, groups) replaces the local React state; `useTabs` becomes a thin facade with the same API. No second parallel store.

**Acceptance criteria:**

- [ ] Store holds tabs/activeId/order with pure actions; it never creates a PTY.
- [ ] `useTabs` API unchanged; E07 lifecycle tests green.
- [ ] Orientation changes keep order, active state, close/reopen, tab/pane identity and indicators (test).

**Verification:** `pnpm test`; manual: tabs, splits and spaces behave as before, PTYs survive.

### E08-03 — Expose the terminalTabs selector and TabNavigator contract

```yaml
id: E08-03
depends-on: [E08-02]
refs: [10.3:1, 10.3:2]
covers: [10.3:1, 10.3:2]
type: task
scope: ui
size: S
```

**Goal:** A `terminalTabs` selector returns the minimal navigator contract (id, title, icon, state, active, close, reorder, focus, orientation) and the existing tab bar consumes it.

**Acceptance criteria:**

- [ ] Contract type exported from `src/modules/navigation`.
- [ ] The current tab bar (both orientations) reads only the contract; other tab kinds stay hidden behind it.

**Verification:** `pnpm test`; `pnpm check-types`.

### E08-04 — Separate session lifecycle from navigation

```yaml
id: E08-04
depends-on: [E08-02]
refs: [6.2:2, 5.4:3]
covers: [6.2:2]
type: task
scope: ui
size: M
```

**Goal:** Refactor only: a `sessions` module owns session disposal. Its reconciler watches the navigation store and disposes a leaf's session once no terminal tab holds it, replacing the `disposeSession` calls in `useTabs` and the second sweep in `App.tsx`. The `leafId ↔ ptyId` lookup and resize stay in the terminal module, which owns the session registry.

**Acceptance criteria:**

- [ ] `useTabs`/the store no longer import terminal session internals; each removed leaf is disposed exactly once, from the reconciler.
- [ ] No behaviour change; E07 lifecycle tests green.

**Verification:** `pnpm test`; manual: close a pane, its PTY is released (no orphan process).

### E08-05 — Add split ratios to the pane tree model

```yaml
id: E08-05
depends-on: [E08-04]
refs: [6.2:4, 5.10:4, PRJ-006, .docs/plan/analysis/terminal.md]
covers: [terminal/pane-tree-model, 6.2:4, 5.10:4]
type: task
scope: ui
size: S
```

**Goal:** Split nodes in `panes.ts` carry ratios; pure operations keep stable ids and normalise ratios on split/close.

**Acceptance criteria:**

- [ ] Split node type has `ratios` (sum 1); split, close and move operations update them.
- [ ] Unit tests for ratio normalisation and id stability; 4-pane limit kept (decision 12).

**Verification:** `pnpm test`.

### E08-06 — Wire split ratios into PaneTreeView

```yaml
id: E08-06
depends-on: [E08-05]
refs: [TER-004, 13.2:7]
covers: [terminal/pane-tree-view, TER-004]
type: task
scope: ui
size: S
```

**Goal:** `PaneTreeView` renders splits with the model's ratios (`defaultSize`) and writes user resizes back to the store (`onLayoutChanged` with `isUserInteraction`), keeping the resize-interaction gating.

**Acceptance criteria:**

- [ ] Horizontal and vertical splits keep their ratios after a tab switch.
- [ ] Resize still updates PTY geometry once per settle (no resize storm).
- [ ] No visual changes to the handle or drop overlay.

**Verification:** `pnpm test`; manual: resize a split, switch tabs, the ratio is kept and `stty size` matches.

### E08-07 — Move sessions between tabs without restarting them

```yaml
id: E08-07
depends-on: [E08-05]
refs: [TER-009]
covers: [TER-009]
type: task
scope: ui
size: M
```

**Goal:** Store actions move a pane to another tab (or into a new tab) keeping its PTY and output alive, exposed through commands and shortcuts only. Menu entries come with the designed context menus (E22-04); no menu changes here.

**Acceptance criteria:**

- [ ] `movePane(leafId, targetTabId | "new")` pure operation plus store action; an emptied source tab closes.
- [ ] The moved session keeps its `ptyId`; no `pty_close`/`pty_open` (test).
- [ ] Respects the 4-pane limit of the target tab.

**Verification:** `pnpm test`; manual: move a pane running `top` to a new tab, it keeps running.

### E08-08 — Decouple close guards from editor state

```yaml
id: E08-08
depends-on: [E08-02, E05-06]
refs: [TER-011, 13.2:9]
covers: [app-shell/close-guards, TER-011]
type: task
scope: ui
size: S
```

**Goal:** App and tab close guards depend only on terminal state plus optional dirty-content providers registered by tools. The AI imports are already gone (E05-01, E05-06); this issue only decouples the editor state.

**Acceptance criteria:**

- [ ] Dirty-content check is a provider interface the editor registers when loaded; the close guards no longer import editor internals.
- [ ] Busy-terminal confirmation (`confirmCloseRunningTerminal`) and "close anyway" preserved.

**Verification:** `pnpm test` (`useAppCloseGuard.test.ts`, `tabCloseGuards.test.ts`); manual: quitting with `pnpm dev` running asks for confirmation.

### E08-09 — Migrate navigation consumers and serialization to the store

```yaml
id: E08-09
depends-on: [E08-03, E08-06, E08-07]
refs: [10.3:5]
covers: [10.3:5]
type: task
scope: ui
size: M
```

**Goal:** Consumers (spaces serialization, window title, control context, shortcuts) read the store and selectors directly; then facade variants nobody uses are removed.

**Acceptance criteria:**

- [ ] Spaces serialization reads from the store with the same persisted shape (no new persisted field; split ratios are persisted by E16-05).
- [ ] Unused `useTabs` facade members deleted; `pnpm knip` reports none left.

**Verification:** `pnpm test`; `pnpm knip`; manual: restart restores tabs and splits as before.

### E08-10 — Add navigation tests for close, focus, reorder, cold tabs and live sessions

```yaml
id: E08-10
depends-on: [E08-08, E08-09]
refs: [10.3:6, 13.2:9]
covers: [10.3:6, 13.2:9]
type: task
scope: ui
size: S
```

**Goal:** Store-level tests cover the navigation behaviours and safe close end to end.

**Acceptance criteria:**

- [ ] Tests: close (tab/others/to the right), focus after close, reorder, cold-tab activation, sessions alive across all of them.
- [ ] Test: closing a tab with a running process asks for confirmation and disposes its PTYs on accept.

**Verification:** `pnpm test`.

### E08-11 — Close-out: Navigation model

```yaml
id: E08-11
depends-on: [E08-01, E08-02, E08-03, E08-04, E08-05, E08-06, E08-07, E08-08, E08-09, E08-10]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E09 — App coordinator split

```yaml
id: E09
depends-on: [E05, E08]
refs: [F2:2, ADR-005, 5.10:7, 10.2:1, 6.2:10, .docs/plan/analysis/app-shell.md]
```

Replace the monolithic `App.tsx` with a small coordinator plus services and hooks, and gather OS-specific code into a
platform module. Refactors only; no behaviour or visual change.

### E09-01 — Extract the shortcut handler map into useAppShortcuts

```yaml
id: E09-01
depends-on: []
refs: [F2:2, 10.2:1]
covers: [F2:2]
type: task
scope: ui
size: M
```

**Goal:** Refactor only: move the shortcut handler map and `isDisabled` logic out of `App.tsx` into `useAppShortcuts`.

**Acceptance criteria:**

- [ ] `App.tsx` calls one hook; no behaviour change.
- [ ] Unit tests cover the handler map for tab/pane shortcuts.

**Verification:** `pnpm test`; manual: new tab, split and next-tab shortcuts.

### E09-02 — Extract launch-files and open-file handling into useLaunchFiles

```yaml
id: E09-02
depends-on: []
refs: [10.2:1]
covers: [10.2:1]
type: task
scope: ui
size: S
```

**Goal:** Refactor only: the open-file event and CLI launch-files handling move from `App.tsx` into a dedicated hook.

**Acceptance criteria:**

- [ ] `useLaunchFiles` owns the code formerly in `App.tsx` (around :620-680); no behaviour change.

**Verification:** `pnpm test`; manual: `lut <file>` opens the file in the editor.

### E09-03 — Extract the agent launch flow into useAgentLaunch

```yaml
id: E09-03
depends-on: []
refs: [10.2:1]
covers: [10.2:1]
type: task
scope: ui
size: S
```

**Goal:** Refactor only: the agent launch flow moves from `App.tsx` (around :680-745) into a hook/service.

**Acceptance criteria:**

- [ ] `useAgentLaunch` owns the flow; no behaviour change (the silent `agent_enable_hooks` call moves as is and is removed later by E20-11).

**Verification:** `pnpm test`; manual: launch Claude from the new-tab menu.

### E09-04 — Extract spaces and workspace wiring into a hook

```yaml
id: E09-04
depends-on: []
refs: [10.2:1]
covers: [10.2:1]
type: task
scope: ui
size: M
```

**Goal:** Refactor only: tab/space state wiring and persistence calls (App.tsx:262-293) move into `useWorkspaceCoordinator`.

**Acceptance criteria:**

- [ ] No behaviour change; E07 lifecycle tests green.

**Verification:** `pnpm test`; manual: switch spaces, terminals keep running.

### E09-05 — Create the platform module with OS detection and path helpers

```yaml
id: E09-05
depends-on: []
refs: [6.2:10, .docs/plan/analysis/app-shell.md]
covers: [6.2:10]
type: task
scope: ui
size: M
```

**Goal:** Refactor only: OS detection and path helpers move to `src/modules/platform`.

**Acceptance criteria:**

- [ ] Moved into `src/modules/platform`: `src/lib/platform.ts`, `src/lib/homeRelativePath.ts` (+ test) and `src/lib/launchDir.ts`; tests move with them.
- [ ] Callers of OS detection import from the platform module: `src/app/App.tsx`, `src/modules/header/Header.tsx`, `src/modules/shortcuts/shortcuts.ts`, `src/modules/explorer/FileExplorer.tsx`, `src/modules/explorer/lib/clipboardPaste.ts`, `src/modules/source-control/SourceControlPanel.tsx`, `src/modules/terminal/ghostty/input/{GhosttyInputController,keyRouting,TerminalNativeSelection}.ts`, `src/modules/terminal/lib/{keymap,terminalLinks}.ts`, `src/settings/SettingsApp.tsx`, `src/settings/sections/{AboutSection,GeneralSection}.tsx` (list re-checked with `rg` in the PR; if it grows past ~15 callers, the rest go to a follow-up issue).
- [ ] No behaviour change on Windows, macOS or Linux.

**Verification:** `pnpm test`; `pnpm check-types`; `rg "lib/platform|lib/homeRelativePath|lib/launchDir" src` is empty.

### E09-06 — Move window operations, permissions and native menu wiring into the platform module

```yaml
id: E09-06
depends-on: [E09-05]
refs: [6.2:10, .docs/plan/analysis/app-shell.md]
covers: [6.2:10]
type: task
scope: ui
size: M
```

**Goal:** Refactor only: window operations (`@tauri-apps/api/window`), OS permission requests and native menu wiring used by the app shell move behind `src/modules/platform`.

**Acceptance criteria:**

- [ ] Window and menu calls in `src/app/App.tsx`, `src/main.tsx`, `src/settings/main.tsx`, `src/app/hooks/useAppCloseGuard.ts`, `src/components/WindowControls.tsx`, `src/modules/tabs/lib/useWindowTitle.ts`, `src/modules/agents/lib/useWindowFocus.ts` and `src/modules/control/useControlBridge.ts` go through platform helpers.
- [ ] Renderer-internal window code (`terminal/ghostty/renderScheduling.ts`, `windowPresentation.ts`) stays in the terminal module.
- [ ] No behaviour change on Windows, macOS or Linux.

**Verification:** `pnpm test`; `pnpm check-types`; manual: native menu, window controls (minimize/maximize/close) and window title on Windows.

### E09-07 — Extract the boot sequence from main.tsx into a bootstrap module

```yaml
id: E09-07
depends-on: [E09-05]
refs: [.docs/plan/analysis/app-shell.md]
covers: [app-shell/main-entry]
type: task
scope: ui
size: S
```

**Goal:** Refactor only: the load-bearing boot order (`pty_close_all` before any tab, `initLaunchDir` before first paint, hidden-window show) becomes an explicit, tested `bootstrap()`.

**Acceptance criteria:**

- [ ] `main.tsx` calls `bootstrap()`; order kept (main.tsx:30,33,42-50).
- [ ] A unit test asserts the call order.

**Verification:** `pnpm test`; `pnpm tauri dev` starts with no theme flash and a working terminal.

### E09-08 — Reduce App.tsx to a small coordinator

```yaml
id: E09-08
depends-on: [E09-01, E09-02, E09-03, E09-04, E09-05, E09-06, E09-07]
refs: [ADR-005, 5.10:7, 10.2:1]
covers: [app-shell/app-root, ADR-005, 5.10:7]
type: task
scope: ui
size: L
size-exception: mechanical move of the remaining inline handlers and providers out of App.tsx (several hundred lines moved, none rewritten); reviewable as moves with no behaviour change
```

**Goal:** `App.tsx` only composes providers, services/hooks and `AppShell`; remaining inline logic moves to hooks.

**Acceptance criteria:**

- [ ] `App.tsx` under ~250 lines with no direct imports of editor/explorer/git/lsp/preview internals.
- [ ] `TerminalStack` still mounted once; E07 and E08 tests green.

**Verification:** `pnpm test`; `pnpm check-types`; `pnpm lint`; manual 13.2:5 and 13.2:6 checks.

### E09-10 — Resolve the React Compiler lint warnings in the remaining code

```yaml
id: E09-10
depends-on: [E05-20, E06-07, E09-08]
refs: [ADR-007, .docs/testing/baseline.md]
covers: [ADR-007]
type: task
scope: ui
size: M
```

**Goal:** The code that survives the cleanups (BYOK AI, blocks, App split) compiles fully with the React Compiler: no `react-hooks` compiler warnings, so no component is silently skipped or relies on render-time ref access or cascading effects.

**Acceptance criteria:**

- [ ] `react-hooks/refs`, `react-hooks/set-state-in-effect`, `react-hooks/immutability`, `react-hooks/globals`, `react-hooks/preserve-manual-memoization` and `react-hooks/incompatible-library` report nothing in `src/` (fixed, or an `eslint-disable-next-line` with a reason where the pattern is intentional, such as a third-party library).
- [ ] Those rules become errors in `eslint.config.js`, and the `--max-warnings` budget of `pnpm lint` is lowered to the new count.
- [ ] Each fix keeps the visible behaviour; when a change is not a pure refactor, the PR says so and a test covers it.
- [ ] The lint section of `.docs/testing/baseline.md` is updated.

**Verification:** `pnpm lint` exits 0 with the lowered budget; `pnpm check-types && pnpm test`; manual: tabs, splits, settings and the explorer behave as before.

**Notes:** At E01-16 there were 105 such warnings (ai 20, settings 17, terminal 13, tabs 10, app 7, spaces 6, source-control 6, others ≤5). Many disappear with E05 (AI), E06 (blocks) and the E08/E09 refactors. If the remaining count is large, split this issue by module before starting.

### E09-11 — Compile every component with the React Compiler

```yaml
id: E09-11
depends-on: [E09-10]
refs: [ADR-007, .docs/testing/baseline.md]
covers: [ADR-007]
type: task
scope: ui
size: M
```

**Goal:** The React Compiler compiles every component and hook. Today it skips some silently: syntax it does not
support yet or a pattern it cannot prove safe makes it leave the whole function unoptimized, and the lint rules do not
report that (found in E09-09: 23 functions, 32 errors).

**Acceptance criteria:**

- [ ] A test runs the compiler (the same Babel plugin and target as `vite.config.ts`) over `src/` and fails on any
      function it does not compile, except an allowlist where each entry gives its reason (TanStack Virtual's
      `useVirtualizer`).
- [ ] The skipped functions compile: `try`/`finally` without `catch`, `import()` inside a component, `++` on a variable
      a closure captures, conditional or optional expressions inside `try`/`catch`, a store hook used as an object
      (`useX.getState()`) inside a component, and an `eslint-disable` of a React rule inside a component.
- [ ] Each rewrite keeps the behaviour; existing tests pass unchanged.
- [ ] `.docs/testing/baseline.md` records the check.

**Verification:** `pnpm test`; `pnpm check-types`; `pnpm lint`; manual: tabs, splits, explorer, Git panel, settings and
a background image behave as before.

### E09-09 — Close-out: App coordinator split

```yaml
id: E09-09
depends-on: [E09-01, E09-02, E09-03, E09-04, E09-05, E09-06, E09-07, E09-08, E09-10, E09-11]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E10 — Secondary tools on the design (Git, explorer, editor, previews)

```yaml
id: E10
depends-on: [E11, E05]
refs: [UX-009, .docs/plan/analysis/ide-tools.md]
```

The IDE-like tools (Git panel and history, explorer, file icons, editor, markdown and web preview) take lut's design.
They stay where they are: Files and Git in the sidebar, the rest as tabs, shown only when opened. The tools that already
load on first open keep their `*Lazy.tsx` wrappers; changing how they load is E26-04's analysis.

### E10-13 — Rebuild the Git panel changes view on lut's design

```yaml
id: E10-13
depends-on: [E11-08]
refs: [UX-009, F6:3]
covers: [ide-tools/source-control-ui]
type: task
scope: ui
size: M
```

**Goal:** Replace the change list and staging part of `SourceControlPanel.tsx` with the designed view over the existing hooks.

**Acceptance criteria:**

- [ ] Change list and stage/unstage/discard match the design.
- [ ] Behaviour: stage/unstage/discard call the existing source-control hooks (component test with mocked hooks).
- [ ] A screenshot of the view is attached to the PR.

**Verification:** `pnpm test`; manual: stage/unstage/discard on a test repo.

### E10-14 — Rebuild the Git panel commit and sync actions on lut's design

```yaml
id: E10-14
depends-on: [E10-13]
refs: [UX-009, F6:3]
covers: [ide-tools/source-control-ui]
type: task
scope: ui
size: M
```

**Goal:** Replace the commit, branch and fetch/pull/push part of the panel with the designed view and delete the remaining
Terax panel code.

**Acceptance criteria:**

- [ ] Commit, branch and sync actions match the design.
- [ ] Terax `SourceControlPanel.tsx` removed; the panel keeps loading on first open through its lazy wrapper, as before (E26-04 analyses loading).
- [ ] Behaviour: commit calls the existing commit action with the typed message and is disabled with an empty message (component test).
- [ ] A screenshot of the view is attached to the PR.

**Verification:** `pnpm test`, `pnpm knip`; manual: commit and push on a test repo.

### E10-15 — Rebuild the Git history view on lut's design

```yaml
id: E10-15
depends-on: [E11-08]
refs: [F6:3]
covers: [ide-tools/git-history-ui]
type: task
scope: ui
size: M
```

**Goal:** Replace `GitHistoryPane`/`GitHistoryStack` with the designed history view over `git-history/lib`.

**Acceptance criteria:**

- [ ] Graph, commit list and commit details match the design; Terax views removed.
- [ ] Behaviour: selecting a commit loads its details through `git-history/lib` (component test with the lib mocked).
- [ ] A screenshot of the view is attached to the PR.

**Verification:** `pnpm test src/modules/git-history`, `pnpm check-types`; manual: browse the history of a test repo.

### E10-16 — Rebuild the explorer tree view on lut's design

```yaml
id: E10-16
depends-on: [E11-08]
refs: [UX-009, 10.2:6]
covers: [ide-tools/explorer-ui]
type: task
scope: ui
size: M
```

**Goal:** Replace `FileExplorer.tsx`/`TreeRow.tsx` with the designed tree view.

**Acceptance criteria:**

- [ ] Tree navigation, opening files and drag-a-path-into-terminal work as designed.
- [ ] Behaviour: expanding a folder calls the existing tree loader once per folder (component test).
- [ ] A screenshot of the view is attached to the PR.

**Verification:** `pnpm test src/modules/explorer`; manual: browse and open files.

### E10-17 — Rebuild explorer file operations and search on lut's design

```yaml
id: E10-17
depends-on: [E10-16]
refs: [UX-009]
covers: [ide-tools/explorer-ui]
type: task
scope: ui
size: M
```

**Goal:** Replace `InlineInput.tsx`, `ExplorerSearch.tsx` and the context actions with the designed versions and delete the
remaining Terax explorer views.

**Acceptance criteria:**

- [ ] Create/rename/delete/copy/paste and explorer search work as designed.
- [ ] Remaining Terax explorer components removed.
- [ ] Behaviour: rename and delete call the existing fs commands with the expected paths (component test with mocked `invoke`).
- [ ] A screenshot of the view is attached to the PR.

**Verification:** `pnpm test src/modules/explorer`, `cargo test --manifest-path src-tauri/Cargo.toml --locked`; manual:
file operations on a scratch folder.

### E10-18 — Replace the Catppuccin file icon theme with lut's file icons

```yaml
id: E10-18
depends-on: [E11-08, E05-13]
refs: [UX-006]
covers: [ide-tools/file-icons]
type: task
scope: ui
size: M
```

**Goal:** Replace `FileIcon.tsx` and the icon mapping with a file icon set consistent with lut's UI icons and drop
`@iconify-json/catppuccin` if unused.

**Acceptance criteria:**

- [ ] All `FileIcon` consumers (explorer, palette, git views) use the new iconography.
- [ ] Unused icon packages removed from `package.json`.
- [ ] Behaviour: a test maps known names (`.ts`, `.rs`, `.md`, folder, unknown) to the new icons; `rg -i catppuccin src` is empty.
- [ ] A screenshot of the explorer with the new icons is attached to the PR.

**Verification:** `pnpm check-types`, `pnpm test`, `pnpm knip`.

### E10-19 — Theme the editor from lut theme tokens

```yaml
id: E10-19
depends-on: [E11-08]
refs: [UX-004]
covers: [ide-tools/editor-themes]
type: task
scope: ui
size: M
```

**Goal:** The editor follows the designed look and lut's theme tokens; Terax CodeMirror themes and the
`@uiw/codemirror-theme-*` packages are removed.

**Acceptance criteria:**

- [ ] `cmThemes.ts`, `chromeTheme.ts`, `themes.ts` replaced; `compositingBudget.test.ts` updated.
- [ ] Switching the app theme updates an open editor.
- [ ] Unused theme packages removed.
- [ ] A screenshot of the editor in a light and a dark theme is attached to the PR.

**Verification:** `pnpm test`, `pnpm build`.

### E10-20 — Rebuild the markdown preview on lut's design

```yaml
id: E10-20
depends-on: [E11-08]
refs: [UX-009]
covers: [ide-tools/markdown-ui]
type: task
scope: ui
size: M
```

**Goal:** Replace `MarkdownPreviewPane`/`MarkdownStack` with the designed preview.

**Acceptance criteria:**

- [ ] Rendering, links and local images (through the asset policy) work as designed; Terax views removed.
- [ ] Behaviour: relative image paths resolve through the asset policy (component test).
- [ ] A screenshot of the view is attached to the PR.

**Verification:** `pnpm test src/modules/markdown`; manual: preview a README with images.

### E10-21 — Rebuild the web preview on lut's design

```yaml
id: E10-21
depends-on: [E11-08]
refs: [10.3:4]
covers: [ide-tools/preview-ui]
type: task
scope: ui
size: M
```

**Goal:** Replace `PreviewPane`/`PreviewAddressBar`/`PreviewStack` with the designed web preview.

**Acceptance criteria:**

- [ ] Address bar, reload and dev-server preview work as designed; internal hosts still blocked; Terax views removed.
- [ ] Behaviour: navigating to a blocked internal host is refused (test) and reload re-requests the current URL (component test).
- [ ] A screenshot of the view is attached to the PR.

**Verification:** `pnpm test src/modules/preview`; manual: preview a local dev server.

### E10-22 — Close-out: secondary tools on the design

```yaml
id: E10-22
depends-on: [E10-13, E10-14, E10-15, E10-16, E10-17, E10-18, E10-19, E10-20, E10-21]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add
any discovered work to plan.md (or state 'nothing new').

## E11 — lut UI design (user-owned)

```yaml
id: E11
depends-on: []
refs: [.docs/proposal.md, .docs/plan/analysis/decisions.md, .docs/plan/analysis/app-shell.md]
```

Layout design owned by the user: how each surface is arranged and how it flows. Colours come from the active theme and
are not designed here (the theme model already provides the UI tokens); typography and density are implementation
(E12-01). Every issue that creates or
changes a surface's layout depends on the relevant design issue here; Terax's visual components are not a design
baseline (shadcn/Radix primitives remain the component base).

### E11-01 — lut logo and app icon

```yaml
id: E11-01
depends-on: []
refs: [.docs/plan/analysis/decisions.md, .docs/plan/analysis/build-identity.md]
covers: [build-identity/icons-logos]
type: design
scope: ui
size: S
```

**Goal:** The user designs the lut logo and the app icon.

**Acceptance criteria:**

- [ ] The logo and app icon exist as source artwork with PNG and ICO exports at the sizes the bundle needs.
- [ ] The variant used as the app icon is chosen.

### E11-02 — App shell: window frame/title bar, tab navigator (horizontal/vertical), header, dialogs

```yaml
id: E11-02
depends-on: []
refs: [.docs/plan/analysis/app-shell.md]
covers: [UX-002, 10.2:2]
type: design
scope: ui
size: M
```

**Goal:** The user designs the terminal-first app shell: window frame and title bar per OS, the tab navigator in horizontal
and vertical orientation, header, split panes chrome and dialogs (close confirmations, errors). There is no status bar
(decision 30).

**Acceptance criteria:**

- [ ] Window frame/title bar designs for Windows, macOS and Linux.
- [ ] Tab navigator in both orientations, including overflow and active/attention states.
- [ ] Header, pane chrome and dialog designs; no status bar (decision 30), its indicators placed in the header, the
      editor tab and the tabs.
- [ ] Focus mode: all chrome hidden (tabs, sidebar, header), how to enter and leave it (§10.4, IR-86).

### E11-03 — Settings UI: sections, theme/font pickers, shortcuts editor

```yaml
id: E11-03
depends-on: []
refs: [.docs/plan/analysis/state-settings.md]
covers: [UX-004, UX-005]
type: design
scope: ui
size: M
```

**Goal:** The user designs the settings window: section structure, theme and font pickers, and the shortcuts editor.

**Acceptance criteria:**

- [ ] Section list and layout of each section.
- [ ] Theme picker, font picker and shortcuts editor (including conflict display) designed.
- [ ] Startup setting designed: startup mode (restore last session / open a default project / empty terminal) and default-project choice (IR-28).

### E11-04 — Profiles UI: picker for new tab/split, profile editor, profile icons, tab title/color

```yaml
id: E11-04
depends-on: [E11-02]
refs: [.docs/plan/analysis/proposal.md]
covers: [PRO-012, F3:4]
type: design
scope: ui
size: M
```

**Goal:** The user designs how profiles are picked when opening a tab or split, the profile editor, profile icons and the
tab title/colour customisation.

**Acceptance criteria:**

- [ ] Profile picker for new tab and new split designed.
- [ ] Profile editor (detected vs custom profiles) and icon selection designed.
- [ ] Tab title and colour customisation designed.
- [ ] In-pane error states designed: missing profile (with "open with default profile" / choose another profile) and the "process exited" state used by the profile `closeBehavior`.

### E11-05 — Projects UI: sidebar navigator, relaunch consent modal, restore errors

```yaml
id: E11-05
depends-on: [E11-02]
refs: [.docs/plan/analysis/proposal.md]
covers: [UX-003, 10.2:6]
type: design
scope: ui
size: M
```

**Goal:** The user designs project navigation in the sidebar, the modal that asks before relaunching a command
(decision 26) and how restore errors are shown.

**Acceptance criteria:**

- [ ] Sidebar project navigator designed (no permanent explorer/source control).
- [ ] Relaunch consent modal designed (run / always in this Space / don't run).
- [ ] Restore error states (retry / open shell) designed.

### E11-06 — Agents UI: tab badges, notifications, focus-next-attention, hooks manager preview/diff

```yaml
id: E11-06
depends-on: [E11-02]
refs: [.docs/plan/analysis/agents.md]
covers: [AGT-005, AGT-006, AGT-007]
type: design
scope: ui
size: M
```

**Goal:** The user designs agent status on tabs/panes, notifications, the focus-next-attention affordance, the hooks
manager with preview/diff and selective uninstall.

**Acceptance criteria:**

- [ ] Every normalized agent state, including the degraded "no hooks" state, has a visual.
- [ ] Notification list/toasts and focus action designed.
- [ ] Hooks manager (per-agent status, diff preview, stale-preview error, uninstall) designed.

### E11-07 — Command palette and context menus

```yaml
id: E11-07
depends-on: []
refs: [.docs/plan/analysis/app-shell.md]
covers: [UX-007, UX-008]
type: design
scope: ui
size: S
```

**Goal:** The user designs the command palette (commands, file and content search modes) and the context menus of tabs,
panes and terminal.

**Acceptance criteria:**

- [ ] Palette layout and each mode designed.
- [ ] Context menus for tab, pane and terminal content designed.

### E11-08 — Secondary tools surfaces: how editor/Git/explorer/diff/preview are invoked and laid out

```yaml
id: E11-08
depends-on: [E11-02]
refs: [.docs/plan/analysis/ide-tools.md, UX-009, 10.3:4, F6:3]
covers: [UX-009]
type: design
scope: ui
size: M
```

**Goal:** The user designs how the secondary tools (editor, LSP status, Git panel, Git history, diff, explorer, markdown
and web preview) are invoked and laid out (ContentTab vs ToolWindow), and any file iconography, keeping all of them hidden
by default.

**Acceptance criteria:**

- [ ] Invocation (buttons, commands, shortcuts) and placement are defined for each tool.
- [ ] Visual design for each tool's surface exists.
- [ ] States explicitly that no tool is visible by default.

### E11-09 — Close-out: lut UI design

```yaml
id: E11-09
depends-on: [E11-01, E11-02, E11-03, E11-04, E11-05, E11-06, E11-07, E11-08]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add
any discovered work to plan.md (or state 'nothing new').

## E12 — App shell UI implementation

```yaml
id: E12
depends-on: [E11, E08, E09, E07]
refs: [ADR-002, 10.2, UX-001, UX-002, .docs/plan/analysis/app-shell.md]
```

Implement the user's design for the window frame, tab navigator, header, dialogs, global styles and icons (no status
bar, decision 30).
Behaviour (navigation model, close guards, coordinator) comes from E08/E09; this epic replaces only the visual layer.

### E12-01 — Rebuild global styles on the theme's UI tokens

```yaml
id: E12-01
depends-on: [E11-02]
refs: [ADR-002, UX-004, UX-006, .docs/plan/analysis/app-shell.md]
covers: [app-shell/styles, ADR-002]
type: task
scope: ui
size: M
```

**Goal:** Replace Terax's `globals.css` visual language with lut's: colours from the active theme's tokens, and the
typography, spacing and density scales the E11-02 layouts need, keeping the React + shadcn/Radix base (ADR-002) and the
performance invariants.

**Acceptance criteria:**

- [ ] `src/styles/globals.css` takes every colour from the theme tokens; typography, spacing and radius scales are
      defined once there; `terax-*` animations and chrome styles removed or renamed.
- [ ] `@font-face` rules for terminal symbol fonts in `src/styles/fonts.css` preserved, renamed "Nerd Font Icons"
      (files, family and the fonts' own name tables) so they don't read as lut's own work.
- [ ] The bundled monospace font is Source Code Pro, variable (weights 200-900), replacing JetBrains Mono; the
      auto-detected Nerd Font prefers SauceCodePro.
- [ ] Terminal text on Windows and Linux is hinted (stems on whole pixels, as native terminals draw them) by a
      WebAssembly rasterizer for the installed or bundled text font; icons, emoji and other fallbacks keep the canvas.
- [ ] `compositingBudget.test.ts` and `motionBudget.test.ts` adapted to the new CSS and green (no infinite animations, compositing limits kept).
- [ ] Light and dark modes both render; vibrancy and background image customisation still work (decision 16).

**Verification:** `pnpm check-types && pnpm test`; `pnpm tauri dev`: visual check in light/dark, with and without background image.

### E12-02 — Replace app icons and logo with lut artwork

```yaml
id: E12-02
depends-on: [E11-01]
refs: [identity:2, ADR-008, .docs/plan/analysis/build-identity.md]
covers: [build-identity/icons-logos]
type: task
scope: none
size: L
size-exception: Binary asset replacement (full Tauri icon set) plus deletion of the unused android/ios sets; mechanical.
```

**Goal:** Every bundled icon and logo is lut's, as designed by the user.

**Acceptance criteria:**

- [ ] `src-tauri/icons/` built from the E11-01 artwork by `pnpm icons`: the per-size exports (each adjusted for its
      size) are used as they are, `pnpm tauri icon` renders only the sizes with no export; android/ios sets deleted.
- [ ] `terax-icon.png` removed and `public/logo.png` replaced; `rg -n "terax-icon" .` returns nothing.

**Verification:** `pnpm tauri build` succeeds; the installed app shows the lut icon in taskbar, window and installer.

### E12-03 — Implement the title bar header and window controls

```yaml
id: E12-03
depends-on: [E11-02, E12-01, E09-08]
refs: [10.2:2, TER-006, 6.2:10, .docs/plan/analysis/app-shell.md]
covers: [app-shell/header, app-shell/window-controls, 10.2:2, TER-006]
type: task
scope: ui
size: M
```

**Goal:** New header per design, with the search entry routed to the active terminal's search controller and platform window controls.

**Acceptance criteria:**

- [ ] `src/modules/header/` rebuilt per E11-02 as a 28px `TitleBar`: sidebar toggle, tabs (horizontal), drag area,
      cwd breadcrumb by the search, search pill, agent notification bell, settings, window controls. The command
      palette has no button (shortcut only).
- [ ] Horizontal tabs: the bar sits above the workspace only, beside a full-height sidebar, so the tabs line up with
      the terminals. Vertical tabs: the bar is hidden and slides in over the window after the pointer rests on the
      top edge; it stays while focus is in it or a menu opened from it is open, and shows briefly on launch.
- [ ] Search target routing (terminal or editor, `SearchInline.tsx:4`) kept over the terminal search controller.
- [ ] Copy, paste, selection and search keep working in terminal panes (TER-006).
- [ ] `src/components/WindowControls.tsx` per design on Windows/Linux (custom or native as designed); macOS traffic lights intact; drag region works.
- [ ] The workspace runs edge to edge (no inset, radius or shadow); the terminal layer keeps a 12px left gap only
      while a side panel is open beside it. The chrome takes the theme's `sidebar` colour.
- [ ] In a split, the active pane carries a small accent triangle in its top-right corner; the cursor blinks by
      default.
- [ ] The design's palette is the default `lut` theme; the previous default palette is kept as the `neutral` theme.

**Verification:** `pnpm check-types && pnpm test`; manual on Windows 11: min/max/close, drag, find text in terminal output, copy/paste.

### E12-04 — Implement the horizontal tab navigator

```yaml
id: E12-04
depends-on: [E11-02, E11-04, E12-01, E08-10]
refs: [10.2:3, 10.3:1, TER-012, .docs/plan/analysis/app-shell.md]
covers: [app-shell/tabs-ui, 10.2:3, TER-012]
type: task
scope: ui
size: M
```

**Goal:** Replace `TabBar`/`TabSwitcherHud` with a `TabNavigator` over the navigation store, rendering the horizontal presentation per design.

**Acceptance criteria:**

- [ ] `TabNavigator` renders tabs from the navigation store (`useNavigatorItems`, `TabNavigatorActions`), with icons
      and live state from the tab presenters (`TabIcon`, `TabStatus`), never importing editor/explorer modules.
- [ ] Tab indicators per design (TER-012): active, dirty, preview and the agent state after the title (working, needs
      attention, finished, fed by `tabAgentStatus`). Terminal tabs carry no icon until profiles give them one
      (E11-04); the private terminal keeps its mark. Tab colours come with the profiles UI.
- [ ] A detected agent starts idle (no spinner) until its first prompt, in the Rust detector, the tab state and the
      notification bell; a finished agent is idle, not waiting.
- [ ] No close button on the tab: middle click, the tab menu and `tab.close` close it.
- [ ] Reorder, close and rename work; the `NewTabMenu` entry point is kept (the profile picker itself belongs to the profiles UI epic).
- [ ] The tab menu, the new-tab menu and the Ctrl+Tab switcher take the design's menu look.
- [ ] The theme gains generic status colours (`success`, `warning`, `info`; `destructive` stays the error colour),
      set by every built-in theme from its own palette; existing status indicators use them.
- [ ] `TabBar.tsx` and `TabSwitcherHud.tsx` deleted.

**Verification:** `pnpm check-types && pnpm test`; manual: reorder/close/rename with nvim running in a tab, no PTY restart.

### E12-05 — Add the vertical tab navigator presentation

```yaml
id: E12-05
depends-on: [E12-04, E07-05]
refs: [TER-003, UX-002, .docs/plan/analysis/decisions.md]
covers: [TER-003, UX-002]
type: task
scope: ui
size: M
```

**Goal:** The navigator can be shown vertically, chosen by the global orientation setting (decision 11).

**Acceptance criteria:**

- [ ] Vertical presentation per E11-02 (a rail headed by the space name and the new-tab button), switching live
      from the global orientation preference.
- [ ] Switching orientation never unmounts `TerminalStack` nor restarts PTYs; the navigation lifecycle tests stay green.

**Verification:** `pnpm test`; manual: toggle orientation with a long-running command in a hidden tab; it keeps running.

### E12-06 — Move the status bar indicators into the header, the editor and the tabs

```yaml
id: E12-06
depends-on: [E11-02, E11-08, E12-01]
refs: [8.5:3, 16:23, .docs/plan/analysis/app-shell.md]
covers: [app-shell/statusbar-ui, app-shell/diagnostics-badge, app-shell/os-icon]
type: task
scope: ui
size: M
```

**Goal:** The design has no status bar (decision 30). Each of its indicators moves to where the design puts it, and the
status bar itself is removed.

**Acceptance criteria:**

- [ ] The cwd breadcrumb (`CwdBreadcrumb`) sits in the header per design; clicking a segment still `cd`s there.
- [ ] Editor tabs get a status line per design: file path, line and column, LSP state (`LspStatusPill`) and
      `DiagnosticsBadge`, shown only in editor tabs (decision 2).
- [ ] The private terminal is marked by its tab icon (as today); the "not saved in the Space" explanation moves to the
      tab tooltip.
- [ ] The git branch (`useGitBranch`) shows in the sidebar Git view and the OS/shell mark is the tab's profile icon
      (`OsIcon`, `useSystemInfo`); whatever ends up unused is removed. (`WorkspaceEnvSelector` is removed by E16-13.)
- [ ] `StatusBar` and its footer are removed; the terminal area grows and each PTY gets one resize.

**Verification:** `pnpm check-types && pnpm test`; manual: `cd` in the terminal updates the header breadcrumb; opening a
file with diagnostics shows the badge in the editor's status line.

### E12-07 — Rebuild the close confirmation dialogs

```yaml
id: E12-07
depends-on: [E11-02, E12-01, E08-08, E09-08]
refs: [TER-011, 13.2:9]
covers: [app-shell/close-dialogs]
type: task
scope: ui
size: S
```

**Goal:** Close-tab/close-app confirmation dialogs per design, behaviour unchanged.

**Acceptance criteria:**

- [ ] `src/app/components/CloseDialogs.tsx` rebuilt on the designed dialog; texts say lut (no "Quit Terax?").
- [ ] Same opt-out and "close anyway" semantics as the close guards.

**Verification:** `pnpm test`; manual: close a tab and the app with a running process.

### E12-08 — Lay out the terminal-predominant workspace surface

```yaml
id: E12-08
depends-on: [E11-02, E11-08, E12-03, E12-04, E12-06]
refs: [UX-001, 5.10:8, 16:22, 10.2:5, .docs/plan/analysis/app-shell.md]
covers: [app-shell/workspace-surface, UX-001, 5.10:8, 16:22, 16:23, UX-009, F6:3]
type: task
scope: ui
size: M
```

**Goal:** The workspace places the terminal as the central, predominant area, with the secondary tools where E11-08 places
them.

**Acceptance criteria:**

- [ ] The terminal is the default surface and takes the central area; Files and Git open in the sidebar, the editor and
      the commit graph as tabs, as in the design. Each tool's own look is E10-13 to E10-21.
- [ ] Header, navigator and sidebar are the recreated components (5.10:8); no Terax layout remains.

**Verification:** manual on Windows: the default window shows the terminal occupying the central area.

**Notes:** delivered by E12-03 to E12-06 and E12-10. Loading the secondary tools' code only when first opened is
analysed by E26-04.

### E12-10 — Add focus mode (hide all chrome)

```yaml
id: E12-10
depends-on: [E11-02, E12-03, E12-04]
refs: [10.4, .docs/plan/analysis/proposal.md]
covers: [10.4]
type: task
scope: ui
size: S
```

**Goal:** Focus mode, one of the four layout combinations of §10.4 (IR-86): only the terminal area is visible, per the E11-02 design.

**Acceptance criteria:**

- [ ] A command and shortcut enter and leave focus mode; it hides the tab navigator, projects sidebar and header. It
      replaces today's zen mode (`view.zenMode`).
- [ ] Focus mode also puts the window in OS full screen; leaving it restores the window as it was (maximized or not).
- [ ] A separate full-screen toggle (F11 by default, as in Windows Terminal) works with or without focus mode.
- [ ] Leaving focus mode restores the previous chrome state (orientation, sidebar collapsed/width) exactly.
- [ ] Entering and leaving never remounts terminal panes or restarts PTYs (test with the E07-01 instrumentation).

**Verification:** `pnpm test`; manual: enter focus mode with two tabs and a split, switch tabs by shortcut, leave focus mode.

### E12-11 — Close-out: app shell UI

```yaml
id: E12-11
depends-on: [E12-01, E12-02, E12-03, E12-04, E12-05, E12-06, E12-07, E12-08, E12-10]
refs: [.docs/plan/README.md]
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E13 — Settings, theming, fonts and shortcuts

```yaml
id: E13
depends-on: [E11, E05, E06, E14]
refs: [UX-004, UX-005, TER-008, 5.10:9, 6.2:9, F6, .docs/plan/analysis/state-settings.md]
```

Preferences, theme tokens, custom themes, fonts, configurable shortcuts and the settings UI.
Logic issues come first; visual issues implement the user's E11 designs.

### E13-01 — Prune the shortcut registry and tolerate unknown overrides

```yaml
id: E13-01
depends-on: [E05-07, E06-04]
refs: [TER-008, F1:5, F6:6, .docs/plan/analysis/app-shell.md]
covers: [app-shell/shortcuts]
type: task
scope: ui
size: S
```

**Goal:** Refactor: the shortcut registry lists only existing features and ignores stored overrides for unknown ids. No shortcut is added here (the tab-orientation shortcut comes from E07-07).

**Acceptance criteria:**

- [ ] `ShortcutId` registry (`src/modules/shortcuts/shortcuts.ts:8-49`) and per-OS defaults (`shortcutDefaults.ts`) drop ids of removed features (AI, command blocks); editor/explorer ids stay (decision 2).
- [ ] `resolveShortcut` drops stored overrides with unknown ids without error.

**Verification:** `pnpm test` (`shortcuts`, `shortcutDefaults`, `resolveShortcut` tests); `pnpm check-types`.

### E13-03 — Resolve terminal theme and font through layered preferences

```yaml
id: E13-03
depends-on: [E14-02, E14-01, E14-03]
refs: [13.2:19, 16:6, 16:24, 3.4:invariant, .docs/plan/analysis/terminal.md, .docs/plan/analysis/decisions.md]
covers: [terminal/theme-font, state-settings/theme-core, 13.2:19, 16:6, 16:24]
type: task
scope: ui
size: M
```

**Goal:** Terminal palette, font and cursor come from the layered resolver and update live without restarting sessions.

**Acceptance criteria:**

- [ ] `src/styles/terminalTheme.ts` and `useTerminalFont.ts` read from `resolvePreferences` instead of only global prefs/CSS vars.
- [ ] Changing theme, font or cursor updates open terminals without respawning PTYs or unmounting panes (13.2:19, 16:24).
- [ ] Theme, font family/size and cursor style are all user-configurable (16:6).
- [ ] Test: an appearance change triggers no `pty_close`/spawn.

**Verification:** `pnpm test`; manual: change font and theme while `top` runs; output continues.

**Out of scope:** per-pane overrides beyond what the per-pane appearance spike decides (decision 9).

### E13-04 — Support Nerd Font and powerline glyph fallback

```yaml
id: E13-04
depends-on: [E13-03]
refs: [UX-005, .docs/plan/analysis/terminal.md]
covers: [UX-005]
type: task
scope: ui
size: S
```

**Goal:** Configurable terminal fonts render Nerd Font/powerline glyphs when the renderer allows it.

**Acceptance criteria:**

- [ ] `resolveTerminalFont` appends the bundled symbol font as fallback; a test covers the resolved family list.
- [ ] A user-installed Nerd Font selected in preferences is used.

**Verification:** `pnpm test` (`resolveTerminalFont`); manual: a powerline prompt renders with and without a Nerd Font installed.

### E13-05 — Import, export and edit custom theme files

```yaml
id: E13-05
depends-on: []
refs: [F6:4, UX-004, .docs/plan/analysis/state-settings.md]
covers: [state-settings/theme-files, F6:4, UX-004]
type: task
scope: ui
size: S
```

**Goal:** Custom themes are JSON files that can be imported, exported and edited, and are re-validated and applied on change. Logic only: errors are returned as data and rendered by E13-08.

**Acceptance criteria:**

- [ ] Import/export of JSON themes under `appConfigDir/themes` (`themeFiles.ts`); no Terax format compatibility.
- [ ] Edit opens the file in the built-in editor (kept, decision 2); saved changes are re-validated and applied live.
- [ ] An invalid file keeps the previous theme and produces a typed error (file, field, message) exposed by the themes store; no new UI in this issue.

**Verification:** `pnpm test` (`themeFiles` tests); manual edit round trip.

### E13-06 — Curate built-in themes and visual presets

```yaml
id: E13-06
depends-on: []
refs: [F6:5, UX-004, identity:2]
covers: [state-settings/theme-builtin-themes, F6:5]
type: task
scope: ui
size: M
```

**Goal:** lut ships a curated set of built-in themes and a default, chosen with the user.

**Acceptance criteria:**

- [ ] `src/modules/theme/themes/` replaced with the chosen set; `terax-default` removed and the new default set.
- [ ] An unknown stored `themeId` falls back to the default without error.

**Verification:** `pnpm test`; manual: switch among built-in themes in light/dark.

### E13-07 — Rebuild the settings window shell

```yaml
id: E13-07
depends-on: [E11-03, E14-02]
refs: [.docs/plan/analysis/decisions.md, .docs/plan/analysis/state-settings.md]
covers: [state-settings/settings-window-shell, state-settings/settings-ui-kit]
type: task
scope: ui
size: M
```

**Goal:** The settings surface (separate window or not, per E11-03, decision 21a) with its section navigation and UI kit per design.

**Acceptance criteria:**

- [ ] `SettingsApp.tsx`, `SectionHeader` and `SettingRow` rebuilt per design; the `?tab=` deep link kept; unknown tabs fall back to general.
- [ ] Changes propagate live to the main window via the existing emit mechanism.

**Verification:** `pnpm check-types && pnpm test`; manual: open settings from the shortcut and via deep link.

### E13-08 — Implement the general, appearance and about sections

```yaml
id: E13-08
depends-on: [E13-07, E13-03, E13-04, E13-05, E13-06]
refs: [UX-004, UX-005, 16:6, identity:2]
covers: [state-settings/settings-sections-terminal, UX-004]
type: task
scope: ui
size: M
```

**Goal:** General, themes/fonts and about sections per E11-03 with theme and font pickers.

**Acceptance criteria:**

- [ ] `GeneralSection`, `ThemesSection` and `AboutSection` rebuilt per design; About shows lut identity (no Terax repo/site).
- [ ] Theme picker (built-in + custom, import/export/edit) and font picker apply live.
- [ ] Invalid custom theme files show the typed error from E13-05 next to the theme.

**Verification:** `pnpm test`; manual: pick a theme and font; terminals update without restart.

### E13-09 — Implement the shortcuts editor

```yaml
id: E13-09
depends-on: [E13-07, E13-01]
refs: [TER-008]
covers: [TER-008]
type: task
scope: ui
size: M
```

**Goal:** Users view, rebind and reset shortcuts in the settings UI per E11-03.

**Acceptance criteria:**

- [ ] `ShortcutsSection` rebuilt per design, editing `preferences.shortcuts` overrides.
- [ ] A rebinding takes effect immediately in the main window; reset restores the per-OS default.

**Verification:** `pnpm test`; manual: rebind new-tab, use it, reset it.

### E13-10 — Implement the editor and LSP settings section

```yaml
id: E13-10
depends-on: [E13-07, E11-08]
refs: [.docs/plan/analysis/decisions.md, .docs/plan/analysis/state-settings.md]
covers: [state-settings/settings-editor-lsp]
type: task
scope: ui
size: M
```

**Goal:** Settings for the secondary editor and LSP tools per design.

**Acceptance criteria:**

- [ ] `EditorSection`, `LspInstallDialog` and `LspServersGroup` rebuilt per design; `lspSwitchState` logic and its test kept.

**Verification:** `pnpm test`; manual: toggle an LSP server and run the install flow.

### E13-12 — Make the zoom shortcuts work on non-US keyboard layouts

```yaml
id: E13-12
depends-on: [E13-01]
refs: [TER-008, .docs/testing/baseline.md]
covers: [app-shell/shortcuts]
type: task
scope: ui
size: S
```

**Goal:** zoom in and out from the keyboard on any layout. Found by the Windows smoke test (E01-13) on a Spanish layout: the defaults are `Ctrl+=` / `Ctrl+Shift++` (in) and `Ctrl+Shift+-` (out) in `src/modules/shortcuts/shortcutDefaults.ts`, so `Ctrl++` (main row or numpad) is not a shortcut and types `+` into the prompt, and there is no way to zoom out; `Ctrl+Shift++` on the numpad zooms in and `Ctrl+0` resets.

**Acceptance criteria:**

- [ ] `Ctrl++` and `Ctrl+-` zoom in and out on US and Spanish layouts, from the main row and from the numpad; the existing bindings keep working.
- [ ] A zoom shortcut never reaches the terminal as text.
- [ ] Tests cover the bindings for the key/code combinations of both layouts and the numpad.

**Verification:** `pnpm test` (shortcuts tests); manual on Windows with a Spanish layout: `Ctrl++`, `Ctrl+-` and `Ctrl+0` on the main row and the numpad.

### E13-13 — Spike: sharper terminal text on Windows

```yaml
id: E13-13
depends-on: []
refs: [5.4, 13.4, .docs/testing/baseline.md]
covers: [terminal/webgpu-renderer]
type: spike
scope: ui
size: M
```

**Goal:** decide how to make terminal text as sharp as in Windows Terminal. Found by the Windows smoke test (E01-13): lut draws glyphs with grayscale antialiasing and looks slightly blurry next to Windows Terminal, which uses ClearType (subpixel) through DirectWrite. The renderer invariants (§5.4) forbid changing the atlas or the WebGPU renderer casually, hence a spike first.

**Acceptance criteria:**

- [ ] Side-by-side captures of lut (WebGPU and WebGL) and Windows Terminal with the same font, size and theme at 100% and 125% scale, recorded in the PR.
- [ ] Options evaluated with their cost and risk: subpixel (per-channel) coverage in the glyph atlas, gamma/contrast tuning (the existing `terax:terminal-text-contrast` curve), device-pixel snapping of glyph positions and sizes, and font hinting.
- [ ] A recommendation, with the follow-up issues added to the plan, or a decision to keep grayscale antialiasing.

**Verification:** the captures and the decision in the PR; any follow-up issue synced.

### E13-14 — Turn off WebView2's browser shortcuts and context menu on Windows

```yaml
id: E13-14
depends-on: []
refs: [TER-008, .docs/plan/analysis/app-shell.md]
covers: [app-shell/shortcuts]
type: task
scope: be
size: S
```

**Goal:** a key lut does not bind never triggers a browser feature. Found on Windows: `Ctrl+P` with focus outside a
terminal opens the print dialog, because WebView2 keeps its browser accelerator keys on by default (print, find on page,
reload with `Ctrl+R`/`F5`, page zoom), and a right click outside lut's own menus opens the browser's context menu
(back, reload, save as, print). Tauri 2.12 exposes neither setting, so every window hooks WebView2's
`AcceleratorKeyPressed` and `ContextMenuRequested` events through `with_webview`.

**Acceptance criteria:**

- [ ] On Windows, `Ctrl+P`, `Ctrl+F`, `Ctrl+R`, `F5` and `Ctrl+Plus`/`Ctrl+Minus` with focus outside a terminal do
      not print, find, reload or zoom the page; lut's own shortcuts on those keys keep working.
- [ ] A right click outside lut's own menus opens no browser menu; text fields keep cut, copy, paste and select all.
- [ ] Debug builds keep the DevTools keys (`F12`, `Ctrl+Shift+I`) and "Inspect".
- [ ] macOS and Linux are unchanged.

**Verification:** `pnpm tauri dev` and a release build on Windows: press each key with focus in the sidebar, a
terminal and an editor tab.

### E13-15 — Directional pane focus and resize shortcuts

```yaml
id: E13-15
depends-on: [E13-01]
refs: [TER-004, TER-008, .docs/plan/analysis/state-settings.md]
covers: [TER-004, TER-008]
type: task
scope: ui
size: S
```

**Goal:** Move between panes and resize them from the keyboard as Windows Terminal does: by direction, not by order.
Today only `pane.focusNext`/`pane.focusPrev` (order) and `pane.swap*` exist.

**Acceptance criteria:**

- [ ] `pane.focusLeft/Right/Up/Down` focus the pane beside the active one in that direction, picked from the pane
      rectangles (`paneRects`); nothing happens at an edge. Default: Alt+arrows.
- [ ] `pane.resizeLeft/Right/Up/Down` move the edge of the active pane on that side through `setSplitRatios`, within
      the split's minimum size. Default: Alt+Shift+arrows (Ctrl+Shift+arrows stays with the shells' word selection).
- [ ] Both are configurable in Settings → Shortcuts and appear in the command palette.
- [ ] The Alt+arrow defaults no longer reach the shell (its Alt+Left/Right word moves); this is stated in the
      shortcut's description, and rebinding it gives them back.
- [ ] Tests: focus picks the right neighbour in nested splits; resize respects the minimum and keeps ratios summing 1.

**Verification:** `pnpm test`; manual: a 2×2 split, move around with Alt+arrows and resize with Alt+Shift+arrows.

### E13-11 — Close-out: settings and theming

```yaml
id: E13-11
depends-on: [E13-01, E13-03, E13-04, E13-05, E13-06, E13-07, E13-08, E13-09, E13-10, E13-12, E13-13, E13-14, E13-15]
refs: [.docs/plan/README.md]
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E14 — Profiles: model, detection and PTY launch

```yaml
id: E14
depends-on: [E08, E02, E06]
refs: [PRO-001, F3, 7.1, 7.3, .docs/plan/analysis/backend-core.md, .docs/plan/analysis/terminal.md, .docs/plan/analysis/decisions.md]
```

Introduce `TerminalProfile` (stored and validated in the backend), detected profiles (one per shell and one per WSL distro)
plus user-defined ones, and launch every pane by profile id resolved in Rust (decision 10), with args, env, cwd and
per-profile appearance.

### E14-01 — Spike: per-pane font and theme on the shared WebGPU canvas

```yaml
id: E14-01
depends-on: []
refs: [PRO-005, F3:5, 7.1, .docs/plan/analysis/terminal.md, .docs/plan/analysis/decisions.md]
covers: [PRO-005]
type: spike
scope: ui
size: S
```

**Goal:** Decide (decision 9) how far per-pane font and color overrides can go with the shared WebGPU canvas/glyph atlas
and the WebGL fallback, before committing the appearance scope of profiles.

**Acceptance criteria:**

- [ ] Findings note in `.docs/` covering the atlas budget (font specs per window), palette per session (`applyThemeToSession`), font per session (`updateSessionFont`) and the WebGL fallback.
- [ ] Recommendation of which appearance fields are per pane in v1 (colors, font family/size/weight, opacity) and which stay global.
- [ ] Prototype measurements (frame time, memory) with 4 panes using different fonts; the prototype is not merged.
- [ ] plan.md updated with the decided scope for E14-16.

**Verification:** Note reviewed by the user; `node .docs/plan/tools/validate.mjs` passes after the plan update.

### E14-02 — Introduce layered preferences (global, profile, project)

```yaml
id: E14-02
depends-on: []
refs: [6.2:9, 7.1, 5.10:9, .docs/plan/analysis/state-settings.md]
covers: [state-settings/settings-store, 6.2:9, 5.10:9]
type: task
scope: ui
size: M
```

**Goal:** Settings resolve as global defaults overridden by profile and project values, with preferences separated from theme tokens.
This is the **only** preference resolver of lut: E13-03 reads terminal theme/font through it and E14-16 extends it with the
pane layer. (Moved here from the settings epic so the profiles epic can build on it without an epic cycle.)

**Acceptance criteria:**

- [ ] Pure `resolvePreferences(global, profile?, project?)` in `src/modules/settings/` with tests for precedence and missing layers; its layer list is ordered so a later pane layer can be appended without changing callers.
- [ ] Single-store + `writePref`/emit cross-window mechanism kept (`store.ts:394-406`, `preferences.ts:48-72`).
- [ ] Appearance preferences (theme id, font, cursor) are stored apart from UI token values (5.10:9).

**Verification:** `pnpm check-types && pnpm test`.

### E14-03 — Add the Rust TerminalProfile model and validation

```yaml
id: E14-03
depends-on: []
refs: [7.1, 6.2:5, PRO-010, .docs/plan/analysis/proposal.md]
covers: [F3:1, PRO-001, PRO-010, 6.2:5, 7.1]
type: task
scope: be
size: M
```

**Goal:** A backend-owned `profiles` module defines named profiles (id, name, executable, args, env, startingDirectory,
environment native/WSL distro, appearance overrides, tab title/color/icon, allowShellTitle, closeBehavior) and validates them.
Persistence comes in E14-04.

**Acceptance criteria:**

- [ ] `src-tauri/src/modules/profiles/` with a serde model (camelCase) and a stable `profileId` per profile; `closeBehavior` is `ask | close | keepOpen`.
- [ ] Validation returns field-level errors: empty name, empty executable, invalid env names, duplicate ids (PRO-010).
- [ ] Unit tests for every validation error and for serde round trip of a full profile.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml profiles`.

**Out of scope:** storage (E14-04), UI (E15), export/import (E23).

### E14-04 — Persist profiles in a store with corruption handling

```yaml
id: E14-04
depends-on: [E14-03]
refs: [6.2:5, F3:1, .docs/plan/analysis/proposal.md]
covers: [F3:1, 6.2:5]
type: task
scope: be
size: S
```

**Goal:** Profiles are stored by the backend in lut's app config dir, written atomically, and a corrupt file never loses the user's data silently. No `schemaVersion` or migrations before the first release (no user data exists).

**Acceptance criteria:**

- [ ] Store file in the app config dir (lut bundle id), written atomically (temp file + rename).
- [ ] No Terax data is read.
- [ ] A corrupt file is backed up next to the store and replaced by defaults, and the error is reported to the frontend.
- [ ] Unit tests: load/save round trip, corrupt file backup.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml profiles`.

### E14-05 — Expose profile CRUD and default-profile commands

```yaml
id: E14-05
depends-on: [E14-04]
refs: [F3:2, 6.2:5]
covers: [F3:2]
type: task
scope: be
size: S
```

**Goal:** Tauri commands to list, get, create, update and delete profiles and to set the default profile.

**Acceptance criteria:**

- [ ] Commands `profiles_list`, `profiles_get`, `profiles_save`, `profiles_delete`, `profiles_set_default`; all validate input with the E14-03 validator.
- [ ] Deleting the default profile reassigns the default to the first available profile.
- [ ] A `lut://profiles-changed` event is emitted after every mutation.
- [ ] Commands registered in the capability file; unit tests for default reassignment.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml profiles`.

### E14-06 — Detect shell profiles, one per installed WSL distro

```yaml
id: E14-06
depends-on: [E14-03]
refs: [F3:6, PRO-006, 13.3, .docs/plan/analysis/backend-core.md]
covers: [F3:6, PRO-006]
type: task
scope: be
size: M
```

**Goal:** Auto-detected shells become read-only "detected profiles" (decisions 10 and 18), listed together with custom ones.

**Acceptance criteria:**

- [ ] Windows: PowerShell 7, Windows PowerShell 5.1, CMD, Git Bash when installed, and one profile per installed WSL distro (`workspace::wsl_list_distros`).
- [ ] Git Bash is found wherever Git for Windows is installed (from `git --exec-path` or `PATH`, as the tests do since E01-20), not only under `Program Files` on the system drive. Today `list_shells` misses a Git installed on `D:`, and `sanitize_shell_override` then ignores a terminal shell set to it (found by E06-05).
- [ ] macOS/Linux: `/etc/shells` plus common Homebrew paths, deduplicated by canonical path.
- [ ] Detected profiles have stable ids derived from their source (e.g. `detected:wsl:Ubuntu`), cannot be deleted but can be hidden, and their appearance can be overridden.
- [ ] Detection runs at startup and on demand; uninstalled sources disappear from the list without breaking panes that reference them (they get the E14-10 error).
- [ ] Unit tests for detection parsing (UTF-16 WSL list output, /etc/shells).

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml profiles`; manual on Windows 11 with Ubuntu: the list shows pwsh, Windows PowerShell, cmd and Ubuntu.

### E14-07 — Launch spec: executable and argv arguments in the PTY session

```yaml
id: E14-07
depends-on: [E14-03]
refs: [PRO-002, 14.1:1, 5.10:1, .docs/plan/analysis/backend-core.md]
covers: [PRO-002, 14.1:1, 5.10:1]
type: task
scope: be
size: M
```

**Goal:** The PTY backend can spawn any executable with an argument array, keeping shell integration for known shells.

**Acceptance criteria:**

- [ ] Internal `LaunchSpec { program, args: Vec<String>, .. }` used by the PTY session; arguments are never joined into a shell string.
- [ ] Known shells (pwsh, powershell, bash, zsh, fish, cmd) keep OSC 7/133 integration; unknown programs spawn without it.
- [ ] The enumerated-shell allowlist (`shell_init.rs:115-129`) no longer silently drops unknown shells; a missing executable returns a typed `ExecutableNotFound`.
- [ ] Unit tests for command construction on Windows and Unix.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml shell_init`.

### E14-08 — PowerShell -NoProfile option coexisting with shell integration

```yaml
id: E14-08
depends-on: [E14-07]
refs: [7.3, .docs/plan/analysis/backend-core.md]
covers: [7.3, backend-core/shell-integration-scripts]
type: task
scope: be
size: S
```

**Goal:** A PowerShell profile can skip the user's profile script while lut's integration (prompt, OSC 7/133, backslash paths) still loads.

**Acceptance criteria:**

- [ ] Profile option `loadUserProfile` (default true) maps to `-NoProfile` plus sourcing only lut's integration script.
- [ ] `scripts/profile.ps1` keeps wrapping the user's custom `prompt` function when the user profile is loaded.
- [ ] Tests for the generated PowerShell command line in both modes.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml shell_init`; manual: a pwsh pane with `loadUserProfile: false` still reports cwd (OSC 7) and prompt marks.

### E14-09 — Launch spec: environment variable overrides

```yaml
id: E14-09
depends-on: [E14-07]
refs: [PRO-004, 7.1]
covers: [PRO-004]
type: task
scope: be
size: S
```

**Goal:** Profiles set or unset environment variables without overriding lut's own `LUT_*` integration variables.

**Acceptance criteria:**

- [ ] `env` map (value, or null to unset) applied after the inherited env and before lut-reserved vars; reserved names are rejected by validation.
- [ ] Applied to WSL launches (mechanism, `WSLENV` or `env` prefix, documented in code).
- [ ] Unit tests for merge order and reserved names.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml pty`; manual: a pane with `FOO=bar` prints it in pwsh and WSL.

### E14-10 — Start directory and WSL distro per launch with typed errors

```yaml
id: E14-10
depends-on: [E14-07]
refs: [PRO-003, PRO-006, 13.5:7, 13.2:12, .docs/plan/analysis/backend-core.md]
covers: [PRO-003, 13.5:7, backend-core/pty-session]
type: task
scope: be
size: M
```

**Goal:** Each launch targets its own start directory and WSL distro (independent of the window's workspace env); failures are typed, not hidden.

**Acceptance criteria:**

- [ ] The launch spec carries `cwd` and `distro`; profile args are honoured for WSL (ignored today, `shell_init.rs:652-653`).
- [ ] An unusable cwd (missing path, unmounted drive) falls back to home and the open result reports the cwd used plus a warning.
- [ ] Errors are a serialized enum: `ExecutableNotFound`, `CwdUnavailable`, `DistroNotInstalled`, `ProfileNotFound`, `SpawnFailed`.
- [ ] Unit tests for each error path.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml pty`; manual: a pane in an uninstalled distro gets a typed error and the app keeps working.

### E14-11 — Remove the unused pty_has_foreground_job command

```yaml
id: E14-11
depends-on: []
refs: [.docs/plan/analysis/backend-core.md]
covers: [backend-core/pty-session]
type: task
scope: be
size: XS
```

**Goal:** Dead-code cleanup, separate from the launch-spec behaviour changes: the `pty_has_foreground_job` command (`src-tauri/src/modules/pty/mod.rs:384`) has no caller.

**Acceptance criteria:**

- [ ] The command, its registration in `lib.rs` and any helper used only by it are removed.
- [ ] `rg "pty_has_foreground_job" src src-tauri` is empty.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`; `cargo clippy --all-targets --locked -- -D warnings`; `pnpm check-types`.

### E14-12 — Open PTYs by profile id resolved in the backend

```yaml
id: E14-12
depends-on: [E14-05, E14-06, E14-08, E14-09, E14-10, E06-05, E02-10]
refs: [F3:3, TER-001, .docs/plan/analysis/decisions.md]
covers: [F3:3, TER-001, backend-core/shell-integration-launch]
type: task
scope: be
size: M
```

**Goal:** `pty_open` takes a `profileId` (plus an optional cwd override); the backend resolves and validates the stored
profile and builds the launch spec (decision 10). The frontend never sends executables.

**Acceptance criteria:**

- [ ] `pty_open { profileId?, cwd?, cols, rows, paneId, colors }`; no `profileId` means the default profile; the positional `shell` parameter is removed.
- [ ] An unknown profile id returns `ProfileNotFound` (no silent fallback in the backend).
- [ ] The `terminalShell` preference seeds the default profile once and is no longer read by the PTY path.
- [ ] Integration test: open by detected and by custom profile id; open by unknown id fails cleanly.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml pty`; `pnpm tauri dev`: a new tab opens the default profile.

### E14-13 — Frontend profiles client and openPty options object

```yaml
id: E14-13
depends-on: [E14-12]
refs: [7.1, F3:3, .docs/plan/analysis/terminal.md]
covers: [terminal/pty-bridge]
type: task
scope: ui
size: S
```

**Goal:** Typed TS access to the profile commands (validated with Zod at the IPC boundary) and an `openPty` that takes an options object with `profileId`.

**Acceptance criteria:**

- [ ] `src/modules/profiles/` with Zod schemas mirroring the serde model and a store refreshed on `lut://profiles-changed`.
- [ ] `openPty({ profileId, cwd, paneId, colors })` replaces the positional signature (`pty-bridge.ts:110-119`).
- [ ] Typed errors from E14-10 surface as a discriminated union.
- [ ] `pty-bridge.test.ts` and the profile schema tests are updated.

**Verification:** `pnpm test`; `pnpm typecheck`.

### E14-14 — Profile per pane in the pane tree and session lifecycle

```yaml
id: E14-14
depends-on: [E14-13, E08-09]
refs: [PRO-009, 16:11, 13.2:12, F3:7, .docs/plan/analysis/terminal.md]
covers: [PRO-009, 16:11, 13.2:12, F3:7, terminal/session-lifecycle, terminal/session-api]
type: task
scope: ui
size: M
```

**Goal:** Pane leaves carry `profileId`; sessions open, respawn and split with their profile instead of `preferences.terminalShell`.

**Acceptance criteria:**

- [ ] The leaf has an optional `profileId`; a split inherits the source pane's profile unless one is given.
- [ ] `useGhosttyTerminalSession` opens through E14-13 (`useGhosttyTerminalSession.ts:832-858` no longer reads `terminalShell`); respawn reuses the same profile.
- [ ] Missing profile: the pane shows a repairable error with "open with default profile", using existing components; no app crash (13.2:12).
- [ ] Tests for the missing-profile, unavailable-cwd and uninstalled-distro paths (F3:7).

**Verification:** `pnpm test`; `pnpm typecheck`; manual: a pwsh and a WSL pane in the same tab.

**Notes:** The error presentation is functional only, using existing components (decision 7); it is replaced by the designed in-pane error state in E15-01 (design E11-04).

### E14-15 — Apply the profile closeBehavior when the process exits

```yaml
id: E14-15
depends-on: [E14-14]
refs: [7.1, PRO-001, .docs/plan/analysis/proposal.md]
covers: [7.1]
type: task
scope: ui
size: S
```

**Goal:** The profile's `closeBehavior` (IR-11, IR-63: `ask | close | keepOpen`, §7.1) decides what happens to a pane when its process exits. Today the field is only modelled (E14-03) and edited (E15-02).

**Acceptance criteria:**

- [ ] On PTY exit the session lifecycle reads the pane's profile `closeBehavior`: `close` closes the pane (and the tab if it was the last pane), `keepOpen` keeps the pane with its output and an exit notice, `ask` keeps the pane and offers close/restart.
- [ ] Restart reuses the same profile and cwd (no app restart); a missing profile falls back to the E14-14 missing-profile path.
- [ ] The notice and prompt reuse existing components as-is (decision 7); the designed state comes with E15-01 (E11-04).
- [ ] Tests for the three behaviours, including the last pane of a tab and a non-zero exit code.

**Verification:** `pnpm test`; manual: a profile running `cmd /c exit 3` with each behaviour.

### E14-16 — Per-profile appearance overrides without respawning

```yaml
id: E14-16
depends-on: [E14-01, E14-14, E14-02]
refs: [PRO-005, F3:5, 7.1, .docs/plan/analysis/state-settings.md]
covers: [PRO-005, F3:5]
type: task
scope: ui
size: M
```

**Goal:** Resolve appearance as global → profile → pane override and apply it per session, within the scope decided by E14-01. No second resolver: the pane layer is appended to `resolvePreferences` (E14-02).

**Acceptance criteria:**

- [ ] `resolvePreferences` (E14-02) gains an optional pane-override layer; tests define which appearance fields merge and which replace. No separate `resolveTerminalAppearance` is added.
- [ ] Sessions consume the resolved palette/font via `applyThemeToSession`/`updateSessionFont`; panes without overrides still follow global changes.
- [ ] Editing a profile's appearance updates open panes without respawning the PTY.
- [ ] Exceeding the atlas budget degrades to the default font with a warning.

**Verification:** `pnpm test`; manual: two panes with different color schemes; `top` keeps running while they change.

### E14-17 — Phase 3 gate: two panes with different profiles persist and restore

```yaml
id: E14-17
depends-on: [E14-14, E14-16]
refs: [F3:gate, 16:11, .docs/plan/analysis/state-settings.md]
covers: [F3:gate, 16:11]
type: task
scope: ui
size: S
```

**Goal:** Serialized pane leaves keep `profileId`, so a tab with two panes using different shells and appearance survives a restart.

**Acceptance criteria:**

- [ ] The current snapshot serializer writes and reads `profileId` per leaf (minimal change; the versioned projects schema comes in E16).
- [ ] Round-trip test with two leaves that have different profiles and cwds.
- [ ] Manual gate run documented in the PR.

**Verification:** `pnpm test`; manual: open pwsh + WSL panes with different themes, restart, both restore with their profile.

### E14-19 — Emit the PowerShell prompt markers before the user's prompt runs

```yaml
id: E14-19
depends-on: []
refs: [.docs/testing/baseline.md]
covers: [backend-core/shell-integration-scripts]
type: task
scope: be
size: S
```

**Goal:** a PowerShell prompt that writes itself with `Write-Host` (pshazz, and likely other prompt tools) is not followed by an extra blank line. Found by the Windows smoke test (E01-13): with a two-line pshazz prompt the cursor sits one line below the `$`, while Windows Terminal shows it next to it. In `src-tauri/src/modules/pty/scripts/profile.ps1` the wrapper returns `OSC 133 D/A + OSC 7 + <user prompt> + OSC 133 B`, but a `Write-Host` prompt has already printed by then, so 133;A arrives after the visible prompt and the terminal starts a fresh line.

**Acceptance criteria:**

- [ ] OSC 133 D and A (and OSC 7) are written with `[Console]::Write` before the user's `prompt` runs; the wrapper returns only the user's prompt plus 133 B.
- [ ] Prompts that return a string, prompts that use `Write-Host`, and the default `PS >` prompt all keep the cursor on the prompt line, with cwd and prompt tracking still working.
- [ ] A test exercises the script with a `Write-Host` prompt (like the Bash prompt-hook tests) or the PR records a manual run with pshazz.

**Verification:** `pnpm tauri dev` on Windows with pshazz: the cursor follows the `$`; `cd` updates the cwd breadcrumb.

### E14-20 — Stop the screen shifting one line per keystroke in nushell

```yaml
id: E14-20
depends-on: []
refs: []
covers: [TER-007]
type: task
scope: ui
size: S
```

**Goal:** typing in `nu` (nushell) does not move the screen. Found while closing E07 (Windows, `nu` started from a pwsh tab): every keystroke shifts the content above the prompt up by one line; Windows Terminal does not. lut has no nushell integration script, so the cause is in the terminal emulation, not in lut's prompt markers. Likely suspects: the reply to the cursor position report (`CSI 6n`), which reedline queries to repaint its prompt, or a PTY size that differs from the renderer grid by one row, so reedline draws one row lower than it thinks and the terminal scrolls.

**Acceptance criteria:**

- [ ] The cause is identified and recorded in the PR (what reedline sends and what lut answers or sizes, compared with Windows Terminal).
- [ ] Typing in `nu` no longer shifts the screen; the fix is in the layer that caused it.
- [ ] A regression test replays the sequence that triggered the shift.

**Verification:** `pnpm tauri dev` on Windows: run `nu`, type a long command; the content above the prompt stays still.

### E14-21 — Per-profile terminal padding inside panes

```yaml
id: E14-21
depends-on: [E14-16]
refs: [PRO-005, F3:5]
covers: [PRO-005]
type: task
scope: ui
size: S
```

**Goal:** Each profile sets the padding around the terminal grid, inside its panes, as Windows Terminal profiles do.
The workspace adds none of its own (only a 12px left gap while a side panel is open, E12-03), so full-screen programs
like nvim fill the pane by default.

**Acceptance criteria:**

- [ ] Profiles gain a padding field (top, right, bottom, left; default 0) resolved through `resolvePreferences` like the
      other appearance fields (E14-16).
- [ ] The terminal fit (`fitTerminalViewport`) subtracts the padding before counting columns and rows, so nothing is
      cut and the PTY gets the real size; the pane's background fills the padding.
- [ ] Changing a profile's padding resizes its open panes once each, without respawning.
- [ ] Tests for the fit with padding, including a pane too small for it.

**Verification:** `pnpm test`; manual: two panes with different profiles and paddings, nvim in one of them.

### E14-18 — Close-out: profiles model and launch

```yaml
id: E14-18
depends-on: [E14-01, E14-02, E14-03, E14-04, E14-05, E14-06, E14-07, E14-08, E14-09, E14-10, E14-11, E14-12, E14-13, E14-14, E14-15, E14-16, E14-17, E14-19, E14-20, E14-21]
refs: [F3]
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add
any discovered work to plan.md (or state 'nothing new').

## E15 — Profiles UI

```yaml
id: E15
depends-on: [E11, E14, E04, E12, E13]
refs: [PRO-011, PRO-012, PRO-013, F3:4, 10.2:4, .docs/plan/analysis/app-shell.md]
```

Implement the user's profile designs: picker for new tab and split, profile manager/editor, profile icons, and tab
title/color per profile.

### E15-01 — Profile picker for new tab and split

```yaml
id: E15-01
depends-on: [E11-04, E13-01, E14-14, E14-15]
refs: [PRO-011, F3:4, 10.2:4, .docs/plan/analysis/app-shell.md]
covers: [PRO-011, F3:4, 10.2:4]
type: task
scope: ui
size: M
```

**Goal:** `NewTabMenu` becomes the profile catalogue (detected + custom, default first) and splits can choose a profile, per the E11-04 design.

**Acceptance criteria:**

- [ ] `src/modules/tabs/NewTabMenu.tsx` lists visible profiles from the profiles store; no IDE tools in this list (10.2:4).
- [ ] Choosing a profile opens a tab/split with that `profileId`; a split without explicit choice inherits the pane's profile.
- [ ] Keybindings: new tab with the default profile, and open the profile picker (IR-24), registered in the shortcuts registry (E13-01).
- [ ] The functional in-pane states of E14-14 (missing profile) and E14-15 (process exited / ask) are replaced by the E11-04 design, with "open with default profile" and "choose profile" opening this picker.
- [ ] Component tests for listing and selection.

**Verification:** `pnpm test`; `pnpm typecheck`; manual: open a WSL profile in a new tab and pwsh in a split.

### E15-02 — Profile manager and editor

```yaml
id: E15-02
depends-on: [E11-04, E11-03, E13-07]
refs: [F3:2, PRO-010, 7.1, .docs/plan/analysis/proposal.md]
covers: [F3:2, PRO-010]
type: task
scope: ui
size: L
size-exception: one form over the whole TerminalProfile model; splitting it leaves an editor that cannot save valid profiles
```

**Goal:** Users create, edit, duplicate, hide, delete and set the default profile, with field-level validation errors from the backend, per the E11-04 design.

**Acceptance criteria:**

- [ ] List of detected (non-deletable, hideable) and custom profiles; set default.
- [ ] Editor fields: name, executable, args (list), env (key/value, unset), starting directory, environment/distro, PowerShell user-profile option, appearance overrides, closeBehavior, allowShellTitle.
- [ ] Backend validation errors (E14-03) are shown per field; invalid profiles cannot be saved.
- [ ] Component tests for validation display and save.

**Verification:** `pnpm test`; `pnpm typecheck`; manual: create a custom `python -q` profile and open it.

### E15-03 — Profile icons: built-in set and image files

```yaml
id: E15-03
depends-on: [E11-04, E15-02]
refs: [PRO-012, .docs/plan/analysis/proposal.md]
covers: [PRO-012]
type: task
scope: ui
size: M
```

**Goal:** Each profile shows an icon in the picker and its tabs, chosen from a built-in set or a user image file (IR-23).

**Acceptance criteria:**

- [ ] Built-in icon set from the app's UI icon library; detected profiles get sensible defaults (pwsh, cmd, WSL distro, bash...).
- [ ] User image files are loaded safely through the asset protocol with a scoped path; a missing file falls back to the default icon.
- [ ] Icon shown in the picker, editor and tab.

**Verification:** `pnpm test`; manual: set an image icon, delete the file, restart: default icon, no error dialog storm.

### E15-04 — Tab title and color per profile, shell title permission

```yaml
id: E15-04
depends-on: [E11-04, E11-02, E15-02, E12-04]
refs: [PRO-013, 7.1, .docs/plan/analysis/decisions.md]
covers: [PRO-013]
type: task
scope: ui
size: S
```

**Goal:** Tabs take their initial title and color from the profile; shell OSC 0/2 titles rename the tab only when the profile allows it (decision 17).

**Acceptance criteria:**

- [ ] Profile `tab.title`/`tab.color` applied on open; user renames still win.
- [ ] `allowShellTitle: false` ignores OSC 0/2 for that tab.
- [ ] Unit tests for title precedence (user > shell if allowed > profile > default).

**Verification:** `pnpm test`; manual: profile with color and fixed title; `echo -e "\e]0;x\a"` ignored when disallowed.

### E15-05 — Window title from lut name and active tab

```yaml
id: E15-05
depends-on: [E11-02, E15-04, E04-03]
refs: [identity, .docs/plan/analysis/app-shell.md]
covers: [app-shell/window-title]
type: task
scope: ui
size: XS
```

**Goal:** The window title says lut and reflects the active tab title per the E11-02 design.

**Acceptance criteria:**

- [ ] `APP_NAME` in `src/modules/tabs/lib/useWindowTitle.ts` is `lut` (if not already done by Phase 0).
- [ ] Title format follows the design and uses the resolved tab title from E15-04.

**Verification:** `pnpm test`; manual: switching tabs updates the OS window title.

### E15-06 — Close-out: profiles UI

```yaml
id: E15-06
depends-on: [E15-01, E15-02, E15-03, E15-04, E15-05]
refs: [F3]
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add
any discovered work to plan.md (or state 'nothing new').

## E16 — Projects: model and persistence (Spaces evolution)

```yaml
id: E16
depends-on: [E14, E02, E08]
refs: [ADR-006, F4, 6.4, 6.5, .docs/plan/analysis/state-settings.md, .docs/plan/analysis/decisions.md]
```

Evolve Spaces into projects whose saved state is their live state (decision 26: no presets), with stable ids
reconciled at hydration. lut has no releases: a shape change drops the old data, nothing is migrated.

### E16-01 — Spike: Project and saved-state schema

```yaml
id: E16-01
depends-on: []
refs: [6.4, 6.5, F4:1, PRJ-013, PRJ-014, .docs/plan/analysis/state-settings.md]
covers: [6.4]
type: spike
scope: none
size: S
```

**Goal:** Fix the schema and its storage before code changes.

**Acceptance criteria:**

- [ ] Written schema in `.docs/` with `projectId`, `windowId`, `tabId`, `paneId`/runtime ids, pane tree with ratios, `profileId`, cwd, the still-running command, the per-project relaunch approvals, and `windows[]` from v1 (IR-71).
- [ ] Storage decision: JSON via Tauri Store (IR-73; no `schemaVersion` before the first release), file layout, owner (TS with Zod; Serde only where it crosses IPC).
- [ ] Ratio validation rule (sum 1, one per child; IR-70) documented.
- [ ] Pane/leaf id semantics of the current code are investigated and written down (IR-60: which ids are stable across restarts, splits and moves) before persisted pane ids are fixed.
- [ ] The running command is stored as the line the user typed, only while it runs (decision 26), and the 4-pane-per-tab limit is a schema rule (IR-48).
- [ ] plan.md updated if the schema changes issue scope.

**Verification:** Document reviewed by the user; `node .docs/plan/tools/validate.mjs` passes.

### E16-02 — Rename the spaces module to projects (no behaviour change)

```yaml
id: E16-02
depends-on: [E16-01, E02-14]
refs: [ADR-006, 5.10:5, .docs/plan/analysis/state-settings.md]
covers: [5.10:5]
type: task
scope: ui
size: L
size-exception: mechanical move/rename of src/modules/spaces to src/modules/projects and its importers; no logic change
```

**Goal:** Spaces become `projects` in code (module, types, hooks) so the following issues extend one model (ADR-006).

**Acceptance criteria:**

- [ ] `src/modules/spaces/` moved to `src/modules/projects/`; `SpaceMeta` → `ProjectMeta`, hooks renamed; importers updated.
- [ ] Persisted file name and keys unchanged in this PR.
- [ ] No behaviour change: existing tests pass unchanged except renames.

**Verification:** `pnpm test`; `pnpm typecheck`; manual: existing spaces still load after the rename.

### E16-03 — Projects store validated on load

```yaml
id: E16-03
depends-on: [E16-02]
refs: [13.5:9, .docs/plan/analysis/state-settings.md]
covers: [13.5:9, ADR-006, state-settings/spaces-persistence]
type: task
scope: ui
size: M
```

**Goal:** The projects store validates on load with Zod and never drops data silently. lut has no releases, so there
are no migrations: data saved in an older shape is dropped.

**Acceptance criteria:**

- [ ] A file that fails validation is backed up next to the store and replaced by defaults, and the error is reported; no Terax data is read.
- [ ] Corrupt or partial entries are skipped per entry and reported (not silently swallowed, `serialize.ts:220-236`).
- [ ] Unit tests: valid file round trip, corrupt file, partial entry.

**Verification:** `pnpm test`; manual: corrupt the store file, start, defaults loaded and backup present.

### E16-04 — Project and saved-state model

```yaml
id: E16-04
depends-on: [E16-03]
refs: [F4:1, 6.4, 6.2:6, PRJ-001, ADR-006]
covers: [F4:1, 6.2:6, PRJ-001, 6.4]
type: task
scope: ui
size: M
```

**Goal:** Implement the E16-01 schema: a project list with metadata and each project's saved state, with separate stable ids.

**Acceptance criteria:**

- [ ] Zod schemas and types for `Project`, its saved state and `RunningWorkspace` with `projectId`, `windowId`, `tabId`, `paneId`.
- [ ] Project list API (create, rename, archive flag per decision 19, delete) backed by the projects store.

**Verification:** `pnpm test`; `pnpm typecheck`.

### E16-05 — Snapshot tabs, splits, ratios, cwd and active tab

```yaml
id: E16-05
depends-on: [E16-04, E08-09]
refs: [F4:4, PRJ-002, PRJ-003, PRJ-006, 6.5:3]
covers: [F4:4, PRJ-002, PRJ-003, PRJ-006, PRJ-013, 6.5:2, 6.5:3, 6.5:4]
type: task
scope: ui
size: M
```

**Goal:** A snapshot captures tab order, pane tree, split ratios, cwd per pane, active tab and pane: the project's saved state is its live state (decision 26). The still-running command is added by E17-12.

**Acceptance criteria:**

- [ ] Split nodes serialize ratios, validated and normalized (sum 1, one per child; IR-70).
- [ ] Leaves serialize `cwd`; tab order and active tab/pane persisted; autosave is the only writer (no templates, no "save as").
- [ ] Round-trip tests: serialize → hydrate yields the same topology, ratios and cwds.

**Verification:** `pnpm test`; manual: resize splits, restart, ratios kept.

### E16-06 — Validate the 4-pane-per-tab limit in saved state

```yaml
id: E16-06
depends-on: [E16-05]
refs: [5.4, PRJ-002, .docs/plan/analysis/proposal.md]
covers: [PRJ-002]
type: task
scope: ui
size: S
```

**Goal:** Persisted layouts can never promise more panes than the renderer supports: `MAX_PANES_PER_TAB = 4` (§5.4, decision 12, IR-48) is a validation rule of the project schema, not only of the live `useTabs` action.

**Acceptance criteria:**

- [ ] The saved-state Zod schema rejects a tab with more than 4 leaves with a typed, field-level error (tab id, pane count).
- [ ] The limit is one shared constant used by `useTabs` (`src/modules/tabs/lib/useTabs.ts:31`) and the schema.
- [ ] Hydrating a stored layout with more than 4 panes in a tab does not crash: the project is reported as invalid and not partially restored.
- [ ] Tests: 4 panes accepted, 5 rejected, invalid stored file handled.

**Verification:** `pnpm test`; `pnpm typecheck`.

### E16-07 — Different profiles per pane in a project

```yaml
id: E16-07
depends-on: [E16-05]
refs: [PRJ-005, 13.2:12, 16:11]
covers: [PRJ-005]
type: task
scope: ui
size: S
```

**Goal:** Saved leaves reference a `profileId`; panes of one project can use different profiles.

**Acceptance criteria:**

- [ ] Leaves store `profileId` (replacing the E14-17 interim field).
- [ ] Hydrating a leaf whose profile no longer exists opens with the default profile and reports a repairable error (13.2:12).
- [ ] Tests for mixed profiles and a missing profile.

**Verification:** `pnpm test`; manual: project with pwsh and WSL panes restores both.

### E16-09 — Regenerate runtime ids at hydration; never persist live PTYs

```yaml
id: E16-09
depends-on: [E16-05]
refs: [6.5:1, 6.5:6, 6.5:8]
covers: [6.5:1, 6.5:6, 6.5:8]
type: task
scope: ui
size: S
```

**Goal:** Hydration creates fresh tab/pane/pty ids and reconciles them with persisted structure; restart recreates shells but no process memory.

**Acceptance criteria:**

- [ ] No PTY ids or process handles in persisted JSON (schema test).
- [ ] Hydration maps persisted ids to new runtime ids; agent/session references keyed by runtime id are rebuilt, not reused.
- [ ] Restored panes start fresh shells in their cwd (documented: interactive state is not preserved).

**Verification:** `pnpm test`; manual: restart and confirm new shells in the saved cwds.

### E16-10 — Keep workspace authorization for project roots

```yaml
id: E16-10
depends-on: [E16-04]
refs: [14.1:5, .docs/plan/analysis/state-settings.md]
covers: [14.1:5]
type: task
scope: ui
size: XS
```

**Goal:** Project roots and pane cwds keep going through the existing `workspace_authorize` checks before spawn.

**Acceptance criteria:**

- [ ] Project creation/hydration calls the existing authorization (`useSpacesBoot.ts:105-107`, `workspace.rs:95-147`) unchanged.
- [ ] Test that an unauthorized cwd is not spawned without authorization.

**Verification:** `pnpm test`; `cargo test --manifest-path src-tauri/Cargo.toml workspace`.

### E16-12 — Restore each space's active tab when switching to it

```yaml
id: E16-12
depends-on: []
refs: [PRJ-002, .docs/testing/phase2-gate.md]
covers: [PRJ-002]
type: task
scope: ui
size: S
```

**Goal:** Switching to a space shows the tab that was active in it, instead of its last tab. Found by the Phase 2 gate;
it predates E05. At startup only the active space's saved `activeTabIndex` is applied (`useSpacesBoot.ts`); the
others are kept for persistence only, and the space-switch effect in `App.tsx` falls back to the space's last tab.

**Acceptance criteria:**

- [ ] Each space remembers its active tab during the session; switching back to it selects that tab.
- [ ] After a restart, the first switch to a space that was not active selects the tab saved in its `activeTabIndex`.
- [ ] A cross-space jump that sets the active tab explicitly (e.g. from an agent notification) still wins.
- [ ] Tests cover the switch with a remembered tab, a saved index and a closed remembered tab.

**Verification:** `pnpm test`; manual: two spaces, a non-last tab active in each, restart and switch between them.

### E16-13 — Tools follow the focused pane or the Space's pinned folder; drop the workspace env selector

```yaml
id: E16-13
depends-on: [E14-10, E16-04, E16-07]
refs: [PRO-006, .docs/plan/analysis/app-shell.md, .docs/plan/analysis/backend-core.md]
covers: [PRO-006]
type: task
scope: ui
size: M
```

**Goal:** A Space mixes Windows and WSL panes (decision 29). The window-wide workspace env (local or a WSL distro), its
status-bar selector and the switch that tears down every session (`useWorkspaceSwitcher`) go away: the terminal's
environment comes from its profile (E14-10), and the tools (Files, Git, editor, LSP) use the location of the focused
pane (its cwd in its own filesystem, e.g. `\\wsl$\Ubuntu\...` for a WSL pane), or the Space's pinned folder when it
has one, so they stay put while panes move between folders.

**Acceptance criteria:**

- [ ] Without a pinned folder, Files and Git follow the focused pane's cwd and filesystem; focusing a pane of another
      profile or folder switches them, with no session torn down. While a tab without a terminal is active (editor,
      preview, graph), they keep the last focused terminal pane of the Space.
- [ ] A Space can pin a folder (and unpin it) from its menu; while pinned, the tools use it whatever pane has focus. The
      pin is its own field (`pinnedFolder`): the existing `root` (launch directory or home for the default Space) stays
      the Space's base directory and is never turned into a pin.
- [ ] The Spaces' stored `env` and the `defaultWorkspaceEnv` preference (and its Settings control) are removed, with
      nothing migrated: lut has no releases. A pane without a profile opens with the default profile.
- [ ] ADR-009 records the change to the Space model and to where the tools take their location from.
- [ ] `WorkspaceEnvSelector`, the window-wide env store and the interactive local⇄WSL switch are removed.
- [ ] Tests: tool location for a focused pwsh pane, a focused WSL pane, an active editor tab and a pinned folder.

**Verification:** `pnpm test`; manual on Windows with WSL: a Space with a pwsh pane and an Ubuntu pane, focus each and
check Files and Git; pin a folder and focus both again.

### E16-14 — Let a space have no tabs: close the last tab, show an empty workspace

```yaml
id: E16-14
depends-on: [E16-12]
refs: [TER-002, PRJ-002]
covers: [TER-002]
type: task
scope: ui
size: M
```

**Goal:** The last tab of a space can be closed, as any other. Today it can't: `nextActiveInSpace` returns null for it
and `closeTab` refuses, so the code everywhere assumes every space has a tab and there is always an active one.

**Acceptance criteria:**

- [ ] The navigation store allows no active tab (`activeId: number | null`), per space; closing a space's last tab
      leaves it empty instead of refusing, and switching to an empty space shows it empty (never another space's tab).
- [ ] Every consumer of the active tab handles none (title bar, breadcrumb, window title, search, shortcuts that act
      on a pane, command palette, persistence, boot), without scattered null checks.
- [ ] The workspace of an empty space shows an empty state (existing empty-state patterns): a message and a button
      to open a terminal, with the new-tab shortcut.
- [ ] An empty space persists and restores empty.
- [ ] Tests: close the last tab, switch to an empty space, restart with an empty space, open a tab from the empty state.

**Verification:** `pnpm test`; manual: close every tab of a space, switch away and back, restart.

### E16-11 — Close-out: projects model and persistence

```yaml
id: E16-11
depends-on: [E16-01, E16-02, E16-03, E16-04, E16-05, E16-06, E16-07, E16-09, E16-10, E16-12, E16-13, E16-14]
refs: [F4]
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add
any discovered work to plan.md (or state 'nothing new').

## E17 — Project restore, command relaunch and multi-project

```yaml
id: E17
depends-on: [E16, E14]
refs: [8.4, 8.5, 14.1, F4, .docs/plan/analysis/state-settings.md, .docs/plan/analysis/decisions.md]
```

Restore orchestrator (§8.4), last-session restore at startup, multiple open projects, archiving, and relaunching the commands that were still running, with their consent and safety rules (§8.5, §14.1; decision 26). Per decision 8 the P0 restore rebuilds layout and cwd only; relaunching is P1.

### E17-01 — Persist the open-projects session separately from the project catalogue

```yaml
id: E17-01
depends-on: [E16-03]
refs: [F4:7, PRJ-016, .docs/plan/analysis/state-settings.md]
covers: [PRJ-016]
type: task
scope: ui
size: S
```

**Goal:** Record which projects are open and which is active, apart from the list of projects that exist, so startup can reopen exactly that set.

**Acceptance criteria:**

- [ ] A versioned `session` record (open project ids in order, active project id, active tab per project) is stored separately from the projects catalogue.
- [ ] Opening, closing and switching projects update the record; ids that no longer exist are dropped on read.
- [ ] Malformed session data is schema-validated and falls back to an empty session with a logged error, never a crash (16:13).

**Verification:** `pnpm test` (session store round-trip and malformed-input tests); `pnpm typecheck`.

**Notes:** Terax restores every space cold (`useSpacesBoot.ts:87-117`); lut needs "open" distinct from "exists" (state-settings.md).

### E17-02 — Add restore orchestrator: load, validate and resolve environment

```yaml
id: E17-02
depends-on: [E16-07, E16-06, E14-12]
refs: [8.4, .docs/plan/analysis/state-settings.md]
covers: [8.4:1, 8.4:2, 16:13]
type: task
scope: ui
size: M
```

**Goal:** First stages of the §8.4 algorithm as a pure, testable orchestrator: load the project's saved state, validate, and check that profiles, WSL distros, cwds and executables are available.

**Acceptance criteria:**

- [ ] `restoreProject(id)` loads metadata and saved state, validates the saved state and profile existence, and returns a typed plan plus a list of per-pane problems.
- [ ] A missing profile / distro / cwd / executable yields a repairable per-pane problem with a fallback suggestion, not an exception.
- [ ] One failing project never blocks the app or other projects (16:13).
- [ ] No PTY is spawned and no command runs in these stages.

**Verification:** `pnpm test` (orchestrator tests with missing profile, missing cwd, invalid saved state); `pnpm typecheck`.

### E17-03 — Build layout and spawn sessions without running commands

```yaml
id: E17-03
depends-on: [E17-02, E16-05]
refs: [8.4, PRJ-008, .docs/plan/analysis/terminal.md]
covers: [8.4:4, 8.4:5, 8.4:7, 16:7, 13.2:10]
type: task
scope: ui
size: M
```

**Goal:** From a validated plan, create the tab/pane structure with persisted ids separate from runtime ids, then create PTY sessions progressively with profile overrides and pane cwd applied.

**Acceptance criteria:**

- [ ] Runtime pane/session ids are generated; persisted ids are kept as a mapping and never reused as runtime ids.
- [ ] Topology, ratios, profiles and cwd match the saved state (13.2:10).
- [ ] Sessions are created progressively within renderer limits (4 panes per tab, decision 12); an active hidden session is kept.
- [ ] Profile overrides and pane cwd are applied before any startup step; this stage relaunches no command.

**Verification:** `pnpm test` (save → restore round-trip of a three-pane project); manual: save a three-pane project, restart, structure and cwds match.

### E17-04 — Enable autosave only after hydration and cancel restore on close

```yaml
id: E17-04
depends-on: [E17-03]
refs: [8.4, 13.5]
covers: [8.4:10, 13.5:5]
type: task
scope: ui
size: S
```

**Goal:** Prevent partial state from overwriting saved data, and handle closing a project while it is still restoring.

**Acceptance criteria:**

- [ ] Project persistence stays disabled per project until its restore completes successfully.
- [ ] Closing a project mid-restore cancels pending spawns, kills the PTYs already created for it and leaves the stored state untouched.

**Verification:** `pnpm test` (autosave gated by hydration; cancel mid-restore leaves the store unchanged and no orphan sessions).

### E17-05 — Keep debounced autosave and flush on hide/close for projects

```yaml
id: E17-05
depends-on: [E17-04]
refs: [PRJ-002, .docs/proposal.md, .docs/plan/analysis/proposal.md, .docs/plan/analysis/state-settings.md]
covers: [PRJ-002]
type: task
scope: ui
size: S
```

**Goal:** The projects store keeps the save semantics of Spaces (§5.6, IR-50): a 3 s debounce while working, plus an immediate flush when the window is hidden or closed, so quitting never loses the last layout change.

**Acceptance criteria:**

- [ ] Project and session persistence save with a 3 s debounce; pending saves are flushed on window hide and on app close (close guard path), and the close waits for the flush (bounded).
- [ ] The flush respects the hydration gate of E17-04 (nothing is flushed for a project that is still restoring).
- [ ] Tests with fake timers: debounce coalesces writes; hide and close flush pending changes; a restoring project is not flushed.

**Verification:** `pnpm test`; manual: resize a split and quit immediately (under 3 s), relaunch → the new ratio is restored.

### E17-06 — Restore the last session at startup (layout and cwd)

```yaml
id: E17-06
depends-on: [E17-01, E17-04]
refs: [F4:7, PRJ-016, 16:9]
covers: [F4:7, 16:8, 16:9, 13.2:20]
type: task
scope: ui
size: M
```

**Goal:** On launch, reopen the projects that were open using the §8.4 orchestrator and focus the previously active one. P0: layout and cwd only, commands manual (decision 8).

**Acceptance criteria:**

- [ ] Boot reads the session record and restores each open project through the orchestrator; the active project and its active tab are focused.
- [ ] No command is relaunched during the P0 restore; panes open a shell in the saved cwd.
- [ ] A project that fails to restore is reported and skipped; the others still open.
- [ ] An empty or missing session starts with the default project.

**Verification:** `pnpm test` (boot restore integration test); manual: open two projects with different layouts, quit, relaunch → both restored with the same active project (13.2:20).

### E17-07 — Startup mode setting: restore last session, default project or empty terminal

```yaml
id: E17-07
depends-on: [E17-06]
refs: [PRJ-016, F4:7, .docs/plan/analysis/proposal.md]
covers: [PRJ-016, F4:7]
type: task
scope: ui
size: S
```

**Goal:** PRJ-016 defines three startup behaviours (IR-28): restore the last session (default), open a default project, or start with an empty terminal. E17-06 implements only the first; this issue adds the setting and the other two paths. The settings control is added by E18-07.

**Acceptance criteria:**

- [ ] Preferences `startupMode: "restoreLast" | "defaultProject" | "emptyTerminal"` (default `restoreLast`) and `defaultProjectId`, schema-validated; unknown values fall back to the default.
- [ ] Boot honours the mode: `defaultProject` opens only that project (missing or archived → falls back to an empty terminal with a reported warning); `emptyTerminal` opens one tab with the default profile and restores nothing.
- [ ] Tests for each mode and for the missing-default-project fallback.

**Verification:** `pnpm test`; manual: set each mode in the settings file, relaunch.

### E17-08 — Open other saved projects and handle live instances

```yaml
id: E17-08
depends-on: [E17-06]
refs: [PRJ-017, PRJ-009, PRJ-011, F4:6, 8.4]
covers: [PRJ-017, PRJ-009, PRJ-011, F4:6, 8.4:3, 16:10, 13.2:11]
type: task
scope: ui
size: M
```

**Goal:** Open any saved project without closing the open ones, with explicit rules when it is already open.

**Acceptance criteria:**

- [ ] `openProject(id)` adds the project to the session and makes it active; other open projects keep their sessions.
- [ ] If the project is already open the caller chooses focus / open another instance / cancel; the default is focus and nothing is respawned (13.2:11).
- [ ] Switching the active project neither kills nor restarts PTYs of the others.
- [ ] Exposed as store actions and palette commands; visuals come from E18.

**Verification:** `pnpm test` (open twice → one set of sessions); manual: open A, open B, both alive; open A again → focuses A, process count unchanged.

### E17-09 — Define and implement the close-project policy

```yaml
id: E17-09
depends-on: [E17-08]
refs: [6.5]
covers: [6.5:7]
type: task
scope: ui
size: S
```

**Goal:** Closing an active project follows one explicit policy for its PTYs and resources.

**Acceptance criteria:**

- [ ] The chosen policy (close PTYs, suspend presentation, or keep in memory) is written into `.docs/proposal.md` and implemented.
- [ ] Closing a project removes it from the session record but keeps it in the catalogue.
- [ ] Running processes trigger the existing close confirmation before being killed.

**Verification:** `pnpm test`; manual: close a project with a running process → confirmation, then no orphan processes.

### E17-10 — Archive and unarchive projects

```yaml
id: E17-10
depends-on: [E17-09, E16-04]
refs: [.docs/plan/analysis/decisions.md]
covers: [PRJ-001]
type: task
scope: ui
size: S
```

**Goal:** Implement the behaviour of decision 19: archiving hides a project from the list and keeps all its data. The `archived` flag itself is added to the schema by E16-04.

**Acceptance criteria:**

- [ ] Archiving (setting the E16-04 `archived` flag) closes the project if open and removes it from the session.
- [ ] Archived projects are excluded from the default list and from startup restore; unarchiving restores visibility with its data intact.

**Verification:** `pnpm test` (archive/unarchive keeps project data; archived project skipped at boot).

### E17-11 — Emit a shell-ready event for startup execution

```yaml
id: E17-11
depends-on: [E14-08]
refs: [8.4, 13.5, .docs/plan/analysis/terminal.md, .docs/plan/analysis/backend-core.md]
covers: [8.4:6, 13.5:8]
type: task
scope: be
size: M
```

**Goal:** Replace any fixed delay with a session-ready / prompt-recognised signal that relaunched commands wait on.

**Acceptance criteria:**

- [ ] The backend emits a per-session ready event when the prompt is recognised (shell-integration marker), with a fallback on first output after spawn.
- [ ] A configurable timeout marks the pane "not ready" with an error instead of waiting forever (a relaunched command that never returns a prompt does not hang the restore, 13.5:8).
- [ ] No `sleep`-based readiness remains in the restore path.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml`; `pnpm test`; manual: pwsh, bash and a WSL profile each emit ready.

### E17-12 — Capture the command still running in each pane and relaunch it as typed

```yaml
id: E17-12
depends-on: [E17-11, E17-19]
refs: [PRJ-004, PRJ-008, 14.1]
covers: [PRJ-004, PRJ-008, 14.1:2]
type: task
scope: ui
size: M
```

**Goal:** Each pane remembers the command line still running when the project is saved, so restore can relaunch it
(decision 26). The line comes from shell integration (OSC 133;C with the command text: pwsh and fish today, bash and zsh
after E17-19); panes without it (cmd, nu, profiles without integration) keep no command and reopen with an empty shell.

**Acceptance criteria:**

- [ ] The pane records the command text at command start and clears it at command end (133;D); the saved state holds it only while it runs.
- [ ] Relaunch sends the captured line to the same profile's shell as typed input after the E17-11 ready event; it is never rebuilt by concatenating parts (14.1:2).
- [ ] A user-triggered "Relaunch" action runs the pane's command once (P0 manual); it is offered only for panes with
      a saved command, so only while command saving is on (decision 28).

**Verification:** `pnpm test` (capture and clear on 133;C/D); manual: run a command containing quotes in pwsh and bash, restart, relaunch it.

### E17-13 — Ask before relaunching: run, always in this Space, or don't run

```yaml
id: E17-13
depends-on: [E17-12, E17-06, E14-02]
refs: [PRJ-007, 8.4, 8.5, 14.1]
covers: [PRJ-007, F4:5, 8.4:8, 8.5:1, 8.5:6, 16:14, 13.2:18]
type: task
scope: ui
size: M
```

**Goal:** P1 restore: before relaunching a pane's command, ask unless the project already approves it (decision 26).

**Acceptance criteria:**

- [ ] Each relaunch asks "Run" (this time only), "Always in this Space" (stores an approval for that command, cwd and profile in the project; any change asks again) or "Don't run" (the pane opens an empty shell).
- [ ] Approved commands relaunch without asking; previewing a project never relaunches anything; an imported project carries no approvals (16:14, 13.2:18).
- [ ] The consent request is exposed as data (commands, cwd, profile, env) for the E18 modal.

**Verification:** `pnpm test` (approval matrix, invalidation when command, cwd or profile change); manual: restart with `pnpm dev` running → asked; "Always in this Space" → the next restart relaunches it without asking.

### E17-14 — Relaunch each command at most once and add a global relaunch switch

```yaml
id: E17-14
depends-on: [E17-13, E17-07]
refs: [8.4, 8.5, F4:5]
covers: [8.4:8, 8.5:5, 16:12, F4:5]
type: task
scope: ui
size: S
```

**Goal:** Relaunched commands never run twice (16:12) and the user can disable relaunching globally (8.5:5).

**Acceptance criteria:**

- [ ] A per-session guard relaunches each command at most once per restore, including duplicate ready events and a project opened twice; an explicit "Retry" after a failed run (E17-15) starts a new attempt.
- [ ] A global `relaunchCommands` setting (default on) turns relaunching off (panes reopen with an empty shell); it is checked at execution time, not only at plan time.
- [ ] Command text is saved only while `relaunchCommands` is on and `startupMode` is `restoreLast` (decision 28); turning either off clears the saved commands.
- [ ] Tests: dedupe under duplicate ready events and double open; Retry after a failure runs again; global switch off → no command runs, consent is not even requested.

**Verification:** `pnpm test`; manual: disable relaunching, restart a project with an approved command → nothing runs.

### E17-15 — Record per-pane restore results and recovery actions

```yaml
id: E17-15
depends-on: [E17-13, E17-14]
refs: [8.4, 8.5, 14.1]
covers: [8.4:9, 8.5:4, 14.1:3]
type: task
scope: ui
size: S
```

**Goal:** Each pane exposes its restore result, errors and the actions "Retry" and "Open shell without command", plus what was executed with which cwd/environment.

**Acceptance criteria:**

- [ ] Per-pane result state (pending/ready/ran/failed/skipped) with error detail, including inaccessible-profile and failed-command detection.
- [ ] The actions are store functions; retry respects dedupe and policy.
- [ ] Executed command, cwd, profile and relevant env are recorded and queryable (rendered by E18).

**Verification:** `pnpm test` (failed command → failed state; retry runs once; open-shell-only skips the command).

### E17-17 — Add serialization and startup integration tests and measure restore time

```yaml
id: E17-17
depends-on: [E17-08, E17-10, E17-15]
refs: [F4, 13.2, 13.4]
covers: [F4:9, F4:gate, 13.4:8]
type: task
scope: ui
size: M
```

**Goal:** Lock the phase-4 gate with automated tests and a restore-time measurement.

**Acceptance criteria:**

- [ ] Unit tests for saved-state/session serialization; integration tests for boot restore including last-session restore.
- [ ] Gate scenario covered: restart, open a three-pane project, structure recovered, only authorized commands run, errors reported, no duplicated processes.
- [ ] Restore time of a project with multiple tools measured and recorded in the PR (13.4:8).

**Verification:** `pnpm test`; `pnpm typecheck`; manual gate run documented in the PR.

### E17-19 — Report the command line from bash and zsh shell integration

```yaml
id: E17-19
depends-on: []
refs: [.docs/plan/analysis/backend-core.md]
covers: [PRJ-004]
type: task
scope: be
size: S
```

**Goal:** bash and zsh shell integration send the command text at command start, as pwsh (`profile.ps1`) and fish
(`init.fish`) already do, so E17-12 can capture the command still running in a pane (decision 26).

**Acceptance criteria:**

- [ ] `bashrc.bash` and `zshrc.zsh` send OSC 133;C with the command text, escaped like `profile.ps1` and `init.fish`.
- [ ] The script tests (`bashrc.test.bash`, `zshrc.test.py`) cover a command with spaces, quotes and a semicolon.

**Verification:** the bash and zsh script tests pass; manual: run a command with quotes in bash (WSL) and check the 133;C
text in the PTY output.

### E17-18 — Close-out: project restore

```yaml
id: E17-18
depends-on: [E17-01, E17-02, E17-03, E17-04, E17-05, E17-06, E17-07, E17-08, E17-09, E17-10, E17-11, E17-12, E17-13, E17-14, E17-15, E17-17, E17-19]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E18 — Project navigator and relaunch UI

```yaml
id: E18
depends-on: [E11, E16, E17, E13]
refs: [UX-003, 10.2, 8.5, F4, .docs/plan/analysis/app-shell.md, .docs/plan/analysis/state-settings.md]
```

Projects sidebar navigator, archive, relaunch consent modal and restore error surfaces, built on the user's E11 designs.

### E18-09 — Spaces sidebar view on the design

```yaml
id: E18-09
depends-on: [E11-05]
refs: [.docs/plan/analysis/app-shell.md]
covers: [app-shell/sidebar-ui]
type: task
scope: ui
size: S
```

**Goal:** The Spaces view of the sidebar takes the design's look ("Main window" boards, Spaces view) over today's spaces
store. Look only: the projects model and its actions come with E18-02.

**Acceptance criteria:**

- [ ] Header (view title and the new-space button), rows (height, active row, name) and the Spaces / Files / Git
      switcher follow the design.
- [ ] What the view does today keeps working: switch, create, rename, delete and reorder spaces, open a tab in a
      space, move tabs between spaces.
- [ ] Component test for the active row and the actions above.

**Verification:** `pnpm test`; manual on Windows: both tab orientations, sidebar open and closed.

### E18-02 — Implement the projects sidebar navigator

```yaml
id: E18-02
depends-on: [E18-09, E11-05, E16-04, E17-09, E16-13]
refs: [10.2:6, PRJ-017, .docs/plan/analysis/state-settings.md]
covers: [app-shell/sidebar-logic, state-settings/spaces-ui, 10.2:6, UX-003]
type: task
scope: ui
size: M
```

**Goal:** The Spaces view (E18-09) becomes the projects navigator: it lists projects and acts on them through the E17
store actions, keeping the E18-09 look.

**Acceptance criteria:**

- [ ] The navigator lists projects, marks open and active ones, and opens/focuses/closes projects via the E17 store actions.
- [ ] Create, rename, reorder and remove go through the projects store; pinning and unpinning the Space's folder
      (E16-13) stays available from the navigator.
- [ ] `SidebarRail.tsx`, `SpaceSwitcher.tsx`, `SpaceAvatar.tsx` and `src/modules/projects/components/` (the former `spaces/components/`, renamed by E16-02) are removed or replaced.

**Verification:** `pnpm test`; `pnpm typecheck`; manual: open two projects from the sidebar, collapse/resize, restart → width and collapsed state persisted.

### E18-03 — Add archive and unarchive to the navigator

```yaml
id: E18-03
depends-on: [E18-02, E17-10]
refs: [.docs/plan/analysis/decisions.md]
covers: [PRJ-001]
type: task
scope: ui
size: S
```

**Goal:** Expose project archiving (decision 19) in the navigator as designed in E11-05.

**Acceptance criteria:**

- [ ] The archive action hides the project; an archived list allows unarchiving.
- [ ] Uses the E17 archive store actions; no data is lost.

**Verification:** `pnpm test`; manual: archive, restart, unarchive → data intact.

### E18-05 — Implement the relaunch consent modal with command preview

```yaml
id: E18-05
depends-on: [E18-02, E11-05, E17-13]
refs: [8.5, 14.1]
covers: [F4:3, 8.5:2, 8.5:3, 14.1:3]
type: task
scope: ui
size: S
```

**Goal:** Show which commands will be relaunched, with directory, shell/WSL and relevant variables, and collect consent.

**Acceptance criteria:**

- [ ] The modal renders the consent request produced by the E17 policy engine: per-pane command, cwd, profile/WSL distro and relevant env.
- [ ] "Run", "Always in this Space" and "Don't run" map to the E17-13 approvals.
- [ ] "Don't run" opens shells without running commands.

**Verification:** `pnpm test`; manual: restart with `pnpm dev` running → the modal lists it; "Don't run" → nothing runs.

### E18-06 — Show per-pane restore results and recovery actions

```yaml
id: E18-06
depends-on: [E18-05, E11-05, E17-15]
refs: [8.4]
covers: [8.4:9]
type: task
scope: ui
size: S
```

**Goal:** Render restore errors per pane with "Retry" and "Open shell without command".

**Acceptance criteria:**

- [ ] Failed or skipped panes show the error and the two actions, wired to the E17 result actions.
- [ ] Errors never block the rest of the app.

**Verification:** `pnpm test`; manual: project with a missing cwd → error shown, "Open shell without command" works.

### E18-07 — Startup mode and default project in settings

```yaml
id: E18-07
depends-on: [E17-07, E17-14, E11-03, E11-05, E13-07]
refs: [PRJ-016, 8.5, .docs/plan/analysis/proposal.md]
covers: [PRJ-016, 8.5:5]
type: task
scope: ui
size: S
```

**Goal:** Users choose what lut opens at startup and can disable relaunching globally, in the settings surface designed in E11-03.

**Acceptance criteria:**

- [ ] A startup section offers the three `startupMode` values of E17-07; choosing "default project" shows a project picker (archived projects excluded).
- [ ] The global relaunch switch of E17-14 is shown in the same section, with a warning that running command lines are saved locally to relaunch them and may contain secrets (decision 28).
- [ ] Changes are saved through the settings store and apply at the next launch; matches the E11-03 design.
- [ ] Component tests for each mode and for the project picker.

**Verification:** `pnpm test`; manual: choose each mode, relaunch.

### E18-08 — Close-out: projects UI

```yaml
id: E18-08
depends-on: [E18-09, E18-02, E18-03, E18-05, E18-06, E18-07]
refs: []
type: closeout
scope: none
size: XS
covers: []
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E19 — Agents core: events, adapters and correlation

```yaml
id: E19
depends-on: [E02, E05, E09, E16]
refs: [9.1, 9.2, 9.3, 9.4, 9.5, F5, 14.1, 14.2, .docs/plan/analysis/agents.md]
```

Normalized agent events and per-pane state for every supported CLI (Claude, Codex, Gemini, Pi, OpenCode, Grok), keyed by
pane/PTY and linked to tab and project, with privacy defaults and payload sanitizing. No API keys: lut only launches the
official binaries.

### E19-01 — Move the agent activity store from terminal into the agents module

```yaml
id: E19-01
depends-on: []
refs: [6.2:7, .docs/plan/analysis/terminal.md]
covers: [terminal/agent-activity]
type: task
scope: ui
size: S
```

**Goal:** Agent state lives in the `agents` module (6.2:7). Pure move of `src/modules/terminal/lib/agentActivity*` and `agentSignals.test.ts`, with no behaviour change.

**Acceptance criteria:**

- [ ] Files moved under `src/modules/agents/`; all importers (tab badges `tabs/lib/tabAgentStatus.ts`, launcher) updated.
- [ ] Event contract (agent-signal listener) unchanged; tests moved and still pass.
- [ ] No logic edits in the same PR.

**Verification:** `pnpm test`, `pnpm check-types`, `pnpm knip` pass.

### E19-02 — Spike: verify hook events of every supported agent CLI against official docs

```yaml
id: E19-02
depends-on: []
refs: [9.4, 9.5, AGT-002, .docs/plan/analysis/agents.md]
covers: [9.4:10]
type: spike
scope: be
size: S
```

**Goal:** Confirm that the event lists in `agent.rs:84-131` and the adapters in the protocol crate `adapt.rs` match the current official hook docs of Claude Code, Codex, Gemini and Pi, and how OpenCode/Grok can be detected without hooks.

**Acceptance criteria:**

- [ ] Table per CLI and tested version: event -> documented fields -> adapter field; docs URL cited (IR-56).
- [ ] Undocumented or hypothetical events are flagged so the installer never installs them (IR-80).
- [ ] Per-version capability detection plan for Codex hooks, with fallback when a hook does not exist (IR-81).
- [ ] `PreCompact`/model events: schema confirmed or recorded as unavailable (9.4:10).
- [ ] Follow-up work added to plan.md.

**Verification:** findings committed under `.docs/`; reviewer checks every row cites a doc link.

### E19-03 — Define the UI-independent AgentAdapter boundary and normalized event types

```yaml
id: E19-03
depends-on: [E19-02, E02-09, E09-03]
refs: [9.5, AGT-012, 6.2:7]
covers: [9.5, AGT-012, 6.2:7]
type: task
scope: be
size: M
```

**Goal:** Every CLI is translated by an adapter into one normalized event type; nothing outside the adapters imports native hook JSON. Reuse `AgentHookEvent` and the existing reducer types, renaming only what is needed. This issue defines the boundary and the Claude and Codex adapters; the other four adapters follow in E19-04.

**Acceptance criteria:**

- [ ] The `AgentAdapter` boundary and the normalized event (agent kind, session id, pane id, PTY id, provenance `hook|process|osc`, timestamp) are defined in Rust and TS.
- [ ] Claude and Codex adapters translate their hook payloads into the normalized event.
- [ ] Frontend types in `src/modules/agents/model/` expose only normalized types; a grep check shows no UI file imports provider payload types.
- [ ] Unit tests for the Claude and Codex adapters with recorded sample payloads from E19-02.

**Verification:** `cargo test --locked --workspace` (in `src-tauri`), `pnpm test`, `pnpm check-types`.

### E19-04 — Add the Gemini, Pi, OpenCode and Grok adapters

```yaml
id: E19-04
depends-on: [E19-03]
refs: [9.5, AGT-012, .docs/plan/analysis/decisions.md]
covers: [9.5, AGT-012]
type: task
scope: be
size: M
```

**Goal:** The remaining built-in agents (decision 13) produce the same normalized events through the E19-03 boundary.

**Acceptance criteria:**

- [ ] Gemini and Pi adapters translate their hook/extension payloads; OpenCode and Grok use non-invasive signals (process/OSC) only, since they have no documented hooks (per the E19-02 table).
- [ ] No adapter-specific type leaks outside the adapter.
- [ ] Unit tests per adapter with recorded sample payloads from E19-02.

**Verification:** `cargo test --locked --workspace` (in `src-tauri`), `pnpm test`.

### E19-05 — Sanitize and limit hook payloads with privacy-by-default retention

```yaml
id: E19-05
depends-on: [E19-03]
refs: [14.1, 14.2, 9.2, 9.4:2]
covers: [14.1:4, 14.1:8, 14.2:1, 14.2:2, 14.2:3, 9.4:2]
type: task
scope: be
size: M
```

**Goal:** Hook payloads are reduced to allowed metadata before leaving the backend; sensitive content is only kept on explicit opt-in.

**Acceptance criteria:**

- [ ] The default event keeps only ids, agent, state, time, PTY, tab, project and minimal metadata (14.2:1).
- [ ] Commands, tool names, previews, messages, detailed errors and a persistent timeline only with an explicit opt-in flag (14.2:2); the flag defaults to off.
- [ ] Full prompts, file content, transcripts, env vars and tokens are never stored or logged (14.2:3, 14.1:4); `UserPromptSubmit` records turn start only (9.4:2).
- [ ] Length, rate (dedupe/frequency) and persistence limits enforced in the backend (14.1:8, IR-76).
- [ ] Unit tests feed payloads containing a token-like value and env vars and assert they never reach the emitted event or logs.

**Verification:** `cargo test --locked --workspace` in `src-tauri`; `pnpm test`.

### E19-06 — Harden the loopback control server and per-pane request correlation

```yaml
id: E19-06
depends-on: [E19-03, E02-12]
refs: [9.2, 14.1, 5.10:10]
covers: [9.2, 14.1:6, 14.1:7, 5.10:10]
type: task
scope: be
size: S
```

**Goal:** The hook bridge stays loopback-only and authenticated, and every permission response maps to the exact request and PTY.

**Acceptance criteria:**

- [ ] The listener binds `127.0.0.1` only; hook requests require the per-pane token bound to the PTY id; the global token is refused for `hook` (control.rs:401-498).
- [ ] The decision broker keys pending requests by request id + pane + PTY; a response for a different PTY is rejected (14.1:7).
- [ ] With no UI consumer the broker never blocks and falls through immediately (IR-55).
- [ ] Tests for wrong token, wrong PTY, replayed id and non-loopback bind.

**Verification:** `cargo test --locked --workspace` in `src-tauri`.

### E19-07 — Drive agent state from the normalized reducer, keyed by pane and PTY

```yaml
id: E19-07
depends-on: [E19-01, E19-03, E19-05, E05-13]
refs: [F5:1, 9.3, 9.4, AGT-004, AGT-005]
covers: [F5:1, AGT-005, 9.3, 9.4:1, 9.4:3, 9.4:4, 9.4:5, 9.4:6, 9.4:7, 9.4:8, 9.4:9]
type: task
scope: ui
size: M
```

**Goal:** A non-visual agent service consumes normalized events plus process/OSC signals through `reduceAgents` into a store keyed by pane/PTY that the UI reads.

**Acceptance criteria:**

- [ ] States starting, working, needs-approval/attention, response-done, error and exited derived per the 9.4 rows; `Stop` is response-done and `exited` only on real process exit (IR-79); `SessionEnd` differs from PTY close.
- [ ] `PermissionRequest` sets needs-approval and is never auto-approved.
- [ ] Tool and subagent events are only consumed when a consumer enabled them (9.4:7); failure/subagent events are optional per CLI version.
- [ ] Correlation uses pane/PTY ids, never cwd or tab name (IR-61).
- [ ] Each state carries its provenance/confidence (IR-78).
- [ ] Store tests cover each 9.4 row.

**Verification:** `pnpm test`, `pnpm check-types`; manual: run `claude` in a pane and observe working -> response-done in the store (devtools).

### E19-08 — Associate agent sessions with tab and project

```yaml
id: E19-08
depends-on: [E19-07, E16-04]
refs: [AGT-004, 6.4]
covers: [AGT-004]
type: task
scope: ui
size: S
```

**Goal:** Each agent session resolves to its pane, PTY, tab, project and agent session id.

**Acceptance criteria:**

- [ ] A selector returns `{paneId, ptyId, tabId, projectId, agentSessionId}` for an agent and updates when a pane moves to another tab.
- [ ] Panes outside any project report no project without error.
- [ ] Unit tests for pane move and close.

**Verification:** `pnpm test`, `pnpm check-types`.

### E19-09 — Degrade explicitly when hooks are missing or the bridge fails

```yaml
id: E19-09
depends-on: [E19-07]
refs: [AGT-013, 9.3, 13.2:16, 16:21]
covers: [AGT-013, 13.2:16, 16:21]
type: task
scope: ui
size: S
```

**Goal:** Without hooks, or if the control server fails to start, the terminal works and agent state comes only from process/OSC signals marked as low-confidence.

**Acceptance criteria:**

- [ ] The store exposes a `source`/degraded field per agent when no hook events arrive; no state is invented from output silence (9.3).
- [ ] A control-server start failure is non-fatal and logged; PTYs still open (IR-18).
- [ ] Tests: no hooks installed -> process-detected agent with `source: process`; failing control server -> terminal still opens.

**Verification:** `pnpm test`, `cargo test --locked --workspace` in `src-tauri`; manual: with hooks uninstalled, `claude` runs normally in a pane.

### E19-10 — Robustness tests: out-of-order, duplicate, malformed, late hooks and app close

```yaml
id: E19-10
depends-on: [E19-06, E19-07]
refs: [F5:8, 13.5]
covers: [F5:8, 13.5:1, 13.5:4]
type: task
scope: be
size: M
```

**Goal:** The hook pipeline handles every failure case of 13.5 without wrong states or hangs.

**Acceptance criteria:**

- [ ] Rust tests (agent_events.rs, control.rs): duplicate replay id, malformed JSON, out-of-order and late events, timeout.
- [ ] Closing the app while a hook waits for a decision releases the hook with the fallback answer (13.5:1).
- [ ] TS reducer tests: out-of-order events and late events after `exited` are ignored; fallback without hooks.

**Verification:** `cargo test --locked --workspace` in `src-tauri`; `pnpm test`.

### E19-11 — Verify multi-agent correlation with the official CLIs

```yaml
id: E19-11
depends-on: [E19-08, E19-09, E19-10, E19-04]
refs: [F5:gate, 13.2, 16]
covers: [AGT-001, AGT-002, 9.1, 13.2:13, 13.2:14, 16:15, 16:17, F5:gate]
type: task
scope: be
size: S
```

**Goal:** Prove that official `claude` and `codex` run with their own auth and that every event lands in the right pane, also with two sessions in the same cwd.

**Acceptance criteria:**

- [ ] Automated test: two simulated sessions in the same cwd with distinct pane tokens; each event is attributed to its own PTY (13.2:14, 16:17).
- [ ] Manual: `claude` and `codex` in different tabs show correlated states and notifications (13.2:13).
- [ ] Manual F5 gate: two Claude sessions in one directory; the approval is resolved in the correct terminal.
- [ ] lut never reads, exports or simulates CLI credentials and has no API key setting (9.1, 16:15); confirmed by grep of `src/` and `src-tauri/`.

**Verification:** `cargo test --locked --workspace` in `src-tauri`, `pnpm test`; manual checklist recorded in the PR.

### E19-12 — Close-out: Agents core

```yaml
id: E19-12
depends-on: [E19-01, E19-02, E19-03, E19-04, E19-05, E19-06, E19-07, E19-08, E19-09, E19-10, E19-11]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E20 — Agents UX: badges, notifications, hooks manager, focus

```yaml
id: E20
depends-on: [E11, E19, E02, E12, E13, E18]
refs: [9.6, AGT-006, AGT-007, AGT-010, F5, .docs/plan/analysis/agents.md]
```

Agent status in tabs, native and in-app notifications (including BEL and OSC 9/777, decision 17), focus-next-attention,
the hooks manager with preview/diff and selective uninstall, and event retention. No activity view (decision 27).

### E20-01 — Route BEL and OSC 9/777 terminal notifications into the notification pipeline

```yaml
id: E20-01
depends-on: []
refs: [9.6:7, .docs/plan/analysis/decisions.md]
covers: [agents/notification-routing]
type: task
scope: ui
size: S
```

**Goal:** Per decision 17, BEL and OSC 9/777 from any pane reach lut's notification routing, attributed to their pane.

**Acceptance criteria:**

- [ ] BEL, OSC 9 and OSC 777 `notify` sequences produce a terminal-notification event with pane id and sanitized title/body (length-limited).
- [ ] Routed through the same dedupe gate and delivery decision (`notificationGate.ts`, `delivery.ts`) as agent events.
- [ ] Unit tests for each sequence and for dedupe.

**Verification:** `pnpm test`; manual: `printf '\a'` and `printf '\e]9;hi\a'` in an unfocused tab produce one notification each.

### E20-02 — Per-kind notification preferences, frequency limits and redaction

```yaml
id: E20-02
depends-on: [E20-01, E19-05]
refs: [AGT-010, F5:6, 9.6:7, 14.2]
covers: [AGT-010, F5:6, 9.6:7]
type: task
scope: ui
size: M
```

**Goal:** Notification routing honours per-kind settings (attention, response-done, error, terminal bell) for native notification and sound, with redacted bodies by default.

**Acceptance criteria:**

- [ ] The settings model replaces the two booleans (`agentNotifications`, `agentNotificationSound`) with per-kind entries; old values mapped on load.
- [ ] No notification per tool call or token; only relevant transitions notify (9.6:7); configurable frequency limit.
- [ ] Bodies omit prompts, paths and commands unless the privacy opt-in (E19-05) is on.
- [ ] Route/delivery tests extended for every kind.

**Verification:** `pnpm test`, `pnpm check-types`.

### E20-03 — Bounded local event history with an explicit retention policy

```yaml
id: E20-03
depends-on: []
refs: [9.6:6, 14.2:2, F5:6]
covers: [9.6:6]
type: task
scope: ui
size: S
```

**Goal:** Keep a short in-memory history of normalized agent events per session, with a documented retention policy.

**Acceptance criteria:**

- [ ] Ring buffer capped per session and globally; cleared when the session ends plus a grace period.
- [ ] Nothing persisted to disk unless the persistent-timeline opt-in is enabled (14.2:2).
- [ ] Retention policy documented in `.docs/` and unit-tested.

**Verification:** `pnpm test`.

### E20-04 — Focus-next-agent-needing-attention action

```yaml
id: E20-04
depends-on: [E13-01]
refs: [F5:4, 9.6:2, 16:19]
covers: [F5:4, 16:19]
type: task
scope: ui
size: S
```

**Goal:** A keyboard-bindable action focuses the pane of the next agent needing attention, using `nextAttentionAgent`.

**Acceptance criteria:**

- [ ] Action registered in the shortcut/command registry; cycles by attention order across tabs and windows-of-tabs; no-op when none.
- [ ] Activating a notification uses the same focus path.
- [ ] Unit test of ordering.

**Verification:** `pnpm test`; manual with two waiting agents in different tabs.

### E20-05 — Agent icon and status badges on tabs and panes

```yaml
id: E20-05
depends-on: [E11-06, E11-02, E19-09, E12-04]
refs: [9.6:1, 9.6:2, F5:3, AGT-005]
covers: [9.6:1, 9.6:2, F5:3, agents/ui-components]
type: task
scope: ui
size: M
```

**Goal:** Implement the user's design of agent icons and state badges in tabs/panes on the E19 store, replacing `agentIcon` and the old tab status.

**Acceptance criteria:**

- [ ] Every normalized state, including degraded/no-hooks, has its designed badge (13.2:16).
- [ ] A needs-approval tab is highlighted per design.
- [ ] Old `AgentIcon`/tab status code deleted.

**Verification:** `pnpm test`, `pnpm check-types`; manual run with hooks on and off.

### E20-06 — Native notifications and in-app notification list with focus action

```yaml
id: E20-06
depends-on: [E20-02, E20-04, E11-06]
refs: [AGT-006, 9.6:3, 16:18]
covers: [AGT-006, 9.6:3, 16:18, agents/notifications-bridge]
type: task
scope: ui
size: M
```

**Goal:** Replace `AgentNotificationsBridge`, `NotificationBell` and `AgentToast` with the designed notification surfaces fed by the E19 store.

**Acceptance criteria:**

- [ ] Completion and attention requests appear on the tab and as notifications; activating one focuses the pane (E20-04).
- [ ] response-done notification is configurable and never replaces CLI output (9.6:3).
- [ ] Old bridge and components deleted; `pnpm knip` clean.

**Verification:** `pnpm test`, `pnpm knip`; manual: Claude finishing in a background tab notifies and the click focuses it.

### E20-07 — Notification settings section

```yaml
id: E20-07
depends-on: [E20-02, E11-03, E13-07]
refs: [AGT-010]
covers: [AGT-010]
type: task
scope: ui
size: S
```

**Goal:** Implement the designed settings UI for per-kind notifications, sound, frequency and privacy opt-ins.

**Acceptance criteria:**

- [ ] Every preference of E20-02 and the privacy opt-in of E19-05 is editable and persisted.
- [ ] Sound uses `public/notification.mp3` (decision 21b).

**Verification:** `pnpm test`; manual: toggling a kind changes delivery immediately.

### E20-08 — Hooks manager backend: documented events only, plan/apply as the only write path

```yaml
id: E20-08
depends-on: [E02-11, E02-12, E19-02]
refs: [AGT-007, F5:2, 9.4, 13.2:15]
covers: [agents/hook-installer]
type: task
scope: be
size: M
```

**Goal:** The installer exposes per-agent status, plan (diff) and apply for install and uninstall, only for documented events, and never touches foreign hooks. This issue builds the plan/apply path and the JSON settings formats (Claude, Codex, Gemini); the Pi extension file follows in E20-09.

**Acceptance criteria:**

- [ ] Event lists follow the E19-02 table; undocumented events are never installed (IR-80); tool/subagent events stay off until a consumer asks.
- [ ] Plan returns a textual diff per file; apply refuses if the file changed since the plan.
- [ ] Uninstall per agent removes only lut-owned groups; mixed and third-party groups preserved byte-for-byte outside lut groups.
- [ ] Consent (IR-75) covers writing hook commands that call `lut-cli` into agent configs; the pane launcher `lut` (open/identify, decision 21c, used by `lut <file>`) stays on PATH in lut panes by default and is not gated by hook consent.
- [ ] Tests for Claude, Codex and Gemini configs with third-party hooks.

**Verification:** `cargo test --locked --workspace` in `src-tauri`.

### E20-09 — Hooks manager backend: Pi extension file plan/apply

```yaml
id: E20-09
depends-on: [E20-08]
refs: [AGT-007, 9.4, .docs/plan/analysis/agents.md]
covers: [agents/hook-installer]
type: task
scope: be
size: S
```

**Goal:** The Pi notification extension (`lut-notifications.ts`, versioned `lut-pi-notifications-v*` family, E02-11) is installed and removed only through the E20-08 plan/apply path.

**Acceptance criteria:**

- [ ] Plan shows the extension file to create, update (older lut version) or delete; apply refuses if the file changed since the plan.
- [ ] Only lut's own extension files are touched; other Pi extensions are untouched.
- [ ] Tests: fresh install, upgrade from an older lut version, uninstall, foreign extension present.

**Verification:** `cargo test --locked --workspace` in `src-tauri`.

### E20-10 — Hooks manager UI with preview/diff and selective uninstall

```yaml
id: E20-10
depends-on: [E20-08, E20-09, E11-06]
refs: [AGT-007, F5:2, 13.2:15, 16:20]
covers: [AGT-007, F5:2, 13.2:15, 16:20]
type: task
scope: ui
size: M
```

**Goal:** Users see per-agent hook status, review the exact diff and consent before lut installs or removes its hooks.

**Acceptance criteria:**

- [ ] Install and uninstall go through preview -> consent -> apply; a stale preview shows an error and a re-preview path.
- [ ] Uninstall per agent; non-lut hooks untouched.

**Verification:** `pnpm test`; manual: install then uninstall on a `~/.claude/settings.json` with third-party hooks (sandboxed HOME); file returns to its original bytes.

### E20-11 — Remove silent hook installs from the agent launch flow and the notification bell

```yaml
id: E20-11
depends-on: [E20-10, E09-03]
refs: [AGT-007, 9.2, .docs/plan/analysis/proposal.md, .docs/plan/analysis/agents.md]
covers: [AGT-007]
type: task
scope: ui
size: S
```

**Goal:** No code path installs hooks without preview and consent (IR-16, AGT-007). Today launching an agent from the new-tab launcher calls `invoke("agent_enable_hooks")` silently (`App.tsx:636`, moved to `useAgentLaunch` by E09-03), and so does the notification bell (`NotificationBell.tsx:218`).

**Acceptance criteria:**

- [ ] The agent launch flow and the notification bell never call `agent_enable_hooks` (or any apply command) directly.
- [ ] When hooks for the launched agent are missing, the agent still starts, and the user is offered the E20-10 preview -> consent -> apply flow (dismissable; dismissing leaves the agent in the degraded "no hooks" state of E19-09).
- [ ] `agent_enable_hooks` is removed if it has no remaining caller, or reduced to the E20-08 plan/apply path.
- [ ] Test: launching an agent with missing hooks writes no file (mocked `invoke` asserts no apply call).

**Verification:** `pnpm test`; manual in a sandboxed HOME: launch Claude from the launcher with no hooks installed → `~/.claude/settings.json` unchanged until consent.

### E20-13 — Project panel of active agent sessions

```yaml
id: E20-13
depends-on: [E20-05, E11-05, E11-06, E18-02, E19-08]
refs: [9.6:5]
covers: [9.6:5]
type: task
scope: ui
size: S
```

**Goal:** Optional per-project panel listing active agent sessions with state and subagent count; selecting one focuses its pane.

**Acceptance criteria:**

- [ ] Uses the E19-08 tab/project selector; updates live.
- [ ] Implemented per the user's design.

**Verification:** `pnpm test`; manual with two agents in one project.

### E20-15 — Ship agent hooks as plugins the user installs by hand

```yaml
id: E20-15
depends-on: [E19-02]
refs: [AGT-007, 9.4, 13.2:21, .docs/plan/analysis/agents.md]
covers: [AGT-007, agents/hook-installer, F0:9]
type: task
scope: be
size: L
size-exception: the plugins are declarative manifests and hook files; the rest deletes the write path
```

**Goal:** lut never writes, edits or deletes files of other programs (`~/.claude`, `~/.codex`, `~/.gemini`, `~/.pi`). Its hooks ship as plugins (Claude Code plugin, Codex plugin, Gemini CLI extension, Pi package, or whatever each agent documents) kept in this repository; the user installs and removes them by hand with the agent's own commands.

**Acceptance criteria:**

- [ ] One plugin per supported agent under a single directory of this repository, with the manifests each agent needs to install it from GitHub (e.g. `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`); events follow the E19-02 table (documented events only).
- [ ] The hook commands keep today's contract: run `lut-cli` through `LUT_CLI` inside lut panes and print `{}` outside lut, so an installed plugin is inert outside lut and after lut is uninstalled. One hook file works on Windows, macOS and Linux.
- [ ] Agents without a documented plugin/extension mechanism get a documented snippet the user pastes by hand.
- [ ] lut's write path is removed: `agent_enable_hooks`, `agent_disable_hooks`, `agent_hooks_plan`, `agent_hooks_apply`, the Pi extension writer and their callers (new-tab launcher, notification bell). Nothing in lut opens agent config files for writing; a test or grep in CI guards it.
- [ ] lut learns that a plugin is installed from the events it sends (e.g. `SessionStart` carries the plugin version), not by reading agent configs; with no events, the agent runs in the degraded "no hooks" state of E19-09 and lut shows where the install instructions are.
- [ ] User docs per agent: install, update, remove, the agent's own trust/approval step (e.g. Codex `/hooks`), and how to remove lut groups written by earlier lut builds.
- [ ] `proposal.md` AGT-007 and the issues built on the write path (E20-08, E20-09, E20-10, E20-11) are updated to this model.

**Verification:** `cargo test --locked --workspace` in `src-tauri` and `pnpm test`; manual on Windows: install each plugin from the repository with the agent's own command, run the agent in a lut pane (events arrive) and outside lut (no output, no error), uninstall it; this also runs the F0:9 agent check moved from E04-13; `~/.claude`, `~/.codex`, `~/.gemini` and `~/.pi` are never modified by lut (before/after snapshot).

**Notes:** installing from GitHub needs the public repository (E04-09).

**Out of scope:** lut plugins (AGT-014); the statusLine bridge of E21.

### E20-14 — Close-out: Agents UX

```yaml
id: E20-14
depends-on: [E20-01, E20-02, E20-03, E20-04, E20-05, E20-06, E20-07, E20-08, E20-09, E20-10, E20-11, E20-13, E20-15]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E21 — Agent resume and statusLine metrics

```yaml
id: E21
depends-on: [E17, E19, E16, E20]
refs: [PRJ-010, 8.6, 9.7, F5:7, .docs/plan/analysis/agents.md]
```

Resume agent conversations as an explicit action, separate from project restore, and an optional statusLine bridge for
context/model metrics that never overrides the user's own statusLine. Version-dependent; may slip.

### E21-01 — Spike: official resume options of Claude Code and Codex

```yaml
id: E21-01
depends-on: []
refs: [8.6, PRJ-010]
covers: [8.6]
type: spike
scope: be
size: S
```

**Goal:** Determine which official flags (`--continue`, `--resume`, specific session id) each CLI version supports and how the agent session id is obtained from hook events.

**Acceptance criteria:**

- [ ] Table per CLI/version: resume mechanism, required session id, docs URL (IR-56).
- [ ] States clearly that opening `claude` in a new PTY is not restoring the old process (IR-20).
- [ ] Follow-up issues added to plan.md if gaps appear.

**Verification:** findings committed under `.docs/`.

### E21-02 — Persist agent session ids per project pane and build resume commands

```yaml
id: E21-02
depends-on: [E21-01, E16-05, E19-07]
refs: [PRJ-010, 8.6]
covers: [PRJ-010]
type: task
scope: ui
size: M
```

**Goal:** Store the last agent session id per project pane (metadata only) and compute the official resume command for it.

**Acceptance criteria:**

- [ ] Session id taken from normalized SessionStart events (E19); no prompt or transcript stored (14.2:3).
- [ ] Resume command built only for CLIs/versions validated in E21-01; others return "not supported".
- [ ] Unit tests for each supported CLI.

**Verification:** `pnpm test`, `pnpm check-types`.

### E21-03 — Offer agent resume as an explicit action after project restore

```yaml
id: E21-03
depends-on: [E21-02, E11-05, E11-06, E17-15]
refs: [PRJ-010, 8.6]
covers: [PRJ-010]
type: task
scope: ui
size: S
```

**Goal:** After a project is restored, panes that had an agent session offer a resume action; nothing resumes automatically.

**Acceptance criteria:**

- [ ] The resume action runs the command from E21-02 in that pane only after user action.
- [ ] Restore without resume keeps working; unsupported CLIs show no action.

**Verification:** `pnpm test`; manual: restore a project with a Claude pane and resume it.

### E21-04 — Spike: non-destructive statusLine bridge for Claude Code

```yaml
id: E21-04
depends-on: []
refs: [9.7, AGT-009]
covers: [9.7]
type: spike
scope: be
size: S
```

**Goal:** Decide whether lut can chain the user's existing statusLine command and which documented fields (context, model, duration, usage) are available.

**Acceptance criteria:**

- [ ] Coexistence approach with a user statusLine documented; nothing replaced silently (IR-82).
- [ ] Field list with docs URL per version; usage is never presented as cost.

**Verification:** findings committed under `.docs/`.

### E21-05 — Optional statusLine bridge preserving the user's command

```yaml
id: E21-05
depends-on: [E21-04, E20-08]
refs: [F5:7, 9.7, AGT-009]
covers: [F5:7, AGT-009]
type: task
scope: be
size: M
```

**Goal:** Opt-in bridge that feeds documented session metrics into the agent store while still running and printing the user's original statusLine.

**Acceptance criteria:**

- [ ] Installed through the hooks manager preview/consent flow; uninstall restores the original setting byte-for-byte.
- [ ] The user's statusLine output is unchanged; metrics redacted/suppressed by default.
- [ ] Metrics carried as normalized fields on the agent session; tests for chaining and uninstall.

**Verification:** `cargo test --locked --workspace` in `src-tauri`, `pnpm test`.

### E21-06 — Show agent session metrics in the UI

```yaml
id: E21-06
depends-on: [E21-05, E11-06]
refs: [AGT-009]
covers: [AGT-009]
type: task
scope: ui
size: S
```

**Goal:** Display available context/model/duration metrics per the user's design, only when a documented source exists.

**Acceptance criteria:**

- [ ] Hidden when no metrics are present; no cost figures.
- [ ] Behaviour: a component test renders the metrics when the store has them and renders nothing otherwise; no cost field exists in the model.
- [ ] A screenshot is attached to the PR.

**Verification:** `pnpm test`; manual with the bridge enabled.

### E21-07 — Close-out: Agent resume and metrics

```yaml
id: E21-07
depends-on: [E21-01, E21-02, E21-03, E21-04, E21-05, E21-06]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E22 — Command palette, context menus, polish and accessibility

```yaml
id: E22
depends-on: [E11, E12, E05, E06, E13, E14, E15, E17, E18]
refs: [F6, UX-006, UX-007, UX-008, UX-010, UX-011, TER-013, .docs/plan/analysis/app-shell.md]
```

Turns the palette into a terminal/project action launcher, adds context menus, and finishes density, compact tabs,
accessibility and loading/error states on top of the user's design.

### E22-01 — Refactor the command palette into an extensible command registry

```yaml
id: E22-01
depends-on: [E06-01, E05-07]
refs: [UX-008, .docs/plan/analysis/app-shell.md]
covers: [app-shell/command-palette-logic]
type: task
scope: ui
size: M
```

**Goal:** Replace the static `createCommandItems` list with a registry that core and optional modules extend, with no behaviour change. Pure refactor.

**Acceptance criteria:**

- [ ] `src/modules/command-palette/commands.ts` exposes a register/unregister API; existing commands are registered through it.
- [ ] Optional IDE tools (editor, Git, explorer, preview, file/content search) register their own commands lazily; the palette core imports none of them.
- [ ] Fuzzy, mode and MRU libs reused unchanged; `commands.test.ts` adapted and passing.

**Verification:** `pnpm test`; `pnpm check-types`; `pnpm knip`.

**Notes:** commands.ts:69-306; file search coupling in useFileSearch.ts:47-106 and useContentSearch.ts:31.

**Out of scope:** new commands, visuals.

### E22-02 — Add terminal, tab, profile and project actions to the palette registry

```yaml
id: E22-02
depends-on: [E22-01, E14-14, E17-08]
refs: [UX-008, F6:1]
covers: [UX-008]
type: task
scope: ui
size: S
```

**Goal:** Orient the palette to terminal and project actions: new tab/split with a profile, close/move panes, switch tab, open/restore project.

**Acceptance criteria:**

- [ ] Commands for new tab, split (each orientation), close pane, focus next/previous tab, "new tab with profile <name>" (one per profile) and "open project <name>" (one per project).
- [ ] Commands call existing store actions; profile/project entries update live when the stores change.
- [ ] Unit tests for registration and invocation of each action group.

**Verification:** `pnpm test`; manual: run each action from the palette.

### E22-03 — Rebuild the CommandPalette component on the lut design

```yaml
id: E22-03
depends-on: [E22-02, E11-07]
refs: [F6:1, UX-008]
covers: [app-shell/command-palette-ui, F6:1]
type: task
scope: ui
size: M
```

**Goal:** Replace `CommandPalette.tsx` with a component implementing the E11-07 design on top of the registry.

**Acceptance criteria:**

- [ ] Implements the E11-07 palette design; the palette core does not import the explorer `FileIcon` or the theme picker.
- [ ] Fully keyboard operable (open, filter, navigate, run, dismiss); results announced to screen readers.
- [ ] Optional-tool modes (file/content search) appear only when that tool is loaded.

**Verification:** `pnpm test`; `pnpm check-types`; manual keyboard-only walk-through.

### E22-04 — Add tab and pane context menus

```yaml
id: E22-04
depends-on: [E11-07]
refs: [UX-007, F6:2]
covers: [UX-007, F6:2]
type: task
scope: ui
size: S
```

**Goal:** Context menus for tabs and panes per the E11-07 design.

**Acceptance criteria:**

- [ ] Tab menu: rename, set color, close, close others, close to the right, move.
- [ ] Pane menu: split (both orientations), close pane, copy, paste.
- [ ] Actions reuse navigation-store planners; menus reachable by keyboard (context-menu key / Shift+F10).

**Verification:** `pnpm test`; manual on tabs and panes.

### E22-05 — Add project context menus in the projects navigator

```yaml
id: E22-05
depends-on: [E11-07, E11-05, E18-02]
refs: [UX-007, F6:2]
covers: [UX-007]
type: task
scope: ui
size: S
```

**Goal:** Context menu on projects in the sidebar navigator per the E11-07 and E11-05 designs.

**Acceptance criteria:**

- [ ] Open, restore, rename and remove actions call existing project store actions.
- [ ] Reachable by keyboard.

**Verification:** `pnpm test`; manual in the projects sidebar.

### E22-06 — Add advanced shortcuts for palette, context and navigation actions

```yaml
id: E22-06
depends-on: [E22-02, E13-09]
refs: [F6:6, TER-008]
covers: [F6:6]
type: task
scope: ui
size: S
```

**Goal:** Every registry command can be bound to a user-configurable shortcut, including chords.

**Acceptance criteria:**

- [ ] Registry commands are listed by the shortcuts system and accept user bindings.
- [ ] Chord (two-step) bindings supported; conflicts reported; keys a focused TUI needs are not stolen unless explicitly bound.
- [ ] `shortcuts.test.ts` / `resolveShortcut.test.ts` cover chords and conflicts.

**Verification:** `pnpm test`; manual: bind and use a chord inside and outside Neovim.

### E22-07 — Add a compact/normal density setting

```yaml
id: E22-07
depends-on: [E12-01]
refs: [UX-006, F6:7]
covers: [UX-006, F6:7]
type: task
scope: ui
size: S
```

**Goal:** A density setting (compact/normal) applied app-wide through the E12-01 spacing scale.

**Acceptance criteria:**

- [ ] Setting persisted in the settings store; switching applies without restart.
- [ ] Shell surfaces use density tokens; no hard-coded spacing left in the shell components.

**Verification:** `pnpm test`; manual toggle in both themes.

### E22-08 — Add compact and expandable tab modes

```yaml
id: E22-08
depends-on: [E11-02, E12-05]
refs: [TER-013]
covers: [TER-013]
type: task
scope: ui
size: S
```

**Goal:** Tabs can be shown compact or expanded, in horizontal and vertical layouts, per the E11-02 design.

**Acceptance criteria:**

- [ ] Mode persisted; toggle available from the palette and settings.
- [ ] Agent attention badges remain visible in compact mode.

**Verification:** `pnpm test`; manual with 20+ tabs.

### E22-09 — Add tab groups

```yaml
id: E22-09
depends-on: [E22-08, E11-02]
refs: [TER-013]
covers: [TER-013]
type: task
scope: ui
size: M
```

**Goal:** Users can group tabs, collapse/expand groups and move tabs between groups.

**Acceptance criteria:**

- [ ] Group model in the navigation store with unit tests (create, rename, collapse, move tab, deleting a group keeps its tabs).
- [ ] Groups persisted with the session/project layout.
- [ ] UI per E11-02.

**Verification:** `pnpm test`; manual: groups survive a restart.

### E22-10 — Add accessible loading, error and missing-permission states

```yaml
id: E22-10
depends-on: [E11-02]
refs: [UX-010]
covers: [UX-010]
type: task
scope: ui
size: M
```

**Goal:** Loading, error and missing-permission states across shell, profiles, projects and agents are accessible and non-intrusive.

**Acceptance criteria:**

- [ ] Shared status components per E11-02 used for: shell spawn failure, project restore error, hook install permission error, lazy tool loading.
- [ ] Errors announced through an ARIA live region; none steals terminal focus.

**Verification:** `pnpm test`; manual: profile with a non-existent shell; read-only settings directory.

### E22-11 — Keyboard operability and visible focus: tab navigator and projects sidebar

```yaml
id: E22-11
depends-on: [E22-04]
refs: [F6:8, UX-011]
covers: [F6:8, UX-011]
type: task
scope: ui
size: M
```

**Goal:** The tab navigator (both orientations) and the projects sidebar are fully keyboard operable with logical focus order, visible focus and ARIA roles; the shared a11y test setup is added here.

**Acceptance criteria:**

- [ ] Tab bar and sidebar navigable by keyboard (roving focus, arrow keys, activation); focus returns to the terminal after leaving them.
- [ ] Focus ring uses the theme's `ring` token; text contrast of these surfaces meets WCAG AA in both themes.
- [ ] axe is wired into vitest (shared helper); the tab navigator and sidebar report no serious violations.

**Verification:** `pnpm test`; manual keyboard-only session over tabs and projects; Narrator smoke.

### E22-12 — Keyboard operability and visible focus: dialogs and menus

```yaml
id: E22-12
depends-on: [E22-11, E22-04, E22-05]
refs: [F6:8, UX-011]
covers: [F6:8, UX-011]
type: task
scope: ui
size: S
```

**Goal:** Dialogs (close confirmations, consent modal, errors), context menus and the command palette are keyboard operable with correct focus trapping and return.

**Acceptance criteria:**

- [ ] Every dialog traps focus, closes with Escape where safe and returns focus to the element (or terminal) that opened it.
- [ ] Context menus and the palette are navigable by arrow keys with ARIA menu/listbox roles.
- [ ] axe (E22-11 helper) reports no serious violations on these surfaces.

**Verification:** `pnpm test`; manual keyboard-only session over dialogs and menus.

### E22-13 — Keyboard operability and visible focus: settings

```yaml
id: E22-13
depends-on: [E22-11, E13-07, E13-09, E15-02]
refs: [F6:8, UX-011]
covers: [F6:8, UX-011]
type: task
scope: ui
size: S
```

**Goal:** The settings surface (section navigation, pickers, shortcuts editor, profile editor) is keyboard operable with visible focus and labelled controls.

**Acceptance criteria:**

- [ ] Section navigation, every control and the shortcuts editor recording mode work by keyboard; every input has an accessible label.
- [ ] axe (E22-11 helper) reports no serious violations on the settings sections.

**Verification:** `pnpm test`; manual keyboard-only session in settings.

### E22-14 — Support high DPI, minimum window size and scaling changes

```yaml
id: E22-14
depends-on: [E11-02]
refs: [UX-011, F7:5]
covers: [UX-011]
type: task
scope: ui
size: S
```

**Goal:** Layout stays usable at 100-250% scaling and at a defined minimum window size.

**Acceptance criteria:**

- [ ] `minWidth`/`minHeight` set in `src-tauri/tauri.conf.json`; no clipped controls at the minimum size.
- [ ] Terminal cell metrics recomputed on DPI change (moving between monitors).

**Verification:** manual on Windows at 100/150/200% and across two monitors with different scaling.

### E22-15 — Close-out: palette and polish

```yaml
id: E22-15
depends-on: [E22-01, E22-02, E22-03, E22-04, E22-05, E22-06, E22-07, E22-08, E22-09, E22-10, E22-11, E22-12, E22-13, E22-14]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E23 — Export and import of profiles and projects

```yaml
id: E23
depends-on: [E14, E16, E17, E11]
refs: [PRO-007, PRJ-015, F4:8, 16:14]
```

Portable export/import schema for profiles and projects that never contains secrets; imported projects never relaunch commands without consent.

### E23-01 — Define the portable export schema without secrets

```yaml
id: E23-01
depends-on: [E14-09, E16-04]
refs: [F4:8, PRO-007, PRJ-015]
covers: [F4:8]
type: task
scope: ui
size: S
```

**Goal:** One versioned, documented JSON schema for exported profiles and projects, with a serializer that strips secrets.

**Acceptance criteria:**

- [ ] Schema has `schemaVersion`, `kind` (profiles | projects) and a validated payload (Zod).
- [ ] Secret env values, tokens and stored permissions are excluded or replaced by placeholders.
- [ ] The parser rejects unknown versions with a clear error.

**Verification:** `pnpm test` (round-trip; secret fields absent from output); `pnpm typecheck`.

### E23-02 — Export and import profiles

```yaml
id: E23-02
depends-on: [E23-01, E11-03]
refs: [PRO-007]
covers: [PRO-007]
type: task
scope: ui
size: S
```

**Goal:** Users export selected profiles to a file and import them, resolving id/name conflicts.

**Acceptance criteria:**

- [ ] Export/import entries placed as designed in E11-03, using the native file dialog.
- [ ] Conflicts offer rename or replace; imported executables are validated by the backend on use (decision 10).

**Verification:** `pnpm test`; manual: export two profiles, import them into a clean data dir.

### E23-03 — Export and import projects without relaunch approvals

```yaml
id: E23-03
depends-on: [E23-01, E11-05, E17-13]
refs: [PRJ-015, 16:14]
covers: [PRJ-015, 16:14]
type: task
scope: ui
size: M
```

**Goal:** Users export and import projects; an imported project never relaunches a command without consent.

**Acceptance criteria:**

- [ ] Export includes the saved layout, per-pane profile references and running commands, without secrets or relaunch approvals.
- [ ] An imported project has no approvals: every relaunch asks (E17-13) until the user chooses "Always in this Space".
- [ ] Missing referenced profiles produce repairable errors, not failures.

**Verification:** `pnpm test`; manual: import a project with a running command → consent requested, nothing runs before.

### E23-04 — Close-out: export/import

```yaml
id: E23-04
depends-on: [E23-01, E23-02, E23-03]
refs: []
type: closeout
scope: none
size: XS
covers: []
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E24 — Cross-platform validation

```yaml
id: E24
depends-on: [E12, E17, E01, E19]
refs: [13.2, 13.3, 13.5, 16, F7:5, .docs/plan/analysis/decisions.md]
```

Validates lut on Windows 11 (primary) with TUI and failure-mode tests, and adds macOS/Linux CI builds plus a launch
smoke test (decision 20).

### E24-01 — Add macOS and Linux build jobs to CI

```yaml
id: E24-01
depends-on: [E01-05]
refs: [13.3:2, 13.3:3, .docs/plan/analysis/build-identity.md]
covers: [13.3:2, 13.3:3]
type: task
scope: none
size: S
```

**Goal:** Every PR builds lut on macOS and Linux in CI, next to Windows (decision 20).

**Acceptance criteria:**

- [ ] CI matrix (windows-latest, macos-latest, ubuntu-22.04) runs `pnpm install --frozen-lockfile`, `pnpm check-types`, `pnpm test`, `cargo test --locked --workspace` (in `src-tauri`) and `pnpm tauri build --debug`.
- [ ] Linux job installs `libwebkit2gtk-4.1-dev`, `libgtk-3-dev` and the other Tauri prerequisites.

**Verification:** CI green on all three runners for a test PR.

### E24-02 — Add a launch smoke test to the CI matrix

```yaml
id: E24-02
depends-on: [E24-01]
refs: [13.3:2, 13.3:3, 13.3:4]
covers: [13.3:2, 13.3:3]
type: task
scope: none
size: S
```

**Goal:** Each CI build launches the app, opens the default shell, runs a command and exits cleanly.

**Acceptance criteria:**

- [ ] Smoke script (e.g. `scripts/launch-smoke/`) starts the debug binary with `LUT_SMOKE=1`, waits for the first PTY output and exits 0, or fails on timeout.
- [ ] Linux runs under Xvfb; macOS and Windows on standard runners.

**Verification:** CI shows the smoke step passing on the three OSes; a forced spawn failure makes it fail.

### E24-03 — Port the PTY smoke harness to Windows and lut identifiers

```yaml
id: E24-03
depends-on: [E02-06, E02-09]
refs: [F0:11, 13.4:2, 13.4:3, .docs/plan/analysis/backend-core.md]
covers: [backend-core/pty-smoke]
type: task
scope: be
size: M
```

**Goal:** Reproducible PTY latency/throughput baseline on Windows 11.

**Acceptance criteria:**

- [ ] `scripts/pty-smoke/run.py` runs on Windows (and still on macOS); the temp bundle id uses `dev.lucode.lut.pty-smoke-*`.
- [ ] `driver-old.ts` removed; `TERAX_SMOKE_*` env renamed to `LUT_SMOKE_*`.
- [ ] Usage documented next to the script.

**Verification:** `python scripts/pty-smoke/run.py --fast` on Windows produces a results JSON.

### E24-04 — Verify shells and TUIs on Windows 11

```yaml
id: E24-04
depends-on: []
refs: [TER-007, 13.2, 13.3:1, .docs/plan/analysis/terminal.md]
covers: [TER-007, 13.2:1, 13.2:2, 13.2:3, 13.2:4, 13.3:1, 16:1, 16:2]
type: task
scope: none
size: M
```

**Goal:** Run and record the Windows acceptance checks for shells and TUIs; every failure is fixed or filed.

**Acceptance criteria:**

- [ ] pwsh 7, CMD and WSL Ubuntu: interactive shell, correct prompt and cwd (`C:\` and `D:\`), keyboard works.
- [ ] Neovim: alternate screen, key combinations, selection and resize; lazygit: mouse, resize and Unicode.
- [ ] ConPTY, Job Object cleanup, clipboard, IME and WebView2 checked.
- [ ] Results recorded in `.docs/testing/windows.md`; each failure added as an issue to plan.md.

**Verification:** manual checklist on Windows 11; `pnpm test` and `cargo test --manifest-path src-tauri/Cargo.toml` green.

### E24-05 — Run OS-specific checks for clipboard, IME, WSL, fonts, WebKit and DPI

```yaml
id: E24-05
depends-on: [E24-02]
refs: [F7:5, 13.3]
covers: [F7:5, 13.3:4]
type: task
scope: none
size: M
```

**Goal:** Exercise the OS-specific matrix (13.3) on the platforms available and document the results.

**Acceptance criteria:**

- [ ] Unicode, Nerd Fonts, UI responsiveness, GPU fallback, hidden sessions, notifications and TUI apps checked on Windows.
- [ ] macOS and Linux: launch smoke plus clipboard and font rendering checked (CI or manual); untested points listed as risks.
- [ ] Results in `.docs/testing/os-matrix.md`.

**Verification:** manual checklist; CI smoke green.

### E24-06 — Check renderer leaks with repeated splits

```yaml
id: E24-06
depends-on: []
refs: [16:5, 13.4]
covers: [16:5]
type: task
scope: ui
size: S
```

**Goal:** Prove that creating and closing splits does not leak renderer instances or memory.

**Acceptance criteria:**

- [ ] Test (vitest or bench script) opens/closes 50 splits and asserts renderer/WASM instance counts return to baseline.
- [ ] Manual heap snapshot comparison documented.

**Verification:** `pnpm test`; DevTools memory snapshots before/after.

### E24-07 — Test recovery when the shell or agent process is killed

```yaml
id: E24-07
depends-on: [E19-09]
refs: [13.5:2]
covers: [13.5:2]
type: task
scope: be
size: S
```

**Goal:** Killing the shell or an agent process unexpectedly leaves lut consistent.

**Acceptance criteria:**

- [ ] Pane shows an exited state; no orphan session in the backend registry; agent status cleared.
- [ ] Rust test kills the child and asserts session cleanup.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml`; manual `taskkill /F` on the shell.

### E24-08 — Test frontend reload and webview disconnection during a PTY stream

```yaml
id: E24-08
depends-on: []
refs: [13.5:3, 13.5:6]
covers: [13.5:3, 13.5:6]
type: task
scope: be
size: S
```

**Goal:** Reloading the frontend (HMR) or losing the webview while output streams neither crashes the backend nor leaks sessions.

**Acceptance criteria:**

- [ ] Backend tolerates a closed channel (no panic, bounded buffers).
- [ ] After reload, panes reattach or are cleanly closed according to the session model.

**Verification:** `cargo test --manifest-path src-tauri/Cargo.toml`; manual reload during heavy output in `pnpm tauri dev`.

### E24-09 — Document test results and cross-platform risks

```yaml
id: E24-09
depends-on: [E24-01, E24-02, E24-03, E24-04, E24-05, E24-06, E24-07, E24-08]
refs: [16:28, 16:29]
covers: [16:28, 16:29]
type: task
scope: none
size: S
```

**Goal:** Record frontend/Rust test results and the explicit list of cross-platform risks and pending items.

**Acceptance criteria:**

- [ ] `.docs/testing/results.md` with `pnpm test` and `cargo test` results per OS.
- [ ] macOS/Linux risks and pending items listed, each linked to a plan.md issue or "Not planned" entry.

**Verification:** document reviewed; links resolve.

### E24-10 — Close-out: cross-platform validation

```yaml
id: E24-10
depends-on: [E24-01, E24-02, E24-03, E24-04, E24-05, E24-06, E24-07, E24-08, E24-09]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E25 — Release pipeline and lut updater

```yaml
id: E25
depends-on: [E24, E02, E04]
refs: [F7:6, F7:auto-actualizacion-de-lut, 13.2:22, 16:27, .docs/plan/analysis/build-identity.md]
```

lut's own release pipeline and signing, the updater re-added with lut's endpoint and key, packaging and generated
third-party notices (decision 21g).

### E25-01 — Spike: choose release hosting, update endpoint and signing keys

```yaml
id: E25-01
depends-on: []
refs: [F7:6, F7:auto-actualizacion-de-lut, .docs/plan/analysis/build-identity.md]
covers: [F7:6]
type: spike
scope: none
size: S
```

**Goal:** Decide where lut releases are hosted, the update manifest endpoint per channel, and how bundles are signed.

**Acceptance criteria:**

- [ ] Hosting and endpoints chosen (stable and beta); new minisign key generated and stored outside the repo (CI secret).
- [ ] Per-OS code-signing options listed (Windows Authenticode, macOS notarization) with a decision or explicit postponement.

**Verification:** a test manifest signed with the new key validates against the public key.

### E25-02 — Add a release workflow producing signed bundles for all platforms

```yaml
id: E25-02
depends-on: [E25-01]
refs: [F7:6]
covers: [F7:6]
type: task
scope: none
size: M
```

**Goal:** A tag-triggered CI workflow builds and publishes lut bundles and updater artifacts.

**Acceptance criteria:**

- [ ] Builds NSIS (Windows), dmg/app (macOS) and deb/rpm/AppImage (Linux) with `createUpdaterArtifacts: true` and `TAURI_SIGNING_PRIVATE_KEY` from secrets.
- [ ] Publishes `latest.json` per channel to the chosen endpoint; binary `lut`, sidecar `lut-cli`.

**Verification:** a pre-release tag produces all artifacts and a valid manifest.

### E25-03 — Generate third-party notices for Rust and npm dependencies

```yaml
id: E25-03
depends-on: [E04-01]
refs: [F7:6, .docs/plan/analysis/decisions.md]
covers: [F7:6]
type: task
scope: none
size: S
```

**Goal:** Ship a generated third-party notices file in every bundle (decision 21g).

**Acceptance criteria:**

- [ ] A script (e.g. `cargo about` plus an npm license collector) writes `public/licenses/third-party.txt`; the release workflow runs it.
- [ ] Terax attribution (`public/licenses/terax.txt`) and terminal licenses are still bundled.

**Verification:** `pnpm tauri build`; notices present in the installed app resources.

### E25-04 — Re-add tauri-plugin-updater with lut endpoint and public key

```yaml
id: E25-04
depends-on: [E25-01, E01-02]
refs: [F7:auto-actualizacion-de-lut, 13.2:22]
covers: [F7:auto-actualizacion-de-lut]
type: task
scope: be
size: S
```

**Goal:** Restore the updater plugin wired only to lut's infrastructure.

**Acceptance criteria:**

- [ ] `tauri-plugin-updater` crate and `@tauri-apps/plugin-updater` re-added; `updater:default` capability restored.
- [ ] `plugins.updater` in `src-tauri/tauri.conf.json` uses lut's endpoint and pubkey only; `rg -i "crynta|terax-ai"` finds no updater URL.

**Verification:** `pnpm tauri build`; `cargo test --manifest-path src-tauri/Cargo.toml`.

**Notes:** Terax's AI proxy built reqwest with `rustls-no-provider` and installed the ring provider by hand (`rustls::crypto::ring::default_provider().install_default()` in the deleted `net/clients.rs`); without it reqwest panics on the first TLS request. E05-16/E05-18 removed both crates, so check which TLS backend the updater plugin pulls in and whether it needs a provider installed.

### E25-05 — Add update channel and disable settings with a check service

```yaml
id: E25-05
depends-on: [E25-04]
refs: [F7:auto-actualizacion-de-lut]
covers: [F7:auto-actualizacion-de-lut]
type: task
scope: ui
size: S
```

**Goal:** Update logic: configurable channel (stable/beta), option to disable, throttled automatic check. No visuals.

**Acceptance criteria:**

- [ ] Settings keys for channel and enabled; disabled means no update network request at all.
- [ ] Channel selects the manifest endpoint; throttle state stored under a `lut` key.
- [ ] Unit tests for channel selection, disabled mode and throttling.

**Verification:** `pnpm test`; network log shows no request when disabled.

### E25-06 — Build the update dialog and settings update controls

```yaml
id: E25-06
depends-on: [E25-05, E11-02, E11-03]
refs: [F7:auto-actualizacion-de-lut]
covers: [F7:auto-actualizacion-de-lut]
type: task
scope: ui
size: S
```

**Goal:** UI for update availability, download progress and restart, plus channel/disable controls, per E11-02 and E11-03.

**Acceptance criteria:**

- [ ] Update dialog and settings controls implement the designs; manual "check now" works.

**Verification:** `pnpm test`; manual against a test release.

### E25-07 — Verify the updater uses only lut infrastructure and rejects bad signatures

```yaml
id: E25-07
depends-on: [E25-02, E25-06]
refs: [13.2:22, 16:27]
covers: [13.2:22, 16:27]
type: task
scope: none
size: S
```

**Goal:** Prove end to end that updates come only from lut and that unsigned or tampered bundles are rejected.

**Acceptance criteria:**

- [ ] An old build updates to a newer test release.
- [ ] A bundle with no signature or signed with another key is rejected with a visible error.
- [ ] Network log shows only lut's endpoint.

**Verification:** manual on Windows with a test release; results recorded in `.docs/testing/results.md`.

### E25-08 — Spike: evaluate a lut Nix package proposal

```yaml
id: E25-08
depends-on: [E25-02]
refs: [F7:6, .docs/plan/analysis/decisions.md]
covers: [F7:6]
type: spike
scope: none
size: XS
```

**Goal:** Write a proposal (no decision) for packaging lut releases with Nix, per decision 21e.

**Acceptance criteria:**

- [ ] Short proposal in `.docs/` describing options and maintenance cost; the decision is left to the user.

**Verification:** proposal reviewed by the user.

### E25-09 — Close-out: release and updater

```yaml
id: E25-09
depends-on: [E25-01, E25-02, E25-03, E25-04, E25-05, E25-06, E25-07, E25-08]
refs: []
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and add any discovered work to plan.md (or state 'nothing new').

## E26 — Accessory improvements

```yaml
id: E26
depends-on: [E12]
refs: [.docs/plan/README.md]
```

Changes that improve lut but are accessory: worth doing, not worth holding another epic for. Issues are added here as
they come up and taken when there is room; none blocks another epic. The epic's `depends-on` grows with the epics its
issues build on.

### E26-01 — Quit confirmation lists the running processes, per the design

```yaml
id: E26-01
depends-on: [E12-07]
refs: [TER-011, 13.2:9, .docs/plan/analysis/app-shell.md]
covers: [app-shell/close-dialogs]
type: task
scope: ui
size: M
```

**Goal:** The quit confirmation matches the design's "Quit confirmation" board: it names what quitting stops instead of
saying that "a process" is running.

**Acceptance criteria:**

- [ ] The backend reports the name of each pane's foreground process (today `pty_has_foreground_process` only answers
      whether there is one); Rust tests for the new command.
- [ ] The dialog lists one row per running process: the command, where it runs (space · tab) and its state (an agent's
      working / needs approval from the agent activity store, otherwise running).
- [ ] The description counts them ("3 processes are still running"); the title, verb and action follow the platform
      (Close on Windows and Linux, Quit on macOS).
- [ ] The opt-out and "close anyway" behave as before; component test for the list, the count and the platform texts.

**Verification:** `pnpm test`, `cargo test --manifest-path src-tauri/Cargo.toml --locked`; manual on Windows: quit with
an agent and a dev server running lists both.

### E26-02 — macOS and Linux title bars per the design

```yaml
id: E26-02
depends-on: [E12-03]
refs: [UX-011, .docs/plan/analysis/app-shell.md]
covers: [app-shell/window-controls]
type: task
scope: ui
size: S
```

**Goal:** E12-03 built the title bar and checked it on Windows only. On Linux the bar reuses the Windows caption
buttons, and on macOS the native traffic lights neither sit in the 28px bar nor hide with the vertical-tabs bar.

**Acceptance criteria:**

- [ ] Linux: `WindowControls` gets the design's GNOME-style variant (round 20px buttons, minimize, maximize, close).
- [ ] macOS: `trafficLightPosition` centres the traffic lights in the 28px bar; the space the bar and the sidebar keep
      clear for them (E12-03) matches.
- [ ] macOS, vertical tabs: the traffic lights hide and show with the hidden title bar, through a native call from
      Rust (`standardWindowButton` `setHidden`), and are always visible while the bar is.
- [ ] Checked on macOS and on a Linux desktop (GNOME and one other): both tab orientations, drag, min/max/close,
      sidebar open and closed.

**Verification:** `pnpm test`; `cargo test`; manual on macOS and Linux as listed.

### E26-04 — Analyse how the secondary tools load

```yaml
id: E26-04
depends-on: []
refs: [.docs/plan/analysis/ide-tools.md]
covers: [6.2:8, 10.3:4, F2:6, 5.10:12, F6:gate, 13.5:10, 14.1:9, ide-tools/file-navigator, terminal/links, ide-tools/editor-core, ide-tools/lsp, ide-tools/editor-git-diff, ide-tools/source-control-logic, ide-tools/git-history-logic, ide-tools/explorer-logic, ide-tools/markdown-logic, ide-tools/preview-logic, agents/control-frontend-bridge]
type: spike
scope: ui
size: S
```

**Goal:** Decide, with numbers, whether to keep, extend or drop the lazy loading of the secondary tools. Today the Git
panel, editor, Git diff, Git history and markdown preview (from Terax) and the web preview (E07) already load their code
the first time they are opened, through their `*Lazy.tsx` wrappers. The explorer loads at startup, and the terminal
imports the LSP navigator for Ctrl+click on paths. Lazy loading costs a short delay the first time a tool opens; its
gain (startup time and memory) is unmeasured.

**Acceptance criteria:**

- [ ] Startup time, memory and startup bundle size measured on Windows as they are today, and with the lazy tools loaded
      at startup.
- [ ] The first-open delay of each lazy tool measured, with and without preloading while idle.
- [ ] Recommendation recorded here: keep it as it is, load everything at startup, or extend lazy loading (explorer,
      LSP navigator), with the issues to plan.

**Verification:** the measurements and the recommendation in the issue.

### E26-03 — Close-out: accessory improvements

```yaml
id: E26-03
depends-on: [E26-01, E26-02, E26-04]
refs: [.docs/plan/README.md]
covers: []
type: closeout
scope: none
size: XS
```

**Goal:** Verify every item of this epic is delivered (validator coverage), run the epic's verification commands, and
add any discovered work to plan.md (or state 'nothing new').

## Not planned

- `TER-010` — P2: moving sessions between windows needs multiwindow (post-v1).
- `PRJ-012` — P2: multiple windows per project (post-v1).
- `UX-012` — P2: visual layout/window editor (post-v1).
- `AGT-011` — P2: approve/deny permissions from the UI (post-v1); the existing decision broker stays as is.
- `AGT-014` — P2: plugin system for more agent adapters (post-v1); existing adapters are kept.
- `5.10:13` — Multiwindow is a later phase (post-v1).
- `AGT-008` — P1: agent activity view; agent CLIs such as Claude Code already show it (decision 27).
- `9.6:4` — Agent activity view (decision 27).
- `F5:5` — Agent activity timeline and subagents (decision 27).
- `9.8:1` — Rules for AGT-011 (P2, post-v1).
- `9.8:2` — Rules for AGT-011 (P2, post-v1).
- `9.8:3` — Rules for AGT-011 (P2, post-v1).
- `9.8:4` — Rules for AGT-011 (P2, post-v1).
- `9.8:5` — Rules for AGT-011 (P2, post-v1).
- `9.8:6` — Rules for AGT-011 (P2, post-v1).
- `9.8:7` — Rules for AGT-011 (P2, post-v1).
- `PRJ-014` — P1: schema migrations start with the first release; lut has no releases or user data yet.
- `6.5:5` — Schema migrations (PRJ-014) start with the first release.
- `F4:2` — No Spaces data to keep: lut has no releases.
- `F0:1` — Done before planning (commit 611f9e3: Terax snapshot imported).
- `F0:3` — Done before planning (commit 5409728: Terax docs moved to .docs/origin-terax).
- `F7:1` — Multiwindow (post-v1).
- `F7:2` — Multiwindow (post-v1).
- `F7:3` — Multiwindow (post-v1).
- `F7:4` — Multiwindow (post-v1).
- `F7:gate` — Multiwindow gate (post-v1).
- `agents/decision-client` — Frontend permission-decision client belongs to AGT-011 (P2, post-v1); kept dormant.
