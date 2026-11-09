# Area analysis: ai (built-in BYOK AI)

Scope: `src/modules/ai/**`, `src/components/ai-elements/**`, `src-tauri/src/modules/{ai_sessions.rs,net.rs,net/,secrets.rs}`.
That is 116 files, about 21.4k lines. Items are listed in `analysis/ai.json`.

## How it works today

- **Frontend runtime.** The chat runs on the Vercel AI SDK (`ai`, `@ai-sdk/*`). `lib/agent.ts` builds a language model for each provider in `config.ts`: Anthropic, OpenAI, Google, Groq, xAI, Cerebras, OpenRouter, OpenAI-compatible, plus the local backends LM Studio, Ollama, MLX and whisper.cpp. It also builds the system prompt (`config.ts:902,953`).
- **Requests.** Provider HTTP calls do not use the webview's `fetch`. `lib/proxyFetch.ts` sends them through the Rust proxy. Metadata travels in the `x-terax-ai-request` header (`proxyFetch.ts:232`) to `ai_http_stream`, and response chunks come back on a Tauri `Channel`.
- **Rust proxy.** `net.rs` validates URLs and headers (`net.rs:76,133`). `net/ip.rs` classifies hosts to block SSRF and cloud metadata addresses. `net/clients.rs` caches pinned `reqwest` clients. `net/stream.rs` handles stream back-pressure through `ai_http_ack`. Streams are cancelled when a page loads or a window is destroyed (`lib.rs:223,439`).
- **Tools.** `tools/*.ts` gives the model tools for fs, edit, search, shell, terminal, todo and subagents. They call `lib/native.ts`, which invokes these commands:
  - `ai_read_file`, `ai_read_dir`, `ai_grep`, `ai_glob`, from the fs area (`fs/ai.rs`)
  - `shell_run_command`, `shell_session_*`, `shell_bg_*`, from the shell area
  - `fs_write_file` and similar fs commands

  Writes and edits go through an approval step (`AiToolApproval`, `PlanDiffReview`, and the `ai-diff` tab kind in `tabs/lib/useTabs.ts:86`). Path access is checked by `lib/security.ts` against `pathPolicy.json`.

- **State.** All state lives in Zustand stores under `store/`:
  - `chatStore`: panel, mini window, live context, approvals
  - `chatRuntime`: `@ai-sdk/react` Chat instances
  - `agentsStore`, `snippetsStore`, `todoStore`, `planStore`
- **Persistence.**
  - Conversations: `lib/sessions.ts` writes them through the `ai_session_*` commands to one file per session under `app_data_dir` (`ai_sessions.rs:519`). Old `terax-ai-sessions.json` stores are migrated (`ai_sessions.rs:33-34`).
  - Agents, snippets and todos: tauri-plugin-store files `terax-ai-agents.json`, `terax-ai-snippets.json` and `terax-ai-todos.json`.
  - API keys: `lib/keyring.ts` reads and writes them through `secrets_*`. On macOS and Windows that is the OS keychain under service `terax-ai`. On Linux it is the file `app_local_data_dir/secrets.json` (`secrets.rs:46-48`).
- **Lifecycle.** `App.tsx` wraps the whole tree in `AiComposerProvider` (`App.tsx:1694`) and calls `useAiBootstrap`, which loads keys (`App.tsx:369`) and `useAiLiveBridge`, which feeds terminal context (`App.tsx:1410`). It mounts `AgentRunBridge`, `LocalAgentNotificationsBridge`, `AiMiniWindow` and `SelectionAskAi` (`App.tsx:1625-1637`). The heavy SDK chunks are lazy-loaded (`components/lazy.tsx`, `index.ts` comment). Speech-to-text runs from `lib/stt.ts` and `hooks/useWhisperRecording.ts`.

## Interfaces

- **Tauri commands defined in this area** (`lib.rs:402-414`):
  - `secrets_get`, `secrets_set`, `secrets_delete`, `secrets_get_all`
  - `lm_ping`, `ai_http_stream`, `ai_http_cancel`, `ai_http_ack`
  - `ai_session_load`, `ai_session_save`, `ai_session_delete`, `ai_session_finish_migration`, `ai_session_prune_backup`
