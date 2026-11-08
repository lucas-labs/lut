#!/usr/bin/env node
// Epic skeleton: every proposal item and every non-keep inventory item is assigned to exactly one epic
// (its primary owner) or to "Not planned". Writes analysis/skeleton.json; exit 1 if anything is unassigned.
// Issues of other epics may also cover an item; the primary epic is responsible for it being covered.
//
// usage: node .docs/plan/tools/skeleton.mjs
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ANALYSIS_DIR, INVENTORY_DIR, readJson } from "./lib.mjs";

export const EPICS = [
  ["E01", "Phase 0: baseline and build reproducibility", [], "Reproducible build on Windows 11, baseline tests/lint, measurements, module contracts and dependency map, CI."],
  ["E02", "Phase 0: identity isolation and Terax neutralisation", ["E01"], "lut never shares data, hooks, env vars, control server or updater with a Terax installation. Removes the updater and autostart plugins, Nix and CodeRabbit configs."],
  ["E03", "Phase 0: licensing, provenance and project docs", [], "Apache-2.0 obligations, README with the Terax credit note, docs/ADR process, requirements traceability."],
  ["E04", "Phase 0: user-visible names and going public", ["E02", "E03"], "Simple replaces so every user-visible name says lut (binary, titles, About, installer, CLI help, publisher); then make the repo public with a lut CodeRabbit config."],
  ["E05", "Remove the built-in BYOK AI", ["E01"], "Decouple and delete the in-app AI (ADR-004, 9.9) without breaking CLI agents; remove what only serves it."],
  ["E06", "Remove command-blocks mode", ["E01"], "Delete the Warp-like blocks mode, its shell support and the history index it uses (user decision 3)."],
  ["E07", "Terminal-first shell proof of concept (F1)", ["E02"], "AppShell with the terminal as main surface, existing components reused, orientation/sidebar toggles without remounting sessions."],
  ["E08", "Navigation model: tabs and splits", ["E07"], "Single navigation store and contracts extracted from useTabs; split tree, ratios, moves, safe close."],
  ["E09", "App coordinator split", ["E05", "E08"], "Replace the monolithic App.tsx with a small coordinator, services and hooks; platform module."],
  ["E10", "Secondary tools on demand (editor, Git, explorer, previews)", ["E08", "E09"], "Keep every IDE-like tool, lazy-loaded and hidden until invoked (F2:6, F6:3, UX-009)."],
  ["E11", "lut UI design (user-owned)", [], "Design issues owned by the user. Every UI implementation issue depends on the relevant design issue."],
  ["E12", "App shell UI implementation", ["E11", "E08", "E09"], "Implement the user's design for the window frame, tab navigator, header, status bar, dialogs, styles and icons."],
  ["E13", "Settings, theming, fonts and shortcuts", ["E11", "E09"], "Preferences, themes, fonts, configurable shortcuts and the settings UI."],
  ["E14", "Profiles: model, detection and PTY launch", ["E08"], "TerminalProfile model, detected + custom profiles (incl. WSL distros), launch by profile id, per-profile appearance."],
  ["E15", "Profiles UI", ["E11", "E14"], "Profile picker, profile editor, per-profile icon and tab title/color."],
  ["E16", "Projects: model and persistence (Spaces evolution)", ["E14"], "Evolve Spaces into versioned projects/presets with lut-internal schema migrations."],
  ["E17", "Project restore, startup commands and multi-project", ["E16"], "Restore orchestrator, last-session restore, open other projects, startup command policies and safety."],
  ["E18", "Project navigator and preset editor UI", ["E11", "E16"], "Projects sidebar, preset editor, startup consent modal."],
  ["E19", "Agents core: events, adapters and correlation", ["E02", "E05"], "Normalized agent events and state per pane/PTY/tab/project for every supported CLI, privacy rules, no API keys."],
  ["E20", "Agents UX: badges, notifications, hooks manager, focus", ["E11", "E19"], "Agent status in tabs, notifications, focus-next-attention, hook install preview/diff and selective uninstall."],
  ["E21", "Agent resume and statusLine metrics", ["E17", "E19"], "Resume agent sessions on project restore; optional statusLine metrics."],
  ["E22", "Command palette, context menus, polish and accessibility", ["E11", "E12"], "Palette for terminal/project actions, context menus, density, accessibility, loading/error states."],
  ["E23", "Export and import of profiles and projects", ["E14", "E16"], "Portable schema without secrets; imported presets never run commands without consent."],
  ["E24", "Cross-platform validation", ["E12", "E17"], "Windows primary; macOS/Linux CI builds and launch smoke; OS-specific and failure-mode tests."],
  ["E25", "Release pipeline and lut updater", ["E24"], "lut's own release pipeline, signing and updater; packaging; third-party notices; Nix package proposal."],
].map(([id, title, dependsOn, description]) => ({ id, title, dependsOn, description }));

