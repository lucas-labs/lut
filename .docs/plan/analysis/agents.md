# Area analysis: agents

Scope: CLI agent integration (`src/modules/agents`, `src/modules/control`, `agent.rs`, `agent_events.rs`,
`agent_json.rs`, `control.rs`, crates `terax-cli` and `terax-control-protocol`, `scripts/build-cli.mjs`,
`public/notification.mp3`). 64 files, ~14k lines. Inventory: `analysis/agents.json`.

## How it works today

**Pipeline**

```
claude/codex/gemini (hook config in ~/.claude, ~/.codex, ~/.gemini) or Pi (TS extension)
  └─ hook command: [ -n "$TERAX_CLI" ] && "$TERAX_CLI" hook <agent> <event> || printf '{}'
       └─ terax-cli hook (crates/terax-cli/src/hook.rs): reads stdin (<=1 MiB), reads TERAX_PANE_ID,
          TERAX_CONTROL_ADDR, TERAX_CONTROL_TOKEN; trims payload; sends one JSON line over TCP
            └─ control.rs: 127.0.0.1 listener, authenticate() with the per-pane token bound to the pty id,
               replay-id dedupe (4096 recent ids per pane)
                 └─ agent_events.rs handle_bound(): pane/pty check, normalize() (protocol crate adapt.rs),
                    rate limit, link.apply_hook() (pty/agent_detect.rs) -> emits
                    `terax:agent-event` (to owning window) + legacy `terax:agent-signal`;
                    PermissionRequest may wait on DecisionBroker if a window announced readiness
                      └─ frontend:
                         - live path: AgentNotificationsBridge listens to agent-signal -> agentStore
                           -> routeAgentNotification (OS notification / toast / bell + sound)
                         - unused path: control/agents.ts connectAgentEvents -> model/reducer
```

- **Lifecycle of the control server**: `control::start` (control.rs:192-258) binds `127.0.0.1:0`, makes a 32-byte hex
  token, writes a descriptor `{protocol,address,token,pid,app_version}` to `<cache>/terax/control.json`
  (control.rs:755-793, 0600/0700 on Unix), finds the bundled `terax-cli` next to the exe (control.rs:805-829),
  hard-links/copies it as `<cache>/terax/run/<pid>/bin/terax(.exe)` (control.rs:910-943) and sweeps launcher dirs of
  dead pids (control.rs:835-878). Shutdown removes the descriptor only if its token is ours (control.rs:795-803).
- **Per pane**: `ControlState::shell_env` (control.rs:107-122) creates a fresh token per pane; `shell_init.rs:214-226`
  (backend-core) exports `TERAX_CONTROL_ADDR`, `TERAX_CONTROL_TOKEN`, `TERAX_PANE_ID`, `TERAX_CLI` and prepends the
  launcher dir to `PATH`; `activate_shell` binds token to the pty id. The global token is refused for `hook`
  (control.rs:439-445).
- **Hook installer** (agent.rs): per agent `AgentSpec` lists events; some are `.off()` (tool, failure, subagent
  events; agent.rs:84-131), installed only when "wanted". `json_after` (agent.rs:345-391) uses `agent_json`
  (a format-preserving JSON editor, agent_json.rs:493-640) to upsert/remove groups. Plan/apply with a
  `before` snapshot (agent.rs:571-631) refuses to write if the file changed since the preview.
- **Decision broker** (agent_events.rs:95-250): pending map capped at 16 (4 per pane); waits only while a window has
  called `agent_decisions_ready(true)`; cancels on ui-gone / pane-closed / agent-gone / timeout (default 600s,
  max 900s, protocol hook/mod.rs:19-20). No frontend consumer calls it today.
- **Frontend model** (`src/modules/agents/model/`): `reduceAgents` with states `starting|working|needs-input|needs-approval|…`,
  provenance `process|osc|hook`, subagents, pending permission; tested but **not wired**.