- **Managed state:** `net::AiStreamState`, `ai_sessions::SessionFilesState`, `secrets::SecretsState` (`lib.rs:261-266`).
- **Commands consumed from other areas** (through `native.ts`):
  - fs: `workspace_current_dir`, `workspace_authorize`, `fs_read_project_memory`, `ai_read_file`, `fs_write_file`, `fs_canonicalize`, `fs_create_file`, `fs_create_dir`, `ai_read_dir`, `ai_grep`, `ai_glob`
  - shell: `shell_run_command`, `shell_session_open/run/close`, `shell_bg_spawn/logs/kill/list`
- **Request headers:** `x-terax-ai-request` (`net.rs:247`) and `x-terax-session` (`ai_sessions.rs:550`).
- **Window events:**
  - `terax:ai-attach-file`, dispatched by `App.tsx:575` and handled in `composer.tsx:116`
  - `terax://ai-agents-changed` (`agentsStore.ts:12`)
  - `terax://ai-snippets-changed` (`snippetsStore.ts:10`)
- **Stores and keys:**
  - `terax-ai-sessions.json` (legacy), `terax-ai-agents.json`, `terax-ai-snippets.json`, `terax-ai-todos.json`
  - localStorage `terax-ui-mini-window-geom` (`useMiniWindowGeometry.ts:12`)
  - keychain service `terax-ai` (`config.ts:1`)
  - `secrets.json` (Linux)
  - session files in `app_data_dir`
  - AI settings stored in the settings store (`settings/store.ts:8-16`)
- **Files read:** `TERAX.md` at the workspace root is used as project memory (`transport.ts:16`). `/init` writes it (`slashCommands.ts:34`).
- **Shortcuts:** `ai.toggle`, `ai.toggleMini` and `ai.askSelection` (`shortcuts/shortcutDefaults.ts:62-64,128-130`, `shortcuts.ts:45-46`).
- **Command palette:** `toggleAi`, `askAiSelection` and `ai.toggle` (`command-palette/commands.ts:56-57,288`).
- **Public TS API used by other areas:**
  - `index.ts` barrel
  - `native`
  - `checkReadable`
  - `useChatStore`
  - `chatRuntime.getOrCreateChat`
  - `config` types and constants
  - keyring getters
  - `buildLanguageModel`
  - `AgentStatusPill`
  - `AiStatusBarControls`
  - `Chip` and `ChipsRow`
  - `AiComposerInput`
  - `AGENT_ICONS`
  - agents and snippets libs and stores
  - `MarkdownCode`

## Couplings

Inbound, from other areas into ai:

| Consumer        | file:line                                                                                                                                                                     | What it uses                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| app-shell       | `src/app/App.tsx:22-33,359-369,557,564,604,1113,1410,1625-1637,1694`                                                                                                          | barrel, composer provider, native, chat store                      |
| app-shell       | `src/app/components/WorkspaceInputBar.tsx:3-6,24`                                                                                                                             | AiInputBarConnect, Chip, ChipsRow, useComposer, AiComposerInput    |
| app-shell       | `src/app/hooks/useAppCloseGuard.ts:2,6`                                                                                                                                       | flushPersist, sessions                                             |
| app-shell       | `src/app/hooks/useWorkspaceSwitcher.ts:3,48,68`                                                                                                                               | `native.workspaceAuthorize`                                        |
| spaces          | `src/modules/spaces/lib/useSpacesBoot.ts:1,106`                                                                                                                               | `native.workspaceAuthorize`                                        |
| explorer        | `src/modules/explorer/lib/useGitStatus.ts:1`                                                                                                                                  | native                                                             |
| markdown        | `src/modules/markdown/MarkdownPreviewPane.tsx:1-2`, `lib/assetPath.test.ts:2`                                                                                                 | MarkdownCode, checkReadable                                        |
| editor          | `src/modules/editor/EditorPane.tsx:1-2`, `lib/autocomplete/provider.ts:7-10`                                                                                                  | AI inline autocomplete (config, keyring, buildLanguageModel, `ai`) |
| source-control  | `src/modules/source-control/useSourceControlPanel.ts:8,13,874-875`                                                                                                            | AI commit message (chatStore, config, agent, `ai`)                 |
| statusbar       | `src/modules/statusbar/StatusBar.tsx:6-11`                                                                                                                                    | useChatStore, AgentStatusPill, AiStatusBarControls                 |
| terminal        | `src/modules/terminal/block/BlockOverlay.tsx:12`                                                                                                                              | useChatStore                                                       |
| agents          | `src/modules/agents/lib/review.ts:1,32` (+ test mocks `review.test.ts:30,37`)                                                                                                 | chatStore, chatRuntime                                             |
| settings        | `src/modules/settings/store.ts:8-16`                                                                                                                                          | config constants/types                                             |
| settings UI     | `src/settings/sections/ModelsSection.tsx:38,47,48,904,1121`, `AgentsSection.tsx:12-27`, `components/ProviderIcon.tsx:1`, `ProviderKeyCard.tsx:6`, `ModelsSection.test.tsx:30` | config, keyring, stores, `lm_ping`                                 |
| shortcuts       | `src/modules/shortcuts/shortcutDefaults.ts:62-64,128-130`, `shortcuts.ts:45-46`                                                                                               | ai.* ids                                                           |
| command-palette | `src/modules/command-palette/commands.ts:56-57,288`                                                                                                                           | toggleAi, askAiSelection                                           |
| tabs            | `src/modules/tabs/lib/useTabs.ts:86,925-960`                                                                                                                                  | `ai-diff` tab kind                                                 |
| tests/build     | `src/styles/compositingBudget.test.ts:42,46`, `src/app/dist-budget.test.ts`, `src/app/eager-budget.test.ts`, `vite.config.ts:86-92`                                           | chunk/budget names                                                 |
| backend-core    | `src-tauri/src/lib.rs:6,223,261-266,402-414,439`, `src-tauri/src/modules/mod.rs:4,15,19`                                                                                      | registration                                                       |
| fs (Rust)       | `src-tauri/src/modules/fs/read_policy.rs:20`                                                                                                                                  | `include_str!` of `src/modules/ai/lib/pathPolicy.json`             |

