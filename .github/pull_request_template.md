Closes #

## Goal

<!-- What this PR achieves and why, in one or two sentences. -->

## Files changed

<!-- The main files or areas touched. For mechanical commits (moves, formatting, deletions), say which commit is
mechanical so the review can skip it. -->

## Functional changes

<!-- What behaves differently for the user or for other modules. Write "none" for refactors. -->

## Risks

<!-- What could break and where: invariants touched (PTY, renderer, shell bridge, hooks), platforms, persisted data. -->

## Tests executed

<!-- Commands and their results; failures or skipped checks with the reason. -->

| Command | Result |
| ------- | ------ |
|         |        |

## Compatibility

<!-- Windows / macOS / Linux / WSL; persisted settings or files; CLI and control protocol. -->

## Screenshots

<!-- Only if the UI is affected. Otherwise delete this section. -->

## Checklist

- [ ] One issue, one concern; refactors are separate from behaviour changes.
- [ ] Moved pure functions keep or extend their tests.
- [ ] ADR added under `.docs/decisions/` if a contract, persisted model or platform constraint changed.
- [ ] No new lint warnings (`pnpm lint` budget); no dependency upgrades beyond what this change needs.
- [ ] Discovered work is added to `.docs/plan/plan.md`, synced, and linked in a comment on the issue (or "nothing new").
