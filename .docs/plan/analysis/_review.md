# Cross-area review of the analysis

Scope: the eight `analysis/<area>.{json,md}` files, `analysis/proposal.md`, `inventory/proposal-items.json`.
Method: validator run; all 136 draft issues parsed from the `## Draft issues` sections (yaml blocks) with a script
(covers, depends-on, type, scope, size); mechanical check of every `file:line` citation in the area `.md` files
(1075 citations); manual check of about 60 sampled claims against the code.

## Validator

- `node .docs/plan/tools/validate.mjs --analysis-only` → `validate: OK`, exit 0, on the first run. **No JSON edits were made.**
- Things the validator does not check, found by parsing the drafts:
  - Every `covers` id in the drafts is a valid proposal item or inventory item. Every non-`keep` inventory item is
    covered by at least one draft.
  - **18 dependency placeholders** do not resolve. In plan.md they must become real ids:
    `agents-D09→ai-D??`, `ai-D03→identity-D01?`, `ai-D05→app-shell-D?`, `ai-D09→agents-D?`,
    `backend-core-D08→state-settings-D??`, `backend-core-D14→terminal-D??`, `ide-tools-D03→ai-D??`,
    `ide-tools-D06→tabs-D??,ai-D??`, `ide-tools-D07→ai-D??`, `ide-tools-D13→tabs-D??`, `ide-tools-D15→tabs-D??`,
    `ide-tools-D18→app-D??`, `state-settings-D07/D09/D13→terminal-D??`, `terminal-D05→backend-core-D??`,
    `terminal-D06→profiles-D??` (there is no profiles area at all; see below).
  - **Dependencies that resolve but point at the wrong issue:**
    - `build-identity-D01?` is used to mean "bundle id change", but D01 is the updater. The bundle id change is
      **build-identity-D04**. Affected drafts: agents-D03 (should depend on build-identity-D05), app-shell-D24, app-shell-D25,
      backend-core-D01, backend-core-D13, state-settings-D01.
    - `ai-D01?` is used to mean "AI removed", but ai-D01 only isolates the keychain service. The real
      targets are ai-D05 (unmount), ai-D09 (frontend delete) and ai-D10 (Rust delete). Affected drafts: app-shell-D06,
      app-shell-D09, backend-core-D05, backend-core-D06, build-identity-D08, build-identity-D09, build-identity-D10,
      state-settings-D02.

## Cross-area inconsistencies

### Duplicate or overlapping drafts (merge, or keep one and cross-reference it)

