# Area analysis: state-settings

Scope: `src/modules/spaces`, `src/modules/settings`, `src/modules/theme`, `src/settings/`, `settings.html`,
`src-tauri/src/modules/workspace.rs` (94 files, ~14.1k lines). Inventory: `analysis/state-settings.json`.

## How it works today

**Persistence base.** Every persisted file uses `@tauri-apps/plugin-store` `LazyStore` with a _relative_ path,
resolved under the app data dir derived from the bundle identifier `app.crynta.terax` (`src-tauri/tauri.conf.json:5`).
Three stores live in this area:

| Store                      | Owner                                   | Write policy                                                        |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| `terax-settings.json`      | `src/modules/settings/store.ts:225,394` | autoSave 200 ms + explicit `save()` per setter (`store.ts:402-406`) |
| `terax-spaces.json`        | `src/modules/spaces/lib/store.ts:21,27` | autoSave 500 ms                                                     |
| `terax-custom-themes.json` | `src/modules/theme/customThemes.ts:5,9` | autoSave 200 ms + `save()`                                          |

Plus browser-side storage inside the WebView profile (also keyed by bundle id): localStorage "shadow" keys for
pre-paint (`ThemeProvider.tsx:47-48`, `preferences.ts:17-18`, read by `settings.html:11`) and an IndexedDB
`terax-bg-images` for background images (`bgImageStore.ts:1`). Theme files are written to
`appConfigDir()/themes/<id>.terax-theme` (`themeFiles.ts:8,19-25`).

**Spaces lifecycle.** `App.tsx:282` calls `useSpacesBoot` once ready: `loadAll()` reads all entries
(`spaces/lib/store.ts:35-48`). Empty store → creates a `Default` space rooted at launch cwd/home with the
`defaultWorkspaceEnv` preference (`useSpacesBoot.ts:57-78`). Otherwise every space's `state:<id>` is hydrated into
_cold_ tabs (`serialize.ts:205-236`, `cold: true`), the active space's WSL/local env is adopted
(`useSpacesBoot.ts:96-97`), a fresh terminal tab is added if the active space is empty (`:100-103`), all leaf cwds
are authorized in the backend registry (`:105-107`, `workspace.rs:254`), then `replaceTabs` (`:117`). Errors are
logged and swallowed (`:118-120`). `useSpacePersistence` (`App.tsx:293`) re-serializes tabs grouped by space,
debounced 3 s, and flushes on blur/hidden/beforeunload/unmount, skipping unchanged JSON (`useSpacePersistence.ts:42-101`).
Metadata mutations (`create/rename/setEnv/setColor/reorder/remove/setActive`) write immediately (`useSpaces.ts:53-127`).

**Settings.** `Preferences` is one flat object of ~65 keys (`store.ts:130-199`) with defaults (`:322-392`).
`loadPreferences()` reads all entries in one IPC call (`:408-...`) with per-key coercion helpers.
Each setter goes through `writePref` → `store.set` + `save` + `emit("terax://prefs-changed")` (`:400-406`).
`onPreferencesChange` subscribes to both local `store.onChange` and the Tauri event, mapping store keys to
preference names (`:1029-1081`). The zustand store `usePreferencesStore` hydrates once per window and applies
incremental updates (`preferences.ts:48-72`). AI keys live in the OS keychain (ai area) and only an
`terax://ai-keys-changed` event crosses here (`store.ts:1086-1096`).

**Settings window.** A separate Tauri webview labelled `settings` created by `open_settings_window`
(`src-tauri/src/lib.rs:88-130`) loading `settings.html?tab=…`; if it exists it is shown/focused and receives
`terax:settings-tab` (`lib.rs:95-105`, `SettingsApp.tsx:112-117`). `src/settings/main.tsx` mounts `SettingsApp`
which calls `usePreferencesStore.init()` (`SettingsApp.tsx:95-100`) and renders one of seven sections
(`:38-69`). Writes from that window reach the main window through the Tauri event.

**Theme.** `Theme` = id/name + light/dark variants of UI color tokens and a terminal palette (bg/fg/cursor/selection/
16 ANSI/font) + optional editor theme (`types.ts:1-66`). `ThemeProvider` resolves the active theme (built-in
`themes/index.ts` or custom store) and mode, calls `applyTheme` which writes CSS custom properties on
`document.documentElement` (`applyTheme.ts:64-102`), and mirrors to localStorage for the pre-paint script. Hence a theme
is **per window (per webview), not per pane**. Imported themes are validated (`validateTheme.ts`).

