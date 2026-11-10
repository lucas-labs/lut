# Building lut

How to build and run lut from a clean checkout. Windows 11 is the primary platform; macOS and Linux follow the
same steps once their prerequisites are installed.

> The identifier is `dev.lucode.lut` (E02-06); the app package, executable and `productName` are `lut` (E02-07); the
> CLI sidecar is `lut-cli` and the child-process variables are `LUT_*` (E02); internal crates, modules and protocol
> names are lut too (E04-12).

## Toolchain

| Tool      | Version                  | Notes                                                                                     |
| --------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| Node.js   | ≥ 22                     | `engines.node` in `package.json`                                                          |
| pnpm      | 11.9.0                   | pinned by `packageManager`; install with `corepack enable` (do not install pnpm globally) |
| Rust      | stable, MSVC on Windows  | edition 2021; no `rust-toolchain` file, any current stable works                          |
| Tauri CLI | 2.12 (`@tauri-apps/cli`) | installed as a dev dependency; run it as `pnpm tauri …`                                   |
| Zig       | 0.16.0                   | **optional**: only to rebuild the committed Ghostty WASM (see below)                      |
| Python 3  | any 3.x                  | **optional**: only for the profiling scripts (all macOS-only today)                       |

`pnpm-workspace.yaml` sets `minimumReleaseAge` (3 days, strict): pnpm refuses package versions published less
than 3 days ago. Keep that in mind when adding or bumping dependencies.

### Per-OS prerequisites

These are Tauri's own prerequisites: <https://v2.tauri.app/start/prerequisites/>.

- **Windows**: Microsoft C++ Build Tools ("Desktop development with C++": MSVC + Windows SDK) and the WebView2
  runtime, which ships with Windows 11. Install Rust with `rustup` and use the `stable-x86_64-pc-windows-msvc`
  toolchain.
- **macOS**: Xcode Command Line Tools (`xcode-select --install`). The bundle targets macOS 13.0+.
- **Linux**: webkit2gtk 4.1 and gtk3 development packages plus the usual build tools. On Debian/Ubuntu:
  `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.

## First build

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm tauri dev
```

On Windows a cold `pnpm install` can take several minutes, and the first `pnpm tauri dev` compiles the whole
Rust workspace. Later runs are incremental.

## Commands

| Purpose                                   | Command                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Install dependencies                      | `pnpm install --frozen-lockfile`                                                                       |
| Run the app (dev)                         | `pnpm tauri dev`                                                                                       |
| Release build + installers                | `pnpm tauri build`                                                                                     |
| Frontend only (browser, no Tauri backend) | `pnpm dev` (Vite on port 1420, strict)                                                                 |
| Frontend production build                 | `pnpm build` (`tsc && vite build` into `dist/`)                                                        |
| Type check                                | `pnpm check-types`                                                                                     |
| Lint / format check                       | `pnpm lint` (ESLint, `src/`) · `pnpm format:check` (Prettier, `src/**/*.{ts,tsx}` and `.docs/**/*.md`) |
| Frontend tests                            | `pnpm test` (Vitest)                                                                                   |
| Rust tests                                | `cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace`                                 |
| Clippy                                    | `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings`  |
| Rust format                               | `cargo fmt --manifest-path src-tauri/Cargo.toml --all`                                                 |
| Unused files/exports                      | `pnpm knip`                                                                                            |
| Bundle checks                             | `pnpm check:dist` · `pnpm size` (after `pnpm build`) · `pnpm analyze:eager`                            |

`src-tauri/Cargo.toml` is a Cargo workspace with the app plus `crates/lut-cli` and
`crates/lut-control-protocol`; `--workspace` covers all three.

### CLI sidecar prebuild

The app bundles the `lut-cli` binary (crate `lut-cli`) as a Tauri sidecar (`bundle.externalBin` in
`tauri.conf.json`). Tauri expects it at `src-tauri/binaries/lut-cli-<target-triple>[.exe]` before it builds the app, so:

- `pnpm tauri dev` runs `pnpm build:cli:dev && pnpm dev` (`beforeDevCommand`);
- `pnpm tauri build` runs `pnpm build:cli && pnpm build` (`beforeBuildCommand`).

