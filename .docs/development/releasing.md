# Releasing lut

How a lut release is made, published and picked up by an installed lut. It is the design of E25 (release pipeline and
lut updater): each section names the issue that builds it. Decisions taken in E25-01; the build commands themselves
live in [build.md](build.md).

## Identities and channels

lut runs under two identities. An installed lut follows one of two update channels; a development build never
updates and never shares anything with an installed lut.

| Identity  | Identifier           | Built by                    | Updates from                    |
| --------- | -------------------- | --------------------------- | ------------------------------- |
| Installed | `dev.lucode.lut`     | the release workflow, a tag | its channel: `stable` or `beta` |
| Dev       | `dev.lucode.lut.dev` | `pnpm tauri dev` on a clone | never                           |

- **Channel.** `stable` gets releases `vX.Y.Z`; `beta` gets those and the pre-releases `vX.Y.Z-beta.N`. It is a
  setting of the installed app (E25-05), not a second app: switching channel keeps the same install and data.
- **What the identifier separates.** The app's config folder (settings, profiles, spaces), the WebView2/WebKit data
  (its local storage) and lut's runtime folder under the user cache (the control descriptor that `lut-cli` talks to,
  the shell integration). Today the dev build uses the product identifier and the runtime folder is a fixed name, so a
  dev build and an installed lut read the same settings and overwrite each other's control descriptor. The dev
  identity is added before the first release (E25-10).
- **Agent hooks** are shared on purpose: a hook runs `$LUT_CLI` from the pane that started the agent, so the same
  hook reaches whichever lut owns that pane.

## Versions and tags

lut follows semver. The version lives in:

| File                        | Field                                  |
| --------------------------- | -------------------------------------- |
| `package.json`              | `version`                              |
| `src-tauri/Cargo.toml`      | `package.version`, `workspace.package` |
| `src-tauri/Cargo.lock`      | the workspace crates' entries          |
| `src-tauri/tauri.conf.json` | `version` (becomes `../package.json`)  |

