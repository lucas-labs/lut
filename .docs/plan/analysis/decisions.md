# User decisions after the analysis (2026-11-08)

Answers to the open questions of the area analyses and `_review.md` ("Decisions for the user").
These override any analysis recommendation. Decisions that change the spec must also be reflected in
`.docs/proposal.md` (each listed under "Spec update" gets an issue or is applied with the plan).

## General rules

- **No relationship with Terax.** lut does not import, read, migrate or stay compatible with anything from a Terax
  installation (data, spaces, settings, keychain, hooks). The user does not use Terax. Identity isolation (Phase 0) is about
  never touching Terax's things; no import/migration/detection/warning features. Old Terax keychain entries are left alone.
- **No removal of working features** unless the proposal says so. The only planned removal is the built-in BYOK AI
  (ADR-004, §9.9) and what exists only to serve it. "Terminal-first" is about UI emphasis.
- **UI**: the user designs it. shadcn/Radix primitives (`src/components/ui/`) are kept as the component base; the redesign
  comes later. Personalisations (vibrancy, background image, opacity, themes) are kept — the redesign changes the app's look,
  not its customisation features.

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Names | Bundle identifier `dev.lucode.lut` (user's domain lucode.dev). Executable `lut`, hooks CLI sidecar `lut-cli`, env prefix `LUT_`, cache dir `<cache>/lut`. |
| 2 | IDE tools (editor, LSP, explorer, Git panel, history, diff, markdown/web preview, palette file/content search, fs index) | **Keep all.** They become secondary, on-demand utilities (proposal §1.7, UX-009, F2:6, F6:3): hidden behind buttons/commands, lazy-loaded, not always visible. Not removed. Their UI is redesigned with the rest. The unwired git agent-task backend (task worktrees, checkpoints, hunk review; ~14k lines, no UI caller, writes refs/terax and ~/.terax) is **removed** (decision 23). |
| 3 | Command blocks mode (Warp-like) | **Remove** entirely: `block/`, `GhosttyBlocks*`, block sessions/controller, tab `blocks` flag, `TERAX_BLOCKS` env and shell-side block support, `history/` (Rust) if only blocks/palette-history use it, palette history mode, `__teraxNewBlockTab`, block-input toggle. |
| 4 | Spaces → Projects | **Evolve Spaces** (ADR-006). No migration of Terax data. Only lut-internal schema versioning (`schemaVersion`, PRJ-014) between lut versions. |
| 5 | Updater | **Remove `tauri-plugin-updater`** (crate, npm package, capability, UI) in Phase 0. Re-add in F7 pointing to lut's releases and key. |
| 6 | shadcn/Radix | Keep as UI base; redesign later. |
| 7 | Phase 1 before the design | Allowed: functional work reusing current components as-is; nothing new and visual before the user's design. |
| 8 | Restore (P0) | Layout + cwd restore only; commands are started manually. PRJ-007/PRJ-013 stay P1. |
| 9 | Per-pane font/theme | Spike first (shared WebGPU canvas/atlas), then commit scope. |
| 10 | Profile executables | Like Windows Terminal: the profile stores the executable; the UI sends a **profile id**; the backend resolves and validates it from stored profiles. Auto-detected shells stay as **detected profiles**; users add arbitrary custom profiles. |
| 11 | Tab orientation | Global setting in v1. |
| 12 | Pane limit | Keep 4 per tab in v1. |
| 13 | Agent adapters | **Keep all** existing: Claude, Codex, Gemini, Pi, OpenCode, Grok (proposal §1.6 "y otros agentes CLI"). |
| 14 | File links | Keep opening in the internal editor (it stays). |
| 15 | Autostart plugin | Remove. |
| 16 | Vibrancy, background image | Keep. |
| 17 | OSC 0/2 titles; BEL / OSC 9 / OSC 777 | Shell titles may rename tabs when the profile allows it (`allowShellTitle`); BEL and OSC 9/777 reach notifications. |
| 18 | WSL | WSL distros are **auto-detected profiles** (one per distro, like Windows Terminal), available in P0; users can also add custom WSL profiles. The per-space local/WSL environment evolves into the profile. |
| 19 | Project archive | Hides the project from the list; keeps its data. |
| 20 | Platforms | Windows primary; macOS and Linux build in CI plus a basic launch smoke test before v1. |
| 21a | Settings window | Separate or not: decided by the user's design. |
| 21b | `public/notification.mp3` | Keep (may be replaced later). |
| 21c | CLI `open`/`identify` | Keep (the editor stays). |
| 21d | macOS camera/mic entitlements, WebView2 bootstrapper | Keep as-is. |
| 21e | Nix flake (`flake.nix`, `flake.lock`, `nix/`) | Remove now (it repackages Terax release binaries). Add to F7 as "possible proposal to review": a lut Nix package, no decision now. |
| 21f | `.coderabbit.yaml` | Remove Terax's config now; add a new lut config when the repo goes public (free for public repos). |
| 22 | Going public | The repo goes public at the end of Phase 0, once user-visible names say lut: executable/binary, bundle id, productName, window titles, About, installer, CLI help/messages, publisher. Simple replaces only; internal identifiers (`TeraxGhostty*`, `_terax_*`, CSS names…), logo/icons and design may still say Terax (rename on touch / later design). The "go public" issue: repo visibility, lut CodeRabbit config, branch protection on `master`, history secret scan. |
| 21g | Third-party notices | Generate a third-party notices file for Rust/npm dependencies in F7 (release pipeline). |
| 23 | Unwired git agent-task backend | **Remove** (`ide-tools/git-agent-tasks`, `ide-tools/git-frontend-review-models`) in Phase 0, which also removes its Terax-named refs/dirs/env vars. Recoverable from git history if ever wanted. |
| 24 | Not planned items | Approved. Everything not planned for this milestone is listed in `.docs/plan/future.md` (kept in sync by the validator) so a future planning round can pick it up. |