- **Live UI path**: `AgentNotificationsBridge` (AgentNotificationsBridge.tsx:65-93) maps signals to a simplified
  `agentStore` (statuses working/waiting) and calls `routeAgentNotification` (route.ts:30-73): dedupe 2s
  (notificationGate.ts), delivery `none|native|toast|bell` by focus/visibility (delivery.ts), OS notification via
  `@tauri-apps/plugin-notification` (notify.ts), sound via WebAudio fetching `/notification.mp3` (sound.ts:6-10).
  On `finished` it also triggers the AI "managed review" (review.ts).

## Interfaces

**Tauri commands** (registered at backend-core `src-tauri/src/lib.rs:390-401`):
`control_frontend_ready`, `control_respond` (control.rs:701-718); `agent_decisions_ready`, `agent_decision_respond`
(agent_events.rs:542-570); `agent_enable_hooks`, `agent_disable_hooks`, `agent_hooks_plan`, `agent_hooks_apply`,
`agent_hooks_status` (agent.rs:593-636).

**Tauri events**: `terax:control-request` (control.rs:22, useControlBridge.ts:176), `terax:agent-event`
(agent_events.rs:23, agentEvents.ts:12), `terax:agent-signal` (agent_events.rs:24; listened in terminal module),
`terax:terminal-notification` (agentEvents.ts:13).

**Control protocol** (protocol lib.rs:6-20): version 1, newline-delimited JSON over TCP, max 64 KiB; methods `ping`,
`capabilities`, `identify`, `open`, `hook`.

**Env vars** (set by backend-core shell_init.rs, read here): `TERAX_TERMINAL`, `TERAX_CONTROL_ADDR`,
`TERAX_CONTROL_TOKEN`, `TERAX_PANE_ID`, `TERAX_CLI`; read by CLI only: `TERAX_HOOK_TIMEOUT`, `TERAX_HOOK_WAIT`,
`TERAX_HOOK_DEBUG` (hook.rs:58-69); build: `TERAX_CLI_TARGET` (build-cli.mjs:50).

**Files on disk**: `~/.claude/settings.json`, `~/.codex/hooks.json`, `~/.gemini/settings.json`,
`~/.pi/agent/extensions/terax-notifications.ts` (agent.rs:84-136); temp `.<name>.terax-tmp-<pid>-<n>` (agent.rs:552);
`<cache>/terax/control.json`, `<cache>/terax/run/<pid>/bin/terax(.exe)`.

**Persisted settings** (owned by state-settings): `agentNotifications`, `agentNotificationSound`,
`agentLaunchCommands` (settings/store.ts:282-284).

**Public TS APIs used by other areas**: `useControlBridge` (App.tsx:40), `AgentNotificationsBridge`,
`NotificationBell` (Header.tsx:4), `AgentLauncherPanel` (NewTabMenu.tsx:13), `AgentIcon` (TabBar.tsx:17),
`AgentLaunchRequest`/`findAgentLauncher` (App.tsx, Header, TabBar, NewTabMenu), `routeAgentNotification`,
`useWindowFocus`, `useAgentStore` (ai LocalAgentNotificationsBridge.tsx:1-4), `useManagedAgentsStore`
(ai tools/agent.ts:3, useAiLiveBridge.ts:3), `firePendingReviewForSession` (ai useAiBootstrap.ts:3).

## Couplings

- backend-core → agents: `lib.rs:169-180` (`__terax_notify` argv), `lib.rs:187-243,454` (ControlState start/shutdown),
  `pty/mod.rs:242`, `pty/session.rs:249`, `pty/shell_init.rs:195-226` (env + PATH).
- agents → backend-core: `agent_events.rs:20-21` uses `pty::agent_detect::{AgentSignal, HookIntent}` and `PaneTarget`.
- agents → terminal: `AgentNotificationsBridge.tsx:2-6` (`subscribeAgentSignals`, `leafIdForPty`, `hasLeaf`),
  `launcher.ts:1` (`PaneNode`), `context.ts:2`.