**workspace.rs.** Backend registry of authorized roots (incl. derived worktree roots) used to gate fs/pty cwd
(`workspace.rs:22-270`), launch-dir resolution (`:287-340`), AppImage env scrubbing (`:378-440`), and WSL helpers
(distro list/default/home/login shell, path translation) (`:459-750`). Tests at `:752-1332`.

## Interfaces

- **Tauri commands (workspace.rs):** `workspace_authorize` (:254), `workspace_current_dir` (:272), `wsl_list_distros` (:662),
  `wsl_default_distro` (:676), `wsl_home` (:698/720), `wsl_login_shell` (:726). Rust pub API used by pty/fs:
  `authorize_spawn_cwd` (:186), `authorize_user_spawn_cwd` (:211), `user_spawn_cwd_or_home` (:231), `resolve_path` (:459),
  `wsl_path_to_unc` (:519), `launch_cwd_snapshot` (:301), `appimage_env_overrides` (:378).
- **Commands used, defined elsewhere:** `open_settings_window` (lib.rs:89, via `openSettingsWindow.ts:12`),
  `fs_stat`/`fs_create_dir`/`fs_write_file` (themeFiles.ts:29-40).
- **Events:** `terax://prefs-changed` (store.ts:400), `terax://ai-keys-changed` (store.ts:1088),
  `terax://custom-themes-changed` (customThemes.ts:7), `terax://theme-edit` (themeFiles.ts:9),
  `terax:settings-tab` (SettingsApp.tsx:113, lib.rs:103).
- **Stores/keys:** `terax-settings.json` (keys store.ts:226-294), `terax-spaces.json` (`spaces`, `activeId`, `state:<id>`),
  `terax-custom-themes.json` (`themes`), localStorage `terax-ui-theme-shadow`, `terax-ui-theme-id-shadow`,
  `terax-ui-bg-kind-shadow`, `terax-ui-bg-image-shadow`; IndexedDB `terax-bg-images`; files `appConfigDir/themes/*.terax-theme`.
- **Public TS APIs:** `usePreferencesStore`, `loadPreferences`, ~70 `set*` setters, `DEFAULT_PREFERENCES`, `onPreferencesChange`,
  `openSettingsWindow`; `useSpaces`, `useSpacesBoot`, `useSpacePersistence`, `SpaceSwitcher` (spaces/index.ts);
  `ThemeProvider`, `useTheme`, `applyTheme`, `resolveTerminalFont`, `resolveEditorTheme`, bridges (theme/index.ts).
- **Env vars:** none read here except AppImage vars scrubbed in workspace.rs:378-440 (`LD_LIBRARY_PATH`, `APPDIR`, …).

## Couplings

- app-shell → spaces: `src/app/App.tsx:79-82,262-307` (boot, persistence, switcher, `setEnv`).
- spaces → app-shell tabs: `serialize.ts:6-12` imports `Tab`/`EditorTab`/`PreviewTab`/`MarkdownTab` from `modules/tabs/lib/useTabs`;
  `useSpacesBoot.ts:4` `DEFAULT_SPACE_ID`.
- spaces → terminal: `serialize.ts:1-5` `PaneNode`, `isLeaf` from `modules/terminal/lib/panes`.
- spaces → ai/backend: `useSpacesBoot.ts:1` `native.workspaceAuthorize` lives in `modules/ai/lib/native` (must move out when ai is removed).
- spaces → workspace (TS): `parseWorkspaceScopeKey`, `WorkspaceEnv` (`useSpacesBoot.ts:6`).
- settings → many: ~30 files outside the area read `usePreferencesStore` (app, agents, ai, editor, explorer, lsp, shortcuts, zoom).
- settings window → app-shell: `src-tauri/src/lib.rs:88-130,252,396`.
- agents → settings: `agentLaunchCommands` (store.ts:284,974) used by `modules/agents/components/AgentLauncherPanel.tsx:33`.
- theme → ide-tools: `themeFiles.ts`/`useThemeFileEditing.ts` open theme files in editor tabs; `resolveEditorTheme` used by `modules/editor/lib/useEditorThemeExt.ts`.
- theme → backend fs commands: `themeFiles.ts:29-40`.
- workspace.rs ← backend-core pty/fs (spawn cwd authorization, `resolve_path`).

