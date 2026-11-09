# Network audit (E02-13)

Every outbound network call in lut's code, who starts it and its fate. Checked on 2026-11-09 against `master` after
E05 (BYOK AI removed) and E02-06/E02-07, with:

```sh
git grep -n -E "fetch\(|reqwest|XMLHttpRequest|new WebSocket|EventSource|sendBeacon|https?://" -- src src-tauri/src src-tauri/crates
git grep -n -E "openUrl\(|@import url|fonts\.googleapis|cdn\.|unpkg|jsdelivr|telemetry|analytics"   -- src src-tauri/src
```

Comments, test fixtures (`*.test.ts`, Rust `#[cfg(test)]`), licence files and `localhost`/`127.0.0.1` addresses are
left out of the tables; the last section lists what was checked and found absent.

## Requests made by the app

| Call                                    | File:line                                                                         | Target                                                 | Started by                                                          | Decision                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| PTY output stream                       | `src/modules/terminal/lib/pty-bridge.ts:29`                                       | `lut-pty://` custom protocol, served in process        | every terminal                                                      | keep; local only (protocol name renamed by E04-12)                 |
| Notification sound                      | `src/modules/agents/lib/sound.ts:7`                                               | `/notification.mp3`, a bundled asset                   | agent notification                                                  | keep; local only                                                   |
| Web preview reachability probe          | `src/modules/preview/PreviewAddressBar.tsx:200`                                   | the URL the user typed (`no-cors` GET, 900 ms timeout) | user, in the preview address bar                                    | keep; user-initiated                                               |
| Web preview page                        | `src/modules/preview/PreviewPane.tsx` (iframe, CSP `frame-src http: https:`)      | the URL the user typed                                 | user                                                                | keep; user-initiated                                               |
| `git fetch` / `pull --ff-only` / `push` | `src-tauri/src/modules/git/commands.rs:159,172,185` → `operations.rs:972,988,474` | the repository's own remotes, through the user's `git` | user, buttons in source control (`useSourceControl.ts:467`)         | keep; user-initiated                                               |
| Automatic `git fetch` on refresh        | `src/modules/source-control/useSourceControl.ts:382`                              | the repository's remotes                               | nobody: every caller passes `remote: 'never'`, the default (`:424`) | keep; dormant, no automatic network call                           |
| Bench report                            | `src/bench/driver.ts:98`, `early.ts:66`, `report.ts:27,40`                        | the lab orchestrator on `localhost`                    | bench builds only (`LUT_BENCH=1`)                                   | keep; stripped from product builds (`src/app/dist-budget.test.ts`) |

## Links opened in the system browser

These never run inside lut: `@tauri-apps/plugin-opener` hands the URL to the OS, and only on a user click.

| Link                                                  | File:line                                                                                                                    | Target                        | Decision                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| About: repository, new issue                          | `src/settings/sections/AboutSection.tsx:10,66,77,81`                                                                         | `github.com/lucas-labs/lut`   | lut's repository (E04-03); the Terax website link was removed |
| Links in terminal output, Markdown and external links | `src/modules/terminal/lib/terminalLinks.ts:72`, `src/modules/editor/lib/markdownExtras.ts:83`, `src/lib/external-link.ts:13` | whatever the content links to | keep; user click                                              |
| Language server docs                                  | `src/modules/lsp/lib/presets.ts:34-252`, `LspStatusPill.tsx:165`, `src/settings/components/LspInstallDialog.tsx:99`          | each server's documentation   | keep; user click                                              |
| Commit or file on the remote's website                | `src/modules/git-history/GitHistoryPane.tsx:787` (URL from `lib/remoteWebUrl.ts:58`)                                         | the repository's host         | keep; user click                                              |
| Open the preview in the browser                       | `src/modules/preview/PreviewAddressBar.tsx:173`, `PreviewPane.tsx:97`                                                        | the previewed URL             | keep; user click                                              |

The LSP install dialog (`LspInstallDialog.tsx:38`) only copies an install command to the clipboard; it runs nothing.

## Checked and absent

- **Terax services:** the updater (E01-02) and the BYOK AI with its `HTTP-Referer: https://terax.ai` / `X-Title: lut`
  headers (E05, #358) are gone. `git grep -n "terax.ai" src src-tauri/src` returns nothing, and the About links point to lut's
  repository (E04-03).
- **HTTP clients in Rust:** none in lut's code; `reqwest` is in `Cargo.lock` only as a dependency of `tauri` itself.
- **Telemetry, analytics, crash reporting:** none (the only "sentry" match is a file-icon rule for `.sentryclirc`).
- **CDN, remote scripts or fonts:** none. The CSP allows `script-src 'self' 'wasm-unsafe-eval'` and
  `font-src 'self' data:`; every font is bundled under `src/assets/fonts/`.
- **Remote connections allowed by the CSP:** `connect-src` keeps `https:` and `http://localhost:*`, used by the preview
  probe; nothing else in the code connects out.
