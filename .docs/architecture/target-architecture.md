# Target architecture

Where the code is going: the contracts between domains, the invariants that every change keeps, the main process flows
and the renderer (E01-09). It adds no requirement: everything here comes from [the proposal](../proposal.md) (§5.4, §6,
§7, §8, §9, §10) and the [user decisions](../plan/analysis/decisions.md), which win over any analysis. Where the code
is today: [current-state.md](current-state.md) and [module-dependencies.md](module-dependencies.md). The order of the
changes: [migration-plan.md](migration-plan.md).

The target is reached by evolving the imported code in small PRs (ADR-007), not by a rewrite: the terminal engine, the
PTY transport and the agent bridge are kept (§10.1).

## Layers

From §6.1, with what exists today:

| Target layer                                     | Today                                                                        | Changed by    |
| ------------------------------------------------ | ---------------------------------------------------------------------------- | ------------- |
| `AppShell` / theme / keymap / command palette    | `app/App.tsx` (1484-line coordinator), `modules/theme`, `shortcuts`, palette | E07, E09, E12 |
| `ProjectNavigator`                               | `modules/spaces` (switcher), sidebar with explorer and source control        | E16, E18      |
| `TabNavigator` (horizontal or vertical)          | `modules/tabs` (`TabBar`, `useTabs` React state, 8 tab kinds)                | E07, E08, E12 |
| `WorkspaceView` → `TerminalStack` (kept)         | `app/components/WorkspaceSurface.tsx` → `modules/terminal/TerminalStack.tsx` | E07           |
| Agent status, activity, notifications            | `modules/agents`, `modules/control`, `terax:agent-signal`                    | E19, E20, E21 |
| Optional tools (editor, Git, explorer), lazy     | Always-mounted IDE modules                                                   | E10           |
| PTY manager, shell integration, session registry | `src-tauri/src/modules/pty/`                                                 | E14, E17      |
| Control server, agent hooks, hook broker         | `control.rs`, `agent_events.rs`, `agent.rs`, `terax-cli`                     | E02, E19, E20 |
| Project/profile persistence and launcher         | Spaces store (`terax-spaces.json`); no profiles                              | E14, E16, E17 |
| Notifications and OS integration                 | notification plugin, `vibrancy.rs`, `window_presentation.rs`                 | E09, E20      |

The built-in BYOK AI (`modules/ai`, `net`, `ai_sessions`, `secrets`) and command-blocks mode have no target layer:
they are removed (ADR-004, §9.9; decision 3).

## Domains and contracts

§6.2 splits the code into domains. The rule for all of them: **the UI observes services and emits intents; actions on
processes and files belong to the backend or a controller.** Modules may share types and events but not import each
other's components in cycles (today: tabs ↔ terminal, spaces ↔ terminal, agents ↔ ai; see
[module-dependencies.md](module-dependencies.md)).

| Domain           | Owns                                                      | Contract                                                                                                                                                                                                 | Source                               |
| ---------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `terminal-core`  | Ghostty WASM model, WebGPU/WebGL renderers, PTY transport | Unchanged at first (§10.1). `TerminalStack` takes `{ id, paneTree, activeLeafId }[]` instead of `Tab[]`.                                                                                                 | §10.1, E07-02                        |
| `sessions`       | PTY lifecycle, `leafId ↔ ptyId`, resize, write, dispose   | Sessions outlive tab and layout changes; the UI asks for a pane by **profile id** and the backend resolves and validates the launch (executable, args, env, cwd, WSL distro) from stored profiles.       | §6.2, decision 10, E08-04, E14-12    |
| `navigation`     | Tabs, orientation, selection, order, groups               | One store, two presentations. `TabNavigator` receives id, title, icon, state, active, close, reorder, focus, orientation. It **never creates a PTY**.                                                    | §10.3, §10.4, decision 11, E08-02/03 |
| `layouts`        | Split trees and ratios                                    | Pure operations on stable ids; ratios are part of the model and persisted. At most 4 panes per tab (the renderer slot pool).                                                                             | §5.4, decision 12, E08-05/06         |
| `profiles`       | Process and style of a session                            | `TerminalProfile` (§7.1), validated by Zod and Serde across IPC. Overrides resolve `globalDefaults` → profile → project pane → runtime. Detected shells and one profile per WSL distro are profiles too. | §7.1, decisions 10 and 18, E14       |
| `projects`       | Project metadata, presets, snapshots, restore lifecycle   | Project, Preset, Running Workspace and Layout Snapshot are separate (§8.1). Evolves Spaces; versioned with `schemaVersion`.                                                                              | §8, ADR-006, decision 4, E16, E17    |
| `agents`         | Normalized events, statuses, adapters, notifications      | Statuses `starting`, `working`, `needs-input`, `needs-approval`, `done`, `error`, `idle`, `exited` (§9.3), from structured hooks first and process/OSC signals as a fallback with their source.          | §9, decision 13, E19                 |
| `optional-tools` | Editor, LSP, Git, explorer, diff, previews                | Capabilities loaded on demand (`ContentTab` / `ToolWindow`); nothing loads them at startup.                                                                                                              | §10.3, decision 2, E10               |
| `settings`       | Global preferences and overrides per profile and project  | Layered preferences (global, profile, project).                                                                                                                                                          | §6.2, E14-02, E13                    |
| `platform`       | OS detection, paths, windows, permissions, native menu    | One module for platform-specific code.                                                                                                                                                                   | §6.2, E09-05/06                      |