## "terax" mentions

**(a) Phase 0 identity isolation** (persisted/shared names; all also isolated by changing the bundle id in build-identity)

- Store files: `terax-settings.json` (settings/store.ts:225), `terax-spaces.json` (spaces/lib/store.ts:21), `terax-custom-themes.json` (theme/customThemes.ts:5).
- localStorage keys: `terax-ui-theme-shadow`, `terax-ui-theme-id-shadow` (ThemeProvider.tsx:47-48, settings.html:11), `terax-ui-bg-kind-shadow`, `terax-ui-bg-image-shadow` (preferences.ts:17-18).
- IndexedDB: `terax-bg-images` (bgImageStore.ts:1).
- Theme dir under `appConfigDir` (themeFiles.ts:19-21) — not named terax, but shared via bundle id.

**(b) Visual rebranding**

- `Terax — Settings` window title (settings.html:7); About: name, `app.crynta.terax`, repo `crynta/terax-ai`, `terax.app` (AboutSection.tsx:11-12,25,93,106,117).
- UI strings: LspInstallDialog.tsx:68, AgentsSection.tsx:398, ModelsSection.tsx:380 (removed anyway), GeneralSection.tsx:566,606,662, ThemesSection.tsx:210,216 ("Import .terax-theme").
- Default theme `terax-default` / "Terax Default" (themes/terax-default.ts:9-11, themes/index.ts:14,20, types.ts:68, settings/store.ts:37) — also persisted as `themeId` value: rename needs a fallback.
- Theme file extension `.terax-theme` (themeFiles.ts:8) — user-facing format; keep accepting it on import.

**(c) Internal — rename on touch**

- Tauri event names `terax://prefs-changed`, `terax://ai-keys-changed`, `terax://custom-themes-changed`, `terax://theme-edit`, `terax:settings-tab` (app-local, not shared across apps).
- Log prefixes `[terax]` (useSpacesBoot.ts:119, themeFiles.ts:133,139, useThemeFileEditing.ts:46,51); CSS class `terax-bg-surface` (SurfaceLayer.tsx:104).
- workspace.rs test temp names and sentinel `__terax_invalid_distro__` (:527,815,823,891,955,1156,1186,1209,1266,1293-1326).

## Risks

- Spaces boot swallows errors (`useSpacesBoot.ts:118-120`) and casts store values without validation (`spaces/lib/store.ts:41-44`): a malformed file yields an empty or broken session silently (16:13, 13.5:9).
- No schema version in any store; migrations (PRJ-014) start from an implicit "v0" Terax format.
- Removing settings keys/sections is entangled with ai/ide-tools module removal order (compile breaks).
- Per-pane theming needs the renderer to stop reading global CSS vars; changes must not remount PTY sessions (3.4:invariant).
- Settings window and main window share the store file with independent LazyStore instances; concurrent writes rely on last-writer-wins per key (store.ts:396-406). Acceptable for prefs; projects store should have a single writer.

## Open questions

1. Keep "spaces" as the lut project concept (rename to projects), or treat spaces as a separate grouping above projects?
2. Migrate existing `terax-spaces.json` content into lut projects at all? Since the data dir changes with the bundle id, lut starts empty — proposal: no migration from Terax, only lut-internal schema migrations.
3. Keep background image / vibrancy features (design decision, F6:5)?
4. Should IDE tab kinds (editor/preview/markdown) in old serialized state be dropped silently or reported on migration?
5. Where does the projects store live: TS LazyStore (like today) or Rust-owned file with Serde validation (7.1 says Zod in TS and Serde when crossing IPC)? Needs a spike.

## Answers

