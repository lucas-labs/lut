# Architecture decision records

An ADR records one decision that is expensive to reverse: what was chosen, what was rejected and why. ADRs are short
and are never rewritten once accepted; a new ADR supersedes an old one.

## When an ADR is required

A PR needs an ADR when it changes any of these (proposal §15, change-control rule 6):

- **a contract** between modules or processes: Tauri commands and events, the control protocol, the CLI, the hook
  payloads, the shell integration;
- **a persisted model**: store files, their schema or location, exported files, settings keys;
- **a platform constraint**: supported OS, shells, WebView or renderer requirements, toolchain versions.

Implementation details inside a module that keep its contract need no ADR. When in doubt, write a short one.

## Numbering and files

- Ids are `ADR-NNN`, numbered in order and never reused. The file is `NNNN-<kebab-title>.md`, for example
  `0001-technical-base.md`.
- ADR-001 to ADR-008 were taken in [`.docs/proposal.md`](../proposal.md) §4. Each gets its own file here when it is
  recorded or revised; until then the proposal is its record. New decisions start at ADR-009.
- Copy [`0000-template.md`](0000-template.md). Refer to the proposal, the plan or the code instead of copying them.
- An ADR is added in the PR that implements the decision and is referenced from that PR's checklist.

## Status

| Status     | Meaning                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| Proposed   | Under discussion; the PR implementing it is open.                       |
| Accepted   | In force.                                                               |
| Superseded | Replaced by a later ADR; the header names it (`Superseded by ADR-NNN`). |
| Rejected   | Considered and declined; kept so the discussion is not repeated.        |

Only the status line of an accepted ADR may change later (when it is superseded).

## Index

| ADR                               | Title          | Status   |
| --------------------------------- | -------------- | -------- |
| [ADR-001](0001-technical-base.md) | Technical base | Accepted |
