# Future work (not planned for the current milestone)

Everything in the `## Not planned` section of `plan.md` that is postponed (not already done) is collected here, so a
future planning round can pick it up with the same process (analysis -> plan.md -> GitHub issues).
`validate.mjs` fails if a postponed "Not planned" id is missing from this file.

Also to review in a future round (no proposal item yet):

- A lut Nix package. Terax's flake is removed in Phase 0 (user decision 21e).
- An in-app licenses screen (proposal §14.3 calls it "futura"; IR-97). `public/licenses/terax.txt` and the terminal licenses
  are already bundled (E03-02); third-party notices come with the release pipeline (E25). Not a harvested proposal item, so it
  cannot be listed in plan.md "Not planned".
- Agent task worktrees/checkpoints as a lut feature. Terax's unwired backend is removed in Phase 0 and can be recovered from
  git history (commit 611f9e3, `src-tauri/src/modules/git/`; user decision 23).
- Switching the package manager from pnpm to bun (user preference). Needs a new lockfile (dependency versions may move),
  translating the pnpm workspace, `catalog:`, overrides, `minimumReleaseAge` and `allowBuilds`, and updating the Tauri
  `before*Command`s, scripts and `.docs/development/build.md`.

## Multiwindow

Several windows: PTY/renderer ownership per window, moving tabs/panes between windows, per-window project layouts, geometry restore per monitor. Needs a design of PTY and canvas ownership first (proposal 5.10, Phase 7).

- `TER-010` — P2 Mover sesiones entre ventanas
- `PRJ-012` — P2 Ventanas múltiples por proyecto
- `UX-012` — P2 Interfaz visual de edición de layout y gestión de ventanas
- `5.10:13` — Multiwindow | Alto | Fase posterior | PTY/webview/renderer por ventana
- `F7:1` — definir ownership de PTY/renderer por ventana
- `F7:2` — creación/cierre de ventanas
- `F7:3` — transferencia de tab/pane si se decide
- `F7:4` — restauración de geometría por monitor
- `F7:gate` — ventanas se recuperan sin crear sesiones huérfanas, sin leaks visibles y sin errores de foco/propiedad de PTY.

## Agent activity view

A view of an agent session's tools, subagents, errors and events. Not wanted for now: agent CLIs such as Claude Code
already show it (decision 27).

- `AGT-008` — P1 Vista opcional de actividad: herramientas, subagentes, errores y eventos
- `9.6:4` — Vista `Agent Activity` colapsada por defecto, accesible mediante atajo o menú de tab.
- `F5:5` — Timeline opcional y subagentes cuando la CLI/fuente ofrece datos.

## Agent permission approval from the UI

Approve/deny agent permission requests from lut, only with a secure protocol and fallback (proposal 9.8). The backend decision broker and the frontend client already exist and stay dormant.

- `AGT-011` — P2 Aprobar/rechazar permisos desde UI, sólo con protocolo seguro y fallback
- `9.8:1` — Se muestra acción concreta, comando y contexto completo (cuando sea seguro), nunca un botón ambiguo.
- `9.8:2` — Se verifica relación exacta con sesión, pane, PTY y ventana.
- `9.8:3` — La respuesta sólo afecta la solicitud vigente; nonce/ID y timeout impiden aprobar una solicitud distinta.
- `9.8:4` — Si UI no está disponible o vence el plazo, fallback al flujo normal del agente, sin aprobación silenciosa.
- `9.8:5` — Nunca almacenar un estado “always allow” sin una política explícita y segura.
- `9.8:6` — Registrar auditoría local de aprobación/rechazo de forma acotada.
- `9.8:7` — Confirmar las garantías de autorización ofrecidas por cada CLI; no falsificar respuestas.
- `agents/decision-client` — Frontend permission-decision client (agent_decisions_ready / agent_decision_respond)

## Agent adapter plugins

A plugin system for additional agent adapters. The existing built-in adapters (Claude, Codex, Gemini, Pi, OpenCode, Grok) are kept in v1.

- `AGT-014` — P2 Plugins/adaptadores de agentes adicionales

## Schema migrations

lut has no releases and no user data: until the first release, a change to a stored shape drops the old data instead
of migrating it. Versioned stores (`schemaVersion`), ordered migrations and rollback come with the first release that
must keep data across an update.

- `PRJ-014` — P1 Migraciones de esquema
- `6.5:5` — Las migraciones de esquema requieren `schemaVersion` y transformaciones probadas.
- `F4:2` — Migrar `Spaces` actual conservando datos. Not needed: there is no Spaces data to keep.
