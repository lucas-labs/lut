#!/usr/bin/env node
// Adds/removes ids in the "depends-on" list of an epic or issue in plan.md.
// usage: node .docs/plan/tools/set-deps.mjs <ID> [+DEP ...] [-DEP ...] [--file plan.md]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_DIR } from "./lib.mjs";

const args = process.argv.slice(2);
const fi = args.indexOf("--file");
const planPath = fi >= 0 ? args.splice(fi, 2)[1] : join(PLAN_DIR, "plan.md");
const [id, ...ops] = args;
let text = readFileSync(planPath, "utf8");
const re = new RegExp(`(\\nid: ${id}\\r?\\ndepends-on: \\[)([^\\]]*)(\\])`);
const m = text.match(re);
if (!m) {
  console.error(`no yaml block with id ${id}`);
  process.exit(1);
}
let deps = m[2].split(",").map((s) => s.trim()).filter(Boolean);
for (const op of ops) {
  if (op.startsWith("+")) deps.push(op.slice(1));
  else if (op.startsWith("-")) deps = deps.filter((d) => d !== op.slice(1));
  else throw new Error(`bad op ${op} (use +ID or -ID)`);
}
deps = [...new Set(deps)].sort();
text = text.replace(re, (_, a, _b, c) => `${a}${deps.join(", ")}${c}`);
writeFileSync(planPath, text);
console.log(`${id}: [${deps.join(", ")}]`);