// Proposal items -> epic. Keys are exact ids, or prefixes ending in ":" / "/" (longest prefix wins).
const P = {
  "identity:1": "E02", "identity:2": "E04",
  "TER-001": "E14", "TER-002": "E08", "TER-003": "E12", "TER-004": "E08", "TER-005": "E07", "TER-006": "E12", "TER-007": "E24",
  "TER-008": "E13", "TER-009": "E08", "TER-011": "E08", "TER-012": "E12", "TER-013": "E22",
  "PRO-001": "E14", "PRO-002": "E14", "PRO-003": "E14", "PRO-004": "E14", "PRO-005": "E14", "PRO-006": "E14", "PRO-009": "E14", "PRO-010": "E14",
  "PRO-011": "E15", "PRO-012": "E15", "PRO-013": "E15", "PRO-007": "E23",
  "PRJ-001": "E16", "PRJ-002": "E16", "PRJ-003": "E16", "PRJ-005": "E16", "PRJ-006": "E16", "PRJ-013": "E16", "PRJ-014": "E16",
  "PRJ-004": "E17", "PRJ-007": "E17", "PRJ-008": "E17", "PRJ-009": "E17", "PRJ-011": "E17", "PRJ-016": "E17", "PRJ-017": "E17",
  "PRJ-010": "E21", "PRJ-015": "E23",
  "UX-001": "E12", "UX-002": "E12", "UX-003": "E18", "UX-004": "E13", "UX-005": "E13", "UX-006": "E22", "UX-007": "E22", "UX-008": "E22",
  "UX-009": "E10", "UX-010": "E22", "UX-011": "E22",
  "3.4:invariant": "E07",
  "AGT-001": "E19", "AGT-002": "E19", "AGT-004": "E19", "AGT-005": "E19", "AGT-012": "E19", "AGT-013": "E19", "AGT-003": "E05",
  "AGT-006": "E20", "AGT-007": "E20", "AGT-008": "E20", "AGT-010": "E20", "AGT-009": "E21",
  "ADR-001": "E03", "ADR-002": "E12", "ADR-003": "E07", "ADR-004": "E05", "ADR-005": "E09", "ADR-006": "E16", "ADR-007": "E01", "ADR-008": "E02",
  "5.4:": "E07",
  "5.10:1": "E14", "5.10:2": "E07", "5.10:3": "E07", "5.10:4": "E08", "5.10:5": "E16", "5.10:6": "E08", "5.10:7": "E09", "5.10:8": "E12",
  "5.10:9": "E13", "5.10:10": "E19", "5.10:11": "E05", "5.10:12": "E10",
  "6.2:1": "E07", "6.2:2": "E08", "6.2:3": "E08", "6.2:4": "E08", "6.2:5": "E14", "6.2:6": "E16", "6.2:7": "E19", "6.2:8": "E10", "6.2:9": "E13", "6.2:10": "E09",
  "6.4": "E16", "6.5:": "E16", "6.5:7": "E17", "7.1": "E14", "7.3": "E14",
  "8.4:": "E17", "8.5:": "E17", "8.5:2": "E18", "8.5:3": "E18", "8.6": "E21",
  "9.1": "E19", "9.2": "E19", "9.3": "E19", "9.4:": "E19", "9.5": "E19", "9.6:": "E20", "9.7": "E21", "9.9:": "E05",
  "10.1:": "E07", "10.2:1": "E09", "10.2:2": "E12", "10.2:3": "E12", "10.2:4": "E15", "10.2:5": "E07", "10.2:6": "E18",
  "10.3:": "E08", "10.3:4": "E10", "10.4": "E08",
  "F0:2": "E03", "F0:4": "E02", "F0:5": "E02", "F0:10": "E02",
  "F0:6": "E01", "F0:7": "E01", "F0:8": "E01", "F0:9": "E01", "F0:11": "E01", "F0:12": "E01", "F0:entregable": "E01", "F0:gate": "E01",
  "F1:": "E07",
  "F2:1": "E08", "F2:2": "E09", "F2:3": "E05", "F2:4": "E05", "F2:5": "E05", "F2:6": "E10", "F2:7": "E05", "F2:8": "E05", "F2:gate": "E05",
  "F3:": "E14", "F3:4": "E15",
  "F4:1": "E16", "F4:2": "E16", "F4:4": "E16", "F4:3": "E18", "F4:5": "E17", "F4:6": "E17", "F4:7": "E17", "F4:9": "E17", "F4:gate": "E17", "F4:8": "E23",
  "F5:": "E20", "F5:1": "E19", "F5:8": "E19", "F5:gate": "E19", "F5:7": "E21",
  "F6:": "E22", "F6:3": "E10", "F6:4": "E13", "F6:5": "E13", "F6:gate": "E10",
  "F7:5": "E24", "F7:6": "E25", "F7:auto-actualizacion-de-lut": "E25",
  "13.2:1": "E24", "13.2:2": "E24", "13.2:3": "E24", "13.2:4": "E24", "13.2:5": "E07", "13.2:6": "E07", "13.2:7": "E07", "13.2:8": "E07",
  "13.2:9": "E08", "13.2:10": "E17", "13.2:11": "E17", "13.2:12": "E14", "13.2:13": "E19", "13.2:14": "E19", "13.2:15": "E20", "13.2:16": "E19",
  "13.2:17": "E05", "13.2:18": "E17", "13.2:19": "E13", "13.2:20": "E17", "13.2:21": "E02", "13.2:22": "E25",
  "13.3:": "E24", "13.4:": "E01", "13.4:8": "E17",
  "13.5:1": "E19", "13.5:4": "E19", "13.5:2": "E24", "13.5:3": "E24", "13.5:6": "E24", "13.5:5": "E17", "13.5:8": "E17", "13.5:7": "E14",
  "13.5:9": "E16", "13.5:10": "E10", "13.5:11": "E07",
  "14.1:1": "E14", "14.1:2": "E17", "14.1:3": "E17", "14.1:4": "E19", "14.1:5": "E16", "14.1:6": "E19", "14.1:7": "E19", "14.1:8": "E19", "14.1:9": "E10",
  "14.2:": "E19", "14.3:": "E03", "14.4:": "E03",
  "15:1": "E01", "15:2": "E01", "15:3": "E01", "15:4": "E01", "15:6": "E01", "15:5": "E03", "15:7": "E03", "15:8": "E03",
  "16:1": "E24", "16:2": "E24", "16:3": "E07", "16:4": "E07", "16:5": "E24", "16:6": "E13", "16:7": "E17", "16:8": "E17", "16:9": "E17", "16:10": "E17",
  "16:11": "E14", "16:12": "E17", "16:13": "E17", "16:14": "E17", "16:15": "E19", "16:16": "E05", "16:17": "E19", "16:18": "E20", "16:19": "E20",
  "16:20": "E20", "16:21": "E19", "16:22": "E12", "16:23": "E10", "16:24": "E13", "16:25": "E03", "16:26": "E02", "16:27": "E25", "16:28": "E24", "16:29": "E24",
};