Outbound, from ai into other areas:

- `ai-elements/chat-code.tsx` uses `components/ui/button`.
- `ai-elements/chat-code.tsx:5` imports `useChatStore`, so markdown preview code blocks currently pull in the chat store.
- fs and shell commands are called through `native.ts`.

## "terax" mentions

**(a) Phase 0 identity isolation**

- `config.ts:1` sets `KEYRING_SERVICE = "terax-ai"`. The macOS Keychain and Windows Credential Manager are not scoped by bundle id, so lut reads and writes the same API-key entries as an installed Terax. This must change in Phase 0 (ai-D01).
- `agent.ts:158-159` sends `HTTP-Referer: https://terax.ai` and `X-Title: Terax` to OpenRouter. This identifies lut as Terax to a third party, which falls under the F0:5 outbound audit (ai-D01).
- Store files `terax-ai-*.json` (`sessions.ts:13`, `agents.ts:82`, `snippets.ts:12`, `todos.ts:12`, `ai_sessions.rs:33-34`), localStorage `terax-ui-mini-window-geom`, and `secrets.json` all live in the app data dir or webview origin. They become isolated once the bundle id and data dir change (identity area), so no rename is needed here.
- `pathPolicy.json:51-55` lists Terax's cache/data dirs (`/.cache/terax`, `app.crynta.terax`, …) as protected. After the identity change, lut's own dirs must be added (ai-D03). The fs read policy uses the same file.

**(b) Visual rebranding** (all of it disappears with the removal, so do not rebrand it)

- `AiChat.tsx:219`, `AiComposerInput.tsx:260`, `AiMiniWindow.tsx:543-549`, `SelectionAskAi.tsx:60`: "Ask Terax"-style text and the logo alt text.
- `LocalAgentNotificationsBridge.tsx:8,66-70`: notification titles.
- `config.ts:902,953`: system prompt "You are Terax".

**(c) Internal**

- CSS classes `terax-chat-item`, `terax-collapsible-content`, `terax-reveal`, `terax-blink`, `terax-attention-pulse`, `terax-shimmer` (in AiChat, AiComposerInput, AiStatusBarControls, AiToolApproval, shimmer.tsx, tool.tsx).
- `TERAX_CMD_RE` and `<terax-command>` (`slashCommands.ts:72`, `composer.tsx:247`).
- The `TERAX.md` project memory (`transport.ts:11-16`, `agent.ts:319`, `slashCommands.ts:34-42`).
- The headers `x-terax-ai-request` and `x-terax-session`, and the events `terax:ai-attach-file` and `terax://ai-*-changed`.
- The `[terax]` log prefix (`useAiLiveBridge.ts:148`), a comment in `zodV3Shim.ts:3`, and test fixtures.

All of these are deleted with the module.

## Risks

