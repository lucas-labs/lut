# Area analysis — ide-tools

Scope: `src/modules/{editor,explorer,git,git-history,source-control,lsp,markdown,preview}`,
`src-tauri/src/modules/{fs,git,lsp}`, `src-tauri/tests/{fs_search,git_operations}.rs` — 213 files, ~57.5k lines.
Inventory: `.docs/plan/analysis/ide-tools.json` (30 items).

## How it works today

**Rust backend.** `src-tauri/src/lib.rs` manages `FsWatchState`, `AssetGrants`, `GitWatchState`, `LspState`,
`Supersede`, `FileIndexState` (lib.rs:267-273), registers the `asset` URI scheme (lib.rs:219, `fs/assets.rs::serve`)
and ~80 commands (lib.rs:299-376).

- `fs/` — `mod.rs` gives `blocking()` (spawn_blocking wrapper, mod.rs:25) and `to_canon()` (verbatim-prefix
  stripping, mod.rs:60) used across the backend. `file.rs` read/write/stat/canonicalize (writes emit
  `fs:file-written`, file.rs:191); `tree.rs` dir listing + `list_subdirs`; `mutate.rs`/`copy.rs`/`clipboard.rs`
  explorer operations; `assets.rs` grants per-webview tokens to serve files through `asset://`, checked by
  `read_policy.rs` (deny `<cache>/terax` runtime dir and secret paths from `src/modules/ai/lib/pathPolicy.json`,
  read_policy.rs:13-30). `watch.rs` + `watch/{plan,portable,macos}.rs` is a single shared watcher (notify on
  Linux/Windows, FSEvents on macOS) emitting `fs:changed` (watch.rs:178) and feeding the file index
  (watch.rs:70). `index.rs`/`search.rs`/`grep.rs`/`supersede.rs` implement a cached fuzzy file index
  (nucleo) and ripgrep-library content search with request supersession. `ai.rs`/`project_memory.rs` are
  AI-tool reads (`ai_read_file`, `ai_grep`, `TERAX.md`).
- `git/` — shells out to the `git` CLI (no git2): `process.rs` builds commands with a stripped env,
  `plumbing.rs`/`utils.rs` resolve and authorize repos, `operations.rs` + `parser.rs` implement
  status (porcelain v2), stage/unstage/discard/commit/fetch/pull/push/log/show/branches; `commands.rs` exposes
  them. `watch.rs` subscribes repos to the fs watcher and emits `terax:git-changed`. A second, much larger
  subsystem — `review.rs`/`diff.rs`/`patch.rs` (hunk-level staging), `checkpoint.rs` (snapshot refs under
  `refs/terax/checkpoints/<task>/<turn>`), `worktree.rs`/`task_worktree.rs`/`task_state.rs`/`project_config.rs`
  (agent task worktrees in `~/.terax/worktrees`, config in `.terax/project.toml`, `TERAX_*` env), `branch.rs`
  — is registered (lib.rs:353-374) but **no frontend code calls it** (only wrappers in `src/modules/git/api.ts`).
- `lsp/` — `lsp_spawn` (mod.rs:62) starts a language server in an authorized root, frames JSON-RPC
  (`framing.rs`), streams messages over a Tauri `Channel`, RSS-limits and kills sessions; `env.rs` resolves
  binaries from a captured login-shell PATH. All sessions are killed on exit (lib.rs:451).

**Frontend.** Every tool is a lazy tab kind or sidebar view mounted by the app area:
`WorkspaceSurface.tsx:3-6` mounts `EditorStack`, `AiDiffStack`, `GitDiffStack`, `GitHistoryStack`,
`MarkdownStack`, `PreviewStack`; `App.tsx:1506` mounts `FileExplorer` and `SourceControlPanel` in the sidebar.

- `editor/` — CodeMirror 6 via `@uiw/react-codemirror`; `useDocument.ts` loads/saves via `fs_read_file`/
  `fs_write_file`, `useEditorFileSync.ts` reloads on `fs:file-written`; language table
  (`languageDefinitions.ts`), external formatter, vim mode, media preview through `asset://`, AI inline
  autocomplete (`lib/autocomplete/`, uses BYOK keys) and AI/Git diff panes (`@codemirror/merge`).
- `lsp/` — `sessionManager.ts` spawns one server per (preset, root) via `lsp_spawn`, `client.ts`
  (`TeraxLspClient extends LanguageServerClient` from `codemirror-languageserver`), diagnostics into
  `editor/lib/diagnosticsStore.ts` (status-bar badge), status pill, and `navigator.ts` — an "open file" hook
  set by `App.tsx:1395` and read by terminal link activation.