**1. Spaces persistence.** File `terax-spaces.json` in the app data dir (LazyStore, `spaces/lib/store.ts:21,27`). Schema:
`spaces: SpaceMeta[]` with `{id, name, root: string|null, env: WorkspaceEnv, color?: number, createdAt, updatedAt}` (`:5-14`);
`activeId: string|null`; `state:<spaceId>: {tabs: SerializedTab[], activeTabIndex}` (`:16-19`). `SerializedTab` is
`terminal {tree, blocks?, customTitle?}` | `editor {path}` | `preview {url}` | `markdown {path}`; tree nodes are
`leaf {cwd?, active?}` | `split {dir, children}` — **no ratios, no profile, no command, no ids** (`serialize.ts:14-27`).
Read once at boot (`useSpacesBoot.ts:44`); metadata written immediately on mutation (`useSpaces.ts:69-127`); tab state
written debounced 3 s and on blur/hide/unload (`useSpacePersistence.ts:7,73-101`). **No versioning or migrations**; the only
tolerance is per-tab try/catch (`serialize.ts:225-233`). Mapping: a space ≈ a lut project with a root and env (PRJ-001), the
`state:` entry ≈ a _snapshot of live state_, not a declarative preset (PRJ-013, 6.5:2/3). Missing for lut: ratios (PRJ-006),
profile per pane (PRJ-005), startup commands/states (PRJ-004, PRJ-008), schemaVersion (PRJ-014), stable preset/runtime ids (6.4).
Session restore (PRJ-016) is partly there already: all spaces' tabs are restored cold and the active space/tab is reopened
(`useSpacesBoot.ts:87-117`) — lut needs "which projects were open" separate from "which projects exist". Opening other projects
(PRJ-017) maps to `useSpaces.create` + `setActive` (`useSpaces.ts:53-127`) plus `workspace_authorize` of the root.

**2. Settings storage.** Stores: `terax-settings.json` (all preferences, keys at `settings/store.ts:226-294`),
`terax-spaces.json`, `terax-custom-themes.json`; localStorage `terax-ui-theme-shadow`, `terax-ui-theme-id-shadow`,
`terax-ui-bg-kind-shadow`, `terax-ui-bg-image-shadow`; IndexedDB `terax-bg-images`; files `appConfigDir/themes/*.terax-theme`.
Data dir = Tauri app data/config dir for identifier `app.crynta.terax` (tauri.conf.json:5). AI keys are in the OS keychain (ai area).
Outside this area, ai stores (`src/modules/ai/lib/{agents,sessions,snippets,todos}.ts`) also use LazyStore. All names above are
Phase 0 targets; changing the bundle id isolates them all at once, and the explicit file renames satisfy F0:10.

**3. Settings window.** Separate webview `settings` built in Rust (`lib.rs:88-130`) from the multi-page entry `settings.html`
→ `src/settings/main.tsx` → `SettingsApp`. It loads prefs independently (`SettingsApp.tsx:95-100`). Propagation: each setter writes
the shared store file then emits `terax://prefs-changed {key,value}` (`store.ts:400-406`); the main window's `onPreferencesChange`
listens and patches zustand (`store.ts:1072-1078`, `preferences.ts:58-64`). Custom themes use the same pattern
(`customThemes.ts:37-41`). Tab deep-link via `?tab=` and `terax:settings-tab` event.

**4. Theme module.** A theme = UI color tokens + terminal palette (bg/fg/cursor/cursorAccent/selection/16 ANSI/font family/
weight/size) per light/dark variant + optional editor theme (`types.ts:3-66`). Applied globally as CSS vars on
`document.documentElement` (`applyTheme.ts:64-102`) → **per window**, all panes share it; terminal font also resolves from global
prefs (`resolveTerminalFont.ts:9`). For `TerminalProfile` (PRO-005, F3:5): needs a pure resolver `resolveTerminalAppearance(themeId,
mode, overrides) → TerminalPalette+font` that the terminal pane consumes directly (not via root CSS vars), theme lookup by id across
built-in+custom (exists in ThemeProvider), and validation (`validateTheme.ts`) for profile import (PRO-010). Shell and startingDirectory
come from settings `terminalShell`/workspace env, not the theme; icon and tab title/color (PRO-012, PRO-013) have no home today —
`SpaceMeta.color` (`spaces/lib/store.ts:11`, `spaceColor.ts`) is the only color-per-entity precedent.

**5. Preset trust model.** Today persisted state cannot auto-run a command: serialized terminals hold only tree/cwd/title
(`serialize.ts:14-27`) and restore opens a plain shell in that cwd (cold tabs). `agentLaunchCommands` (store.ts:284) run only on a user
click in AgentLauncherPanel (`agents/.../AgentLauncherPanel.tsx:93`). The one persisted command executed implicitly is
`editorCustomFormatCommand` (store.ts:292) on save — removed with the editor. The only trust gate is the cwd authorization registry
(`useSpacesBoot.ts:105-107`, `workspace.rs:95-147`). A project preset that runs commands needs (8.5, 14.1:3, 16:14, 13.2:18): per
project/preset consent bound to a hash of the command set (re-prompt on change), imported presets untrusted by default, a preview of
what will run with cwd/env/profile, restore creating structure first without running (8.4:4), running only after shell-ready (8.4:6),
once-per-start policies (16:12), and per-pane result with "retry / open shell without command / edit preset" (8.4:9).