- **API keys shared with Terax.** Until ai-D01 lands, a dev build of lut on Windows or macOS shares API keys with an installed Terax through the OS keychain.
- **`workspace_authorize` lives in the AI module.** Spaces restore depends on it, so deleting the module before ai-D02 breaks Spaces boot.
- **Rust compile path.** `fs/read_policy.rs:20` `include_str!`s a file inside `src/modules/ai`, so deleting the folder breaks the Rust build.
- **Markdown code blocks.** Markdown preview code highlighting depends on `ai-elements/markdown-code` → `chat-code` → `chatStore`.
- **CLI agent review.** `agents/lib/review.ts` sends CLI-agent review output into the AI chat. That flow needs a non-AI destination, or it must be dropped (agents area decision).
- **CLI agent notifications.** `LocalAgentNotificationsBridge` shares the notification pipeline with CLI agents, and agentStore's `localAgent` state is still pending separation (F2:5, 9.9:3).
- **TLS provider.** `net/clients.rs:119` installs the rustls `ring` provider, and its comment says the updater installs the same one. Removing `rustls` and `reqwest` as direct dependencies is probably safe, but it must be verified together with lut's own updater (F7).
- **Persisted settings.** Settings keep AI fields (`settings/store.ts`). Removing the types needs migration code that tolerates old persisted keys.
- **Dead commands after removal.** Once AI is gone, the fs commands (`fs/ai.rs`: `ai_read_file`, `ai_read_dir`, `ai_grep`, `ai_glob`) and the shell session/background commands may have no callers left. They are a follow-up for the fs and shell areas.
- **Build config.** The budget tests and `vite.config.ts` manualChunks name the AI chunks and will fail or go stale.

## Open questions

1. When the AI is removed, should lut delete the OS keychain entries under the old service, or leave them alone? Leaving them is recommended: they belong to Terax.
2. Where should CLI-agent review results go once the chat is gone (`agents/lib/review.ts`)? This is for the agents area and the user to decide.
3. Should the editor's AI inline autocomplete and source-control's AI commit message go now, or with the editor/IDE decision (F2:6)? They are BYOK, so the recommendation is to remove them in this area's call-site cut.
4. Does lut's own updater need an explicit rustls crypto provider once `net/clients.rs` is gone? Check this during F7, or with a small spike.
5. Should the `ai-diff` tab kind and the approval and plan-review UI be removed outright? Nothing in the proposal needs them.

## Answers

1. **Who imports ai from other areas.** Every call site is in the Couplings table:
   - TS imports: App.tsx, WorkspaceInputBar, useAppCloseGuard, useWorkspaceSwitcher, useSpacesBoot, useGitStatus, MarkdownPreviewPane, EditorPane and the autocomplete provider, useSourceControlPanel, StatusBar, BlockOverlay, agents review, the settings store, and the Models/Agents/ProviderIcon/ProviderKeyCard settings components.
   - Tauri commands invoked outside the area: only `lm_ping` (`ModelsSection.tsx:904,1121`).
   - Shortcuts: `ai.toggle`, `ai.toggleMini`, `ai.askSelection`.
   - Palette commands: `toggleAi`, `askAiSelection`.
   - Tab kind: `ai-diff`.
   - Window event: `terax:ai-attach-file` (`App.tsx:575`).
   - Rust: `lib.rs` registration, plus `fs/read_policy.rs:20` including `pathPolicy.json`.
2. **Are net/ or secrets.rs used by anything besides AI?** No.
   - Nothing in Rust references `net::` or `secrets::` outside `lib.rs` registration.
   - The updater does not use `net`. It brings its own reqwest (`Cargo.toml:66` comment).
   - `agent_events.rs` and `control.rs` use `std::net`, not this module.
   - `secrets` is only reached from `ai/lib/keyring.ts`.

   What must stay is AI-adjacent code that does not live in net or secrets:
   - `native.workspaceAuthorize` and other non-AI wrappers: move them out (ai-D02).
   - `security.ts` and `pathPolicy.json`: move them out (ai-D03).
   - the markdown code-block renderer (ai-D04).