- agents → app-shell (tabs): `context.ts:1`, `useControlBridge.ts:1`, `AgentNotificationsBridge.tsx:1`.
- app-shell → agents: `App.tsx:17,40,636-645,1386,1616`; `Header.tsx:4-5`; `TabBar.tsx:17-18`; `NewTabMenu.tsx:13-14`.
- agents → state-settings: `route.ts:1`, `AgentLauncherPanel.tsx:15-16`; settings/store.ts imports launcher defaults.
- agents ↔ ai: `review.ts:1,31` (chatStore, chatRuntime); ai → agents: `LocalAgentNotificationsBridge.tsx:1-4`,
  `tools/agent.ts:3`, `useAiLiveBridge.ts:3,131`, `useAiBootstrap.ts:3`.
- build-identity: `tauri.conf.json:38-39` externalBin, `package.json:12-13`, `src-tauri/Cargo.toml:11-12,82`.

## "terax" mentions

**(a) Phase 0 identity isolation (shared with an installed Terax)**

- Env vars: `TERAX_CLI`, `TERAX_PANE_ID`, `TERAX_CONTROL_ADDR`, `TERAX_CONTROL_TOKEN`, `TERAX_TERMINAL`,
  `TERAX_HOOK_TIMEOUT/WAIT/DEBUG` — hook.rs:55-69, lib.rs:107,285-286,327, agent.rs:189-190,278-285,652,706-714
  (and backend-core shell_init.rs/scripts).
- Hook ownership markers in user configs: `TERAX_CLI` + `hook` (agent.rs:333), Gemini `"name": "terax"`
  (agent.rs:318), `LEGACY_MARKERS = ["notify;Terax;", "terax;notify", "__terax_notify"]` (agent.rs:255),
  Pi `terax-notifications.ts` / `// terax-pi-notifications-v2` / family `terax-pi-notifications-v` (agent.rs:135-136,184).
- Control descriptor and launcher: `<cache>/terax/control.json` (control.rs:758, cli lib.rs:300),
  `<cache>/terax/run/<pid>/bin/terax(.exe)` (control.rs:927,946).
- Bundled sidecar name `terax-cli`/`terax-cli-<triple>` (control.rs:807-823, build-cli.mjs:59-81,
  Cargo.toml:2,13; tauri.conf externalBin in build-identity). The PATH-visible command `terax` (launcher) shadows an
  installed Terax's own `terax` command inside lut panes.
- Windows argv `__terax_notify` + OSC `777;notify;Terax;` (agent.rs:641-665; lib.rs:172).

