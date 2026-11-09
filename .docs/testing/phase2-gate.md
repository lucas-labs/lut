# Phase 2 gate (E05-19)

Checks that lut works without the BYOK AI: no API key, no request to an AI provider, shell selection and saved Spaces
still working. Run on 2026-11-09 on Windows 11 Pro 10.0.26200, on `master` at `e62c574` (after #359) plus the E05-21
fix.

## Automated

| Command                                                                                                                         | Result                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`                                                                                                                     | 4019 passed, 2 skipped                                                                                                   |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`                                                          | 726 passed, 0 failed                                                                                                     |
| `pnpm build`                                                                                                                    | pass                                                                                                                     |
| `pnpm size`                                                                                                                     | all under limit; main window startup JS 231.59 kB gzipped (limit 540 kB), total client JS 1.14 MB gzipped (limit 1.5 MB) |
| `pnpm check:dist`                                                                                                               | startup graph clean; `index.html` 46 chunks (1213.8 KiB), `settings.html` 31 chunks (673.0 KiB)                          |
| AI provider hosts in `dist/` (OpenAI, Anthropic, Gemini, Groq, OpenRouter, Cerebras, Mistral, xAI, DeepSeek, Ollama, LM Studio) | none                                                                                                                     |
| HTTP clients in lut's Rust code                                                                                                 | none; `reqwest` is only a dependency of `tauri` itself                                                                   |

A first `pnpm test` run, made while `pnpm build` and `cargo test` ran at the same time, had 5 failures in 3 files; alone
it passes. This matches the known failure under heavy load in [baseline.md](baseline.md).

## Manual, driven over CDP

The app ran with `pnpm tauri dev` and the main window's WebView2 opened with `--remote-debugging-port` (through a
`--config` override of `additionalBrowserArgs`). A Playwright script connected over CDP, typed into the terminal, read
the page state and recorded every request of the webview. The user's app data was backed up before and restored after.

Three profiles:

1. **The user's profile**, written before the AI removal: one space, one tab, and the old AI keys in
   `terax-settings.json` plus the `terax-ai-*.json` files.
2. **A Spaces fixture** in the same format: two spaces, a terminal split in two panes with different cwds, an editor
   tab, a Markdown tab and a terminal in a second root.
3. **A clean profile**: no app data at all.

| Check                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Starts with no API key | Pass on all three profiles; the legacy AI keys and files are ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Terminals work         | Pass: pwsh 7.6.9 starts in the saved cwd and runs commands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Agent hooks            | Pass for Claude Code and Codex. A PowerShell script stayed in the foreground and sent `SessionStart`, `UserPromptSubmit`, `Notification` (`permission_prompt`) and `Stop` through the real CLI (`$env:TERAX_CLI hook <agent> <event>`), the same command lut's installed hooks run. The bell showed the agent as waiting with a badge, and the tab icon changed. A hook sent from a command that exits at once shows nothing, because the session ends with the process; a real agent stays in the foreground. No real Claude Code or Codex session was run. |
| No AI provider request | Pass: the only non-localhost request was `terax-pty.localhost/poll`, the local PTY transport.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Shell selection        | **Failed, then fixed by E05-21.** With saved Spaces the main window never loaded the preferences, so a new tab ignored `terminalShell`. After the fix: Windows PowerShell 5.1 and pwsh 7.6.9 both honoured, including a change made while the window was open. WSL: switching the space to Ubuntu opens `/bin/bash` in `/home/lucas`.                                                                                                                                                                                                                        |
| Saved Spaces           | Pass: the user's space and the fixture come back with their spaces, tabs, split, cwds and roots. The active tab of a space that was not active at startup is not restored when switching to it; the saved index is kept on disk. This was the behaviour before E05 too.                                                                                                                                                                                                                                                                                      |

Notes:

- The settings window cannot open in this setup: WebView2 refuses a second webview whose browser arguments differ from
  the main one's. The shell preference was changed by calling `setTerminalShell` from `modules/settings/store.ts`, the
  setter the settings section uses.
- The criterion names `lut-spaces.json`; the file is still `terax-spaces.json` until E02-06 renames the app data.