// Inventory items (non-keep) -> epic.
const I = {
  "terminal/links": "E10", "terminal/session-lifecycle": "E14", "terminal/session-api": "E14", "terminal/pty-bridge": "E14",
  "terminal/agent-activity": "E19", "terminal/pane-host": "E07", "terminal/pane-tree-view": "E08", "terminal/pane-tree-model": "E08",
  "terminal/theme-font": "E13", "terminal/blocks-logic": "E06", "terminal/blocks-ui": "E06",
  "backend-core/app-entry": "E02", "backend-core/pty-session": "E14", "backend-core/shell-integration-launch": "E14",
  "backend-core/shell-integration-scripts": "E14", "backend-core/agent-detect": "E02", "backend-core/shell-exec": "E05",
  "backend-core/ipc-body": "E05", "backend-core/history": "E06", "backend-core/pty-smoke": "E24", "backend-core/ipc-profile": "E05",
  "app-shell/app-root": "E09", "app-shell/close-guards": "E08", "app-shell/close-dialogs": "E12", "app-shell/workspace-surface": "E12",
  "app-shell/workspace-input-bar": "E05", "app-shell/os-icon": "E12", "app-shell/budget-tests": "E02", "app-shell/main-entry": "E09",
  "app-shell/window-controls": "E12", "app-shell/command-palette-logic": "E22", "app-shell/command-palette-ui": "E22", "app-shell/header": "E12",
  "app-shell/shortcuts": "E13", "app-shell/sidebar-logic": "E18", "app-shell/sidebar-ui": "E18", "app-shell/statusbar-ui": "E12",
  "app-shell/diagnostics-badge": "E12", "app-shell/tabs-ui": "E12", "app-shell/tabs-model": "E08", "app-shell/window-title": "E15", "app-shell/styles": "E12",
  "agents/hook-installer": "E20", "agents/control-server": "E02", "agents/control-protocol": "E02", "agents/cli-sidecar": "E02",
  "agents/legacy-session-store": "E05", "agents/managed-agents": "E05", "agents/notification-routing": "E20", "agents/ui-components": "E20",
  "agents/notifications-bridge": "E20", "agents/control-frontend-bridge": "E10",
  "ai/": "E05",
  "build-identity/tauri-config": "E02", "build-identity/updater-logic": "E02", "build-identity/updater-dialog": "E02", "build-identity/capabilities": "E02",
  "build-identity/windows-installer-hooks": "E04", "build-identity/macos-plists": "E04", "build-identity/icons-logos": "E12",
  "build-identity/cargo-manifest": "E02", "build-identity/node-package": "E02", "build-identity/frontend-build-config": "E01",
  "build-identity/bench-app-lab": "E01", "build-identity/nix-package": "E02", "build-identity/coderabbit": "E02",
  "ide-tools/fs-read-policy": "E02", "ide-tools/git-agent-tasks": "E02", "ide-tools/git-frontend-review-models": "E02", "ide-tools/fs-ai-tools": "E05", "ide-tools/editor-ai": "E05",
  "ide-tools/": "E10",
  "state-settings/spaces-persistence": "E16", "state-settings/spaces-ui": "E18", "state-settings/settings-ai": "E05", "state-settings/": "E13",
};