**(b) Visual rebranding**: CLI help/messages ("Terax command line interface", "Terax is not running…", "Opened … in
Terax", `terax <ver>`; cli lib.rs:87-566, hook.rs:96-151), "Denied in Terax" (render.rs:46), control errors
"Terax is still restoring…", "Terax UI did not respond" (control.rs:629-695), "Terax notifications are working"
(notify.ts:40), "Run the Terax agent…" (NotificationBell.tsx:296), "Terax could not create an editor tab"
(useControlBridge.ts:140), display name `terax: "Terax"` (format.ts:8), logo special case (agentIcon.tsx:54),
"not managed by Terax" (agent.rs:431).

**(c) Internal (rename on touch)**: crate names `terax-control-protocol`/`terax_cli` identifiers, Tauri event names
`terax:*` (app-internal, not shared across apps), thread names `terax-control-listener`, `terax-hook-stdin`, console
prefixes `[terax]`, comments, temp suffix `.terax-tmp-` (only in the target dir; harmless but could clash in name —
rename with D02).

## Risks

1. **Double delivery / cross-talk today**: a lut pane exports `TERAX_CLI`, so Terax's installed hooks fire into lut;
   conversely lut's installer would consider Terax's hooks its own (same marker) and uninstalling in lut removes
   Terax's hooks (violates 13.2:21).
2. **Descriptor overwrite**: both apps write `<cache>/terax/control.json`; whichever starts last wins.
3. **Silent hook installation** without preview/consent: App.tsx:636-645 (every agent launch), NotificationBell.tsx:218,
   useAiLiveBridge.ts:131 — contradicts proposal "No sorprender al usuario" and F0:9/F5:2.
4. Removing the AI module will break `review.ts`/`managedAgentsStore` and `LocalAgentNotificationsBridge` unless
   ordered (9.9:3).
5. The detailed reducer is unwired; replacing the bridge must keep pane correlation correct (16:17).
6. Hook event schemas drift by CLI version (9.4/9.5); `.off()` events are correct defaults.

## Open questions

1. New names: env prefix `LUT_` (`LUT_CLI`, `LUT_PANE_ID`, `LUT_CONTROL_ADDR`, …)? Sidecar `lut-cli` and PATH command
   `lut`? Cache dir `<cache>/lut`? (Proposal says final executable is `lut`; a PATH command `lut` inside panes would
   shadow nothing but the app itself — confirm.)
2. Keep Gemini and Pi support (proposal only requires Claude/Codex P0; AGT-014 P2 plugins)? Keep OpenCode/Grok launchers?
3. Keep the `__terax_notify`/OSC legacy path at all? Proposed: delete (lut has no legacy installs).
4. Keep the `open`/`identify` CLI methods if the editor (ide-tools) is removed?
5. Keep `public/notification.mp3` (licence/provenance unknown) or ship a lut sound?
6. Should lut actively detect and warn about Terax hooks present in the same config (informational only)?

## Answers

**1. Hook installer.** Writes `~/.claude/settings.json`, `~/.codex/hooks.json`, `~/.gemini/settings.json` (JSON, under
`hooks.<Event>`) and the file `~/.pi/agent/extensions/terax-notifications.ts` (agent.rs:84-136, 492-505). Hook
command strings (agent.rs:275-287):

- POSIX: `[ -n "$TERAX_CLI" ] && "$TERAX_CLI" hook <agent> <event> || printf '{}'`
- cmd (Codex/Gemini on Windows): `if defined TERAX_CLI ("%TERAX_CLI%" hook <agent> <event>) else (echo {})`
- PowerShell (Claude on Windows, with `"shell": "powershell"`): `if ($env:TERAX_CLI) { & $env:TERAX_CLI hook <agent> <event> } else { '{}' }`
- Gemini groups also get `"name": "terax"` and `"matcher": "*"`; Codex gets `commandWindows`.
  Ownership: `command_is_ours` = contains any of `notify;Terax;`, `terax;notify`, `__terax_notify`, or (`TERAX_CLI` and
  `hook`) (agent.rs:255,331-334); a group is ours only if **every** hook command in it is ours (agent.rs:336-348).
  Uninstall removes only our groups for listed events (agent.rs:379-389) — third-party hooks and mixed groups are
  preserved; invalid JSON is refused (agent.rs:353-360). Pi: install refuses to overwrite a file lacking
  `terax-pi-notifications-v`; uninstall deletes only if it carries it (agent.rs:425-438). Writes are atomic and follow
  symlinks (agent.rs:509-568). There is preview (`agent_hooks_plan`) and stale-check apply (`agent_hooks_apply`), but
  the app calls `agent_enable_hooks` directly (no preview).

**2. Control server.** Transport: TCP on `127.0.0.1:<ephemeral>` (control.rs:197), newline JSON, 64 KiB, 32
connections, 7s IO timeout. Auth: global 256-bit token in the descriptor (non-hook methods) and per-pane tokens bound
to pty id (hook requires per-pane; control.rs:401-498), constant-time compare, replay-id set. Discovery: in panes via
env `TERAX_CONTROL_ADDR`/`TERAX_CONTROL_TOKEN`/`TERAX_PANE_ID`/`TERAX_CLI`; outside panes via
`<cache>/terax/control.json` (cli lib.rs:284-330, checks pid liveness). Collisions with a running Terax: the
descriptor file and `<cache>/terax/run/` dir; env var names (Terax hooks fire in lut panes and are accepted by lut's
server); the `terax` command on PATH; the sidecar name in the same install dir is not a collision (different
bundle). The port itself never collides (ephemeral).

**3. terax-cli.** Commands: `terax <file> [--line n] [--no-focus] [--json]`, `open`, `ping`, `capabilities`, `identify`,
`hook <agent> <event>`, `--version` (cli lib.rs:564-566). `hook` never fails the agent: outside a pane or on any error
it prints `{}` (hook.rs:86-110, 348). Build: `scripts/build-cli.mjs` runs `cargo build --locked -p terax-cli` and
copies to `src-tauri/binaries/terax-cli-<triple><ext>` (build-cli.mjs:50-89); bundled as Tauri `externalBin`
`binaries/terax-cli` (tauri.conf.json:38-39). The app locates it next to its own exe or, in debug, in `binaries/`
(control.rs:805-829). The CLI locates the app by env vars or the descriptor file.

**4. Agent events.** Hook kinds (protocol hook/mod.rs:68-82): session-start, prompt, tool-start/end,
permission-request/resolved, notification, stop, stop-failure, interrupt, subagent-start/stop, session-end. Backend
emits detailed `terax:agent-event` and maps to a coarse `terax:agent-signal` (started/working/attention/finished/exited,
pty/agent_detect.rs:69-77). Only the coarse signal reaches the UI today: agentStore session status, OS notification
when unfocused, toast when focused on another tab (attention only), bell list/badge, sound. Tab icons come from
`AgentIcon` (TabBar.tsx:17). Logic: model/reducer, route/delivery/notificationGate/notify/sound, control adapters,
broker. Visual: NotificationBell, AgentToast, AgentLauncherPanel, agentIcon.

**5. AGT status.**

- AGT-001 Claude detection: met (hooks + process detection in backend-core agent_detect).
- AGT-002 Codex: met for SessionStart/UserPromptSubmit/PermissionRequest/Stop; needs re-verification per version.
- AGT-003 no API keys: met in the hook path; violated only by managed-agents/review coupling (AI).
- AGT-004 association pane/PTY/tab/session: partial (pane+pty+sessionId in events; project not yet — depends on projects).
- AGT-005 visible states: partial (reducer has full states; UI shows only working/waiting).
- AGT-006 notify + focus action: met (route.ts onActivate, nextAttentionTarget).
- AGT-007 install with preview + selective uninstall: partial (backend done; UI installs silently, no preview UI).
- AGT-008 activity view: missing (model supports tools/subagents; events `.off()`).
- AGT-009 context/model/usage: missing.
- AGT-010 notification config: partial (two booleans).
- AGT-011 approvals: backend broker exists, UI missing (deferred, P2).
- AGT-012 normalization: met in Rust (adapt.rs) and TS model; UI not yet consuming it.
- AGT-013 no-hooks fallback: partial (process/OSC signals exist in backend-core; no explicit "degraded" indicator, 13.2:16).
- AGT-014 plugins: missing (adapters are hard-coded enums).

**6. Dependency on ai.** The hook pipeline has none. Dependencies are: `review.ts` + `managedAgentsStore.ts`
(AI supervising Claude), `agentStore.localAgent` used by ai `LocalAgentNotificationsBridge`, and ai code that installs
Claude hooks (useAiLiveBridge.ts:131). Removing managed agents and splitting localAgent makes the area API-key free.

## Draft issues

### agents-D01 — Isolate control env vars and CLI discovery from Terax

```yaml
id: agents-D01
depends-on: []
refs: [F0:10, identity, 13.2:21]
covers: [agents/cli-sidecar, agents/control-server, F0:10]
type: task
scope: be
size: M
```

**Goal:** lut panes and lut's CLI never read or export Terax env vars or Terax's control descriptor.

**Acceptance criteria:**

- [ ] `TERAX_CONTROL_ADDR/TOKEN`, `TERAX_PANE_ID`, `TERAX_CLI`, `TERAX_TERMINAL`, `TERAX_HOOK_*` renamed to the lut prefix in the CLI (hook.rs, lib.rs), shell_init.rs and shell scripts (backend-core), agent.rs hook/Pi templates.
- [ ] Descriptor and launcher dir moved to `<cache>/lut/` (control.rs:755-768, cli lib.rs:300).
- [ ] lut panes strip any inherited `TERAX_*` control vars (lut started from a Terax pane).
- [ ] Unit tests updated; a test asserts no `TERAX_` string is exported to the PTY.

**Verification:** `cargo test -p terax-cli -p terax-control-protocol` and `cargo test` in src-tauri pass; in a lut pane `env | grep -i terax` prints nothing.

### agents-D02 — Make lut hook markers distinct and never touch Terax hooks

```yaml
id: agents-D02
depends-on: [agents-D01]
refs: [F0:10, 13.2:21, 16:26, 13.2:15]
covers: [agents/hook-installer, 13.2:21, 16:26]
type: task
scope: be
size: M
```

**Goal:** installing/uninstalling lut hooks preserves Terax's and third-party hooks.

**Acceptance criteria:**

- [ ] Ownership marker is the lut env var (`LUT_CLI` + `hook`); Gemini name `lut`; Pi file/family `lut-notifications.ts` / `lut-pi-notifications-v`; temp suffix `.lut-tmp-`.
- [ ] `LEGACY_MARKERS`, `conout_marker`, `emit_conout_marker` and the `__terax_notify` argv branch (backend-core lib.rs:169-180) removed.
- [ ] Tests: a config with Terax groups (current and legacy markers) plus third-party groups survives lut install+uninstall byte-identical outside lut groups.

**Verification:** `cargo test agent` passes including the new Terax-coexistence tests.

### agents-D03 — Rename the bundled CLI sidecar binary

```yaml
id: agents-D03
depends-on: [agents-D01, build-identity-D01?]
refs: [F0:10, identity]
covers: [agents/cli-sidecar]
type: task
scope: be
size: S
```

**Goal:** lut ships its own sidecar name and PATH command, not `terax-cli`/`terax`.

**Acceptance criteria:**

- [ ] build-cli.mjs outputs `lut-cli-<triple>` (env `LUT_CLI_TARGET`); `externalBin` updated; `find_bundled_cli` and launcher name (`lut`) updated.
- [ ] Shell integration functions (profile.ps1, zshrc.zsh, init.fish) expose `lut`, not `terax`.

**Verification:** `pnpm build:cli` produces `src-tauri/binaries/lut-cli-<triple>`; `pnpm tauri build` bundles it; `lut ping` works in a pane.

### agents-D04 — Stop installing agent hooks without consent

```yaml
id: agents-D04
depends-on: []
refs: [F0:9, F5:2, AGT-007]
covers: [F0:9]
type: task
scope: ui
size: S
```

**Goal:** no code path writes to `~/.claude`, `~/.codex`, `~/.gemini` or `~/.pi` without explicit user consent.

**Acceptance criteria:**

- [ ] Remove the implicit `agent_enable_hooks` calls in App.tsx:636-645 and NotificationBell.tsx:218 (the ai call useAiLiveBridge.ts:131 goes with ai removal).
- [ ] Remove `agent_enable_hooks`/`agent_disable_hooks` commands; only plan/apply remain.
- [ ] Launching an agent without hooks still works (process/OSC signals).

**Verification:** launch Claude from the launcher with no hooks installed: `~/.claude/settings.json` unchanged (checksum); `pnpm test` passes.

### agents-D05 — Design: hook management (preview, consent, selective uninstall)

```yaml
id: agents-D05
depends-on: []
refs: [AGT-007, F5:2, 13.2:15]
covers: []
type: design
scope: ui
size: S
```

**Goal:** user designs how lut shows per-agent hook status, the diff preview and install/uninstall.

**Acceptance criteria:**

- [ ] Design covers status per agent, diff view, stale-preview error, uninstall.

### agents-D06 — Hook management UI with preview/diff and selective uninstall

```yaml
id: agents-D06
depends-on: [agents-D05, agents-D02, agents-D04]
refs: [AGT-007, F5:2, 13.2:15, 16:20]
covers: [AGT-007, F5:2, 13.2:15, 16:20]
type: task
scope: ui
size: M
```

**Goal:** users install/remove lut hooks per agent after reviewing the exact diff.

**Acceptance criteria:**

- [ ] Uses `planAgentHooks`/`applyAgentHooksPlan`; apply refused if file changed since preview, with a re-preview path.
- [ ] Uninstall per agent; non-lut hooks untouched.

**Verification:** manual: install then uninstall on a settings.json with third-party hooks; file returns to original bytes.

### agents-D07 — Spike: verify Claude Code and Codex hook events against current docs

```yaml
id: agents-D07
depends-on: []
refs: [9.4, 9.5, AGT-002, AGT-014]
covers: [AGT-001, AGT-002]
type: spike
scope: be
size: S
```

**Goal:** confirm the event lists in agent.rs:84-131 and adapters in adapt.rs match current official docs.

**Acceptance criteria:**

- [ ] Table of event -> documented fields -> adapter field per CLI version; gaps recorded.
- [ ] Decision on keeping Gemini/Pi/OpenCode/Grok.

**Verification:** findings committed in `.docs/`; follow-up issues added to plan.md.

### agents-D08 — Split localAgent out of agentStore

```yaml
id: agents-D08
depends-on: []
refs: [F2:5, 9.9:3]
covers: [agents/legacy-session-store, F2:5, 9.9:3]
type: task
scope: ui
size: S
```

**Goal:** CLI agent state no longer carries AI-agent state.

**Acceptance criteria:**

- [ ] `localAgent`/`setLocalAgent` moved to the ai module; agentStore keeps CLI sessions and notifications only.
- [ ] No behaviour change; tests updated.

**Verification:** `pnpm test` and `pnpm typecheck` pass.

### agents-D09 — Remove AI-managed agents and review rounds

```yaml
id: agents-D09
depends-on: [ai-D??]
refs: [AGT-003, 9.9:2, 13.2:17]
covers: [agents/managed-agents, AGT-003, 13.2:17]
type: task
scope: ui
size: S
```

**Goal:** the agents module has no import from `@/modules/ai`.

**Acceptance criteria:**

- [ ] Delete managedAgentsStore.ts, review.ts(+test) and their callers in AgentNotificationsBridge.
- [ ] `grep -r "modules/ai" src/modules/agents src/modules/control` is empty.

**Verification:** `pnpm test`, `pnpm typecheck`; with no API key configured, Claude hook notifications still arrive.

### agents-D10 — Agent service driven by the normalized reducer

```yaml
id: agents-D10
depends-on: [agents-D08, agents-D09]
refs: [F5:1, 9.3, 9.5, AGT-012]
covers: [agents/notifications-bridge, F5:1, AGT-012, AGT-004]
type: task
scope: ui
size: M
```

**Goal:** replace AgentNotificationsBridge with a non-visual service: `connectAgentEvents` + process/OSC signals -> `reduceAgents` store keyed by pane, feeding notifications.

**Acceptance criteria:**

- [ ] UI-facing store exposes normalized state only (no provider JSON types).
- [ ] `Stop` -> response-done, `exited` only on real exit (9.3); notifications fired via `notificationEffect`.
- [ ] Correct pane when two panes share cwd (16:17).

**Verification:** `pnpm test` incl. new store tests; manual Claude run shows working -> needs-input.

### agents-D11 — Design: agent status, attention and notification center

```yaml
id: agents-D11
depends-on: []
refs: [9.6, AGT-005, AGT-006, AGT-008]
covers: []
type: design
scope: ui
size: M
```

**Goal:** user designs tab/pane badges, attention highlight, notification list, launcher and collapsed activity view.

**Acceptance criteria:**

- [ ] States of 9.3 each have a visual; degraded (no hooks) state shown (13.2:16).

### agents-D12 — Implement agent status badges and notification center

```yaml
id: agents-D12
depends-on: [agents-D11, agents-D10]
refs: [9.6:2, AGT-005, AGT-006]
covers: [agents/ui-components, AGT-005, AGT-006, 13.2:16]
type: task
scope: ui
size: M
```

**Goal:** replace NotificationBell/AgentToast/AgentLauncherPanel/agentIcon with the user's design on the new store.

**Acceptance criteria:**

- [ ] Badges for every normalized state, focus action from a notification, explicit "no hooks" degradation.
- [ ] Old components deleted.

**Verification:** `pnpm test`; manual run with hooks on and off.

### agents-D13 — Shortcut: jump to next agent needing attention

```yaml
id: agents-D13
depends-on: [agents-D10]
refs: [F5:4, 9.6:2]
covers: [F5:4]
type: task
scope: ui
size: S
```

**Goal:** keyboard action focuses the pane of the next agent needing attention using `nextAttentionAgent`.

**Acceptance criteria:**

- [ ] Cycles by attention order; no-op when none.

**Verification:** unit test of ordering; manual with two waiting agents.

### agents-D14 — Configurable notification types, sound and privacy

```yaml
id: agents-D14
depends-on: [agents-D10, agents-D11]
refs: [AGT-010, 14.2:1]
covers: [agents/notification-routing, AGT-010]
type: task
scope: ui
size: M
```

**Goal:** per-kind (attention / response-done / error) notification and sound settings; body redaction by default.

**Acceptance criteria:**

- [ ] Preferences migrated from the two booleans; routing honours per-kind settings.
- [ ] Notification bodies omit prompts/paths unless enabled.

**Verification:** `pnpm test` (route/delivery tests extended).

### agents-D15 — Robustness tests for the hook pipeline

```yaml
id: agents-D15
depends-on: [agents-D10]
refs: [F5:8, 13.5:1, 13.5:2, 13.5:4, 14.1:8]
covers: [F5:8, 13.5:4]
type: task
scope: be
size: M
```

**Goal:** tests for out-of-order, duplicate, malformed, late hooks, app close while waiting and missing hooks fallback.

**Acceptance criteria:**

- [ ] Rust tests in agent_events.rs/control.rs and TS reducer tests cover each case.

**Verification:** `cargo test`, `pnpm test`.

### agents-D16 — Agent activity view (tools, subagents, errors)

```yaml
id: agents-D16
depends-on: [agents-D11, agents-D10, agents-D07]
refs: [AGT-008, F5:5, 9.6:4]
covers: [AGT-008, F5:5]
type: task
scope: ui
size: M
```

**Goal:** collapsed-by-default activity view; tool/subagent hooks are installed only when the user enables it.

**Acceptance criteria:**

- [ ] Enabling the view adds the `.off()` events through the preview flow (D06).

**Verification:** manual run with tool events enabled; `pnpm test`.

### agents-D17 — Spike: statusLine bridge for context/model/usage

```yaml
id: agents-D17
depends-on: []
refs: [AGT-009, 9.7]
covers: [AGT-009]
type: spike
scope: be
size: S
```

**Goal:** decide whether a non-destructive statusLine chaining is possible.

**Acceptance criteria:**

- [ ] Findings on coexistence with a user statusLine and available fields.

**Verification:** document in `.docs/`.

### agents-D18 — Spike: UI approvals with the existing decision broker

```yaml
id: agents-D18
depends-on: [agents-D10]
refs: [AGT-011, 9.8]
covers: [agents/decision-client, AGT-011]
type: spike
scope: be
size: S
```

**Goal:** check the broker against the 9.8 guarantees and decide keep/remove of `agentDecisions.ts`.

**Acceptance criteria:**

- [ ] Gap list vs 9.8:1-7; decision recorded.

**Verification:** document in `.docs/`.

### agents-D19 — Rebrand user-visible strings in agents/control

```yaml
id: agents-D19
depends-on: [agents-D03]
refs: [identity]
covers: [agents/control-protocol, agents/control-frontend-bridge]
type: task
scope: be
size: S
```

**Goal:** user-visible CLI/control/notification messages say lut.

**Acceptance criteria:**

- [ ] Strings listed in "terax mentions (b)" updated; internal identifiers untouched.
- [ ] `open` method behaviour re-checked against the editor decision (ide-tools).

**Verification:** `cargo test`, `pnpm test`; `lut --help` shows lut.
