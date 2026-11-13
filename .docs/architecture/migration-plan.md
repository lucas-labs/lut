# Migration plan

The order in which the imported code moves to the [target architecture](target-architecture.md), and the tests that
gate each step (E01-09). The work itself is in [plan.md](../plan/plan.md): this file only orders its epics and points
to the issues that matter for the sequence. Dependencies between epics are the `depends-on` fields of the plan, checked
by `node .docs/plan/tools/validate.mjs`.

## Rules for every step

- Small PRs, one concern each; refactors separate from behaviour changes; mechanical changes in their own commit
  ([change-control.md](../development/change-control.md), proposal §12.3).
- **Tests before the move:** a step that touches the terminal lifecycle starts by adding the test that locks the
  invariant (E07-01 before any shell change). Moved pure functions keep their tests.
- CI gate on every PR (E01-05): lint with a warning budget that only goes down, Prettier, type checks, Vitest, build,
  knip, rustfmt, clippy and the Rust tests.
- **Structural checks:** `pnpm docs:deps` regenerates [module-dependencies.md](module-dependencies.md); a refactor
  that cuts a dependency must show the matrix cell disappearing (for example `terminal → tabs` after E07-02, every
  `→ ai` edge after E05).
- No mass dependency upgrades during F0–F2.

## Sequence

```text
F0  E01 baseline ──┬─ E02 identity ──┬─ E04 names, public
                   └─ E03 licensing ─┘
                      E02 ─ E07 terminal-first PoC (F1)
                      E02 ─ E06 blocks removal ─ E05 AI removal (F2)
                      E07 + E05 + E06 ─ E08 navigation ─ E09 coordinator split
                      E08 ─ E14 profiles (F3) ─ E16 projects ─ E17 restore (F4)
                      E09 + E16 ─ E19 agents core ─ E20 agents UX ─ E21 resume (F5)
E11 design (user) + E14 ─ E13 settings ─ E10 tools on demand ─ E12 app shell UI ─ E15, E18, E22, E23 (F6)
                      E12 + E17 + E19 ─ E24 cross-platform ─ E25 release and updater (F7)
```

### 1. Baseline (F0): E01–E04

- **E01** records the build, toolchain, tests and known failures ([baseline.md](../testing/baseline.md)), adds CI
  (E01-05), the PR rules (E01-06), these architecture documents (E01-07 to E01-09) and the performance baseline
  (E01-10 to E01-12). **Gate:** E01-14; nothing is deleted before it.
- **E02** isolates lut's identity from Terax (bundle id, executable, env vars, storage, hooks) and deletes the unwired
  git agent-task backend (E02-03 → E02-04 → E02-05). **Check:** E04-13 (moved from E02-16), coexistence with an installed Terax.
- **E03** licensing and provenance; **E04** user-visible names, then the repository goes public (E04-09).

### 2. Terminal-first proof of concept (F1): E07

Reuses the current components; nothing new and visual before the user's design (decision 7).

1. E07-01: lifecycle tests for the mount invariant (switching tabs, splitting and closing keep every pane mounted,
   no `pty_close`/`pty_open`).
2. E07-02: `TerminalStack` takes `{ id, paneTree, activeLeafId }[]` instead of `Tab[]` (proposal PR-002).
3. E07-03 and E07-04: `AppShell` with the terminal as the main surface; IDE tools hidden at startup.
4. E07-05 to E07-07: orientation toggle, projects sidebar placeholder, theming and shortcuts (PR-003, PR-004).
5. **Gate:** E07-08 (resize, DPI, hidden panes, WebGPU fallback) and E07-09 (orientation, sidebar, reorder, hidden
   tabs).

### 3. Removals (F2): E06, then E05

- **E06** removes command-blocks mode from the palette, tabs, frontend modules, shell scripts and the Rust `history`
  module.