- `explorer/` — `useFileTree.ts` lazy tree + `watchRegistry.ts` refcounted `fs_watch_add`, DnD (incl. dropping
  paths into terminals), clipboard paste, git status decorations, Catppuccin icon mapping (`fileIcons.ts`
  2.7k lines).
- `git/` api wrappers + `changes.ts` subscription; `source-control/` panel + hooks (includes AI commit
  message generation via `ai/store/chatStore`, useSourceControlPanel.ts:8,874); `git-history/` commit graph.
- `markdown/` — preview rendered with streamdown, live reload on fs events, relative assets via `asset://`.
- `preview/` — iframe browser tab for dev servers with URL policy (`previewUrl.ts`).

Lifecycle: tools are code-split (`*Lazy.tsx`), but the sidebar defaults to the explorer
(`sidebar/useSidebarPanel.ts:51`) and tab kinds are part of the `Tab` union in `useTabs.ts` and of Spaces
serialization (`spaces/lib/serialize.ts:25-27`).

## Interfaces

- **Tauri commands** (lib.rs:299-376): `list_subdirs`, `fs_read_dir`, `fs_read_file`, `fs_write_file`,
  `fs_stat`, `fs_canonicalize`, `fs_create_file`, `fs_create_dir`, `fs_rename`, `fs_move`, `fs_delete`,
  `fs_delete_batch`, `fs_copy`, `fs_clipboard_paths`, `fs_watch_add`, `fs_watch_remove`, `fs_search`,
  `fs_warm_index`, `fs_list_files`, `fs_grep`, `fs_grep_interactive`, `fs_glob`, `ai_read_file`, `ai_read_dir`,
  `ai_grep`, `ai_glob`, `fs_read_project_memory`, `asset_grant`, `asset_revoke`; `lsp_detect`, `lsp_host_pid`,
  `lsp_resolve_root`, `lsp_spawn`, `lsp_send`, `lsp_kill`; `git_*` (resolve_repo, panel_snapshot, status, diff,
  diff_content, stage, unstage, discard, commit, fetch, pull_ff_only, push, log, show_commit, commit_files,
  commit_file_diff, remote_url, list_branches, checkout_branch, merge_base, diff_summary, diff_file,
  apply_hunks, worktree_list/add/remove/prune, checkpoint_create/list/restore/prune, branch_create/rename,
  upstream_info, watch, unwatch); `task_project_config`, `task_worktree_*` (7).
- **Events:** `fs:file-written` (file.rs:191), `fs:changed` (watch.rs:178), `terax:git-changed`
  (git/watch.rs:26, git/changes.ts:5). LSP uses per-session `Channel`s, not events.
- **URI schemes:** `asset://` (lib.rs:219). `previewUrl.ts:1-6` reserves `asset.localhost`, `tauri.localhost`,
  `ipc.localhost`, `terax-pty.localhost`.
- **Persisted state:** none owned here; editor/LSP preferences live in settings (`settings/store.ts:139-197`:
  `editorTheme`, `editorFontSize`, word wrap, autosave, formatter, `lspActivation`); open editor/preview/
  markdown tabs in Spaces (`serialize.ts:25-27`).
- **Files on disk (git agent-task subsystem, dormant):** `refs/terax/checkpoints/*`, `refs/terax/tasks/*`
  in user repos; `.git/terax-worktree-id`, `.git/terax-last-restore`, `.git/terax-no-hooks`,
  `terax-tasks.lock`; `~/.terax/worktrees/…`, `~/.terax/…` state (task_state.rs:73); `.terax/project.toml`.
  Other: `.terax-copy-*` temp dirs (copy.rs:132), reads `TERAX.md` (project_memory.rs:38).
- **Env vars:** `TERAX_TASK`, `TERAX_WORKSPACE_PATH`, `TERAX_ROOT_PATH`, `TERAX_PORT`, `TERAX_PORT_<n>` set for
  task scripts (task_worktree.rs:96-102) — dormant.
- **Public TS APIs used elsewhere:** `@/modules/editor` (`EditorPaneHandle`, `NewEditorDialog`,
  `useApplyEditorFontSize`, `useEditorFileSync`, stacks, `useDiagnosticsStore`), `editor/lib/languageDefinitions`,
  `languageResolver`, `externalFormat`; `@/modules/explorer` (`FileExplorer`, `FileIcon`); `@/modules/git`
  (`git`); `@/modules/lsp` (`setLspNavigator`, `LspStatusPill`, presets, `redetectBinary`),
  `lsp/lib/navigator`; `@/modules/markdown` (`MarkdownStack`, `MarkdownLink`); `@/modules/preview`
  (`PreviewStack`, `PreviewPaneHandle`, `lib/previewUrl`); `@/modules/source-control`
  (`SourceControlPanel`, `useRepositoryTargeting`, `useSourceControlContext`); `@/modules/git-history`.

## Couplings