`scripts/build-cli.mjs` runs `cargo build --locked -p lut-cli --bin lut-cli` (with `--release` for `build:cli`) for the host
triple reported by `rustc -vV`, or for `LUT_CLI_TARGET` / `CARGO_BUILD_TARGET` when set, and copies the result
into `src-tauri/binaries/` (ignored by git). Running the Rust tests or clippy directly does not need it.

### Ghostty WASM

The terminal core is a WebAssembly build of Ghostty, committed under `packages/ghostty-core/`. A normal build
uses the committed `.wasm` files and does not need Zig.

- `adapted/ghostty-vt.wasm` and `adapted/ghostty-vt-scalar.wasm` (used by the app): Zig 0.16.0, steps in
  `packages/ghostty-core/adapted/UPSTREAM.md`.
- `ghostty-vt.wasm` and `official/` (legacy fork): Zig 0.15.2, steps in `packages/ghostty-core/FORK.md`.

## CI

`.github/workflows/ci.yml` runs on every pull request to `master` and every push to `master`. A push that only touches
`.docs/` or Markdown files skips it; a pull request always starts it (only **changes** runs when it touches nothing
else), so the checks `master` requires always report (E04-09). Its jobs:

- **changes** (Ubuntu): on a pull request, decides which of the others run from the changed files (E01-25). A push
  to `master` runs all of them.
- **frontend** (Ubuntu): `pnpm install --frozen-lockfile`, `lint`, `format:check`, `check-types`, `test`, `build`,
  `knip`.
- **frontend shell tests** (Windows): the Vitest files with a Windows-only path (`quoteShellPath.test.ts` and
  `powershellPrompt.test.ts` with PowerShell, `bashPromptHooks.test.ts` with Git Bash).
- **backend** (Windows): builds the CLI sidecar, then runs `cargo fmt --check`, `cargo clippy -D warnings` and
  `cargo test`.

The Rust tests in CI are the same command as in the table above. The `lut` lib tests take about a minute
(`cargo test --manifest-path src-tauri/Cargo.toml -p lut --lib`).

## Platform-specific scripts

`pnpm-workspace.yaml` sets `shellEmulator: true`: pnpm runs `package.json` scripts with its own cross-platform shell,
so POSIX syntax such as `INSPECT=true vite` (`dev:inspect`, `analyze:bundle`) works the same on Windows.

These `package.json` scripts do not work on Windows:

| Script                                                | Limitation                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `profile:renderer:*`, `profile:app`, `test:ipc:macos` | macOS only (WKWebView, `footprint`, Swift); they exit on other OSes |

Also macOS-only and not wired to `package.json`: `scripts/ghostty-webkit-memory.mjs` and
`scripts/pty-smoke/run.py`. `scripts/renderer-profile/suite.sh` and `scripts/app-lab/export-tree.sh` are POSIX
shell scripts. Everything else (`test:terminal-scaling`, `bench:ghostty`, `profile:ghostty`, `soak:ghostty`)
runs on any OS.

The other way round, `scripts/baseline/measure.ps1` (the performance baseline, see `.docs/testing/baseline.md`) is
Windows-only: it drives the release app through Win32 APIs from PowerShell 7.

## Baseline environment

Toolchain used for the Phase 0 baseline (E01), recorded on 2026-11-08:

|           |                                                       |
| --------- | ----------------------------------------------------- |
| OS        | Windows 11 Pro 10.0.26200 (x86_64)                    |
| Node.js   | 24.19.0                                               |
| pnpm      | 11.9.0 (corepack 0.35.0)                              |
| Rust      | rustc / cargo 1.98.1, `stable-x86_64-pc-windows-msvc` |
| Tauri CLI | 2.12.0                                                |
| Python    | 3.12.7 / 3.14.0                                       |
| Zig       | not installed (not needed)                            |

Cold timings on that machine: `pnpm install --frozen-lockfile` 6m37s (network-bound), `pnpm build:cli:dev` 1m09s,
`pnpm build` 18s, `cargo build --manifest-path src-tauri/Cargo.toml --locked` (debug) 3m45s.