**6. Settings of removed areas.** AI: `defaultModelId`, `customInstructions`, autocomplete* (4), lmstudio*/mlx*/ollama*/openaiCompatible*
(9), `customEndpoints`, `openrouterModelId`, `sttProvider`, `groqSttModel`, `whispercppBaseURL`, `favoriteModelIds`, `recentModelIds`
(store.ts:233-260) + keys event (:1086-1096). Editor: `editorTheme`, `editorFontSize`, `vimMode`, `editorWordWrap(Column)`,
`editorAutoSave(Delay)`, `editorFormatOnSave`, `editorFormatter(ByLang)`, `editorCustomFormatCommand` (:234-235,261-263,287-292).
LSP: `lspActivation`, `lspCustomServers` (:293-294). Explorer: `showHidden` (+legacy), `explorerGitDecorations` (:264-266).
UI: sections Models, Agents (AI personas), Editor, LSP components, ProviderKeyCard/Icon; theme `resolveEditorTheme`, `Theme.editorTheme`.

## Draft issues

### state-settings-D01 — Rename persisted store files and browser storage keys

```yaml
id: state-settings-D01
depends-on: [build-identity-D01?]
refs: [identity, F0:10, .docs/plan/analysis/state-settings.md]
covers: [F0:10, identity:1]
type: task
scope: ui
size: S
```

**Goal:** No persisted lut state uses a Terax file or key name.

**Acceptance criteria:**

- [ ] `terax-settings.json`, `terax-spaces.json`, `terax-custom-themes.json` renamed to `lut-*` (constants in settings/store.ts:225, spaces/lib/store.ts:21, theme/customThemes.ts:5).
- [ ] localStorage shadow keys renamed in ThemeProvider.tsx:47-48, preferences.ts:17-18 and settings.html:11 consistently.
- [ ] IndexedDB name in bgImageStore.ts:1 renamed.
- [ ] No migration from Terax files (lut starts clean); grep finds no `terax-` persisted name in src/.

**Verification:** `pnpm test` green; launch app, check app data dir contains only `lut-*` files; `rg -n "terax-(settings|spaces|custom-themes|ui-|bg-images)" src settings.html` returns nothing.

### state-settings-D02 — Remove AI/editor/LSP settings sections

```yaml
id: state-settings-D02
depends-on: [ai-D01?, ide-tools-D01?]
refs: [5.10:9, 16:16]
covers: [state-settings/settings-ai-editor-lsp]
type: task
scope: ui
size: M
```

**Goal:** The settings window only offers terminal-relevant sections.

**Acceptance criteria:**

- [ ] Models, Agents (AI), Editor sections and LSP/provider components deleted with their tests.
- [ ] `SettingsTab` union and `SettingsApp` TABS no longer list them; deep links to removed tabs fall back to general.

**Verification:** `pnpm typecheck && pnpm test`; open settings, all remaining tabs render.

### state-settings-D03 — Remove preferences of removed features and editor theme resolution

```yaml
id: state-settings-D03
depends-on: [state-settings-D02]
refs: [5.10:9, 16:16]
covers: [state-settings/settings-store, state-settings/theme-editor-resolve, 5.10:9]
type: task
scope: ui
size: M
```

**Goal:** `Preferences` contains no AI, editor, LSP or explorer keys.

**Acceptance criteria:**

- [ ] Keys at settings/store.ts:233-266,287-294 and their setters/defaults/map entries removed; keys-changed event removed.
- [ ] `resolveEditorTheme` and `Theme.editorTheme` removed; validateTheme ignores a legacy `editorTheme` field.
- [ ] Old stored keys are ignored without errors.

**Verification:** `pnpm typecheck && pnpm test`; app boots with a settings file containing removed keys.

### state-settings-D04 — Settings schema version and corruption recovery

```yaml
id: state-settings-D04
depends-on: [state-settings-D03]
refs: [13.5:9, 16:13, 7.1, PRJ-014]
covers: [13.5:9, 16:13]
type: task
scope: ui
size: M
```

