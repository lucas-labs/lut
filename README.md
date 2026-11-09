# lut

A cross-platform desktop terminal built around projects, profiles and CLI coding agents. The terminal takes the
centre of the window; editor, Git and other tools stay secondary and open only when you ask for them.

> [!NOTE]
> lut started from the source code of [Terax](https://github.com/crynta/terax-ai), imported at commit
> [`a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9`](https://github.com/crynta/terax-ai/tree/a2c0877d7fe81ed7b9560c3043d4b6c1ad9783c9)
> (Apache-2.0, Copyright 2026 Crynta). Thanks to Crynta and the Terax contributors for the terminal engine lut builds
> on. The commit is recorded only as provenance and attribution: lut is developed independently and does not sync
> with Terax.

lut is in early development. The scope and the decisions behind it are in [`.docs/proposal.md`](.docs/proposal.md)
(Spanish), and the work is planned in [`.docs/plan/plan.md`](.docs/plan/plan.md).

## Technical base

- [Tauri 2](https://v2.tauri.app/): a Rust backend and a React + TypeScript frontend.
- [Ghostty](https://ghostty.org/)'s terminal core compiled to WebAssembly, drawn by a pooled WebGPU/WebGL renderer
  (`packages/ghostty-core`).
- [portable-pty](https://crates.io/crates/portable-pty) for PTY sessions (ConPTY on Windows).

lut is not compatible with Terax: it has its own identifier, data directory, settings, CLI and agent hooks, and never
reads or changes Terax's ([ADR-001](.docs/decisions/0001-technical-base.md)).

## First run

You need Node.js ≥ 22, Rust stable and Tauri's prerequisites for your OS; the full list is in
[`.docs/development/build.md`](.docs/development/build.md).

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm tauri dev
```

The first `pnpm tauri dev` compiles the whole Rust workspace and takes a while; later runs are incremental.
`build.md` also covers release builds, tests and CI.

## Contributing

- Work starts from an issue: every issue comes from [`.docs/plan/plan.md`](.docs/plan/plan.md) (format in
  [`.docs/plan/README.md`](.docs/plan/README.md)).
- One issue, one concern, one branch named `<type>/<issue-id>-<slug>`; refactors stay apart from behaviour changes.
- Open the PR with the [PR template](.github/pull_request_template.md): goal, files changed, risks, the tests you ran
  and their results.
- How changes reach `master`, commit format and the quality gate: [change control](.docs/development/change-control.md).
- lut has no upstream; how code from Terax is treated: [provenance and change policy](.docs/development/provenance.md).
- Decisions that change a contract, a persisted model or a platform constraint need an
  [ADR](.docs/decisions/README.md).

## License

lut is licensed under the [Apache License 2.0](LICENSE). [`NOTICE`](NOTICE) records lut's copyright and Terax's
attribution; bundled third-party components and their licenses are listed in
[`.docs/licensing.md`](.docs/licensing.md).
