# Licensing

lut is licensed under Apache-2.0, the same license as Terax, from which it was imported (proposal §14.3). This page
records how lut meets the obligations it inherits and every third-party component it bundles.

## lut and Terax

| File                        | Content                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `LICENSE`                   | The Apache-2.0 text, kept verbatim from Terax, including Terax's copyright line in the appendix.           |
| `NOTICE`                    | lut's copyright (lucode), the Terax attribution with the origin commit, and the modification notice.       |
| `public/licenses/terax.txt` | Terax's provenance, copyright and modification notice followed by the Apache-2.0 text; ships with the app. |
| `README.md`                 | The `> [!NOTE]` crediting Terax, with the repository link and the origin commit (proposal §14.3, ADR-001). |

Terax shipped no `NOTICE` file, so there are no upstream notices to carry over. The Apache-2.0 obligations
(§4) are met as follows:

- **§4(a) copy of the license:** `LICENSE` in the repository; `public/licenses/terax.txt` in every build.
- **§4(b) modified files:** `NOTICE` and `public/licenses/terax.txt` state that the files derived from Terax were
  modified by lut; the git history records each change. Imported files carry no per-file license headers, so there
  is no header to annotate.
- **§4(c) attributions:** Terax's copyright stays in `LICENSE`, `NOTICE` and `terax.txt`; third-party license files
  are kept as received (below).
- **§4(d) NOTICE:** not applicable upstream; lut's own `NOTICE` passes the Terax attribution on to anyone who
  redistributes lut.

The installer's `copyright` and `publisher` fields are lucode (E04-01).

## Bundled third-party components

| Component                                                                                                                | Where in the repo                                                           | License                                              | License file                                                                                      | Ships as                                            |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Ghostty terminal core (compiled to WASM)                                                                                 | `packages/ghostty-core/adapted/` (`*.wasm`, `wasm/`)                        | MIT, Mitchell Hashimoto and Ghostty contributors     | `packages/ghostty-core/adapted/LICENSE.ghostty`                                                   | bundle resource `licenses/terminal/ghostty.txt`     |
| restty render-state bridge (adapted)                                                                                     | `packages/ghostty-core/adapted/wasm/`, `packages/ghostty-core/lib/adapted/` | MIT, Wiedy Mi                                        | `packages/ghostty-core/adapted/LICENSE.restty`                                                    | bundle resource `licenses/terminal/restty.txt`      |
| ghostty-web (TypeScript terminal package)                                                                                | `packages/ghostty-core/`                                                    | MIT, Coder                                           | `packages/ghostty-core/LICENSE`                                                                   | bundle resource `licenses/terminal/ghostty-web.txt` |
| xterm.js-derived WebGL renderer code                                                                                     | `src/modules/terminal/ghostty/webgl/`                                       | MIT, the xterm.js authors, SourceLair, C. Jeffrey    | `src/modules/terminal/ghostty/webgl/LICENSE.xterm-js`                                             | bundle resource `licenses/terminal/xterm-js.txt`    |
| Nerd Font Icons fonts (Nerd Fonts glyphs from the patched JetBrains Mono)                                                | `src/assets/fonts/*.woff2`                                                  | OFL-1.1; glyph sets under Apache-2.0, CC BY 4.0, MIT | `public/licenses/nerd-font-icons.txt` (sources: `src/assets/fonts/OFL.txt`, `LICENSE.nerd-fonts`) | `dist/licenses/nerd-font-icons.txt`                 |
| Source Code Pro, variable (`@fontsource-variable/source-code-pro` 5.3.1)                                                 | npm dependency, bundled by Vite                                             | OFL-1.1, Adobe                                       | `public/licenses/source-code-pro.txt`                                                             | `dist/licenses/source-code-pro.txt`                 |
| Agent notification sound: "Bleep" by gekofish ([Freesound 716462](https://freesound.org/people/gekofish/sounds/716462/)) | `public/notification.mp3`                                                   | CC0 1.0 (public domain dedication)                   | none required                                                                                     | `dist/notification.mp3`                             |

`src/assets/fonts/README.md` explains how the symbol fonts were built and which icon sets they carry;
`nerd-font-icons.txt` reproduces the notices those sets require (the Apache-2.0 text for Material Design Icons, the
CC BY 4.0 attributions for Codicons and Font Awesome Free). `src/lib/nerdFontIcons.test.ts` checks them.

The app icons and logo (`src-tauri/icons/`, `public/logo.png`) are lut's own artwork, built by `pnpm icons` from
`src-tauri/icons/source/`; they replaced Terax's in E12-02. Terax's notification sound had no recorded source, so it
was replaced by the CC0 one above.

## How the license files ship

- **`public/licenses/*`**: Vite copies `public/` into `dist/`, which Tauri embeds in the app, so every build carries
  them at `licenses/<file>`. They are not referenced by code yet; a licenses screen can link them later.
- **`bundle.resources`** in `src-tauri/tauri.conf.json`: the four terminal licenses are copied next to the executable
  under `licenses/terminal/`.

## Rust and npm dependencies

The licenses of the Rust crates and npm packages compiled into lut (mostly MIT and Apache-2.0) are not collected into
the bundle yet. Generating a third-party notices file for them is deferred to the release pipeline in F7
(decision 21g, E25-03), which writes `public/licenses/third-party.txt`.

## Checking a build

After `pnpm tauri build`, the Windows bundle carries the license files in two places: `dist/licenses/` is embedded in
the executable, and the installer copies `licenses/terminal/*.txt` into the install directory. `pnpm build` alone is
enough to check `dist/licenses/`.