**Goal:** A corrupt or partial settings file never blocks the app and future migrations have a version to key on.

**Acceptance criteria:**

- [ ] Store has `schemaVersion`; loader runs ordered migrations, backs up the previous file before migrating (rollback).
- [ ] Each key validated (Zod) with fallback to default; invalid values reported once (log/toast hook), not thrown.
- [ ] Unit tests: corrupt JSON, wrong types, unknown future version (read-only fallback).

**Verification:** `pnpm test`; manual: truncate the settings file, app starts with defaults and keeps a backup.

### state-settings-D05 — Spike: Project / Preset / RunningWorkspace model and storage

```yaml
id: state-settings-D05
depends-on: []
refs: [6.4, 6.5, 7.1, 8.4, F4:1, PRJ-013, PRJ-014]
covers: [6.4, 6.5:2, 6.5:3]
type: spike
scope: none
size: S
```

**Goal:** Decide the versioned schema and owner (TS store vs Rust/Serde) for projects, presets and live snapshots.

**Acceptance criteria:**

- [ ] Written schema with `projectId`, `presetId`, runtime ids, pane tree with ratios, profile ref, cwd, startup command + policy.
- [ ] Decision on storage owner, file layout, migration strategy, and fate of old spaces data.
- [ ] Decision recorded in `.docs/` and plan updated.

**Verification:** Document reviewed by the user; plan.md updated with resulting issues.

### state-settings-D06 — Versioned projects store replacing spaces persistence

```yaml
id: state-settings-D06
depends-on: [state-settings-D05, state-settings-D01]
refs: [F4:1, PRJ-014, 6.2:6]
covers: [state-settings/spaces-persistence, F4:1, PRJ-014, PRJ-001, PRJ-011]
type: task
scope: ui
size: M
```

**Goal:** Project metadata and live snapshots persisted with a schemaVersion and validated on load.

**Acceptance criteria:**

- [ ] New `projects` module (store + Zod schema + migrations) replaces `spaces/lib/store.ts`; spaces state migrated once if present.
- [ ] Serializer drops IDE tab kinds; corrupt entries skipped and reported, not silently swallowed.
- [ ] Unit tests for serialize/hydrate round trip and migration (F4:9).

**Verification:** `pnpm test`; restart app keeps tabs/splits/cwd.

### state-settings-D07 — Persist split ratios and per-pane profile in snapshots

```yaml
id: state-settings-D07
depends-on: [state-settings-D06, terminal-D??]
refs: [PRJ-006, PRJ-005, PRJ-002, PRJ-003, 13.2:10]
covers: [PRJ-002, PRJ-003, PRJ-006, PRJ-005]
type: task
scope: ui
size: S
```

**Goal:** Restored layouts match topology, ratios, cwd and profile.

**Acceptance criteria:**

- [ ] Split nodes serialize ratios; leaves serialize profile id and cwd.
- [ ] Missing profile on restore falls back to default with a repairable error (13.2:12).

**Verification:** `pnpm test` round-trip tests; manual resize + restart.

### state-settings-D08 — Restore last session (open projects + active) at startup

```yaml
id: state-settings-D08
depends-on: [state-settings-D06]
refs: [F4:7, 8.4, 16:9]
covers: [PRJ-016, F4:7, 16:9]
type: task
scope: ui
size: M
```

**Goal:** On launch lut reopens the projects that were open and focuses the last active one.

**Acceptance criteria:**

- [ ] Separate persisted "session" record (open project ids, active id, per-project active tab) from the project catalogue.
- [ ] Restore creates structure without running startup commands (8.4:4), authorizes cwds before spawn.
- [ ] Integration test of boot restore (F4:9).

**Verification:** `pnpm test`; manual: open 2 projects, quit, relaunch → both open, same active.

### state-settings-D09 — Preset startup commands with consent

```yaml
id: state-settings-D09
depends-on: [state-settings-D07, terminal-D??]
refs: [8.4, 8.5, 14.1:3, 13.2:18]
covers: [PRJ-004, PRJ-008, 8.4:4, 8.4:6, 8.5:1, 16:12, 16:14, 13.2:18]
type: task
scope: ui
size: M
```

**Goal:** Presets can run startup commands only after explicit, hash-bound consent per project/preset.

**Acceptance criteria:**