| Concern                                                       | Drafts                                                                                                                                                                                                                                                                        | Recommendation                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Move `workspaceAuthorize` wrappers out of `modules/ai` (F2:3) | ai-D02 ≡ app-shell-D05                                                                                                                                                                                                                                                        | Keep ai-D02, which covers all four importers (useSpacesBoot.ts:1, useWorkspaceSwitcher.ts:3, App.tsx:33, useGitStatus.ts:1). Drop app-shell-D05.                                                                                                                                                                                            |
| Rename `TERAX_*` env vars exported to PTYs                    | agents-D01 ⊇ backend-core-D02                                                                                                                                                                                                                                                 | agents-D01's acceptance criteria already rename shell_init.rs and the scripts. The rename must be one atomic PR, because the CLI reads the variables (terax-cli/src/lib.rs:107,285) that shell_init.rs:195-219 exports. Merge them into one issue.                                                                                          |
| Hook marker and `__terax_notify` removal                      | agents-D02 ⊇ backend-core-D03                                                                                                                                                                                                                                                 | Merge. lib.rs:169-180, agent_detect.rs:35 and agent.rs:255,644 change together.                                                                                                                                                                                                                                                             |
| `terax` launcher, sidecar and shell function rename           | agents-D03 vs build-identity-D05 (control.rs:927,946) vs backend-core-D02 (`terax` function)                                                                                                                                                                                  | Assign one owner. Note that agents-D03 forgets bashrc.bash:35.                                                                                                                                                                                                                                                                              |
| Read policy protects lut's control dir                        | ai-D03 (pathPolicy.json) vs ide-tools-D02 (read_policy.rs:15)                                                                                                                                                                                                                 | One issue, in the same PR as the descriptor move (see removal orders).                                                                                                                                                                                                                                                                      |
| Remove AI settings sections and prefs                         | ai-D07 vs state-settings-D02/D03                                                                                                                                                                                                                                              | Both delete ModelsSection and the AI part of AgentsSection. Keep state-settings-D02 for sections and state-settings-D03 for store keys. Drop ai-D07, or reduce it to the `lm_ping` command.                                                                                                                                                 |
| AI in the editor and source control                           | ai-D08 ≡ ide-tools-D06 (autocomplete) + ide-tools-D07                                                                                                                                                                                                                         | Keep the ide-tools drafts, which are finer-grained. Drop ai-D08.                                                                                                                                                                                                                                                                            |
| AI entry points in the shell                                  | ai-D05/ai-D06 vs app-shell-D06 (close guard flush, useAppCloseGuard.ts:2-6), app-shell-D09 (WorkspaceInputBar, AiComposerProvider App.tsx:1694), app-shell-D20 (palette/shortcuts), terminal-D12 (BlockOverlay.tsx:12) and ide-tools-D06 (AiDiffPane vs the ai-diff tab kind) | One owner per file. Suggested split: ai-D05 unmounts App.tsx only; app-shell-D06/D09 and terminal-D12 handle their own files; ai-D06 is reduced to statusbar, shortcuts, palette and the ai-diff kind.                                                                                                                                      |
| Split ratios (PRJ-006)                                        | terminal-D04 vs state-settings-D07                                                                                                                                                                                                                                            | terminal-D04 changes the model (panes.ts:14); state-settings-D07 persists it. state-settings-D07 should depend on terminal-D04 and stop covering PRJ-006 itself.                                                                                                                                                                            |
| Per-profile appearance (PRO-005, F3:5)                        | terminal-D07 vs state-settings-D13                                                                                                                                                                                                                                            | Renderer override (terminal-D07) and then the resolver (state-settings-D13). Add the edge state-settings-D13 → terminal-D07.                                                                                                                                                                                                                |
| Prompt-ready signal (8.4:6)                                   | backend-core-D12 (per-PTY BE signal) vs terminal-D09 (OSC 133 FE contract)                                                                                                                                                                                                    | Two answers to one question. Decide FE-only (terminal-D09, which already works through GhosttySemanticEventRouter) or BE. Don't build both.                                                                                                                                                                                                 |
| Open file links without LSP                                   | terminal-D11 vs ide-tools-D08                                                                                                                                                                                                                                                 | ide-tools-D08 (pure move of navigator.ts) goes first. terminal-D11 then adds the OS-opener fallback. Add the edge terminal-D11 → ide-tools-D08.                                                                                                                                                                                             |
| Open tab with profile (PRO-011)                               | terminal-D06 vs app-shell-D16                                                                                                                                                                                                                                                 | terminal-D06 owns the launch API; app-shell-D16 owns the menu UI. app-shell-D16 depends on `state-settings-D01?`, which is unrelated. It should depend on terminal-D06 and on a profile-UI design issue, which does not exist yet.                                                                                                          |
| Webview storage keys                                          | state-settings-D01 vs app-shell-D24                                                                                                                                                                                                                                           | state-settings-D01 renames the theme shadow keys in ThemeProvider.tsx:47-48 and settings.html:11 but **not index.html:11**, which also reads `terax-ui-theme-shadow` (app-shell area). After the rename the main window's pre-paint reads a key that is never written again, which causes a theme flash. index.html must be in the same PR. |
| Bench identifier                                              | build-identity-D04 vs app-shell-D25                                                                                                                                                                                                                                           | See removal orders: it must be the same PR.                                                                                                                                                                                                                                                                                                 |
| Dependency pruning (9.9:6)                                    | ai-D11 vs build-identity-D09                                                                                                                                                                                                                                                  | ai-D11 handles AI deps; build-identity-D09 handles the rest after ide-tools. Make that explicit.                                                                                                                                                                                                                                            |

