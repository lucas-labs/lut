# Independent review of `.docs/plan/plan.md`

Scope: what `validate.mjs` cannot check (it passes: 25 epics, 274 issues, 369/369 proposal items, 111/111 inventory
items). Findings are ordered by severity inside each section. **Severity:** H = breaks a decision, the build or an
acceptance test; M = rework, a wrong order or a coverage gap; L = cleanup.

## Top findings (fix before generating GitHub issues)

| # | Sev | Issue(s) | Finding | Fix |
|---|---|---|---|---|
| T1 | H | E02 (E02-07, E02-16) | Until E05-18, lut **reads Terax's keychain**. `useAiBootstrap` (mounted in `App.tsx`) calls `getAllKeys()` at startup with `KEYRING_SERVICE = "terax-ai"` (`src/modules/ai/config.ts:1`, `lib/keyring.ts:34`). The keychain is per OS user, not per bundle id, so a lut started next to Terax reads Terax's API keys. This breaks 13.2:21/16:26 and E02-07's criterion "No code reads any … keychain entry". Nothing in E02 handles it. | Add an E02 issue before E02-16: "Stop lut from touching Terax's keychain service". Either unmount `useAiBootstrap` and make the AI keyring a no-op (smallest change), or change `KEYRING_SERVICE` to `lut-ai`. Add a check to E02-16: `git grep -n '"terax-ai"' src` returns only files scheduled for deletion, and none of them runs at startup. |
| T2 | H | E01 ↔ E02 | Epic E02 depends on E01, but E01-09 → E02-07, E01-12 → E02-12 and E01-13 → E02-16. The validator checks epic and issue cycles separately, so it does not see this cycle. On GitHub, E01 cannot close until E02 is done, and E02 is blocked by E01. | Set E02 `depends-on: []` (issue-level E02-07 → E01-02 already enforces "first valid build"). Alternatively, split E01-13: a baseline gate that depends only on E01 issues, and an "identity isolation recorded" step that moves to E02-16. |
| T3 | H | E01-13, E02-06 | F0:gate says no module deletion starts until the baseline is executable and its failures are documented. But E02-06 (deletes about 14k lines) and E02-01..03 are prerequisites of the gate issue E01-13, through E02-16. The gate is evaluated after the deletions it is meant to guard. | Make E02-06 (and the E05/E06 deletions via their epics) depend on a gate issue that depends only on E01-02, E01-04, E01-10, E01-11 and E01-12. E02-01 (updater, F0:4) can stay before the gate. |
| T4 | H | E02-07/E02-08 vs E04-01 | `productName` stays "Terax" until E04-01. On Windows the NSIS install dir, Start-menu entry, uninstall registry key and file-association ProgIDs are derived from `productName`. An installed lut build between E02 and E04 therefore overwrites or uninstalls Terax's installation. E02-16's manual coexistence run "with Terax installed" would expose it. The bundled exe name also depends on `productName`/`mainBinaryName` in Tauri 2, not only on Cargo `default-run`. | Move `productName: "lut"` and an explicit `mainBinaryName: "lut"` into E02-08 (identity isolation, IR-03). Reduce E04-01 to descriptions, copyright and publisher. Make E02-16 depend on it. |
| T5 | H | E04-03 | The Windows window title is set in `src-tauri/tauri.windows.conf.json:14` (`"title": "Terax"`), which overrides `tauri.conf.json` on the primary platform. E04-03 only lists `tauri.conf.json`. | Add `tauri.windows.conf.json` to E04-03's criteria and to E04-06's grep. |
| T6 | M | E04 (missing) | `bundle.fileAssociations[0].name = "Terax Document"` (`tauri.conf.json:98-113`, about 60 extensions) is user-visible ("Open with") and registers ProgIDs. `build-identity.md:337,551` asked for removal or a decision, but no issue mentions `fileAssociations`. | Add to E04-01 (or a new XS issue): rename it to "lut Document" or reduce/remove the list, and ask the user. Associations are compatible with decision 2 (the editor stays), so renaming is the minimum. |
| T7 | M | E04-09 vs AI (E05) | The repo goes public with the BYOK AI still mounted. The AI UI shows "Ask Terax anything", "Terax finished", "Terax needs your approval" (`AiComposerInput.tsx:260`, `AiMiniWindow.tsx:546`, `LocalAgentNotificationsBridge.tsx:66-70`) and sends `HTTP-Referer: https://terax.ai` / `X-Title: Terax` (`ai/lib/agent.ts:158`). E04-03 explicitly skips AI files, and E04-06 has no class for "scheduled for removal". | Pick one: (a) make E04-09 depend on E05-06, E05-08 and E05-13 (AI unmounted and unreachable), or (b) add the class "removed by E05/E06, unreachable or listed" to E04-06 and have the user accept it explicitly. Option (a) fits decision 22 better. |
| T8 | M | E06-02 vs E12-06 | E06-02 deletes `OsIcon`, `useSystemInfo` and `useGitBranch` "if rg finds no other consumer". Their only consumer is `WorkspaceInputBar`, so they will be deleted. E12-06 later rebuilds `OsIcon` and requires indicators "using `useSystemInfo`" (inventory `app-shell/os-icon` = replace in E12). | In E06-02, keep `OsIcon.tsx` and `useSystemInfo.ts` (move them next to the status bar) and delete only `useGitBranch`. Or change E12-06 to "create" them. Also fix E02-04/E02-06: their verification uses "the header branch indicator", which lives in `WorkspaceInputBar` (`useGitBranch`). Verify `git_watch` through the Git panel (`source-control/watchSourceControl.ts`) instead. |
| T9 | M | E09-03 / E20-09 (missing) | Launching an agent from the new-tab launcher silently installs hooks: `App.tsx:636` `invoke("agent_enable_hooks")`, and also `NotificationBell.tsx:218`. This violates IR-16/AGT-007 (consent and preview), and no issue removes it. E05-06 only removes the `useAiLiveBridge` path. | Add a criterion to E20-09 (or a new E20 issue that depends on E20-08): "the agent launch flow and the bell never call `agent_enable_hooks`; missing hooks are offered through preview → consent → apply". Keep E09-03 a pure move. |
| T10 | M | E18-01 | It removes `explorer`/`source-control` as sidebar views with `depends-on: []` and claims "No visual change". This is a visible change, and without E10-07/E10-08/E10-12 the explorer and Git panel become unreachable. | Make it depend on E10-07, E10-08 and E10-12 (on-demand entry points) and on E11-05. Drop the "no visual change" claim, or limit the PR to adding the `projects` view. |