export const NOT_PLANNED = {
  "F0:1": "Done before planning (commit 611f9e3: Terax snapshot imported).",
  "F0:3": "Done before planning (commit 5409728: Terax docs moved to .docs/origin-terax).",
  "TER-010": "P2: moving sessions between windows needs multiwindow (post-v1).",
  "PRJ-012": "P2: multiple windows per project (post-v1).",
  "UX-012": "P2: visual layout/window editor (post-v1).",
  "5.10:13": "Multiwindow is a later phase (post-v1).",
  "F7:1": "Multiwindow (post-v1).",
  "F7:2": "Multiwindow (post-v1).",
  "F7:3": "Multiwindow (post-v1).",
  "F7:4": "Multiwindow (post-v1).",
  "F7:gate": "Multiwindow gate (post-v1).",
  "AGT-011": "P2: approve/deny permissions from the UI (post-v1); the existing decision broker stays as is.",
  "9.8:1": "Rules for AGT-011 (P2, post-v1).",
  "9.8:2": "Rules for AGT-011 (P2, post-v1).",
  "9.8:3": "Rules for AGT-011 (P2, post-v1).",
  "9.8:4": "Rules for AGT-011 (P2, post-v1).",
  "9.8:5": "Rules for AGT-011 (P2, post-v1).",
  "9.8:6": "Rules for AGT-011 (P2, post-v1).",
  "9.8:7": "Rules for AGT-011 (P2, post-v1).",
  "AGT-014": "P2: plugin system for more agent adapters (post-v1); existing adapters are kept.",
  "agents/decision-client": "Frontend permission-decision client belongs to AGT-011 (P2, post-v1); kept dormant.",
};

