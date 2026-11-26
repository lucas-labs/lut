# Test results

Manual and end-to-end results that no automated suite covers, newest first. Each entry names its issue, the build
and what was seen.

## E25-07: updater, end to end (2026-11-26, Windows 11)

Whether an installed lut updates from lut's own releases only, and refuses an update its key did not sign
(`.docs/development/releasing.md`).

**Setup**

- `lut_0.1.0-beta.1_x64-setup.exe` from the `v0.1.0-beta.1` release, installed per user
  (`%LOCALAPPDATA%\lut\lut.exe`, identity `dev.lucode.lut`). SmartScreen warned, as expected for an installer without
  Authenticode (E25-11).
- Channel left unset, so it follows the installed version: beta.
- The installed lut was started with `HTTPS_PROXY=http://127.0.0.1:8888`, a local proxy that logged the host of every
  `CONNECT` and decrypted nothing. The updater's requests go through `reqwest`, which honours that variable.

**1. An old build updates to a newer test release: passed**

| Step                                                                 | Seen                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Check now, with `beta.json` at `0.1.0-beta.1`                        | "lut is up to date"                                                   |
| `pnpm release 0.1.0-beta.2`, the tag's workflow, the draft published | `update-manifests` moved `beta.json` to `0.1.0-beta.2`                |
| Check now                                                            | "lut 0.1.0-beta.2 is available"; the dialog opened in the main window |
| Install and restart                                                  | download, the NSIS installer, lut restarted                           |
| After the restart                                                    | `lut.exe` file version `0.1.0-beta.2`                                 |

**2. A bundle with no signature, or signed with another key, is refused: passed**

`beta.json` was replaced by hand for each case, then restored byte for byte from a saved copy (`update-manifests`
would not have restored it: `0.1.0-beta.99` is newer than any release).

| Manifest                                                                                          | Seen                                             | Installed after |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------- |
| `0.1.0-beta.99`, the real beta.2 installer, signed with a throwaway key (`tauri signer generate`) | "Couldn't install the update", a signature error | `0.1.0-beta.2`  |
| `0.1.0-beta.99`, the same installer, empty signature                                              | refused with an error                            | `0.1.0-beta.2`  |

The throwaway key was deleted after the test.

**3. Only lut's endpoint is contacted: passed**

The proxy logged every update check and the download of `0.1.0-beta.2`, from 06:58 to 07:13:

```
CONNECT github.com:443
CONNECT release-assets.githubusercontent.com:443
```

`github.com` serves `releases/download/updater/beta.json` and the bundle URLs, and redirects to
`release-assets.githubusercontent.com`, where GitHub keeps release files: both are GitHub Releases, lut's update
infrastructure. No other host appeared. One connection to `github.com` timed out once (07:11) and the next check
succeeded. The lut the installer restarted did not inherit the proxy, so the two refusals of step 2 were not logged.

**Found**

- "Check now" in Settings opens the update dialog in the main window, behind the Settings window (which stays on top on
  Windows and Linux), so it shows only once Settings is closed. The update flow's UX is to be rethought (for instance,
  the automatic check telling about an update in the notifications instead of a dialog).

**Not covered:** macOS and Linux, which verify signatures with the same plugin code.
