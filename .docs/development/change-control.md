# Change control

How changes reach `master`. lut evolves the imported Terax code incrementally with tests between phases and small
commits (ADR-007): the shared renderer, persistently mounted sessions, the shell bridge and the hooks have invariants
that seemingly visual changes can break.

## Issues and PRs

- **One issue, one PR, one concern.** Work comes from `.docs/plan/plan.md` and its GitHub issues
  (`.docs/plan/README.md` explains the format and the sizing rules: about 300–400 changed lines, larger only for
  mechanical changes with a `size-exception`).
- **Refactors are separate from behaviour changes**, in different PRs or at least in different commits.
- **Mechanical changes go in their own commit** (moves, formatting, deletions, autofixes), so the review can skip them.
  Merge those PRs with **rebase** to keep the commits apart; squash is fine for single-commit PRs.
- **Every PR follows the template** (`.github/pull_request_template.md`): goal, files changed, functional changes,
  risks, tests executed with commands and results, compatibility, and screenshots only if the UI is affected.
- **Definition of done:** the acceptance criteria are verified in the PR. Discovered work is added to `plan.md`, synced
  with `node .docs/plan/tools/github-sync.mjs` and linked in a comment on the issue, or the comment says "nothing new".

## Rules

1. **Read before modifying:** the architecture of the affected module and the relevant files in full.
   `.docs/origin-terax/` is technical reference for the imported code, not lut's rules.
2. **Find the real extension point and the module's tests** before changing anything.
3. **Do not rewrite functional core** (PTY, WASM/renderer, control protocol) only for aesthetic simplification.
4. **Keep tests:** when a pure function moves, its tests move with it or grow.
5. **Do not change the behaviour of external CLIs:** lut does not intercept or fake their prompts, and needs no API
   keys.
6. **Document decisions:** a short ADR under `.docs/decisions/` when a contract, a persisted model or a platform
   constraint changes.
7. **Cross-platform:** abstract paths, shells and quoting. Windows is the primary platform and must be tested.
8. **Security before convenience:** imported scripts, startup commands, hooks and permissions are never activated
   silently.
9. **Nothing is done without verification:** report the commands run, their results, errors, risks and pending tests.
10. **Terminal-first:** no optional feature may take the central area without the user choosing it.
11. **No mass dependency upgrades during F0–F2:** only what a change strictly needs.

## Quality gate

- CI (`.github/workflows/ci.yml`, see `.docs/development/build.md`) runs lint, format, type checks, tests, build and knip
  for the frontend, and fmt, clippy and tests for the backend, on Windows.
- `pnpm lint` has a warning budget (`--max-warnings`): a PR may not add warnings, and a PR that removes some lowers the
  budget.
- Known pre-existing failures and their fixing issues are listed in `.docs/testing/baseline.md`.

## Branches and commits

- **Branches:** `<type>/<issue-id>-<slug>`, for example `fix/e01-21-flaky-index-test`.
- **Commits:** conventional commits in English and lowercase, `<type>(<scope>): <emoji> <what>`. Titles stay under 70
  characters; bodies have at most three lines under 100 characters. The issue goes in a `Ref: #N` trailer.
  - Scopes: `ui` (frontend) and `be` (backend), or none.
  - Types and emojis:

    | Type     | Emoji | Type   | Emoji |
    | -------- | ----- | ------ | ----- |
    | feat     | ✨    | perf   | 🐎    |
    | fix      | 🚑    | test   | 🧪    |
    | refactor | 🔨    | ci     | 🔄    |
    | docs     | 📝    | style  | 💄    |
    | chore    | 🧹    | i18n   | 🌐    |
    | release  | 🔖    | revert | 🔙    |
    | wip      | 🚧    |        |       |