3. **Removal order.** Each step is one PR; sizes are estimates.
   1. ai-D01, Phase 0: change the keychain service and the OpenRouter headers (~10 lines).
   2. ai-D02: move native wrappers to a platform layer (~150).
   3. ai-D03: move the path policy and update the `include_str!` path (~80 plus the moved file).
   4. ai-D04: move the markdown code block into the markdown module and drop its chatStore dependency (~120 plus moves).
   5. ai-D05: cut App.tsx mounts, providers, close guard and the attach event (~250).
   6. ai-D06: cut statusbar, input bar, BlockOverlay, shortcuts, palette and the ai-diff tab (~300).
   7. ai-D07: cut settings Models/Agents sections and AI settings fields (~350, mostly deletions).
   8. ai-D08: cut editor autocomplete and the source-control AI commit message (~200).
   9. agents-D?: decouple `review.ts`.
   10. ai-D09: delete `src/modules/ai` and the rest of `ai-elements` (~18k deleted, size-exception).
   11. ai-D10: delete `ai_sessions.rs`, `net`, `secrets` and their `lib.rs` registration (~3.7k deleted, size-exception).
   12. ai-D11: remove dependencies and update budget tests and vite chunks (~100 plus lockfiles).
   13. ai-D12: verify a no-API-key startup.
4. **Dependencies that become unused.**
   - npm: `ai`, every `@ai-sdk/*` (anthropic, cerebras, google, groq, openai, openai-compatible, react, xai), `use-stick-to-bottom`, and probably `zod` (only AI imports it). Check that with grep before removing.
   - `streamdown` stays (markdown preview). The CodeMirror packages belong to the editor area.
   - Cargo: `keyring` (macOS and Windows targets), `bytes`, `futures-util`, direct `reqwest` (both the main entry and the Windows `system-proxy` entry), and direct `rustls`. reqwest stays transitively through `tauri-plugin-updater`.
   - `tokio`, `getrandom` and `percent-encoding` are still used elsewhere.
5. **What the proposal says.**
   - ADR-004 rejects built-in BYOK AI. lut runs the official CLIs with their own auth.
   - §5.8 and §9.9 list exactly these modules for removal and warn not to touch agents, control, agent.rs, agent_events.rs or the protocol crates.
   - F0:5 audits outbound network calls, including the net module and BYOK.
   - F1:6 hides the integrated AI without deleting the backend.
   - F2:3, F2:4, F2:5 and F2:7 cover decoupling and removal. The F2 gate and 13.2:17 require startup without an API key.
   - AGT-003 and 16:16 say no API keys are needed.
   - §15 and 9.9:6 say to update the manifests only after building the import graph.
   - Rule 5 of the proposal's work rules (line 1142): decouple first, prove that CLI and hooks still work, then remove.

   Nothing in the AI module is kept as a feature. Only the shared helpers (native wrappers, path policy, markdown code block) are kept, and they are moved out.

## Draft issues

### ai-D01 — Isolate AI keychain service and outbound identity from Terax

```yaml
id: ai-D01
depends-on: []
refs: [F0:10, F0:5, ADR-004]
covers: [F0:5]
type: task
scope: be
size: XS
```

**Goal:** lut must not read or write Terax's API keys in the OS keychain, and must not identify itself as Terax to third parties, while the BYOK code still exists.

**Acceptance criteria:**

- [ ] `KEYRING_SERVICE` in `src/modules/ai/config.ts:1` no longer equals `terax-ai` (use a lut-specific value).
- [ ] `HTTP-Referer: https://terax.ai` and `X-Title: Terax` are removed from `src/modules/ai/lib/agent.ts:158-159`.
- [ ] The outbound-call audit notes that the AI proxy only fires on explicit user action with a configured key.

**Verification:** `pnpm test` passes. Grepping `src/modules/ai` for `terax-ai"` and `terax.ai` finds nothing in the runtime code.

### ai-D02 — Move shared native wrappers out of modules/ai

```yaml
id: ai-D02
depends-on: []
refs: [9.9:4, F2:3]
covers: [ai/native-wrappers, F2:3, 9.9:4]
type: task
scope: ui
size: S
```

**Goal:** Non-AI code stops importing from `@/modules/ai`.

**Acceptance criteria:**

- [ ] A neutral module (for example `src/lib/native/workspace.ts`) exposes `workspaceAuthorize` and `workspaceCurrentDir`.
- [ ] `useSpacesBoot.ts`, `useWorkspaceSwitcher.ts`, `App.tsx` and `useGitStatus.ts` import from the neutral module.
- [ ] `src/modules/ai/lib/native.ts` keeps only AI-only wrappers. No behaviour change.

**Verification:** `pnpm test` and `pnpm typecheck` pass. Spaces restore still authorizes the restored cwds (manual check).