### Contradictory dispositions

- **Spaces:** `state-settings/spaces-persistence` is `replace`, and state-settings-D06 says a new `projects` module
  "replaces `spaces/lib/store.ts`". The proposal says the opposite: ADR-006, ADR-005 ("adapt themes and Spaces") and
  §5.6 ("do not discard the split serialization or the hydration infrastructure", IR-51). terminal-D04 and
  state-settings-D07 also _extend_ `serialize.ts`. state-settings-D06 also says "spaces state migrated once if present",
  while the state-settings open questions say "lut starts clean". Pick one: evolve spaces into projects (`adapt`), or replace it.
- **Vibrancy:** `backend-core/vibrancy` (vibrancy.rs) is `defer` (backend-core-D15), but its only frontend,
  `state-settings/theme-window-platform` (theme/vibrancy.ts), is `keep`. Both should follow the same decision.
- **Markdown code blocks:** `ai/markdown-code` is `replace`, but ai-D04 moves it into the markdown module as a pure move
  ("no visual change"). ide-tools-D16 may then delete the markdown preview. ai-D04 must depend on ide-tools-D01;
  otherwise it is wasted work if markdown is removed.
- **Terminal links:** terminal says "inject an open-path capability with an OS-opener fallback" (terminal-D11).
  ide-tools says "move the navigator to a neutral module" (ide-tools-D08). This is compatible only with the
  ordering given above.
- **`terax-pty` URI scheme:** terminal says it, `TERAX_BLOCKS`, `_terax_precmd` and `terax:agent-signal` "must be renamed together".
  backend-core and build-identity say rename-on-touch only (per-process registration; no collision with Terax). Follow
  backend-core: only `TERAX_BLOCKS` is class (a), because it is an env var exported to children. backend-core-D02 must
  also update the terminal test `shellBlockCompatibility.test.ts:27`, which is outside its area.
- **Decision broker (IR-55):** proposal.md asks that the broker "fall through immediately". The code already does this:
  `agent_events.rs:470-472` waits only when `broker.ui_ready(...)` is true; `agentDecisions.ts:55-65` announces
  readiness only when `options.decisions` is set; and no caller in `src/` passes it. agents' `keep` disposition for
  `agents/hook-broker` is therefore correct. The proposal concern is resolved and needs only a regression test, not
  a new issue.
- **Spikes covering `defer` inventory items:** ide-tools-D01 covers 11 `defer` items, app-shell-D26 covers 3,
  terminal-D13 covers 2, and backend-core-D14/D15 cover 1 each. The validator therefore reports them as covered, but
  no issue implements the result of each decision (remove or rebuild the editor core, explorer logic, fs search index,
  markdown/preview logic, git history/source-control logic, editor git diff, fs explorer ops). plan.md needs
  follow-up issues, or "Not planned" entries, once the decisions exist. Spikes should not `cover` those items.

### Removal orders that would break the build or runtime

1. **build-identity-D04 breaks `src/app/dist-budget.test.ts:313-318`.** vite.config.ts:17-28 rejects a bench identifier
   equal to the _current_ `identifier`. The test asserts that `app.crynta.terax` is rejected, which stops being true once
   tauri.conf.json:5 changes. The test update must be in build-identity-D04, not in app-shell-D25.
2. **Cycle agents-D09 ↔ ai-D09.** agents-D09 deletes `managedAgentsStore`, which is imported by ai/tools/agent.ts,
   useAiLiveBridge.ts and useAiBootstrap.ts, so it must follow ai-D09. ai-D09 needs `review.ts` gone first,
   because review.ts imports chatStore at :1 and chatRuntime at :32. Fix: split agents-D09 into (a) remove review.ts
   and its bridge callers, before ai-D09, and (b) delete managedAgentsStore, after ai-D09 or inside it.