- **E05** removes the BYOK AI in three moves: extract what other modules borrow from `modules/ai` (E05-01 to E05-05:
  the `native` wrapper, the sensitive-path policy, markdown code blocks, the CLI agent store, review rounds); unmount it
  (E05-06, PR-005) and remove each entry point (E05-07 to E05-12); delete the frontend and Rust modules and their
  commands (E05-13 to E05-18). **Gate:** E05-19 (no API key needed, shell selection and saved Spaces still work).

### 4. Navigation and coordinator: E08, E09

- **E08** turns `useTabs` into a navigation store: pure planners out with their tests (E08-01), store (E08-02),
  `terminalTabs` selector and `TabNavigator` contract (E08-03), session lifecycle separate from navigation (E08-04),
  split ratios in the model and in `PaneTreeView` (E08-05, E08-06), consumers and serialization migrated (E08-09).
  **Tests:** E08-10 (close, focus, reorder, cold tabs, live sessions).
- **E09** splits `App.tsx` into hooks (shortcuts, launch files, agent launch, spaces wiring), creates the `platform`
  module and the bootstrap module, and leaves a small coordinator (E09-08). E09-10 resolves the React Compiler lint
  warnings and lowers the budget.

### 5. Profiles (F3): E14

Model and validation in Rust (E14-03), versioned store (E14-04), detection with one profile per WSL distro (E14-06),
launch spec (E14-07 to E14-10), then PTYs opened by profile id resolved in the backend (E14-12, PR-006) and a profile per
pane (E14-14). **Gate:** E14-17 (two panes with different profiles persist and restore).

### 6. Projects and restore (F4): E16, E17

- **E16** evolves Spaces into projects: schema spike (E16-01), rename (E16-02), versioned store with migrations
  (E16-03, PR-007), model and snapshots (E16-04, E16-05), runtime ids regenerated at hydration (E16-09).
- **E17** the restore orchestrator of §8.4 (E17-02 to E17-06, PR-008), the shell-ready event (E17-11) and startup
  commands with consent (E17-12 to E17-16). **Tests:** E17-17 (serialization, startup integration, restore time).

### 7. Agents (F5): E19, E20, E21

E19 defines the adapter boundary and normalized events (E19-03), hardens the control server (E19-06) and drives the
state from the reducer keyed by pane and PTY (E19-07, PR-009); **check:** E19-11 with the official CLIs. E20 adds the
UX (badges, notifications, hooks manager with plan/apply), E21 resume and statusLine metrics.

### 8. Design, settings, secondary tools and shell UI (F6): E11, E13, E10, E12, E15, E18, E22, E23

E11 is the user's design and has no code dependency. E13 (settings, theming, fonts, shortcuts) needs it and the
profiles. E10 rebuilds the IDE tools on the design; how they load (most already load on first open) is analysed by E26-04. E12
implements the app shell; E15 profiles UI, E18 project navigator, E22 palette and polish and E23 export and import
follow.

### 9. Platforms and release (F7): E24, E25

E24 validates Windows, macOS and Linux (shells and TUIs, E24-04); E25 builds the release pipeline and re-adds the
updater on lut's own infrastructure (decision 5; E25-07).

## Milestones of proposal §12.3

| Proposal milestone                                 | Issues                 |
| -------------------------------------------------- | ---------------------- |
| PR-001 baseline, docs, build                       | E01                    |
| PR-002 `AppShell` and encapsulated `TerminalStack` | E07-02, E07-03         |
| PR-003 visual tabs adapter and orientation         | E07-05, E08-03         |
| PR-004 empty projects sidebar, navigation state    | E07-06, E08-02         |
| PR-005 isolate the BYOK chat                       | E05-01 to E05-06       |
| PR-006 profile → pane → PTY contracts              | E14-03, E14-12, E14-14 |
| PR-007 versioned presets, Spaces migration         | E16-01 to E16-03       |
| PR-008 project start orchestrator                  | E17-02, E17-03         |
| PR-009 agent reducer to UI                         | E19-07                 |