- [ ] Consent stored per preset bound to a hash of commands+cwd+env; changes or imports require re-consent.
- [ ] Commands run once per start after shell-ready, never via sleep.
- [ ] Per-pane result with retry / open shell without command.

**Verification:** Unit tests for consent hashing; manual: import preset → nothing runs until approved.

### state-settings-D10 — Design: settings window and project switcher

```yaml
id: state-settings-D10
depends-on: []
refs: [UX-004, PRJ-001, PRJ-017, 14.1:3]
covers: [UX-004]
type: design
scope: ui
size: M
```

**Goal:** The user designs the settings window, project list/switcher and preset consent prompt.

**Acceptance criteria:**

- [ ] Designs for settings sections (general/terminal, appearance, shortcuts, notifications, about), project switcher, consent dialog.
- [ ] Decision on background image / vibrancy (F6:5).

### state-settings-D11 — Implement settings window per design

```yaml
id: state-settings-D11
depends-on: [state-settings-D10, state-settings-D02]
refs: [UX-004, UX-005, 16:6, TER-008, identity:2]
covers: [state-settings/settings-window-shell, state-settings/settings-ui-kit, state-settings/settings-sections-terminal, UX-005, 16:6]
type: task
scope: ui
size: L
size-exception: Rewrites several visual sections at once; split per section if the design allows.
```

**Goal:** Settings window matches the user's design and edits only lut settings.

**Acceptance criteria:**

- [ ] Old Terax section components replaced; window title/About show lut identity.
- [ ] Changes propagate live to the main window without remounting sessions (16:24).

**Verification:** `pnpm typecheck && pnpm test`; manual: change font/theme in settings, terminal updates without respawn.

### state-settings-D12 — Implement project switcher per design

```yaml
id: state-settings-D12
depends-on: [state-settings-D10, state-settings-D06]
refs: [PRJ-001, PRJ-009, PRJ-017, F4:6]
covers: [state-settings/spaces-ui, PRJ-009, PRJ-017]
type: task
scope: ui
size: M
```

**Goal:** Users list, open, rename, reorder and close projects from the app.

**Acceptance criteria:**

- [ ] SpaceSwitcher/SpaceAvatar/InlineRename replaced by the designed component on the projects store.
- [ ] Opening a project authorizes its root and restores its snapshot.

**Verification:** `pnpm test`; manual open/close/reopen.

### state-settings-D13 — Per-pane terminal appearance resolver

```yaml
id: state-settings-D13
depends-on: [state-settings-D03, terminal-D??]
refs: [F3:5, PRO-005, 13.2:19, 3.4:invariant]
covers: [state-settings/theme-core, PRO-005, F3:5, 13.2:19]
type: task
scope: ui
size: M
```

**Goal:** A pane's terminal palette and font can come from its profile instead of the window-global CSS vars.

**Acceptance criteria:**

- [ ] Pure `resolveTerminalAppearance(themeId, mode, overrides)` with tests.
- [ ] Terminal pane consumes it; switching theme updates panes without respawning PTYs.

**Verification:** `pnpm test`; manual: two panes with different profiles show different palettes.

### state-settings-D14 — Theme files without the built-in editor

```yaml
id: state-settings-D14
depends-on: [state-settings-D01]
refs: [F6:4, UX-004]
covers: [state-settings/theme-files, F6:4]
type: task
scope: ui
size: S
```

**Goal:** Custom themes are imported/exported as files and edited externally.

**Acceptance criteria:**

- [ ] Editing opens the theme file with the OS default app; file changes are re-validated and applied.
- [ ] Import keeps accepting `.terax-theme` and JSON.

**Verification:** `pnpm test` (themeFiles tests); manual edit round trip.

### state-settings-D15 — Curated built-in themes and default, surface layer per design

```yaml
id: state-settings-D15
depends-on: [state-settings-D10]
refs: [UX-004, F6:5, identity:2]
covers: [state-settings/theme-builtin-themes, state-settings/theme-surface, F6:5]
type: task
scope: ui
size: M
```

**Goal:** Built-in themes and default reflect the user's design; background surface kept or removed per design.

**Acceptance criteria:**

- [ ] Theme set replaced; persisted `terax-default` id falls back to the new default.
- [ ] SurfaceLayer/bgImageStore removed or reimplemented as designed.

**Verification:** `pnpm test`; manual: settings with legacy themeId boots with the new default.
