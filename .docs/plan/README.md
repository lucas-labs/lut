# lut development plan — format and tooling

The plan turns `.docs/proposal.md` and the imported Terax code into GitHub epics and issues.
**Completeness is checked by scripts, not by memory**: every proposal item and every Terax file must be
accounted for. Everything in this folder is written in English.

```
.docs/plan/
├── README.md                 this file
├── plan.md                   the plan: ## epics, ### issues (source of truth for GitHub)
├── inventory/
│   ├── partition.json        every tracked file -> exactly one analysis area   (generated)
│   └── proposal-items.json   every coverable item of proposal.md               (generated)
├── analysis/<area>.json      per-area analysis: files -> items with a disposition
└── tools/
    ├── areas.mjs             area definitions (path patterns)
    ├── partition.mjs         builds/validates inventory/partition.json
    ├── proposal-items.mjs    builds inventory/proposal-items.json
    ├── validate.mjs          validates analysis + plan + coverage
    └── lib.mjs               shared helpers (plan parser, mini YAML)
```

Commands (Node ≥ 22, no dependencies):

```sh
node .docs/plan/tools/partition.mjs          # regenerate partition (fails on unassigned/ambiguous files)
node .docs/plan/tools/proposal-items.mjs     # regenerate proposal items
node .docs/plan/tools/validate.mjs           # validate everything; exit 1 on any error
node .docs/plan/tools/validate.mjs --analysis-only
```

Re-run `proposal-items.mjs` and `validate.mjs` whenever `proposal.md` changes: list-item ids are positional.

## Coverage model

Two sources must be fully covered:

1. **Proposal items** (`inventory/proposal-items.json`): requirement ids (`TER-001`…), ADRs (`ADR-001`…),
   phase tasks and gates (`F0:4`, `F0:gate`, `F7:auto-actualizacion-de-lut`), and list items / table rows /
   whole sections of the harvested sections (`8.4:3`, `13.2:7`, `9.3`, `16:12`…).
2. **Inventory items** (`analysis/<area>.json`): every tracked file of an area belongs to exactly one item;
   each item has a disposition.

An item is covered when at least one issue lists it in `covers`. An item may instead be listed in the
`## Not planned` section of `plan.md` with a reason. Inventory items with disposition `keep` need no issue.
Covering and "Not planned" are mutually exclusive.

## Analysis file format (`analysis/<area>.json`)

```json
{
  "area": "agents",
  "items": [
    {
      "id": "agents/hook-installer",
      "title": "Hook installer for Claude/Codex settings",
      "paths": ["src-tauri/src/modules/agent.rs", "src/modules/control/lib/hooksConfig.ts"],
      "disposition": "adapt",
      "rationale": "Keep the installer; rename identifiers, add preview/diff and selective uninstall.",
      "couplings": ["backend-core/pty-session (TERAX_PANE_ID env)", "ai/... (none)"],
      "risks": "Must not touch third-party hooks in ~/.claude/settings.json."
    }
  ],
  "notes": "Free text: cross-area findings, open questions."
}
```

- `id`: `<area>/<kebab-slug>`, unique.
- `paths`: same pattern syntax as `areas.mjs` (`dir/` prefix, `*`/`**` globs, exact paths); only files of
  that area. Every file of the area must match exactly one item.
- `disposition`: `keep` (no change needed) · `adapt` (modify) · `replace` (rewrite / new design) ·
  `remove` (delete) · `defer` (decide later; still needs an issue or a "Not planned" entry).

## Plan format (`plan.md`)

- `## <EPIC-ID> — <title>` starts an epic; `### <ISSUE-ID> — <title>` starts an issue of that epic.
- The first thing after each heading is a ` ```yaml ` metadata block (flat `key: value` / `key: [a, b]` only).
- Epic ids: `E01`, `E02`… Issue ids: `<epic>-NN` (`E01-01`). Dependencies use these ids, never GitHub numbers.
- Every epic ends with exactly one `closeout` issue (coverage review of the epic, collects discovered work).

Epic metadata:

| key | required | value |
|---|---|---|
| `id` | yes | `E01` |
| `depends-on` | yes | list of epic ids |
| `refs` | yes | proposal item ids, proposal section keys (`8.4`, `F3`) or `.docs/…` paths — documentation pointers |

Issue metadata:

| key | required | value |
|---|---|---|
| `id` | yes | `E01-03` |
| `depends-on` | yes | list of issue ids (blocked-by) |
| `refs` | yes | documentation pointers (not counted as coverage) |
| `covers` | yes (not for `closeout`) | proposal item ids and/or inventory item ids this issue implements |
| `type` | yes | `task` · `design` (UI design work owned by the user) · `spike` (investigation) · `closeout` |
| `scope` | yes | `ui` · `be` · `none` (matches commit scopes) |
| `size` | yes | `XS` · `S` · `M` · `L` · `XL` |
| `size-exception` | if size is L/XL | why it can't be split (e.g. mechanical deletion of a whole module) |

Issue body (required labels, bold):

- `task` / `spike`: `**Goal:**`, `**Acceptance criteria:**` (checkbox list), `**Verification:**` (commands + expected result).
  Optional: `**Notes:**`, `**Out of scope:**`.
- `design`: `**Goal:**`, `**Acceptance criteria:**`.
- `closeout`: `**Goal:**`.

The GitHub generator appends a fixed **Definition of done** to every issue (acceptance criteria verified in
the PR; newly discovered work added to `plan.md`, synced and linked in a comment — or an explicit
"nothing new"; `proposal.md` updated if a decision changed).

### Sizing rules

- One issue = one PR = one concern. Refactors are separate from behaviour changes.
- Target ≤ ~300–400 changed lines, excluding lockfiles and generated files.
- Mechanical, easy-to-review changes (moves, deletions of whole modules) may exceed it with `size-exception`.
- UI work is blocked by a `design` issue: nothing visual is implemented before the user's design exists.
  Terax's visual components and styles are not a design baseline.

### Example

````markdown
## E01 — Phase 0: baseline and identity isolation
```yaml
id: E01
depends-on: []
refs: [F0, ADR-001, ADR-008, identity]
```
Reproducible baseline of the imported code and isolation from any Terax installation.

### E01-04 — Neutralize the Terax updater
```yaml
id: E01-04
depends-on: [E01-02]
refs: [F7:auto-actualizacion-de-lut]
covers: [F0:4, build-identity/updater]
type: task
scope: be
size: S
```
**Goal:** lut must never download or install Terax binaries.

**Acceptance criteria:**
- [ ] Terax updater endpoint and public key removed from `tauri.conf.json`.
- [ ] Update check is disabled until lut's own release pipeline exists.

**Verification:** `pnpm tauri build` succeeds; the app starts with no update request (network log).

## Not planned

- `TER-010` — multi-window session moves deferred beyond v1 (P2).
````