3. **backend-core-D06 (delete ipc_body) before ai-D10 breaks the Rust build:** `net.rs` and `ai_sessions.rs` use
   `ipc_body`. Its dependency must be ai-D10.
4. **backend-core-D05 (delete modules/shell)** has two callers still alive: ai/lib/native.ts (until ai-D09) and
   editor/lib/externalFormat.ts (until the editor decision). It must depend on ai-D09, ide-tools-D01 and an
   editor-formatting issue. Without that, it either fails its acceptance criterion ("no frontend reference") or causes runtime `invoke` errors.
5. **ai-D09 (delete src/modules/ai) is missing edges** to the remaining importers outside ai:
   terminal-D12 (BlockOverlay.tsx:12), agents-D09a (review.ts), app-shell-D06 (useAppCloseGuard.ts:2-6),
   state-settings-D03 (settings/store.ts:8-16 imports AI config), ai-D03 (markdown/lib/assetPath.test.ts:2 and
   MarkdownPreviewPane.tsx:2 import `checkReadable`), ide-tools-D06/D07, app-shell-D09 and app-shell-D19 (StatusBar.tsx:6-11).
6. **ide-tools-D17 (remove LSP)** is missing edges to state-settings-D02 (settings/components/LspInstallDialog.tsx:10
   imports `@/modules/lsp`), terminal-D11 (terminalLinks.ts:17) and the app-shell status bar work.
7. **Command blocks and history:** backend-core says `history/` serves only block mode (block/lib/history.ts). In fact
   the command palette history mode uses it too: `src/modules/command-palette/hooks/useCommandHistory.ts:1` imports
   `historyList` from `terminal/block/lib/history`, which invokes `history_list`. Removing blocks (terminal-D13) or
   history/ (backend-core-D14) breaks the palette unless app-shell-D20/D21 handles it.
8. **Control token window:** agents-D01 moves the control descriptor to `<cache>/lut`. read_policy.rs:15 denies only
   `<cache>/terax` until ide-tools-D02 lands, so between the two PRs `asset_grant` and the fs read commands can read lut's
   control token. Put both in the same PR, or land ide-tools-D02 first.
9. **ai-D03** moves pathPolicy.json; read_policy.rs:20 `include_str!`s it. The draft says so, which is correct. It also needs
   the lut cache dir name, which comes from agents-D01 or a naming decision, not "identity-D01".

### Phase 0 identity targets missing from build-identity's class (a) list

The token regex splits on `;`, so these identity strings fell into (b) or were left out, although other areas found them:

- OSC 777 marker `notify;Terax;` is written into users' agent configs and read back (agent.rs:255 `LEGACY_MARKERS`,
  agent.rs:644 and 1058, agent_detect.rs:35). Only `TERAX_MARKER` is listed. Owned by agents-D02 and backend-core-D03.
- Temp-file suffix `.terax-tmp-` is created next to users' `~/.claude`/`~/.codex` files (agent.rs:552, cleanup at :1221).
  Only agents-D02 mentions it.
- Gemini hook name `"name": "terax"` (agent.rs:318) is noted in prose but not in the table. Same for the cache-dir joins.
  They are in prose only, so a script-driven check would miss them.
- The rest is consistent: keyring `terax-ai` (ai/config.ts:1), `~/.cache/terax/shell-integration` (shell_init.rs:449),
  `<cache>/terax` (control.rs:758, terax-cli lib.rs:300, read_policy.rs:15), productName (tauri.conf.json:3, covered by
  build-identity-D05), updater (tauri.conf.json:118-121). Webview keys (`terax.sidebar.*`, `terax-palette-*`,
  `terax-ui-*-shadow`, IndexedDB `terax-bg-images`, `terax.experimental.terminal-backend`) are isolated by the identifier,
  so they are correctly not class (a).
- No draft decides the **autostart plugin** (lib.rs:207, Cargo.toml:140). build-identity-D08 keeps its capability, while the proposal
  says autostart is not required (IR-14).