const lookup = (map, id) => {
  if (map[id]) return map[id];
  const keys = Object.keys(map)
    .filter((k) => /[:/]$/.test(k) && id.startsWith(k))
    .sort((a, b) => b.length - a.length);
  return keys.length ? map[keys[0]] : null;
};

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  const proposal = readJson(join(INVENTORY_DIR, "proposal-items.json")).items;
  const inventory = readdirSync(ANALYSIS_DIR)
    .filter((f) => f.endsWith(".json") && f !== "skeleton.json")
    .flatMap((f) => readJson(join(ANALYSIS_DIR, f)).items ?? [])
    .filter((i) => i.disposition !== "keep");
  const epicIds = new Set(EPICS.map((e) => e.id));
  const assign = Object.fromEntries(EPICS.map((e) => [e.id, { proposal: [], inventory: [] }]));
  const notPlanned = [];
  const problems = [];
  const allIds = new Set([...proposal.map((p) => p.id), ...inventory.map((i) => i.id)]);
  for (const id of Object.keys(NOT_PLANNED)) if (!allIds.has(id)) problems.push(`Not planned id unknown (or now "keep"): ${id}`);
  for (const [kind, items, map] of [
    ["proposal", proposal, P],
    ["inventory", inventory, I],
  ]) {
    for (const it of items) {
      if (NOT_PLANNED[it.id]) {
        notPlanned.push({ id: it.id, reason: NOT_PLANNED[it.id] });
        continue;
      }
      const e = lookup(map, it.id);
      if (!e) problems.push(`unassigned ${kind} item ${it.id}`);
      else if (!epicIds.has(e)) problems.push(`${it.id} -> unknown epic ${e}`);
      else assign[e][kind].push(it.id);
    }
  }
  for (const e of EPICS) for (const d of e.dependsOn) if (!epicIds.has(d)) problems.push(`${e.id} depends on unknown ${d}`);
  if (problems.length) {
    for (const m of problems) console.error(m);
    console.error(`skeleton: FAILED (${problems.length})`);
    process.exit(1);
  }
  const out = { epics: EPICS.map((e) => ({ ...e, ...assign[e.id] })), notPlanned };
  writeFileSync(join(ANALYSIS_DIR, "skeleton.json"), JSON.stringify(out, null, 2) + "\n");
  for (const e of out.epics) console.log(`${e.id} ${String(e.proposal.length).padStart(3)} prop ${String(e.inventory.length).padStart(3)} inv  ${e.title}`);
  console.log(`not planned: ${notPlanned.length}\nskeleton: OK`);
}
