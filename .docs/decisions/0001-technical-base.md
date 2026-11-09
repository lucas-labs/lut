# ADR-001: Technical base

- **Status:** Accepted
- **Date:** 2026-11-08
- **Issue:** E03-03

## Context

lut needs a cross-platform terminal engine (PTY, VT parser, GPU rendering, shell integration, agent hook bridge)
before it can work on what makes it different: projects, profiles and agent awareness. The full reasoning is in
[`.docs/proposal.md`](../proposal.md) §4 (ADR-001) and the audit of Terax in §5.

## Decision

Import the source code of [Terax](https://github.com/crynta/terax-ai) at commit
`a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9` into this repository and develop it here as an independent product:

- Tauri 2 with a Rust backend and a React + TypeScript frontend;
- Ghostty's terminal core compiled to WebAssembly with the WebGPU/WebGL renderer (`packages/ghostty-core`);
- `portable-pty` for PTY sessions.

The origin commit is recorded only as provenance and attribution (README, `NOTICE`, `.docs/origin-terax/ORIGIN.md`).

## Rejected options

- **A maintained fork that syncs or merges from Terax:** lut changes about half of the product, so keeping upstream
  compatibility is not worth its cost.
- **Building the PTY, VT and GPU engine from scratch for the MVP:** Terax already has working cross-platform
  infrastructure for all of it; rewriting it is costly and risky.

## Consequences

- lut has no upstream; Terax fixes are ported by hand as lut changes
  ([provenance and change policy](../development/provenance.md)).
- lut keeps Terax's Apache-2.0 obligations and credits Terax in the README ([licensing](../licensing.md)).
- lut must not share data, settings, hooks or update infrastructure with a Terax installation (identity isolation,
  epic E02).
- A reproducible baseline of the imported code was recorded before the first refactor
  ([baseline](../testing/baseline.md)).
