#!/usr/bin/env node
// Extracts every coverable item of .docs/proposal.md into inventory/proposal-items.json:
// requirement IDs (TER/PRO/PRJ/UX/AGT-NNN), ADRs, and the list items / table rows / whole
// sections configured in HARVEST below. The plan must cover each item or list it as "Not planned".
//
// Item ids: requirement and ADR ids as-is; "F<phase>:<n>" / "F<phase>:gate" for phase tasks;
// "<section>:<n>" for list items or table rows; "<section>" for whole sections.
// Positional ids shift if the proposal is edited: re-run this script and the validator afterwards.
//
// usage: node .docs/plan/tools/proposal-items.mjs [--check]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROPOSAL_AREA } from "./areas.mjs";
import { INVENTORY_DIR, REPO_ROOT } from "./lib.mjs";

/** section key -> how to harvest it. list/table: one item per entry; whole: one item for the section. */
const HARVEST = {
  identity: { mode: "list" },
  "3.4": { mode: "whole-marker", marker: "Invariante de producto" },
  "5.4": { mode: "list", marker: "Invariantes críticos" },
  "5.10": { mode: "table" },
  "6.2": { mode: "list" },
  "6.4": { mode: "whole" },
  "6.5": { mode: "list" },
  "7.1": { mode: "whole" },
  "7.3": { mode: "whole" },
  "8.4": { mode: "list" },
  "8.5": { mode: "list" },
  "8.6": { mode: "whole" },
  "9.1": { mode: "whole" },
  "9.2": { mode: "whole" },
  "9.3": { mode: "whole" },
  "9.4": { mode: "table" },
  "9.5": { mode: "whole" },
  "9.6": { mode: "list" },
  "9.7": { mode: "whole" },
  "9.8": { mode: "list" },
  "9.9": { mode: "list" },
  "10.1": { mode: "list" },
  "10.2": { mode: "list" },
  "10.3": { mode: "list" },
  "10.4": { mode: "whole" },
  "13.2": { mode: "table" },
  "13.3": { mode: "list" },
  "13.4": { mode: "list" },
  "13.5": { mode: "list" },
  "14.1": { mode: "list" },
  "14.2": { mode: "list" },
  "14.3": { mode: "list" },
  "14.4": { mode: "list" },
  "15": { mode: "list" },
  "16": { mode: "list" },
  // Phases (F0..F7): tasks list after "**Tareas:**" (or inline, split on ";" or ",") + the gate.
};