## Uncovered proposal items

**213 of 369** proposal items are not in any draft's `covers`. Grouped:

**Belong to a code area but no draft lists them** (often the work exists in a draft; only the `covers` entry is missing):

- Terminal P0 features that exist today and need a verification/keep issue: TER-001, TER-002, TER-004, TER-005, TER-006,
  TER-007, TER-009, TER-012, TER-013; 13.2:1, 13.2:2, 13.2:3, 13.2:4, 13.2:7, 13.2:8; 16:1, 16:2, 16:4, 16:5, 16:24.
- Renderer and architecture constraints, which should be attached as `covers` to app-shell-D04, terminal-D02 or terminal-D15, or
  listed in "Not planned" as constraints: 5.4:2, 5.4:4, 5.4:5, 5.4:7, 5.10:1, 5.10:2, 5.10:3, 5.10:4, 5.10:5, 5.10:7,
  5.10:8, 5.10:10, 5.10:13, 10.1:2–10.1:7, 6.2:1, 6.2:2, 6.2:4, 6.2:9, 6.2:10.
- Agents (agents-D10/D12/D15 already do part of this; add the covers): AGT-013, AGT-014, 6.2:7, 9.1, 9.2, 9.3, 9.4:1–9.4:10,
  9.5, 9.6:1–9.6:7, 9.7, 9.8:1–9.8:7, F5:3, F5:6, F5:7, F5:gate, 13.2:13, 13.2:14, 16:15, 16:17, 16:18, 16:19, 16:21.
- UX: UX-011, UX-012, F6:6, F6:7, F6:8.
- Gates: F0:gate, F1:gate, F2:gate, F3:gate, F4:gate, F5:gate, F7:gate.

**Belong to no code area. They need new issues** (new modules, docs, process):

- **Profiles module. No area owns it.** This is the largest gap. terminal-D06 depends on `profiles-D??` and backend-core-D08 on `state-settings-D??`,
  and neither exists. Uncovered: PRO-001, PRO-004, PRO-007, PRO-010, PRO-012, F3:1, F3:2, F3:4, F3:7, 6.2:5, 7.3, plus
  IR-11, IR-23, IR-24, IR-62–IR-66. There is also no **design** issue for the profile manager, picker or icon UI.
- **Projects restore orchestrator and presets:** PRJ-007, PRJ-010, PRJ-012, PRJ-013, PRJ-015, 6.2:6, 6.5:1, 6.5:4–6.5:8,
  8.4:1, 8.4:2, 8.4:3, 8.4:5, 8.4:7, 8.4:8, 8.4:9, 8.4:10, 8.5:2, 8.5:4, 8.5:5, 8.5:6, 8.6, F4:2, F4:3, F4:4, F4:5, F4:6,
  F4:8, F4:9, 13.2:10, 13.2:11, 13.2:12, 13.2:20, 16:7, 16:8, 16:10, 16:11, plus IR-26 (archive), IR-28 (three startup modes plus
  a default project; state-settings-D08 implements only "restore last"), IR-48 (4-pane limit), IR-68–IR-71, IR-74.
  There is also no design issue for the preset editor, the autostart consent modal (8.5:2) or the restore error UI (8.4:9).
- **Phase 0 baseline and docs:** F0:1 and F0:3 (already done; mark them done or "Not planned: done"), F0:8, F0:11, F0:12,
  F0:entregable, 13.4:1–13.4:8, 15:6. terminal-D15 writes into "the baseline report", but no issue creates that report.
- **Docs, licensing and provenance:** ADR-001 (root README with origin SHA and `> [!NOTE]` credit; no README exists),
  14.3:1, 15:8, 16:25, 14.4:1–14.4:4, 15:1, 15:2, 15:3, 15:4, 15:5, 15:7, ADR-002, ADR-003, ADR-005, ADR-006, ADR-007.
- **Process and CI** (implicit): IR-95 (CI workflow; `.github` was removed in 154a6cf), IR-93 (PR template), IR-41 (ADR on
  contract change), IR-58 (lint rule for UI→process imports), IR-45 (no dependency upgrades in F0–F2), IR-96 (perf thresholds).