## 1. Decisions respected

Checked and OK:
- Kept features: IDE tools (E10, rebuilt rather than removed), all six agent adapters (E19-03), vibrancy and background
  image (E12-01, E02-15 IndexedDB rename), notification sound (E20-07), CLI open/identify (E10-10), shadcn base (E12-01).
- Required removals: BYOK AI (E05), command blocks (E06), updater (E02-01; re-added in E25-04), autostart (E02-02), Nix
  and CodeRabbit (E02-03), git agent-task backend (E02-04..06).
- Names: `dev.lucode.lut` (E02-07), `lut` (E02-08), `lut-cli` (E02-13), `LUT_` (E02-10), `<cache>/lut` (E02-09/11).
- Going public (decision 22): secret scan, CodeRabbit, branch protection and visibility are present (E04-07..09).

Findings:
- **H: E02-07/E02-16, keychain.** See T1.
- **H: E02-08/E04-01, `productName` is identity.** See T4.
- **M: E04-03, Windows title.** See T5. **M: `fileAssociations`.** See T6. **M: public with Terax-branded AI UI.** See T7.
- **M: E20-08, IR-75 vs decision 21c.** "The `lut-cli` helper is only placed on PATH once the user consents" would
  also remove the `lut <file>` launcher that E10-10 relies on and that decision 21c keeps. Fix: separate the two. The pane
  launcher `lut` (open/identify) stays on PATH by default; consent covers only writing hook commands into agent configs.
- **L: IR-02/IR-04.** No check that the brand is always lowercase and that "Terminal Workspace" never appears. Fix: add
  both greps to E04-06.

## 2. Issue size and focus

Likely more than about 400 changed lines with no size-exception:
- **E14-02** (serde model + field validation + atomic versioned store + corrupt-file backup + tests): split into
  "model + validation" and "versioned store + corruption handling".
- **E19-03** (adapters for 6 CLIs + normalized Rust/TS types + per-adapter tests): split into "normalized types +
  Claude/Codex adapters" and "Gemini/Pi/OpenCode/Grok adapters".
- **E17-11** (policy matrix + hashed permission + global kill switch + preview/import rules + dedupe guard): split
  "policy + hashed permission" from "dedupe guard + global disable".
- **E20-08** (plan/diff/apply with stale check, for 4 agent config formats): split per format family (JSON settings:
  Claude/Codex/Gemini; Pi extension file), or add a size-exception.
- **E09-07** ("App.tsx under ~250 lines" from about 1,700, after E09-01..06): the rest is still several hundred lines of
  moves. Add a size-exception (mechanical move) or a second extraction issue.