const REQ_RE = /^\|\s*((?:TER|PRO|PRJ|UX|AGT)-\d{3})\s*\|\s*(P\d)\s*\|\s*([^|]+)\|/;
const LIST_RE = /^(?:\d+\.|-)\s+(?:\[ \]\s+)?(.*)$/;
const clip = (s, n = 220) => {
  s = s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

export function extractProposalItems(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  const seen = new Set();
  const add = (id, section, kind, txt) => {
    if (seen.has(id)) throw new Error(`duplicate proposal item id ${id}`);
    seen.add(id);
    items.push({ id, section, kind, text: clip(txt) });
  };

  let key = null; // current harvest key
  let topKey = null; // nearest "# N." key, for unnumbered "##" subsections (e.g. checklist groups)
  let counter = 0;
  let markerSeen = false;
  let listStarted = false;
  let listEnded = false;
  let inFence = false;
  let wholeBuf = null;
  let tableRow = 0;

  const flushWhole = () => {
    if (wholeBuf && wholeBuf.text.length) add(wholeBuf.key, wholeBuf.key, "section", wholeBuf.text.join(" "));
    wholeBuf = null;
  };
  const enter = (k) => {
    flushWhole();
    if (k !== key) counter = 0; // checklist subsections of "16" keep numbering
    key = k;
    markerSeen = false;
    listStarted = false;
    listEnded = false;
    tableRow = 0;
    const spec = HARVEST[k];
    if (spec?.mode === "whole") wholeBuf = { key: k, text: [] };
  };

  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const req = line.match(REQ_RE);
    if (req) add(req[1], "3", "requirement", `${req[2]} ${req[3]}`);

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const [, level, title] = h;
      let m;
      if ((m = title.match(/^(\d+(?:\.\d+)?)\.?\s/))) {
        if (level === "#") topKey = m[1];
        enter(m[1]);
      } else if ((m = title.match(/^Fase (\d+)\b/))) enter(`F${m[1]}`);
      else if ((m = title.match(/^(ADR-\d{3})\b/))) {
        enter(null);
        add(m[1], "4", "adr", title);
      } else if (/^Identidad del producto/.test(title)) {
        topKey = null;
        enter("identity");
      } else if (level === "#") {
        topKey = null;
        enter(null);
      } else enter(topKey && HARVEST[topKey] ? topKey : null);
      continue;
    }
    if (!key) continue;

    // Phases
    if (/^F\d+$/.test(key)) {
      const gate = line.match(/^\*\*Gate:\*\*\s*(.*)$/);
      if (gate) {
        add(`${key}:gate`, key, "phase-gate", gate[1]);
        continue;
      }
      const tasks = line.match(/^\*\*Tareas:\*\*\s*(.*)$/);
      if (tasks) {
        markerSeen = true;
        if (tasks[1].trim()) {
          const sep = tasks[1].includes(";") ? ";" : ",";
          for (const part of tasks[1].replace(/\.$/, "").split(sep)) if (part.trim()) add(`${key}:${++counter}`, key, "phase-task", part);
          listEnded = true;
        }
        continue;
      }
      // Other bold paragraphs of a phase (deliverable, auto-update, ...) are coverable too.
      const note = line.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
      if (note && note[1] !== "Objetivo") {
        add(`${key}:${note[1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")}`, key, "phase-note", `${note[1]}: ${note[2]}`);
        continue;
      }
      if (markerSeen && !listEnded) {
        const li = line.match(LIST_RE);
        if (li) {
          listStarted = true;
          add(`${key}:${++counter}`, key, "phase-task", li[1]);
        } else if (listStarted && line.trim()) listEnded = true;
      }
      continue;
    }

    const spec = HARVEST[key];
    if (!spec) continue;
    if (spec.mode === "whole") {
      if (line.trim() && !line.startsWith("|")) wholeBuf.text.push(line.trim());
      continue;
    }
    if (spec.mode === "whole-marker") {
      const mk = line.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
      if (mk && mk[1].trim() === spec.marker) add(`${key}:invariant`, key, "section", mk[2]);
      continue;
    }
    if (spec.mode === "table") {
      if (/^\|/.test(line)) {
        if (++tableRow <= 2) continue; // header + separator
        const cells = line.split("|").slice(1, -1).map((c) => c.trim());
        add(`${key}:${++counter}`, key, "table-row", cells.join(" | "));
      }
      continue;
    }
    if (spec.mode === "list") {
      if (spec.marker && !markerSeen) {
        if (line.includes(`**${spec.marker}:**`)) markerSeen = true;
        continue;
      }
      if (listEnded && spec.marker) continue;
      const li = line.match(LIST_RE);
      if (li) {
        listStarted = true;
        add(`${key}:${++counter}`, key, "list-item", li[1]);
      } else if (spec.marker && listStarted && line.trim()) listEnded = true;
    }
  }
  flushWhole();
  return items;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  const text = readFileSync(join(REPO_ROOT, PROPOSAL_AREA.file), "utf8");
  const items = extractProposalItems(text);
  const bySection = {};
  for (const it of items) bySection[it.section] = (bySection[it.section] ?? 0) + 1;
  for (const [s, n] of Object.entries(bySection)) console.log(`${s.padEnd(10)} ${n}`);
  console.log(`total      ${items.length}`);

  // Sanity: requirement ids are the backbone; make sure each prefix was found.
  const missing = ["TER", "PRO", "PRJ", "UX", "AGT"].filter((p) => !items.some((i) => i.id.startsWith(`${p}-`)));
  const phases = [0, 1, 2, 3, 4, 5, 6, 7].filter((n) => !items.some((i) => i.id === `F${n}:gate`));
  if (missing.length || phases.length) {
    console.error(`proposal-items: FAILED (missing requirement prefixes: ${missing.join(",") || "-"}; phases without gate: ${phases.join(",") || "-"})`);
    process.exit(1);
  }
  if (!process.argv.includes("--check")) {
    mkdirSync(INVENTORY_DIR, { recursive: true });
    writeFileSync(join(INVENTORY_DIR, "proposal-items.json"), JSON.stringify({ source: PROPOSAL_AREA.file, items }, null, 2) + "\n");
    console.log("wrote inventory/proposal-items.json");
  }
  console.log("proposal-items: OK");
}