Into this area (consumers elsewhere):

- app: `App.tsx:41-55` (editor, explorer, git-history, lsp navigator, preview), `App.tsx:73-77` (source-control),
  `App.tsx:1395` (`setLspNavigator`), `App.tsx:1506-1521` (FileExplorer); `WorkspaceSurface.tsx:3-6`;
  `app/components/useGitBranch.ts:1` (`git`); `feature-loading.test.tsx:4-8,17-33`.
- terminal: `terminal/lib/terminalLinks.ts:17,175` (navigator), `:179,187` (`fs_stat`, `fs_canonicalize`);
  `terminal/block/lib/pathComplete.ts:53` (`fs_read_dir`).
- tabs: `tabs/TabBar.tsx:22-24` (languageDefinitions, languageResolver, FileIcon); tab kinds in `useTabs.ts`.
- command palette: `CommandPalette.tsx:12` (FileIcon), `hooks/useFileSearch.ts:47-106` (`fs_search`,
  `fs_warm_index`), `hooks/useContentSearch.ts:31` (`fs_grep_interactive`).
- settings: `settings/sections/EditorSection.tsx:13-14`, `settings/components/LspInstallDialog.tsx:10`,
  `LspServersGroup.tsx:19`.
- statusbar/header: `StatusBar.tsx:12` (LspStatusPill), `DiagnosticsBadge.tsx:1`, `CwdBreadcrumb.tsx:183`
  (`list_subdirs`), `header/SearchInline.tsx:4` (EditorPaneHandle).
- theme: `theme/themeFiles.ts:30-49`, `theme/useThemeFileEditing.ts:39` (fs commands).
- sidebar: `SidebarRail.tsx:23-25`, `types.ts:1`, `useSidebarPanel.ts:47-51,68`.
- spaces: `spaces/lib/serialize.ts:25-27,81-85,171-191` (editor/preview/markdown tabs).
- ai: `ai/components/AiChat.tsx:17` (MarkdownLink), `FilePicker.tsx:4` (FileIcon), `ai/tools/terminal.ts:1`
  (previewUrl), `ai/lib/native.ts:49-98`, `ai/hooks/useWorkspaceFiles.ts:30`, `ai/lib/composer.tsx:188`.
- Rust: `workspace.rs:260-278,721`, `shell/mod.rs:172`, `shell/session.rs:8`, `control.rs:119,572`,
  `agent.rs:592-615`, `secrets.rs:132`, `lib.rs:53-60` use `fs::blocking`/`fs::to_canon`.

Out of this area: `@/modules/ai/*` (EditorPane.tsx:1-2, autocomplete/provider.ts:7-9, useGitStatus.ts:1,
useSourceControlPanel.ts:8,13,874, MarkdownPreviewPane.tsx:2), `read_policy.rs:20` includes
`src/modules/ai/lib/pathPolicy.json`; `@/modules/{tabs,sidebar,workspace,settings,shortcuts,terminal,theme}`;
`components/ai-elements/markdown-code` (markdown). npm: CodeMirror (`@codemirror/*`, `@uiw/*`,
`@replit/codemirror-vim`, `@replit/codemirror-lang-svelte`, `codemirror-languageserver`),
`@iconify-json/catppuccin`, `streamdown`. Cargo: `ignore`, `grep-regex`, `grep-searcher`, `globset`,
`nucleo-matcher`, `notify`, `fsevent-sys`, `toml` (project_config).

## "terax" mentions

(a) **Phase 0 identity isolation**