- **E09-05** (platform module, "OS detection, path helpers, window operations, permissions and native menu wiring
  scattered"): no file list, so the size is unknown and the criteria cannot be tested. List the source files and callers
  (from E01-06), and split if there are more than about 15 callers.
- **E22-11** (keyboard operability of the whole UI + WCAG AA + axe): too broad for one PR. Split by surface (navigator +
  sidebar, dialogs + menus, settings).

Refactor mixed with behaviour change:
- **E08-09:** "migrate consumers to the store" (refactor) plus "Spaces serialization persists split ratios" (new
  persisted field). E16-05 does the same again. Drop ratio persistence from E08-09 and keep it in E16-05 (or the reverse).
- **E10-08:** the explorer as a lazy capability plus a pure move of `explorer/lib/watch.ts`. Make the move a separate XS
  issue.
- **E13-01:** prunes the registry (refactor) and adds the orientation shortcut, which E07-07 already adds. Remove the
  addition from E13-01.
- **E14-08:** start dir/distro/typed errors plus removal of the unrelated dead `pty_has_foreground_job`. Move the removal
  to its own XS issue, or into E14-05 as dead-code cleanup with a note.

Vague or hard to test:
- **E07-01:** "mount the current app tree with a mocked PTY bridge". `App.tsx` mounts the AI, updater and every tool
  provider, so this is brittle and possibly infeasible. Mount `TerminalStack`/`WorkspaceSurface` with a mocked bridge
  instead, and count mount/unmount through an instrumentation hook (IR-84).
- **E10-13..E10-21, E21-06:** the only criterion is "match the design". Add at least one behavioural assertion each
  (for example, the component is not imported at startup, or an action calls the existing hook) and a screenshot
  attached to the PR.
- **E04-08:** "the first PR after going public receives a CodeRabbit review" cannot be checked before merge. Validate
  the YAML with CodeRabbit's schema or `coderabbitai` config check instead.
- **E05-21 / F2:gate:** see section 5.

Duplicates (same work in two issues; one will be empty or conflict):
- **E02-05 AC2 vs E10-06:** both remove the unused review/worktree/checkpoint wrappers from `git/api.ts`/`types.ts`.
  Keep them in E02-05 (decision 23, Phase 0). Move cover `ide-tools/git-frontend-api` to E02-05 and delete E10-06.
- **E02-08 vs E04-01:** both change Cargo bin/`default-run` and `terax.exe` references. See T4.
- **E01-04 AC2 vs E24-01:** both add macOS/Linux build jobs. Keep E01-04 Windows-only and leave the matrix to E24-01, or
  make E24-01 "make macOS/Linux jobs required + `tauri build --debug`".
- **E05-06 AC3 / E05-01 vs E08-08 AC1/AC4:** `useAppCloseGuard` and `useWorkspaceSwitcher` no longer import
  `modules/ai`. E05 already does this (E08 depends on E05). Drop those criteria from E08-08.
- **E07-04 AC2 vs E10-07 AC2 / E10-08 AC1:** explorer and source control hidden by default. State in E10 that E07-04
  already hid them and that E10 only switches them to registry loaders.
- **E16-04 vs E17-08:** both add the archive flag. Keep the flag in E16-04 and the behaviour (session removal, boot skip)
  in E17-08.
- **E13-04 vs E14-12:** two appearance resolvers (`resolvePreferences` global → profile → project, and
  `resolveTerminalAppearance` global → profile → pane). Define one resolver in E13-02 and have E14-12 extend it with the
  pane layer.

## 3. UI issues and design dependencies

All E10/E12/E13/E15/E18/E20/E21/E22/E25 visual issues depend on an E11 issue. Exceptions:
- **E18-01:** visible sidebar change with no design dependency. See T10.
- **E14-11:** adds an in-pane error state with an "open with default profile" action, using existing components and
  no design dependency. Acceptable as functional, but add E11-04 (or E11-02) as a dependency, or say explicitly that
  the state is replaced in E15 and link that issue.
- **E08-07:** "exposed through the existing tab/pane menus and commands" adds menu entries. Limit it to commands and
  shortcuts (no menu change). Menu entries come with E22-04 (which depends on E11-07).
- **E21-03:** the resume action is agent UI, but it depends only on E11-05. Add E11-06.
- **E13-06:** the invalid-theme error display needs a surface. Keep the issue logic-only (return a typed error) and
  render it in E13-09.

## 4. Ordering

Build-breaking or wrong:
- **T2 (E01↔E02 cycle), T3 (gate after deletions), T8 (E06-02 deletes what E12-06 needs), T10 (E18-01).**
- **E18-02:** deletes `src/modules/spaces/components/`, but E16-02 already moved `spaces/` to `projects/`. Use
  `src/modules/projects/components/`.
- **E24-03:** uses `dev.lucode.lut.pty-smoke-*` and `LUT_SMOKE_*` with `depends-on: []`. Add E02-07 and E02-10. The
  epic chain covers this transitively, but the issue can be picked early.
- **E15-01 → E13-10:** the picker only needs the shortcut registry (E13-01), not the shortcuts editor UI. Change the
  dependency to E13-01 and E14-11.

Unnecessary serialization (epic-level `depends-on` far wider than the issue-level needs):

| Epic | Declared | Actually needed by issues | Suggested |
|---|---|---|---|
| E06 | E01, E02, E05 | E05-07 (for E06-02) | Drop E05. Let E06-02 delete `WorkspaceInputBar` including the AI composer. E05-07 and E05-09 then become unnecessary (both edit code that E06 deletes). |
| E08 | E07, E05, E06 | E06-03, E05-06 | Keep E07 and use issue-level deps for E06-03 and E05-06. |
| E10 | E08, E09, E01, E02, E05, E13 | E13-03 (only E10-19) | Drop E13. Keep E10-19 → E13-03 at issue level. |
| E12 | E11, E08, E09, E07, E10 | E10-11 (only E12-08) | Drop E10. Otherwise app-shell UI waits for all Git/explorer/preview redesigns (E10-13..21). |
| E13 | E11, E09, E05, E06, E14 | E14-01, E14-02 (only E13-04) | Drop E14. Keep the issue-level deps. |
| E17 | E16, E13, E14 | E13-02 (only E17-11) | Drop E13. |
| E20 | E11, E19, E02, E12, E13, E18 | E12-04, E13-01, E13-08, E18-02 | Acceptable, but E20-01..04 and E20-08 could start right after E19. Keep only E19 at epic level. |

## 5. Coverage quality

Nominal or incomplete coverage:
- **F2:gate (E05-21):** the issue says it covers only the AI part, and that "shell selection (`terminalShell`) and
  migrated Spaces are checked in their own issues". No issue checks them at F2 time (E14/E16 come later and change both).
  Fix: add two criteria to E05-21: a new tab honours `terminalShell`, and an existing `lut-spaces.json` restores after
  the AI removal.
- **identity:2** is listed in E04-07, E04-08 and E04-09 (secret scan, CodeRabbit, visibility), which do not rebrand
  anything. Remove it there; E04-01/03/04/06 cover it.
- **Design issues covering functional ids** (E11-01 UX-006, E11-02 UX-002/10.2:2, E11-03 UX-004/005, E11-04 PRO-012/F3:4,
  E11-05 UX-003/10.2:6, E11-06 AGT-005..008, E11-07 UX-007/008, E11-08 UX-009): acceptable because implementation
  issues also cover them. Check that no id is covered *only* by E11. All are double-covered today. Keep it that way.
- **13.2:21 / 16:26 (E02-16):** the grep list misses the keychain service (T1) and `productName`/installer paths (T4).
  Add both to the manual checklist.

Implicit requirements (IR-xx in `analysis/proposal.md`) with no issue:

| IR | Requirement | Fix |
|---|---|---|
| IR-11 / IR-63 | Profile `closeBehavior` (ask / close / keep open after exit). It is a model field (E14-02) and an editor field (E15-02), but nothing implements the behaviour. | New E14 issue after E14-11: apply `closeBehavior` when the process exits, with tests. |
| IR-28 | Startup mode with 3 values (restore last session / open a default project / empty terminal) plus a "default project" setting. E17-05 only restores the last session. | Add a criterion to E17-05 (or a new S issue): a `startupMode` setting with tests. The settings UI goes into E13-09. |
| IR-16 | No silent hook install (App.tsx agent launch, NotificationBell). | See T9. |
| IR-48 | Presets/restore must reject more than 4 panes per tab. E17-03 respects the limit, but neither the preset schema (E16-05/E17-10) nor the editor (E18-04) validates it. | Add a validation criterion to E16-05 and an inline error to E18-04. |
| IR-50 | Keep save-on-hide/close plus the 3 s debounce (no data loss on quit). | Add to E17-04: "autosave keeps debounce and flush on hide/close; test". |
| IR-69 | Preset fields per-pane env, `waitForPrompt`, `timeoutMs`, `onFailure`. E17-10 has command/args/initial state only. | Add to E17-10 or E16-01 (schema), or list them as "Not planned" with a reason. |
| IR-60 | Investigate pane/leaf id semantics before designing preset ids. | Add a criterion to the E16-01 spike. |
| IR-86 | Focus mode (hide all chrome). | Ask the user: an E11-02 design criterion plus an E12 issue, or a `future.md` entry. |
| IR-87 | Status bar optional/hideable. | Add a criterion to E12-06 (toggle), or note it in E11-02. |
| IR-97 | In-app licenses screen ("futura"). | Add to `future.md` (not v1). |
| IR-02 / IR-04 | Lowercase brand; never "Terminal Workspace". | Add to E04-06. |

Acceptance tests are delivered by real test or verification issues (13.2:5/6/8 in E07-09, 13.2:9 in E08-10, 13.2:19 in
E13-04, 13.2:12 in E14-11, 13.2:10/11/18/20 in E17, 13.2:13/14/16 in E19, 13.2:15 in E20-09, 13.2:21 in E02-16, 13.2:22 in
E25-07, 13.2:1-4 in E24-04, 16:* similarly). Two are only partly delivered: 13.2:21/16:26 (T1, T4) and F2:gate (above).

## 6. Phase 0 completeness (after E01-E04)

| Question | Answer | Gaps |
|---|---|---|
| Can lut be built and run? | Yes: E01-01 build doc, E01-03 Windows scripts, E01-04 CI. | T2 and T3 (gate ordering) must be fixed so E01 can close. |
| Isolated from Terax? | Mostly: data dir, stores, webview keys, env vars, control descriptor, shell-integration dir, hook markers, sidecar and updater are all handled. | **No** for the keychain (T1) and for the Windows installer/ProgIDs while `productName` is still Terax (T4, T6). |
| Shows lut names? | Mostly: E04-01..06. | Windows title in `tauri.windows.conf.json` (T5), "Terax Document" file association (T6), AI UI strings (T7). Icons/logo stay Terax as allowed by decision 22. |
| Can the repo go public? | Yes: E04-07 secret scan, E04-08 CodeRabbit, E04-09 visibility and branch protection, E03 README/NOTICE (E04 depends on E03). | Add E03-01 and E03-02 to E04-09's issue-level deps so the README credit and NOTICE are verified to exist before visibility changes. Resolve T7. |

After T1-T7 are fixed, Phase 0 meets decision 22 and acceptance tests 13.2:21/16:26.

## Fixes applied

All ids below are the **final** ids in `plan.md` (issues were renumbered inside the touched epics; every `depends-on`,
closeout and prose reference was rewritten). Main renumbers: E02 +1 from E02-16; E04-10 new; E05-08..22 → E05-07..20
(two issues removed); E09-06..08 → E09-07..09; E10-07 → E10-06; E13-03..12 → E13-02..11 (E13-02 moved to E14-02);
E14 renumbered from E14-02 (three issues added); E16-06..10 → E16-07..11; E17 renumbered from E17-05; E19-04..11 → E19-05..12;
E20-09..12 → E20-10, E20-12..14; E22-12..13 → E22-14..15. `validate.mjs`: OK (25 epics, 291 issues).

### Top findings

| # | Change |
|---|---|
| T1 | New **E02-16** "Stop lut from reading Terax's AI keychain service" (`KEYRING_SERVICE = "lut-ai"`, no read/migration of `terax-ai`). E02-17 depends on it and greps for the service. E02-07's criterion no longer claims keychain isolation. |
| T2 | Removed every E01 → E02 issue edge: E01-09 drops E02-07 (identifier values switched later by E02-07); E01-12 drops E02-12 (hooks-enabled smoke moved to E02-17, which now covers F0:9); E01-13 depends only on E01 issues. F0:entregable moved to new **E04-10** (deliverable report). E02 keeps `depends-on: [E01]`; no cycle. |
| T3 | E01-13 is now only the F0 gate, `depends-on: [E01-02, E01-04, E01-10, E01-11, E01-12]`. Deletions wait for it: E02-02, E02-03, E02-05, E02-06 and E06-02 depend on E01-13. E02-01 (updater, F0:4) stays before it. E05/E06 wait through their epic dependency on E01. |
| T4 | E02-08 renamed "Rename the executable, productName and file-association name to lut" (size M): bin/`default-run`, `productName: "lut"`, explicit `mainBinaryName: "lut"`, `terax.exe` launch paths, installer-collision verification. E04-01 reduced to descriptions, copyright and publisher (XS, depends on E02-08). E02-17 checks the installer paths. |
| T5 | E04-03 includes `src-tauri/tauri.windows.conf.json:14`; E04-06 greps it. |
| T6 | E02-08 renames `fileAssociations[0].name` to "lut Document" (extensions kept, user asked about reducing them); E04-06 checks the "Open with" name. |
| T7 | Decision 25: E04-03 also replaces the BYOK AI visible texts ("Ask Terax anything", "Terax finished", "Terax needs your approval"); E04-06 no longer accepts "scheduled for removal" as a class. E02-14 removes the `HTTP-Referer: https://terax.ai` and `X-Title: Terax` headers. |
| T8 | E06-02 keeps `OsIcon.tsx`/`useSystemInfo.ts` (moved next to the status bar) and deletes only `useGitBranch`; E12-06 notes it. E02-04/E02-06 verify `git_watch` through the Git panel; E10-06 no longer mentions the branch indicator. |
| T9 | New **E20-11** "Remove silent hook installs from the agent launch flow and the notification bell" (depends on E20-10 UI and E09-03). E09-03 stays a pure move and points to it. |
| T10 | E18-01 depends on E10-06, E10-08, E10-12, E11-05; the "no visual change" claim is replaced by an explicit visible-change goal and a check that the tools stay reachable. Epic E18 now depends on E10 and E13. |

### Medium/low findings (sections 1-6)

- **E20-08 vs decision 21c (IR-75):** consent covers writing `lut-cli` hook commands into agent configs; the pane launcher `lut` stays on PATH.
- **IR-02/IR-04:** brand-casing and "Terminal Workspace" greps added to E04-06.
- **Sizes:** E14-02 split into E14-03 (model + validation) and E14-04 (versioned store + corruption handling); E19-03 split into E19-03 (boundary + Claude/Codex) and E19-04 (Gemini/Pi/OpenCode/Grok); E17-11 split into E17-13 (policy + hashed consent) and E17-14 (dedupe + global switch); E20-08 split into E20-08 (plan/apply + JSON configs) and E20-09 (Pi extension); E09-08 (App.tsx reduction) is L with a mechanical-move size-exception; E09-05 now lists source files and callers and is split with E09-06 (window/menu/permissions); E22-11 split into E22-11 (navigator + sidebar + axe setup), E22-12 (dialogs + menus), E22-13 (settings).
- **Refactor mixed with behaviour:** E08-09 no longer persists split ratios (E16-05 does); watcher move is its own XS issue E10-07; E13-01 no longer adds the orientation shortcut (E07-07 does); `pty_has_foreground_job` removal is its own XS issue E14-11.
- **Vague criteria:** E07-01 mounts `TerminalStack`/`WorkspaceSurface` with a mocked bridge and an instrumentation counter (IR-84); E10-13..E10-21 and E21-06 gained a behavioural assertion and a PR screenshot; E04-08 validates against CodeRabbit's schema.
- **Duplicates:** old E10-06 deleted, `ide-tools/git-frontend-api` covered by E02-05 (E10-06 now depends on E02-05); E02-08 vs E04-01 resolved by T4; E01-04 is Windows-only, E24-01 owns the macOS/Linux matrix (E04-05 verification no longer needs a macOS CI job); E08-08 dropped the AI criteria (done in E05); E10-06/E10-08 state that E07-04 already hid the tools; `archived` flag only in E16-04, behaviour in E17-10 (depends on E16-04); one preference resolver: old E13-02 moved to **E14-02** (an E14-12 → E13-02 edge would have created an E13 ↔ E14 epic cycle) and E14-16 extends it with the pane layer.
- **UI/design dependencies:** E14-14's functional error state is replaced by the design in E15-01 (new criterion; E11-04 gained the in-pane error/exited states); E08-07 limited to commands and shortcuts; E21-03 depends on E11-06; E13-05 is logic-only (typed error), rendered by E13-08.
- **Ordering:** E18-02 uses `src/modules/projects/components/`; E24-03 depends on E02-07 and E02-10; E15-01 depends on E13-01, E14-14 and E14-15 instead of the shortcuts editor.
- **Over-wide epic deps:** E06 drops E05 (old E05-07 "strip the AI composer" and E05-09 "remove attach to AI chat" deleted: E06-02/E06-04 delete that code; E05 now depends on E06 and E05-13 on E06-02/E06-04); E17 drops E13 (resolver moved to E14); E13 drops E09. E23 gained E11 (it had reached E11 only through E17 → E13).
- **Coverage:** E05-19 (F2 gate) now checks `terminalShell` and saved `lut-spaces.json`; `identity:2` removed from E04-07 (now `14.1:4`), E04-08 and E04-09 (now `ADR-007`); no id is covered only by a design issue (script check); E02-17 checks keychain and installer paths (13.2:21/16:26).
- **Missing requirements:** IR-11/IR-63 closeBehavior → new **E14-15**; IR-28 startup mode → new **E17-07** (logic) and **E18-07** (settings UI), design criterion in E11-03; IR-48 4-pane limit → new **E16-06**, inline error in E18-04, design in E11-05, rule in E16-01; IR-50 save-on-hide/close → new **E17-05**; IR-69 waitForPrompt/onFailure/env/timeout → new **E17-16**, fields in E16-01 and E18-04; IR-60 → E16-01 criterion; IR-86 focus mode → new **E12-10** + E11-02 criterion; IR-87 hideable status bar → new **E12-09** + E11-02 criterion; IR-16 → E20-11.
- **Phase 0 completeness:** E04-09 depends on E03-01, E03-02 and E04-10.

### Not fixed (and why)

- **Over-wide deps that issue edges require** (the validator now enforces epic reach): E08 → E05/E06 (E08-02 → E06-03, E08-08 → E05-06; E07 kept as the review suggested); E10 → E13 (E10-19 → E13-02); E12 → E10 (E12-08 → E10-11); E13 → E14 (E13-03 → E14-01..03, E13-07 → E14-02); E20 keeps E11/E02/E12/E13/E18 (all used by direct issue edges).
- **IR-97 licenses screen:** the proposal marks it "futura", but it is not a harvested proposal item, so it cannot go in `## Not planned`; recorded in `future.md` ("Also to review").

## Verification

Checked against `plan.md` after the fixes (2026-11-08). `node .docs/plan/tools/validate.mjs`:
`epics 25 | issues 291 | proposal items covered 369/369 | inventory items covered 111/111 (+52 keep)` → **validate: OK**
(including the new cross-epic rule: every issue edge X → Y is backed by epic X reaching epic Y).

Result: **55 resolved, 1 partially resolved, 0 not resolved** (56 findings: the T rows plus every distinct finding of sections 1-6).

### Top findings

| # | Status | Evidence |
|---|---|---|
| T1 | resolved | E02-16 (`KEYRING_SERVICE = "lut-ai"`, no read of `terax-ai`, unit test); E02-17 keychain grep; E02-07 points to E02-16. |
| T2 | resolved | No E01 issue depends on an E02 issue (E01-09, E01-12, E01-13 rewritten); F0:entregable in E04-10; validator cross-epic rule passes. |
| T3 | resolved | E01-13 depends only on E01-02/04/10/11/12; E02-02, E02-03, E02-05, E02-06, E06-02 depend on E01-13; E02-01 stays before it; E05/E06 gated through epic → E01. |
| T4 | resolved | E02-08 sets `productName`/`mainBinaryName` and checks installer collisions; E04-01 reduced (depends on E02-08); E02-17 checks installer paths. |
| T5 | resolved | E04-03 lists `tauri.windows.conf.json:14`; E04-06 greps it. |
| T6 | resolved | E02-08 renames `fileAssociations[0].name` to "lut Document" (user asked about the list); E04-06 checks "Open with". |
| T7 | resolved | Decision 25: E04-03 replaces AI visible texts; E04-06 rejects "scheduled for removal"; E02-14 drops `HTTP-Referer`/`X-Title`. |
| T8 | resolved | E06-02 keeps and moves `OsIcon`/`useSystemInfo`, deletes only `useGitBranch`; E12-06 notes it; E02-04/E02-06/E10-06 verify `git_watch` via the Git panel. |
| T9 | resolved | E20-11 (depends on E20-10, E09-03) removes silent `agent_enable_hooks`; E09-03 stays a pure move. |
| T10 | resolved | E18-01 depends on E10-06, E10-08, E10-12, E11-05; visible-change goal and reachability check. |

### Sections 1-6

| Finding | Status | Evidence |
|---|---|---|
| E20-08 vs decision 21c (IR-75) | resolved | E20-08 criterion: consent covers hook commands only; pane launcher `lut` stays on PATH. |
| IR-02/IR-04 greps | resolved | E04-06 brand-casing and "Terminal Workspace" greps. |
| Size E14-02 | resolved | E14-03 (model + validation), E14-04 (store + corruption). |
| Size E19-03 | resolved | E19-03 (boundary + Claude/Codex), E19-04 (Gemini/Pi/OpenCode/Grok); E19-11 depends on E19-04. |
| Size E17-11 | resolved | E17-13 (policy + hashed consent), E17-14 (dedupe + global switch). |
| Size E20-08 | resolved | E20-08 (plan/apply + JSON configs), E20-09 (Pi extension). |
| Size E09-07 (App.tsx) | resolved | E09-08 size L with mechanical-move `size-exception`. |
| Size E09-05 | resolved | E09-05 lists files and callers; E09-06 split (window/menu/permissions). |
| Size E22-11 | resolved | E22-11/E22-12/E22-13 by surface (see N1 for E22-13 dependencies). |
| Mixed E08-09 | resolved | E08-09 "no new persisted field"; ratios in E16-05. |
| Mixed E10-08 | resolved | Watcher move is E10-07 (XS); E10-08 depends on it. |
| Mixed E13-01 | resolved | "No shortcut is added here" (E07-07 owns it). |
| Mixed E14-08 | resolved | `pty_has_foreground_job` removal is E14-11 (XS). |
| Vague E07-01 | resolved | Mounts `TerminalStack`/`WorkspaceSurface` with a mocked bridge and an instrumentation hook (IR-84). |
| Vague E10-13..E10-21, E21-06 | resolved | Each has a behavioural assertion and a PR screenshot. |
| Vague E04-08 | resolved | Validates against CodeRabbit's schema. |
| Dup E02-05/E10-06 | resolved | Old E10-06 deleted; `ide-tools/git-frontend-api` in E02-05; E10-06 depends on E02-05. |
| Dup E02-08/E04-01 | resolved | See T4. |
| Dup E01-04/E24-01 | resolved | E01-04 Windows-only; E24-01 owns the macOS/Linux matrix; E04-05 needs no macOS CI. |
| Dup E05/E08-08 | resolved | E08-08 states the AI imports are gone (E05-01, E05-06); only editor decoupling remains. |
| Dup E07-04/E10 | resolved | E10-06 and E10-08 state E07-04 already hid the tools. |
| Dup E16-04/E17-08 (archive) | resolved | Flag in E16-04; behaviour in E17-10 (depends on E16-04). |
| Dup resolvers | resolved | Single `resolvePreferences` in E14-02; E14-16 appends the pane layer; E13-03 uses it. |
| UI E18-01 | resolved | See T10. |
| UI E14-11 (now E14-14) | resolved | Notes: functional state replaced by E15-01 (E11-04 designs the in-pane error/exited states). |
| UI E08-07 | resolved | Commands and shortcuts only; menus in E22-04. |
| UI E21-03 | resolved | Depends on E11-06. |
| UI E13-06 (now E13-05) | resolved | Logic-only typed error; rendered by E13-08 (depends on E13-05). |
| Order E18-02 path | resolved | Uses `src/modules/projects/components/`. |
| Order E24-03 | resolved | Depends on E02-07, E02-10. |
| Order E15-01 | resolved | Depends on E13-01, E14-14, E14-15 (not the shortcuts editor). |
| Over-wide epic deps | **partial** | Dropped: E06 → E05, E17 → E13, E13 → E09. Kept with a reason (issue edges now require epic reach): E08 → E05/E06, E10 → E13, E12 → E10, E13 → E14, E20 → E11/E02/E12/E13/E18. E12 → E10 still makes all app-shell UI wait for E10-13..21 because of one edge (E12-08 → E10-11); see N5. |
| F2:gate (E05-21, now E05-19) | resolved | E05-19 checks `terminalShell` and a saved `lut-spaces.json`. |
| identity:2 on E04-07/08/09 | resolved | E04-07 covers `14.1:4`; E04-08/E04-09 cover `ADR-007`. |
| Design-only coverage | resolved | Script check: no covered id appears only in `design` issues. |
| 13.2:21/16:26 | resolved | E02-17 keychain and installer criteria. |
| IR-11/IR-63 closeBehavior | resolved | E14-15; designed state in E11-04/E15-01. |
| IR-28 startup mode | resolved | E17-07 (logic), E18-07 (settings UI), E11-03 criterion. |
| IR-48 4-pane limit | resolved | E16-06; E16-01 rule; E18-04 inline error; E11-05 design; E17-02 depends on E16-06. |
| IR-50 save-on-hide | resolved | E17-05. |
| IR-69 startup fields | resolved | E17-16; E16-01 schema; E18-04 fields. |
| IR-60 id semantics | resolved | E16-01 criterion. |
| IR-86 focus mode | resolved | E12-10 + E11-02 criterion (the review asked to confirm with the user; not recorded in `decisions.md`). |
| IR-87 status bar | resolved | E12-09 + E11-02 criterion. |
| IR-97 licenses screen | resolved | `future.md` "Also to review". |
| Phase 0: E04-09 deps | resolved | E04-09 depends on E03-01, E03-02, E04-10. |

### Regression checks

- Closeouts: every epic has exactly one closeout; it is the last issue and depends on every other issue of its epic.
- Ids: no reference in any issue body points to a missing id after the renumbering.
- Removals: only BYOK AI (E05), command blocks (E06, including palette history per decision 3), updater/autostart/Nix/CodeRabbit
  (E02-01..03), the git agent-task backend (E02-04..06), a dead PTY command (E14-11) and silent hook installs (E20-11).
  Editor, LSP, explorer, Git panel/history, previews, vibrancy, background image, notification sound, CLI open/identify and
  all six adapters stay. See N4 for the branch indicator.
- UI tasks without an E11 ancestor (E07 exempt) are functional/logic only or text replaces (E02, E04-03, E05, E06, E08,
  E09, E10-01..11, E14-02/13..17, E16, E17, E19, E20-01..04, E21-02, E22-01/02, E23-01, E24-06, E25-05); the temporary
  states of E14-14/E14-15 are replaced by E15-01. OK under decision 7.
- Cross-epic deletion before callers: no deletion lands before its callers are removed (E06-02 → E05-13, E05-07/E06-04 →
  E13-01, E05-08/E05-09 → E10-04, E02-05 → E10-06, E16-02 → E18-02, E09-03 → E20-11).

### New or remaining problems

| # | Sev | Problem | Fix |
|---|---|---|---|
| N1 | M | E22-13 (settings keyboard a11y) explicitly covers the shortcuts editor and the profile editor but depends only on E22-11 and E13-07; it reaches neither E13-09 nor E15-02, and epic E22 does not depend on E15. | Add E13-09 and E15-02 to E22-13 and E15 to E22's `depends-on`. |
| N2 | L | E02-14 has `scope: none` but edits `src/modules/ai/lib/agent.ts` (header removal). | Set `scope: ui`. |
| N3 | L | E04 and E05 are unordered; if E05-13 lands before E04-03, E04-03's AI-text criterion names deleted files. | Phrase the AI criterion as "if still present", or accept it. |
| N4 | L | E06-02 deletes `useGitBranch`, removing the git branch indicator of `WorkspaceInputBar` with no replacement (a non-AI, non-block feature; "no removal of working features"). E02-05 keeps API wrappers "used by `useGitBranch`" that then become dead. | Ask the user: keep the branch indicator in the E11-02/E12-06 status bar, or record the removal in `decisions.md`; E06-02 drops the then-unused wrappers. |
| N5 | L | Over-wide epic edge E12 → E10 (single issue edge E12-08 → E10-11) blocks all app-shell UI behind the E10 redesigns. | Move E12-08 into E10 (or after it) and drop E10 from E12. |
