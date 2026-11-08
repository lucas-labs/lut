#!/usr/bin/env node
// Moves an issue of plan.md to another (or the same) epic at a given position, then renumbers the issues of the affected
// epics sequentially (closeout stays last) and rewrites every reference to the renamed ids in the whole file.
//
// usage: node .docs/plan/tools/move-issue.mjs <ISSUE-ID> <EPIC-ID> <position 1-based> [plan.md]
//        node .docs/plan/tools/move-issue.mjs --renumber <EPIC-ID> [plan.md]     (only renumber an epic)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_DIR } from "./lib.mjs";

const args = process.argv.slice(2);
const renumberOnly = args[0] === "--renumber";
const [issueId, targetEpic, posArg, file] = renumberOnly ? [null, args[1], null, args[2]] : args;
const planPath = file ?? join(PLAN_DIR, "plan.md");
const text = readFileSync(planPath, "utf8");

// Split into blocks: preamble, then per epic: header block + issue blocks; trailing sections (e.g. Not planned) kept as is.
const lines = text.split("\n");
const blocks = []; // {kind: 'pre'|'epic'|'issue'|'tail', id, lines}
let cur = { kind: "pre", lines: [] };
for (const line of lines) {
  const e = line.match(/^## (E\d{2}) — /);
  const i = line.match(/^### (E\d{2}-\d{2}) — /);
  const other = /^## /.test(line) && !e;
  if (e || i || other) {
    blocks.push(cur);
    cur = e ? { kind: "epic", id: e[1], lines: [line] } : i ? { kind: "issue", id: i[1], lines: [line] } : { kind: "tail", lines: [line] };
  } else cur.lines.push(line);
}
blocks.push(cur);

const epicOf = new Map(); // epic id -> {head, issues: [block]}
const order = []; // sequence of items: block or epic group
let lastEpic = null;
for (const b of blocks) {
  if (b.kind === "epic") {
    lastEpic = { head: b, issues: [] };
    epicOf.set(b.id, lastEpic);
    order.push(lastEpic);
  } else if (b.kind === "issue") {
    if (!lastEpic) throw new Error(`issue ${b.id} before any epic`);
    lastEpic.issues.push(b);
  } else {
    lastEpic = null;
    order.push(b);
  }
}

const touched = new Set([targetEpic]);
if (!epicOf.has(targetEpic)) throw new Error(`unknown epic ${targetEpic}`);
if (!renumberOnly) {
  const src = epicOf.get(issueId.slice(0, 3));
  const idx = src?.issues.findIndex((b) => b.id === issueId) ?? -1;
  if (idx < 0) throw new Error(`unknown issue ${issueId}`);
  const [blk] = src.issues.splice(idx, 1);
  touched.add(issueId.slice(0, 3));
  const dst = epicOf.get(targetEpic);
  const pos = Math.max(1, Math.min(Number(posArg), dst.issues.length)); // never after the closeout
  dst.issues.splice(pos - 1, 0, blk);
}

// Renumber touched epics; closeout (type: closeout) is forced last.
const rename = new Map();
for (const eid of touched) {
  const g = epicOf.get(eid);
  const isClose = (b) => b.lines.some((l) => /^type:\s*closeout\s*$/.test(l));
  g.issues = [...g.issues.filter((b) => !isClose(b)), ...g.issues.filter(isClose)];
  g.issues.forEach((b, n) => {
    const nid = `${eid}-${String(n + 1).padStart(2, "0")}`;
    if (nid !== b.id) rename.set(b.id, nid);
  });
}

let out = order.flatMap((x) => (x.head ? [...x.head.lines, ...x.issues.flatMap((b) => b.lines)] : x.lines)).join("\n");
if (rename.size) {
  // Two-phase replace through placeholders so swaps (A->B, B->A) are safe.
  const re = new RegExp(`\\b(${[...rename.keys()].map((k) => k.replace("-", "\\-")).join("|")})\\b`, "g");
  out = out.replace(re, (m) => `\u0000${rename.get(m)}\u0000`).replace(/\u0000/g, "");
}
writeFileSync(planPath, out);
console.log(rename.size ? [...rename].map(([a, b]) => `${a} -> ${b}`).join("\n") : "no renames");