- `read_policy.rs:15` denies `<cache>/terax` because the control server writes its runtime file there
  (control.rs:757-758). When control moves to lut's dir, the policy must deny lut's dir (and keep Terax's). → ide-tools-D02.
- Dormant (never invoked by the UI, but reachable over IPC and shared with a Terax install if used):
  `refs/terax/checkpoints|tasks/*` (refs.rs:6, checkpoint.rs:639,685,991; api.ts:282; scope.ts:10,123),
  `~/.terax/worktrees` (commands_review.rs:121, project_config.rs:35,355), `~/.terax` task state
  (task_state.rs:73), `terax-tasks.lock` (task_state.rs:48), `.terax/project.toml` (project_config.rs:121-255),
  branch prefix `terax/` (project_config.rs:38), `TERAX_TASK/WORKSPACE_PATH/ROOT_PATH/PORT[_n]`
  (task_worktree.rs:96-102, project_config.rs:56), `.git/terax-{worktree-id,last-restore,no-hooks,empty-hooks,task-hooks}`
  (checkpoint.rs:39-41, task_worktree.rs:251, worktree.rs:446), commit identity `Terax <terax@localhost>`
  (checkpoint.rs:523-527). Resolved by removal (ide-tools-D04); if the user keeps the feature, each must be renamed in Phase 0.
- `TERAX.md` project memory (project_memory.rs:38) — Terax's AI memory file; removed with AI (ide-tools-D03).

(b) **Visual rebranding** — `errors.rs:53` "Terax needs git …"; `LspStatusPill.tsx:180` "Terax found no …";
`languageDefinitions.ts:475-476` "Terax Theme" language / `terax-theme` extension (theme file format, also
`markdownExtras.ts:25`).

(c) **Internal (rename on touch)** — CSS classes/vars `terax-code-editor` (EditorPane.tsx:656),
`--terax-editor-wrap-column` (extensions.ts:25, test:15), `terax-icon-in` (FileIcon.tsx:43), `terax-pill-in`
(LspStatusPill.tsx:35); log prefixes `[terax]` (iconResolver.ts:24, useExplorerFileDrop.ts:104); class
`TeraxLspClient` (client.ts:242,401; sessionManager.ts:7-244 + test); event `terax:git-changed`
(git/watch.rs:1,26; changes.ts:5); thread names `terax-fs-watch`, `terax-git-watch`, `terax-lsp-*`
(watch.rs:122, git/watch.rs:770, lsp/env.rs:65, session.rs:184-257); FSEvents queue label
`app.crynta.terax.fsevents` (watch/macos.rs:202); temp prefixes `.terax-copy-` (copy.rs:132),
`terax-snapshot-` (checkpoint.rs:188); reserved host `terax-pty.localhost` (previewUrl.ts:5, must track the PTY
scheme name); crate name `terax_lib` in `tests/fs_search.rs:4-36`, `tests/git_operations.rs:5-727`; test
fixtures (`ai.rs:443-445`, `file.rs:396,551`, `read_policy.rs:97,145`, `testutil.rs:17`, `utils.rs:324`,
`lsp/env.rs:118`, all `*_tests.rs`).

## Risks

- Removing the explorer/editor naively would break kept code: fs core is used by terminal links, path
  completion, CwdBreadcrumb, theme files, workspace/shell/control/agent Rust modules.
- CodeMirror is **not** editor-only: the terminal block input uses `@codemirror/{state,view,language,commands,
autocomplete,legacy-modes}` and `@lezer/highlight` (terminal/block/lib/shellEditor.ts, ShellInput.tsx).
- Terminal file-link opening depends on `lsp/lib/navigator.ts`; deleting LSP without moving it breaks links.
- Spaces may hold editor/preview/markdown tabs; removing a tab kind needs tolerant deserialization (spaces area).
- `read_policy` vs. control-server rename ordering (token exposure through `asset://` reads).
- `inlineExtension.ts` is flagged binary by the partition tool (NUL byte) — a review tool may hide its diff.
- Git agent-task tests are interdependent (all import `review_tests`/`testutil`), forcing a single XL deletion PR.

## Open questions

1. Editor: keep an in-app editor at all (secondary window/panel, F6:3) or rely on `$EDITOR`/external editor
   opened from terminal links? If kept: vim mode, formatters, media preview?
2. LSP: keep (only useful with a serious editor) or remove? Recommendation: remove.
3. Explorer: keep as optional secondary panel (UX-009 P1) or drop?
4. Git: in-app Source Control panel and history graph, or lazygit in a pane only? In-app diff viewer?
5. Markdown preview and in-app web preview: not mentioned by the proposal — keep or remove? Recommendation: remove preview.
6. Agent task worktrees / checkpoints (unwired Terax backend): drop (recommended) or turn into a lut agent feature?
7. Command palette file/content search (fs index): part of UX-008's palette or not?

## Answers

**1. What the proposal decides.**

- General: "No debe convertirse en un editor/IDE con una terminal subordinada" (§1 objective, line 43);
  goal 7: "Mantener funciones de exploración, Git, diff o edición como utilidades secundarias, invocables bajo
  demanda y no como elementos centrales o siempre visibles" (line 53); "Git, explorador, editor o diff
  permanecen ocultos hasta que el usuario los necesite" (line 84); "No es un editor de código integrado como
  función principal" (line 93).
- UX-009 (P1): "Paneles secundarios opcionales: explorer, Git, diff, logs de agentes".
- 5.10:12: "Editor/Git/explorer | Medio | Opcional y lazy | Quitar del inicio, no del código sin análisis".
- 6.2:8: "`optional-tools`: editor, Git, explorer, diff como capabilities con carga bajo demanda".
- 10.2:6: "Sidebar actual: nueva navegación de proyectos, sin explorer/source control permanente".
  10.3:4: "Introducir capacidades opcionales `ContentTab` o `ToolWindow` para editor/diff/preview".
- F1:6: "Hacer opcional/ocultar editor, explorer, Source Control, AI integrada…; no eliminar backend todavía".
- F2:6: "Convertir editor, Git y explorer a capabilities opcionales, lazy; decidir qué código mantener";
  F2:7: "Remover dependencias sólo cuando no existan consumidores".
- F6:3: "editor/diff/Git en ventana/panel secundario opcional"; F6:gate: "ningún tool opcional es necesario
  para abrir una terminal". 16:23: "Editor/Git/IA propia no se imponen en la UI". 13.5:10: "Cambiar tabs con editor secundario cerrado".
- §12.1:5 (line 1142): "No borrar funciones de IA/IDE prematuramente".
- Per tool: **editor** — secondary, optional (decided); whether it is kept at all is open (F2:6). **Explorer** —
  optional panel (UX-009), off the sidebar (10.2:6); keep/drop open. **Git/source control** — optional panel
  (UX-009, F6:3); form open. **Git history** — not mentioned (open). **Diff** — optional (UX-009, 6.2:8, F6:3).
  **LSP** — not mentioned (open; recommend remove). **Markdown** — not mentioned (open). **Preview** —
  "preview" appears only as a `ContentTab/ToolWindow` capability (10.3:4); keeping the web preview is open.

**2. Importers from other areas.** See ## Couplings: terminal link opening `terminalLinks.ts:17,175,179,187`;
tabs `TabBar.tsx:22-24` (+ tab kinds in `useTabs.ts`, mounting in `WorkspaceSurface.tsx:3-6`); sidebar
`SidebarRail.tsx:23-25`, `useSidebarPanel.ts:47-51,68`, `App.tsx:1506-1521`; command palette
`CommandPalette.tsx:12`, `useFileSearch.ts:47-106`, `useContentSearch.ts:31`; settings
`EditorSection.tsx:13-14`, `LspInstallDialog.tsx:10`, `LspServersGroup.tsx:19`; statusbar `StatusBar.tsx:12`,
`DiagnosticsBadge.tsx:1`; header `SearchInline.tsx:4`, `useGitBranch.ts:1`; app `App.tsx:41-77,1395`;
ai `AiChat.tsx:17`, `FilePicker.tsx:4`, `tools/terminal.ts:1`.

**3. fs/ used by what lut keeps.** Must stay even without the explorer: `fs/mod.rs` (`blocking`, `to_canon`,
used by workspace.rs:260-278, shell/session.rs:8, control.rs:119,572, agent.rs:592-615, secrets.rs:132,
lib.rs:53); `file.rs` (`fs_stat`/`fs_canonicalize` for terminal links, `fs_read_file`/`fs_write_file` for theme
files); `tree.rs` (`fs_read_dir` for path completion pathComplete.ts:53, `list_subdirs` for CwdBreadcrumb.tsx:183);
`mutate.rs` (theme files create_dir/delete); `assets.rs` + `read_policy.rs` (safe display of user images —
needed for PRO-012 profile image icons; Spaces/profile icons do not use fs today: no profile model exists);
`watch.rs` (git watcher for the branch indicator; reusable for watching project/preset files);
`local_file.rs` (Windows helper). Removable with their consumers: `ai.rs`, `project_memory.rs` (AI);
`copy.rs`, `clipboard.rs` (explorer); `search/grep/index/supersede.rs` (palette + AI, pending UX-008 scope).

**4. Removal order (small PRs) and freed dependencies.**

1. ide-tools-D08 move navigator (S, +40/-15) — unblocks LSP removal.
2. ide-tools-D05 drop dead review/checkpoint frontend models and wrappers (S, ~-900).
3. ide-tools-D04 delete git agent-task backend + move `git_watch` (XL deletion ~-14k, +60) — frees cargo `toml`
   only if nothing else uses it (check `toml` usage in other areas before removing).
4. ide-tools-D03 fs AI commands (M, ~-700) after the AI frontend is gone — no dep freed alone.
5. ide-tools-D06 editor AI features (M, ~-600) after ai-diff tab kind is removed.
6. ide-tools-D07 AI commit message in source control (S).
7. Conditional on ide-tools-D01: D17 LSP (L deletion ~-4.5k) frees `codemirror-languageserver`; D15 preview
   (M ~-800); D16 markdown (M ~-900; `streamdown` freed only together with AI chat); explorer/editor/git UI
   removals or rebuilds (D10-D14). Removing the editor frees `@uiw/react-codemirror`, `@uiw/codemirror-theme-*`
   (9 pkgs), `@uiw/codemirror-themes`, `@replit/codemirror-vim`, `@replit/codemirror-lang-svelte`,
   `@codemirror/lang-*` (11), `@codemirror/lint`, `@codemirror/merge`, `@codemirror/search` (check
   `components/ai-elements/chat-code-lezer.ts` first); NOT `@codemirror/{state,view,language,commands,
autocomplete,legacy-modes}`/`@lezer/highlight` (terminal input). Removing explorer icons frees
   `@iconify-json/catppuccin`. Removing fs search frees `grep-regex`, `grep-searcher`, `nucleo-matcher`,
   `globset` (verify), not `ignore` (tree.rs). There is no git2 and no Monaco.

## Draft issues

### ide-tools-D01 — Decide which optional IDE tools lut keeps

```yaml
id: ide-tools-D01
depends-on: []
refs: [F2:6, 5.10:12, UX-009, F6:3, 6.2:8, 10.3:4, .docs/plan/analysis/ide-tools.md]
covers: [F2:6, 5.10:12, ide-tools/editor-core, ide-tools/editor-git-diff, ide-tools/explorer-logic, ide-tools/fs-explorer-ops, ide-tools/fs-search-index, ide-tools/lsp, ide-tools/markdown-logic, ide-tools/preview-logic, ide-tools/git-history-logic, ide-tools/source-control-logic]
type: spike
scope: none
size: S
```

**Goal:** Record a keep/remove decision for editor, LSP, explorer, Git panel, Git history, diff, markdown
preview, web preview, agent task worktrees and palette file search, so removal/rebuild issues can proceed.

**Acceptance criteria:**

- [ ] One decision per tool with rationale, written to `.docs/` and reflected in `proposal.md` if it changes scope.
- [ ] For each removed tool, the matching removal issue is confirmed; for each kept tool, a design issue exists.
- [ ] Dependency list (npm/cargo) freed by each decision is recorded.

**Verification:** decision document reviewed by the user; `node .docs/plan/tools/validate.mjs` passes after plan update.

### ide-tools-D02 — Read policy denies lut's control runtime directory

```yaml
id: ide-tools-D02
depends-on: [agents-D01?]
refs: [F0:10, identity:1, 14.1]
covers: [ide-tools/fs-read-policy]
type: task
scope: be
size: S
```

**Goal:** The fs read policy must protect lut's control-server runtime file, not only Terax's.

**Acceptance criteria:**

- [ ] `read_policy.rs` denies the runtime directory used by lut's control server (single shared constant/fn with control.rs), and still denies `<cache>/terax`.
- [ ] Tests cover both directories, including a relocated/aliased cache path.

**Verification:** `cargo test -p terax_lib read_policy` (or the renamed crate) passes; an `asset_grant` on the runtime file is refused.

### ide-tools-D03 — Remove AI-only fs commands

```yaml
id: ide-tools-D03
depends-on: [ai-D??]
refs: [F2:4, 9.9:1]
covers: [ide-tools/fs-ai-tools]
type: task
scope: be
size: M
```

**Goal:** Delete `ai_read_file`, `ai_read_dir`, `ai_grep`, `ai_glob`, `fs_read_project_memory` once the AI frontend no longer calls them.

**Acceptance criteria:**

- [ ] `fs/ai.rs` and `fs/project_memory.rs` deleted; commands unregistered from lib.rs.
- [ ] `readable()` tests from ai.rs:440-452 moved to `read_policy.rs`.
- [ ] No frontend reference to the removed commands remains.

**Verification:** `cargo test`, `pnpm test`, `pnpm tsc --noEmit` pass; `rg "ai_read_file|fs_read_project_memory" src src-tauri` is empty.

### ide-tools-D04 — Delete the unwired git agent-task backend

```yaml
id: ide-tools-D04
depends-on: [ide-tools-D01, ide-tools-D05]
refs: [F2:7, F0:10]
covers: [ide-tools/git-agent-tasks]
type: task
scope: be
size: XL
size-exception: mechanical deletion of ~14k lines (checkpoint/worktree/task/review modules and their interdependent test files) with a ~60-line move of git_watch/git_unwatch
```

**Goal:** Remove checkpoints, task worktrees, hunk review and branch create/rename commands that no UI calls, eliminating dormant `refs/terax`, `~/.terax` and `TERAX_*` identity.

**Acceptance criteria:**

- [ ] `git_watch`/`git_unwatch` moved from `commands_review.rs` to `commands.rs`, behaviour unchanged.
- [ ] Listed modules and tests deleted; lib.rs registrations removed; `refs.rs` checkpoint prefix removed if unused.
- [ ] `tests/git_operations.rs` worktree cases removed or rewritten.
- [ ] `rg -i "refs/terax|\.terax/|TERAX_PORT" src-tauri` is empty.

**Verification:** `cargo test`, `cargo clippy` pass; app starts and the header branch indicator still updates on commit.

### ide-tools-D05 — Remove dead frontend git review models and wrappers

```yaml
id: ide-tools-D05
depends-on: []
refs: [F2:7]
covers: [ide-tools/git-frontend-review-models, ide-tools/git-frontend-api]
type: task
scope: ui
size: S
```

**Goal:** Delete `git/hunks.ts`, `git/scope.ts` and the unused review/worktree/checkpoint/branch wrappers and types in `git/api.ts`/`types.ts`.

**Acceptance criteria:**

- [ ] Files and wrappers removed; `index.ts` re-exports updated.
- [ ] No consumer outside `src/modules/git` breaks.

**Verification:** `pnpm tsc --noEmit`, `pnpm test`, `pnpm knip` show no new errors.

### ide-tools-D06 — Remove AI features from the editor

```yaml
id: ide-tools-D06
depends-on: [tabs-D??, ai-D??]
refs: [F2:4, 9.9:1]
covers: [ide-tools/editor-ai]
type: task
scope: ui
size: M
```

**Goal:** Delete inline AI autocomplete and AI diff panes; the editor no longer reads provider keys.

**Acceptance criteria:**

- [ ] `editor/lib/autocomplete/`, `AiDiffPane/Stack/StackLazy` deleted; `EditorPane.tsx` has no `@/modules/ai` import.
- [ ] `WorkspaceSurface` and `feature-loading.test.tsx` no longer reference AiDiffStack.

**Verification:** `pnpm tsc --noEmit`, `pnpm test`; open a file in the editor and type with no AI request (network log).

### ide-tools-D07 — Remove AI commit message generation from source control

```yaml
id: ide-tools-D07
depends-on: [ai-D??]
refs: [F2:4]
covers: [ide-tools/source-control-logic]
type: task
scope: ui
size: S
```

**Goal:** Source control hooks no longer import chatStore, ai/config or ai/lib/agent.

**Acceptance criteria:**

- [ ] AI commit message code path removed from `useSourceControlPanel.ts` (and its trigger in the panel).
- [ ] Manual commit flow unchanged.

**Verification:** `pnpm tsc --noEmit`, `pnpm test`; commit from the panel still works.

### ide-tools-D08 — Move the open-file navigator out of the LSP module

```yaml
id: ide-tools-D08
depends-on: []
refs: [F2:6]
covers: [ide-tools/file-navigator]
type: task
scope: ui
size: S
```

**Goal:** Terminal link activation must not depend on the LSP module.

**Acceptance criteria:**

- [ ] `navigator.ts` moved to a neutral module; `App.tsx` and `terminalLinks.ts` (+ test mock) import the new path.
- [ ] Pure move, no behaviour change.

**Verification:** `pnpm test src/modules/terminal/lib/terminalLinks.test.ts` passes; clicking a file path in the terminal opens it.

### ide-tools-D09 — Design: optional tool windows/panels

```yaml
id: ide-tools-D09
depends-on: [ide-tools-D01]
refs: [UX-009, F6:3, 10.3:4, 10.2:6]
covers: [UX-009, F6:3, 10.3:4]
type: design
scope: ui
size: M
```

**Goal:** The user designs how kept optional tools (editor/diff/Git/explorer…) are opened and presented, and any file iconography.

**Acceptance criteria:**

- [ ] Design covers invocation, placement (ContentTab vs ToolWindow), and visuals for each kept tool.
- [ ] States that nothing is visible by default (16:23).

### ide-tools-D10 — Rebuild the Git panel UI on lut's design

```yaml
id: ide-tools-D10
depends-on: [ide-tools-D09, ide-tools-D07]
refs: [UX-009, F6:3]
covers: [ide-tools/source-control-ui]
type: task
scope: ui
size: L
size-exception: replaces a 1.5k-line Terax view; may split per design section when the design exists
```

**Goal:** Replace `SourceControlPanel.tsx` with the user-designed panel over the existing hooks, or delete it if D01 drops the panel.

**Acceptance criteria:**

- [ ] New view matches the design; Terax panel removed.
- [ ] Not mounted at startup; opened on demand only.

**Verification:** `pnpm test`; stage/commit/push from the panel on a test repo.

### ide-tools-D11 — Git history view per decision

```yaml
id: ide-tools-D11
depends-on: [ide-tools-D09]
refs: [F6:3]
covers: [ide-tools/git-history-ui]
type: task
scope: ui
size: M
```

**Goal:** Rebuild the history view on the new design, or remove the git-history tab kind if D01 drops it.

**Acceptance criteria:**

- [ ] Either new view per design, or `src/modules/git-history/` and its tab kind removed (with tabs area).

**Verification:** `pnpm tsc --noEmit`, `pnpm test`.

### ide-tools-D12 — Explorer panel per decision

```yaml
id: ide-tools-D12
depends-on: [ide-tools-D09]
refs: [UX-009, 10.2:6]
covers: [ide-tools/explorer-ui]
type: task
scope: ui
size: L
size-exception: replaces a 1.1k-line view; removal variant is mechanical
```

**Goal:** Replace the Terax explorer views with the designed optional panel, or remove explorer + `fs/copy.rs`/`clipboard.rs` (keeping `lib/watch.ts` in a neutral module if editor/markdown remain).

**Acceptance criteria:**

- [ ] Explorer is not part of the default sidebar.
- [ ] Drag-a-path-into-terminal behaviour kept or explicitly dropped per decision.

**Verification:** `pnpm test`, `cargo test`; app starts with no explorer mounted.

### ide-tools-D13 — Replace Terax file icon theme

```yaml
id: ide-tools-D13
depends-on: [ide-tools-D09, tabs-D??]
refs: [PRO-012]
covers: [ide-tools/file-icons]
type: task
scope: ui
size: M
```

**Goal:** Remove the Catppuccin file-icon mapping and `@iconify-json/catppuccin` once tabs/palette no longer need it, or replace it with the designed iconography.

**Acceptance criteria:**

- [ ] No import of `explorer/FileIcon` remains outside kept tools; dependency removed if unused.

**Verification:** `pnpm tsc --noEmit`, `pnpm test`, `pnpm knip`.

### ide-tools-D14 — Replace editor themes with lut theming

```yaml
id: ide-tools-D14
depends-on: [ide-tools-D09]
refs: [F6:3]
covers: [ide-tools/editor-themes]
type: task
scope: ui
size: M
```

**Goal:** Editor (if kept) follows the designed theme; Terax CodeMirror themes and `@uiw/codemirror-theme-*` removed.

**Acceptance criteria:**

- [ ] `cmThemes.ts`, `chromeTheme.ts`, `themes.ts` replaced; `compositingBudget.test.ts` updated.
- [ ] Unused theme packages removed from package.json.

**Verification:** `pnpm test`, `pnpm build`.

### ide-tools-D15 — Remove (or rebuild) the in-app web preview

```yaml
id: ide-tools-D15
depends-on: [ide-tools-D01, tabs-D??]
refs: [10.3:4]
covers: [ide-tools/preview-ui]
type: task
scope: ui
size: M
```

**Goal:** Apply D01's decision on the web preview tab (recommended: remove).

**Acceptance criteria:**

- [ ] If removed: `src/modules/preview/` deleted, `tab.newPreview` shortcut and tab kind gone, `devFramePolicy.test.ts` moved to app tests, ai/tools import resolved.
- [ ] Spaces with saved preview tabs still load.

**Verification:** `pnpm tsc --noEmit`, `pnpm test`; restore a Space containing a preview tab.

### ide-tools-D16 — Remove (or rebuild) the markdown preview

```yaml
id: ide-tools-D16
depends-on: [ide-tools-D01, ide-tools-D09]
refs: [UX-009]
covers: [ide-tools/markdown-ui]
type: task
scope: ui
size: M
```

**Goal:** Apply D01's decision on markdown preview.

**Acceptance criteria:**

- [ ] Either designed view, or `src/modules/markdown/` and its tab kind removed with tolerant Spaces loading.

**Verification:** `pnpm tsc --noEmit`, `pnpm test`.

### ide-tools-D17 — Remove LSP support

```yaml
id: ide-tools-D17
depends-on: [ide-tools-D01, ide-tools-D08]
refs: [F2:6, F2:7]
covers: [ide-tools/lsp]
type: task
scope: be
size: L
size-exception: mechanical deletion of the LSP frontend module, Rust lsp module and their settings/statusbar consumers (~4.5k lines)
```

**Goal:** If D01 drops LSP, delete it end to end and free `codemirror-languageserver`.

**Acceptance criteria:**

- [ ] `src/modules/lsp/`, `src-tauri/src/modules/lsp/`, diagnostics store/badge, LspStatusPill, LSP settings groups and `lspActivation` pref removed.
- [ ] lib.rs state/commands/exit hook removed.

**Verification:** `cargo test`, `pnpm test`, `pnpm knip`; opening a .ts file spawns no language server.

### ide-tools-D18 — Optional tools load only on demand

```yaml
id: ide-tools-D18
depends-on: [app-D??, ide-tools-D01]
refs: [6.2:8, F1:6, F6:gate, 16:23, 13.5:10]
covers: [6.2:8, F6:gate, 16:23, 13.5:10]
type: task
scope: ui
size: M
```

**Goal:** No IDE tool module is loaded or mounted at startup; tools register as optional capabilities.

**Acceptance criteria:**

- [ ] Startup bundle contains no editor/explorer/git/lsp chunk (eager-budget test updated).
- [ ] Switching tabs with all tools closed mounts none of them.

**Verification:** `pnpm test src/app/eager-budget.test.ts`; cold start shows a terminal with no tool panel.