- **Security and privacy rules,** which should become acceptance criteria of existing drafts (state-settings-D09, agents-D10,
  agents-D15, terminal-D11, backend-core-D08): 14.1:1–14.1:9, 14.2:1–14.2:3.
- **Cross-platform test matrix:** 13.3:1–13.3:4, 13.5:1, 13.5:2, 13.5:3, 13.5:5, 13.5:6, 13.5:8, F7:5, 16:28, 16:29.
- **Multiwindow (P2), candidates for "Not planned":** TER-010, PRJ-012, UX-012, F7:1–F7:4, F7:gate, 5.10:13.
- **Other implicit requirements (proposal.md IR-xx) that no draft addresses:** IR-06 (a user decision issue for names
  and ids; many Phase 0 drafts block on it), IR-10 (Windows PowerShell 5.1), IR-14 (autostart), IR-15 (first launch shows a
  terminal), IR-18 (agent/control failure must not block the terminal; error boundaries), IR-86 (focus mode), IR-92
  (design-free orientation PoC), IR-97 (licenses screen, future).

## Draft issue problems

**Too big or should be split:**

- state-settings-D09 (M) mixes four concerns: consent model with hashing, the startup runner (after prompt-ready), per-pane result UI
  (retry / open shell), and import trust. Split it. The UI part needs a design.
- state-settings-D06 (M): new projects store, Zod schema and migrations, _plus_ dropping the IDE tab kinds from the serializer.
  This is likely more than 400 lines. Split the schema/store from the serializer change.
- app-shell-D10 (L): moves the pure planners and extracts the store in one PR, and also replaces `window.__teraxNewBlockTab`
  (useTabs.ts:804). Split into a refactor-only move, then the store, then the global.
- ide-tools-D04 (XL): the `git_watch`/`git_unwatch` move is in the same PR as about 11k lines of deletions. Move first; then delete per
  subsystem (checkpoints, task worktrees, review) so each PR stays reviewable.
- agents-D01 merged with backend-core-D02: one atomic rename with a size-exception. Stripping inherited `TERAX_*` vars is a
  behaviour change and gets its own issue. The descriptor move goes in a PR together with ide-tools-D02.
- backend-core-D10 (M): WSL distro, start directory and typed errors are three concerns.
- terminal-D06 (M) covers PRO-011, PRO-009, the launch path and the pane-tree model change.
- app-shell-D13, app-shell-D23, state-settings-D11, ide-tools-D10, ide-tools-D12 (L) are acceptable only if they are
  split per design section once the design exists. Their size-exceptions already say so; plan.md should make the split explicit.

**UI work not blocked by a `design` issue:**

- state-settings-D09 (consent and per-pane result UI), app-shell-D24 (visible app name is visual rebranding, identity:2;
  it should depend on build-identity-D11, not be in Phase 0), app-shell-D16 (no profile-picker design exists), ide-tools-D15
  ("or rebuild" variant has no design dependency), state-settings-D14 (adds an "edit externally" action).
- app-shell-D15 and app-shell-D16 depend on the design only through app-shell-D14. Give them a direct edge to app-shell-D01/D02.
- Missing design issues: the profile manager, picker and icons; the project preset editor, autostart consent modal and restore
  status/error UI; the optional status bar (IR-87) and focus mode (IR-86).

**Refactor mixed with behaviour change:**

- terminal-D11 combines the LSP decoupling, the `spaces` import removal and the new OS-opener fallback.
- ai-D03 combines a file move with a new policy (lut dirs added).
- app-shell-D10, ide-tools-D04, state-settings-D06: see above.
- backend-core-D02: rename plus stripping of inherited vars.

**Missing dependency edges between areas** (besides the placeholders and wrong ids listed under Validator):

