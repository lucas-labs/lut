<p align="center"><img src="public/logo.png" height="96" alt="lut"></p>

<p align="center">𝐥𝐮𝐭 - opinionated terminal that is actually a terminal</p>

<p align="center">
  <a href="https://github.com/lucas-labs/lut/releases"><img alt="Release" src="https://img.shields.io/github/v/release/lucas-labs/lut?include_prereleases&style=flat-square&label=release&labelColor=161a19&color=b8e65a"></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platforms-windows%20%7C%20macos%20%7C%20linux-262c2a?style=flat-square&labelColor=161a19">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/lucas-labs/lut?style=flat-square&labelColor=161a19&color=262c2a"></a>
</p>

<p align="center">
  <a href="https://github.com/lucas-labs/lut/releases">Download</a> •
  <a href=".docs/development/build.md">Build</a> •
  <a href=".docs/plan/plan.md">Roadmap</a>
</p>

<br>

<p align="center"><img src=".docs/media/hero.png" alt="lut with lazygit on top and a shell below"></p>

<br>

## Why lut?

Somewhere along the way terminals got ambitious. They grew chat panels, notebooks, accounts, onboarding screens and a
few hundred megabytes. The terminal became _a feature_ of the app.

`lut` goes the other way. It opens your shells and gets out of the way. Files, agents, Git and an editor are still there, folded in a drawer, until you actually want them.

## What it does

### Your shells

`lut` detects the shells on your machine and turns them into profiles, Windows Terminal style: shell, arguments,
starting folder, environment and looks.

<p align="center"><img src=".docs/media/new-tab.png" alt="The new tab menu with the detected profiles"></p>

### Spaces

A space is a set of tabs and splits for one thing you work on: a repo, a server, a project, whatever. `lut` keeps them there for you, until you don't need them anymore.

### Tabs, your way

Horizontal tabs, vertical tabs, or a compact rail that keeps every pixel for the terminal (that's how I like it, btw).
Split any tab into multiple panes, right or down, and hide the sidebars when you don't need them.

<p align="center"><img src=".docs/media/vertical-tabs.png" alt="Vertical tabs with Neovim"></p>

<p align="center"><img src=".docs/media/compact.png" alt="The compact rail with Claude Code and a shell side by side"></p>

### AI Integration

`lut` doesn't ship its own AI chat. There are other tools for that and they are not called "terminals". `lut` watches the coding agents you already run in terminals (Claude Code, Codex, Gemini, Pi, OpenCode, Grok) and tells you when one finishes or needs you: a toast, a mark on its tab and space, and a notification if you like to be disturbed.

<p align="center"><img src=".docs/media/agents.png" alt="The notification bell with Claude Code waiting for input"></p>

<p align="center"><img src=".docs/media/agents-toast.png" alt="A toast: Claude Code needs your input"></p>

### Everything one shortcut away

Assign your own shortcuts to any action, and the command palette is always there to find commands, spaces, tabs and files.

<p align="center"><img src=".docs/media/command-palette.png" alt="The command palette"></p>

### Tools in the drawer

Source control, a file explorer, an editor with LSP and previews: there when you open them, out of your way when you don't.

<p align="center"><img src=".docs/media/source-control.png" alt="Source control and a diff, opened from the rail"></p>

### Make it yours

17 built-in themes, light and dark, plus your own: create one in Settings or import a `.lut-theme` file.

<p align="center"><img src=".docs/media/themes.png" alt="lut in Catppuccin, Claude, Gruvbox, Neutral, Rosé Pine and Everforest"></p>

<p align="center"><img src=".docs/media/themes-settings.png" alt="The theme gallery in Settings"></p>

### Under the hood

- [Tauri 2](https://v2.tauri.app/): a Rust backend and a React + TypeScript frontend.
- [Ghostty](https://ghostty.org/)'s terminal core compiled to WebAssembly, drawn by a pooled WebGPU/WebGL renderer
  (`packages/ghostty-core`). TUIs like lazygit and Neovim just work.
- [portable-pty](https://crates.io/crates/portable-pty) for PTY sessions (ConPTY on Windows).

## What it won't do

- Ask you to log in, make an account or pay for something you don't need.
- Turn your commands into blocks, cells or notebooks. It's just a terminal.

## Install

`lut` is still in early development. Grab the latest release from [Releases](https://github.com/lucas-labs/lut/releases) and run the installer for your OS.

| OS      | Download                                      |
| ------- | --------------------------------------------- |
| Windows | `lut_<version>_x64-setup.exe`                 |
| macOS   | `lut_<version>_aarch64.dmg` or `_x64.dmg`     |
| Linux   | `.AppImage`, `.deb` or `.rpm` (x64 and arm64) |

`lut` updates itself from its own releases. The Windows installer isn't code-signed yet, so SmartScreen may warn you
the first time.

> [!WARNING]
> I'm stuck on Windows and haven't tested macOS or Linux yet. If you run into issues, please open an issue.
> And if you don't, please open an issue anyway: I want to know if it works for you on your OS.

## Credits

`lut` started from the source code of [Terax](https://github.com/crynta/terax-ai), imported at commit
[`a2c0877d`](https://github.com/crynta/terax-ai/tree/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9)
(Apache-2.0, Copyright 2026 Crynta). Thanks to Crynta and the Terax contributors for the terminal engine `lut` builds
on.

## License

`lut` is licensed under the [Apache License 2.0](LICENSE). [`NOTICE`](NOTICE) records `lut`'s copyright and Terax's
attribution; bundled third-party components and their licenses are listed in
[`.docs/licensing.md`](.docs/licensing.md).