The folder layout of §6.3 is orientative: renderer files are not moved for the sake of folders, and Terax paths stay
until builds and tests allow a safe move.

## Invariants

### Identity (§6.4)

Each entity has its own stable id, never derived from another or from the cwd or a tab name: `projectId`, `presetId`,
`windowId`, `tabId`, `paneId`/`leafId`, `ptyId`, `agentSessionId`. Two agents can run in the same directory, a process
can change cwd, a project can have several instances. Today: tab and leaf ids share one counter in `useTabs`, `ptyId`
is a backend counter mapped from the leaf (`terminalSessionApi`), and agent events are correlated by pane id and a
per-pane control token.

### Renderer and sessions (§5.4)

1. A pane is never remounted because the tab bar moves, the sidebar expands or the project changes.
2. No new canvas per visual tab change.
3. Tab layout is not coupled to the session lifecycle.
4. The notification/resize mechanism and the model ↔ PTY synchronization are kept.
5. Hidden panes do no unnecessary visual work.
6. DPI changes, continuous resize and TUI compatibility are verified.
7. The adapted WASM, the font atlases and the output transport are not changed casually.

Invariants 1–3 are locked by the lifecycle tests of E07-01 and E08-10; 4–6 by the renderer checks of E07-08.

### State and persistence (§6.5)

- A PTY is a live resource and is never stored in JSON; runtime ids are regenerated and reconciled at hydration.
- A preset is declarative, not a process snapshot; a snapshot captures visual structure and restart configuration.
- The last app state never overwrites a saved template without an explicit action.
- Schema changes carry `schemaVersion` and tested migrations.
- Closing the active project follows a defined policy (close PTYs, suspend presentation or keep resources).
- Restarting the app recreates shells; process memory and interactive state are not preserved unless the program
  supports it.

### Security and identity isolation

- lut never reads, writes or migrates Terax data, settings, keychain entries, hooks or environment (decisions, general
  rules; E02).
- Agents use their own login; lut neither reads nor fakes their credentials (§9.1) and needs no API key.
- Startup commands, hooks and permissions are never activated silently (§8.5, E17-13, E20-08).
- The control server listens on loopback only, with per-pane authentication (§9.2, E19-06).

## Process flows

### Opening a pane

```text
UI intent (new tab / split, profile id)
  → navigation adds the tab or leaf (no PTY)
  → sessions: pty_open(profile id, pane id, size, cwd override)
      → backend resolves and validates the profile, builds the command with shell integration, spawns on
        portable-pty (ConPTY on Windows)
  → output: terax-pty scheme long-poll per webview, credit-based acks, presentation class per PTY
  → Ghostty WASM model parses; the shared WebGPU canvas (WebGL fallback) draws the pane's viewport
  → OSC 7 / OSC 133 from the integration scripts update cwd and prompt state; the shell-ready event (E17-11) marks
    the prompt
```

Today the frontend sends the shell path and the backend accepts it only if it is a detected shell; the profile id
replaces that (E14-12).

### Starting the app and restoring a project (§8.4)

1. Load project metadata and preset; validate `schemaVersion` and that profiles exist.
2. Resolve environments (WSL distro, cwd, executables); offer corrections when something is missing.
3. If an instance is already running: focus it, create another or cancel.
4. Build the visual structure with separate preset and runtime ids, without running commands.
5. Create the PTY sessions within the renderer limits.
6. Wait for the shell-ready event, never a fixed delay.
7. Apply profile overrides and pane cwd.
8. Apply the startup policy (`manual`, `auto`, `confirm`), asking where needed and never running a command twice.
9. Record the result per pane, with retry and "open shell without command" actions.
10. Enable autosave only after hydration succeeded.

In the first version restore covers layout and cwd; commands start manually (decision 8). E17 implements the rest.

### Agent events (§9.2)

```text
Agent CLI in a lut shell → official hook (JSON on stdin)
  → lut-cli hook (installed with consent): pane id, control address and token from the shell environment
  → control server (loopback, per-pane token, replay dedupe)
  → normalization per agent adapter, size and rate limits, correlation (pane, PTY, agent session, project)
  → optional decision broker (approvals, later phase, §9.8)
  → frontend event adapter and reducer
  → tab badges, notifications and focus, activity panel
```

The pieces exist today under Terax names (`terax-cli hook`, `control.rs`, `agent_events.rs`); the frontend reducer
(`modules/agents/model/`) is not wired yet (E19-07).

## Renderer

As in §5.4 and kept as is: `libghostty-vt` compiled to WASM is the terminal model, one per leaf; a single WebGPU canvas
per window draws every visible pane through viewport and scissor, with glyph atlases shared per font; WebGL is the
fallback. `TerminalStack` keeps every live terminal mounted and hides inactive tabs with `visibility`. Output reaches
the model through the `terax-pty` scheme, with presentation classes so hidden panes are coalesced. Per-pane font and
theme on the shared canvas are a spike before any commitment (decision 9, E14-01).