`src-tauri/tauri.windows.conf.json` sets `wix.version` only for the MSI, which lut stops building (see
[Artifacts](#artifacts)); MSI versions cannot carry a pre-release tag, so it goes with it.

A release starts with `pnpm release <version>` (E25-02), on an up-to-date, clean `master`:

1. checks the version is `X.Y.Z` or `X.Y.Z-beta.N` and newer than the current one; any other form (`-rc.1`,
   `-alpha`) is refused;
2. writes it into the files above and refreshes `Cargo.lock` (`cargo update --workspace`);
3. commits `release: 🔖 vX.Y.Z` and creates the signed tag `vX.Y.Z`.

Pushing the commit and the tag is left to the person releasing (`git push origin master vX.Y.Z`): nothing leaves the
machine until they decide. A `vX.Y.Z-beta.N` tag is a beta and a `vX.Y.Z` tag is stable.

The release workflow's first job applies the same rule: it fails the run for a tag of any other form, or when the tag
and the versions in the files disagree.

## How a release runs

```mermaid
sequenceDiagram
    autonumber
    actor M as Maintainer
    participant R as master + tag
    participant W as release workflow
    participant S as SignPath
    participant G as GitHub Release (draft)
    participant U as updater release

    M->>R: pnpm release 0.10.0, push commit and tag v0.10.0
    R->>W: tag push starts the workflow
    W->>W: check tag = versions
    par one job per target
        W->>W: Windows x64: build NSIS
        W->>W: macOS arm64 and x64: build dmg + app.tar.gz
        W->>W: Linux x64 and arm64: build AppImage, deb, rpm
    end
    W->>S: Windows installer
    S-->>M: approval request
    M-->>S: approve
    S-->>W: Authenticode-signed installer
    W->>W: sign every updater bundle (minisign)
    W->>W: build latest.json once, from every target's signature
    W->>G: upload installers, signatures, latest.json
    M->>G: review and publish
    G->>W: release published starts the manifest job
    W->>U: replace stable.json (stable only) and beta.json, when newer
```

- **Targets.** Windows x64; macOS arm64 and x64 (two builds); Linux x64 and arm64, on the oldest supported Ubuntu
  runner so the glibc requirement stays low. Each job builds `lut-cli` for its own target (`LUT_CLI_TARGET`, read by
  `scripts/build-cli.mjs`), so an x64 macOS bundle never carries an arm64 sidecar.
- **Signing order.** Authenticode changes the installer's bytes, so the updater signature is made after it, over the
  signed file. The signing keys are CI secrets; the public updater key is in `tauri.conf.json`.
- **One manifest job.** Every target job uploads its bundles and signatures as workflow artifacts; a single job after
  all of them writes `latest.json`. Terax let each job merge itself into the release's `latest.json` and then had to
  patch it in a final job, because parallel uploads overwrote each other.
- **Draft first.** The workflow never publishes. The release stays a draft until it is reviewed and published by
  hand; only then does an installed lut see it.
- **AppImage and Wayland.** Terax removed the bundled `libwayland-*` libraries from the AppImage and re-signed it: the
  copies from the build runner were older than the Mesa of recent distributions and broke EGL. lut keeps that step.

The workflow, its matrix and the manifest job are E25-02; the third-party notices it bundles are E25-03.

## Artifacts

| OS      | Download                 | Used by the updater       | Notes                                                                                                                                            |
| ------- | ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows | NSIS installer (`.exe`)  | the same `.exe`           | per-user install; Authenticode-signed through SignPath. No MSI: it needs an administrator and no betas.                                          |
| macOS   | `.dmg` (arm64, x64)      | `lut.app.tar.gz`          | the `.dmg` is only for the first install. Not signed with an Apple certificate yet: the first launch needs right-click > Open (see `future.md`). |
| Linux   | AppImage, `.deb`, `.rpm` | the same file, per format | the updater replaces an AppImage in place; a `.deb` or `.rpm` update asks for the password to install.                                           |

Every file the updater uses has a `.sig` next to it: the updater signature that an installed lut checks before
installing. `latest.json` points at those files, never at the `.dmg`.

## The update manifests

An installed lut reads one fixed URL per channel, both assets of a permanent release tagged `updater`:

- `https://github.com/lucas-labs/lut/releases/download/updater/stable.json`
- `https://github.com/lucas-labs/lut/releases/download/updater/beta.json`

Each is a copy of a release's `latest.json`. Publishing a release replaces a manifest only when the release is newer
than the version that manifest holds, so publishing an older draft late never moves a channel back:

| Published release     | `stable.json`     | `beta.json`       |
| --------------------- | ----------------- | ----------------- |
| stable `v0.10.0`      | replaced if newer | replaced if newer |
| beta `v0.11.0-beta.1` | unchanged         | replaced if newer |

So the beta channel also gets every stable release, and neither channel ever goes back to an older version. Terax had one channel
and used `releases/latest/download/latest.json`, which GitHub resolves to the newest non-pre-release; a second channel
needs a URL of its own, and one mechanism for both keeps them alike.

## How an installed lut updates

```mermaid
flowchart TD
    start([lut starts, or Check now]) --> enabled{updates enabled?}
    enabled -- no --> stop([no network request])
    enabled -- yes --> due{last check older than the interval,<br/>or Check now?}
    due -- no --> stop2([wait])
    due -- yes --> fetch[fetch the channel's manifest]
    fetch --> newer{newer than this version?}
    newer -- no --> uptodate([up to date])
    newer -- yes --> dialog[update dialog: version and notes]
    dialog -- later --> stop3([ask again next check])
    dialog -- install --> download[download this OS's bundle]
    download --> verify{signature valid<br/>for lut's public key?}
    verify -- no --> error([error shown, nothing installed])
    verify -- yes --> install[install and restart]
```

- **Off means off.** With updates disabled lut makes no update request at all (E25-05).
- **Channel and throttle.** The channel picks the manifest URL at runtime; the time of the last check is stored under
  a lut key (E25-05). The plugin and its configuration (endpoint, public key, the `updater:default` capability) are
  E25-04.
- **The dialog and the settings controls** (channel, enable, Check now) are E25-06, following lut's existing dialog
  and settings patterns.
- **Proof.** E25-07 updates an old build to a test release, and shows that a bundle with no signature or with another
  key's signature is refused, and that the only host contacted is lut's.

## Secrets

The workflow reads these repository secrets; their values never appear in the repository or in logs.

| Secret                               | Used for                                     |
| ------------------------------------ | -------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | signing the updater bundles                  |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | its password                                 |
| `SIGNPATH_API_TOKEN`                 | submitting the Windows installer for signing |

## Issues

| Part                                         | Issue  |
| -------------------------------------------- | ------ |
| These decisions and this document            | E25-01 |
| Dev identity, isolated from an installed lut | E25-10 |
| `pnpm release`, workflow, manifests          | E25-02 |
| Third-party notices in every bundle          | E25-03 |
| Updater plugin wired to lut only             | E25-04 |
| Channel, disable and throttle                | E25-05 |
| Update dialog and settings controls          | E25-06 |
| End-to-end proof                             | E25-07 |
| Nix package proposal                         | E25-08 |