### ai-D03 — Move sensitive-path policy to a neutral module and protect lut dirs

```yaml
id: ai-D03
depends-on: [identity-D01?]
refs: [14.1:4, F0:10]
covers: [ai/path-policy]
type: task
scope: be
size: S
```

**Goal:** The read policy shared by Rust fs and the markdown preview no longer lives in the AI module, and it protects lut's own data dirs.

**Acceptance criteria:**

- [ ] `security.ts`, its test and `pathPolicy.json` are moved, for example to `src/lib/security/`. The `include_str!` path in `src-tauri/src/modules/fs/read_policy.rs:20` is updated.
- [ ] Markdown imports are updated.
- [ ] lut's data and cache directories (from the identity change) are added to the protected list. Terax entries remain.

**Verification:** `pnpm test` and `cargo test -p` for the app crate pass. `security.test.ts` covers a lut control-file path.

### ai-D04 — Decouple markdown preview code blocks from the AI chat

```yaml
id: ai-D04
depends-on: []
refs: [F2:4]
covers: [ai/markdown-code]
type: task
scope: ui
size: S
```

**Goal:** Markdown preview code blocks work without `useChatStore`. Their visual redesign happens later in the markdown area, after a design issue.

**Acceptance criteria:**

- [ ] `markdown-code`, `chat-code`, `chat-code-lezer` and `shimmer` are moved into the markdown module (pure move plus the dependency cut).
- [ ] No import of `@/modules/ai` remains in them. Chat-only actions (such as "send to chat") are dropped.
- [ ] No visual change.

**Verification:** `pnpm test` passes, including `markdown-code.test.tsx`. Markdown preview still highlights code (manual check).

### ai-D05 — Unmount BYOK AI from the app root

```yaml
id: ai-D05
depends-on: [ai-D02, app-shell-D?]
refs: [9.9:1, 9.9:5, F2:4, F1:6, 5.10:11]
covers: [F2:4, 9.9:1, 9.9:5, 5.10:11]
type: task
scope: ui
size: M
```

**Goal:** `App.tsx` no longer mounts the BYOK chat: no `AiComposerProvider`, bootstrap, bridges, mini window or selection popup.

**Acceptance criteria:**

- [ ] `AiComposerProvider`, `useAiBootstrap`, `useAiLiveBridge`, `useSelectionAskAi`, `AgentRunBridge`, `LocalAgentNotificationsBridge`, `AiMiniWindow` and `SelectionAskAi` are removed from `App.tsx`.
- [ ] The `terax:ai-attach-file` dispatch (`App.tsx:575`) and the `flushPersist`/sessions calls in `useAppCloseGuard.ts` are removed.
- [ ] CLI agent notifications still fire (hook events).

**Verification:** `pnpm test` passes. The app starts, terminals work, and a Claude Code hook event still notifies.

### ai-D06 — Remove AI entry points from statusbar, input bar, terminal, shortcuts, palette and tabs

```yaml
id: ai-D06
depends-on: [ai-D05]
refs: [F1:6, F2:4, 16:23]
covers: [16:23]
type: task
scope: ui
size: M
```

**Goal:** No UI entry point opens the BYOK AI.

**Acceptance criteria:**

- [ ] `StatusBar.tsx:6-11`, `WorkspaceInputBar.tsx:3-24` and `BlockOverlay.tsx:12` no longer import the ai module.
- [ ] The `ai.toggle`, `ai.toggleMini` and `ai.askSelection` shortcuts are removed, with their tests.
- [ ] The palette commands `toggleAi` and `askAiSelection` are removed.
- [ ] The `ai-diff` tab kind is removed from `useTabs.ts`.

**Verification:** `pnpm test` passes. Grepping `src/modules/{statusbar,terminal,shortcuts,command-palette,tabs}` and `src/app/components` for `modules/ai` finds nothing.

### ai-D07 — Remove AI provider settings (Models/Agents sections and settings fields)

```yaml
id: ai-D07
depends-on: [ai-D05]
refs: [AGT-003, 16:16]
covers: [AGT-003]
type: task
scope: ui
size: M
```

**Goal:** Settings no longer offer API keys, models or AI agents.

**Acceptance criteria:**

- [ ] `ModelsSection`, `ProviderIcon`, `ProviderKeyCard` and the AI parts of `AgentsSection` are removed. Any CLI-agent launch settings in AgentsSection stay.
- [ ] AI fields are dropped from `src/modules/settings/store.ts`. Old persisted keys are ignored without errors.