- build-identity-D04 must include the dist-budget.test.ts update (removal order #1).
- ai-D09 needs edges to terminal-D12, agents-D09a, app-shell-D06, app-shell-D09, app-shell-D19, state-settings-D03, ai-D03,
  ide-tools-D06 and ide-tools-D07.
- backend-core-D06 → ai-D10. backend-core-D05 → ai-D09 plus the editor decision. build-identity-D10 (CSP `connect-src https:`) → ai-D10.
- ide-tools-D17 → state-settings-D02, terminal-D11. terminal-D11 → ide-tools-D08. ai-D04 → ide-tools-D01.
- state-settings-D07 → terminal-D04 and terminal-D06. state-settings-D09 → terminal-D09 (or backend-core-D12).
  state-settings-D13 → terminal-D07. terminal-D05 → backend-core-D08 and backend-core-D09.
- terminal-D13 and backend-core-D14 → app-shell-D20/D21 (palette history mode, removal order #7).
- agents-D02 (lut hook markers) must precede **any** hook testing (F0:9; proposal contradiction C-04). agents-D04 has no
  dependencies and covers F0:9, but the F0:9 test itself writes hooks.
- All of Phase 0 (agents-D01/D03, build-identity-D04/D05, backend-core-D01, state-settings-D01) depends on a missing
  **user decision issue for names** (identifier, executable, CLI sidecar, env prefix, cache dir).

## Wrong claims

Mechanical check: 1075 `file:line` citations in the area `.md` files. 1072 resolve to an existing file and line
range. The three that do not:

- agents.md:47 `route.ts:30-73`: `src/modules/agents/lib/route.ts` has 69 lines.
- state-settings.md `agents/.../AgentLauncherPanel.tsx:93`: elided path. The real file is
  `src/modules/agents/components/AgentLauncherPanel.tsx:93`, and the line is correct.
- terminal.md `src/foo.ts:10`: an example inside a verification step, not a claim.

Substantive errors found in the sample of about 60 manually checked claims (all others matched the code):

- **backend-core** (Couplings, Answers §6 and crossAreaFindings): "history/ is only used by terminal block-mode suggestions". This is wrong.
  `src/modules/command-palette/hooks/useCommandHistory.ts:1` uses `historyList` (`history_list`) for the palette's
  history mode (CommandPalette.tsx:99-101).
- **agents** (agents.md:131, agents-D04): calls `NotificationBell.tsx:218` a silent or implicit `agent_enable_hooks` call.
  It runs only on an explicit user click (`onEnable`, NotificationBell.tsx:358). It is consent without preview, not
  silent installation. The silent paths are App.tsx:636-645 and useAiLiveBridge.ts:131.
- **agents-D03**: lists profile.ps1, zshrc.zsh and init.fish for the `terax` shell function but omits
  `bashrc.bash:35`. The cited lines zshrc.zsh:26 and init.fish:17 are the guard lines; the functions are at :27 and :18.
- **terminal** (crossAreaFindings): "split-down keyword 'row' is inconsistent". This is questionable: split down produces two rows
  (`LayoutTwoRowIcon`, commands.ts:209), so the user-facing keyword is right even though the internal `SplitDir` naming differs.
- **build-identity**: the class (a) table omits `notify;Terax;` and `.terax-tmp-` (see above). This is incomplete rather than wrong.
- **state-settings.md:133**: `useSpacesBoot.ts:44` "read once at boot". Line 44 is a parameter; the `loadAll()` call is at :55.
  This is a minor imprecision.
- Several summaries write `crates/terax-cli/...`. The real path is `src-tauri/crates/terax-cli/...` (the md files are mostly correct).

Verified-correct examples include: useTabs.ts:31,804,1364-1365; WebGlTerminalRuntime.ts:22; terminalLinks.ts:17,175,179,187,202;
BlockOverlay.tsx:12,265; shell_init.rs:115-129,195-219,449; terax-cli lib.rs:107,285,300; agent_detect.rs:35; lib.rs:88,170,198;
control.rs:758,927,946; read_policy.rs:15,20; agent.rs:318; ai/config.ts:1; ai/lib/agent.ts:158-159; tauri.conf.json:5,29,39,119-121;
App.tsx:120,369,637,1395,1625-1634,1668,1694; bench.rs:17; dist-budget.test.ts:313-316; workspace.rs:231,254; net/clients.rs:118;
serialize.ts:14-16,25-27; useSourceControlPanel.ts:874-875; ModelsSection.tsx:904,1121; previewUrl.ts:5; AboutSection.tsx:27;
MarkdownPreviewPane.tsx:1-2; chat-code.tsx:5; review.ts:1,32; vite.config.ts:86-92; store paths (settings/store.ts:225,
spaces/lib/store.ts:21, customThemes.ts:5); index.html:11; main.tsx:30. Also verified: `pty_has_foreground_job` has no frontend
caller; `shell_run_command` is used only by ai/lib/native.ts and editor/lib/externalFormat.ts; the `agents/model` reducer
is not imported outside its folder; and the git checkpoint/task commands are called only from the wrappers in `src/modules/git/api.ts`.

## Decisions for the user

Deduplicated from all analyses. The first group blocks Phase 0 or many issues.

1. **Names** (IR-06, C-20): bundle identifier, executable `lut`, hooks CLI sidecar name (`lut-cli`?), PATH command,
   env prefix (`LUT_`), cache dir (`<cache>/lut`). Phase 0 drafts in agents, backend-core, build-identity and state-settings block on this.
2. **Optional IDE tools** (C-17, ide-tools-D01): keep or remove each of the editor, LSP, explorer, Git panel, Git history, diff, markdown preview,
   web preview, palette file and content search, and the unwired git agent-task backend. About 30 inventory items wait on this.
3. **Command blocks mode** (terminal-D13): keep or remove. This also decides `history/`, the palette history mode, `__teraxNewBlockTab`
   and the block-input toggle.
4. **Spaces → Projects**: evolve Spaces (ADR-006, `adapt`) or replace it with a new module (state-settings' current plan).
   Is any migration needed beyond lut-internal schema versions (C-03)?
5. **Updater in Phase 0** (C-05): remove the plugin, or keep it disabled until lut's own pipeline exists.
6. **shadcn/Radix primitives** (C-01): kept as a toolkit and restyled, or replaced.
7. **Phase 1 before the design** (C-02, IR-92): allow an unstyled orientation PoC, or block all F1 UI on the design issues.
8. **P0 restore semantics** (C-08, C-09): layout-only restore with all commands manual, or promote PRJ-007/PRJ-013 to P0.
9. **Per-pane font/theme** (C-11, PRO-005 P0): run the renderer/atlas spike before committing the scope.
10. **Profile executables**: any validated path, or the allowlist extended by stored profiles (shell_init.rs:115-129 silently drops
    non-enumerated shells today).
11. **Tab orientation**: global setting or per project (C-07).
12. **Pane limit**: keep 4, raise it, or make it a setting bounded by 12 WebGL slots.
13. **Agent adapters**: keep Gemini, Pi, OpenCode and Grok, or limit to Claude and Codex.
14. **File links without an editor**: OS default app, reveal in the file manager, or a configurable external editor command.
15. **Autostart plugin**: remove (recommended by IR-14).
16. **Window vibrancy and background image**: keep or drop. The backend (defer) and frontend (keep) dispositions disagree today.
17. **OSC 0/2 titles** renaming tabs, and BEL / OSC 9 / OSC 777 reaching notifications.
18. **WSL in P0** through the existing workspace env, or PRO-006 promoted to P0 (C-18).
19. **Project "archive"** semantics (C-10).
20. **Platform scope before v1**: the Linux and macOS test matrix (C-21).
21. **Smaller decisions:** keep the separate settings window; the provenance of `public/notification.mp3`; keep the CLI `open`/`identify`
    methods without the editor; macOS camera/microphone entitlements; the Nix flake; `.coderabbit.yaml`; WebView2 bootstrapper mode;
    a generated third-party notices file.