**Verification:** `pnpm test` passes. Settings opens with a settings file that still contains old AI keys.

### ai-D08 — Remove AI from editor autocomplete and source-control commit messages

```yaml
id: ai-D08
depends-on: [ai-D07]
refs: [F2:6]
covers: [ai/provider-config]
type: task
scope: ui
size: S
```

**Goal:** The editor and source-control areas no longer depend on the AI module.

**Acceptance criteria:**

- [ ] The inline AI completion in `EditorPane.tsx` and `editor/lib/autocomplete/*` is removed.
- [ ] The AI commit-message generation in `useSourceControlPanel.ts:8-13,874-875` is removed.

**Verification:** `pnpm test` passes. Grepping `src` outside `src/modules/ai` for `@/modules/ai` returns only the agents `review.ts` (handled by the agents area) or nothing.

### ai-D09 — Delete the frontend AI module and chat elements

```yaml
id: ai-D09
depends-on: [ai-D02, ai-D03, ai-D04, ai-D06, ai-D07, ai-D08, agents-D?]
refs: [ADR-004, 9.9:2, 5.8]
covers: [ai/chat-elements, ai/chat-ui, ai/agent-runtime, ai/stores, ai/tools-and-subagents, ADR-004, 9.9:2]
type: task
scope: ui
size: XL
size-exception: Mechanical deletion of a whole module (~18k lines) after all call sites are cut. No behaviour change remains in it.
```

**Goal:** `src/modules/ai` and the chat-only `src/components/ai-elements` files are gone.

**Acceptance criteria:**

- [ ] No file outside the deleted folders imports them.
- [ ] `src/modules/agents`, `src/modules/control` and the Rust agent modules are untouched.
- [ ] `compositingBudget.test.ts` entries for the deleted files are removed.

**Verification:** `pnpm typecheck`, `pnpm test` and `pnpm build` pass.

### ai-D10 — Delete Rust ai_sessions, net and secrets modules

```yaml
id: ai-D10
depends-on: [ai-D09]
refs: [F2:7, F0:5]
covers: [ai/sessions-backend, ai/net-proxy, ai/secrets-backend]
type: task
scope: be
size: L
size-exception: Mechanical deletion of three self-contained modules (~3.7k lines) plus their registration in lib.rs.
```

**Goal:** The backend no longer ships the AI HTTP proxy, AI session storage or the secrets store.

**Acceptance criteria:**

- [ ] The modules are removed from `modules/mod.rs:4,15,19`.
- [ ] Their state, commands and cleanup hooks are removed from `lib.rs:6,223,261-266,402-414,439`.
- [ ] The updater still compiles. The rustls provider question is noted for F7.

**Verification:** `cargo check`, `cargo test` and `pnpm tauri build` pass. The app starts.

### ai-D11 — Remove AI dependencies from package.json and Cargo.toml

```yaml
id: ai-D11
depends-on: [ai-D10]
refs: [9.9:6, F2:7, F2:8]
covers: [9.9:6, F2:7]
type: task
scope: none
size: S
```

**Goal:** No unused AI dependencies remain.

**Acceptance criteria:**

- [ ] npm: `ai`, all `@ai-sdk/*`, `use-stick-to-bottom` and `zod` (if no consumer is left) are removed.
- [ ] The `vite.config.ts` manualChunks entries and the dist/eager budget test entries for them are removed.
- [ ] Cargo: `keyring` (both targets), `bytes`, `futures-util`, direct `reqwest` (both entries) and direct `rustls` are removed, each confirmed unused by grep and `cargo check`.

**Verification:** `pnpm install`, `pnpm build`, `pnpm test` and `cargo check` succeed. A bundle analysis shows no AI SDK chunk.

### ai-D12 — Verify startup and CLI agents with no API key configured

```yaml
id: ai-D12
depends-on: [ai-D11]
refs: [F2:gate, 13.2:17, 16:16]
covers: [13.2:17, 16:16]
type: task
scope: none
size: XS
```

**Goal:** Prove the F2 gate for the AI part.

**Acceptance criteria:**

- [ ] On a clean profile with no keys, the app starts, terminals work, and Claude Code/Codex hooks deliver events.
- [ ] No network request is made to any AI provider (network log).

**Verification:** A manual test on Windows 11, with the result recorded in the PR.
