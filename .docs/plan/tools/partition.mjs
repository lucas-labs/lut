#!/usr/bin/env node
// Assigns every tracked file (except EXCLUDED) to exactly one analysis area and writes
// inventory/partition.json. Exits 1 if a file matches no area or more than one.
//
// usage: node .docs/plan/tools/partition.mjs [--check]   (--check: validate only, don't write)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AREAS, EXCLUDED, toMatcher } from "./areas.mjs";
import { INVENTORY_DIR, REPO_ROOT, countLines, git, trackedFiles } from "./lib.mjs";

const checkOnly = process.argv.includes("--check");
const areas = AREAS.map((a) => ({ ...a, matchers: a.patterns.map((p) => ({ p, m: toMatcher(p) })) }));
const excluded = EXCLUDED.map(toMatcher);

const result = Object.fromEntries(AREAS.map((a) => [a.id, { title: a.title, files: [], lines: 0 }]));
const unassigned = [];
const ambiguous = [];
const usedPatterns = new Set();

for (const path of trackedFiles()) {
  if (excluded.some((m) => m(path))) continue;
  const hits = [];
  for (const a of areas) {
    const hit = a.matchers.find(({ m }) => m(path));
    if (hit) {
      hits.push(a.id);
      usedPatterns.add(`${a.id}::${hit.p}`);
    }
  }
  if (hits.length === 0) unassigned.push(path);
  else if (hits.length > 1) ambiguous.push(`${path} -> ${hits.join(", ")}`);
  else {
    const lines = countLines(join(REPO_ROOT, path));
    result[hits[0]].files.push({ path, lines });
    result[hits[0]].lines += lines ?? 0;
  }
}

// Patterns that match nothing usually mean a typo or a moved file.
const deadPatterns = areas.flatMap((a) =>
  a.patterns.filter((p) => !usedPatterns.has(`${a.id}::${p}`)).map((p) => `${a.id}: ${p}`),
);

let failed = false;
const report = (label, list) => {
  if (!list.length) return;
  failed = true;
  console.error(`\n${label} (${list.length}):`);
  for (const x of list) console.error(`  ${x}`);
};
report("Files in no area", unassigned);
report("Files in more than one area", ambiguous);
report("Patterns matching no file", deadPatterns);

let total = 0;
console.log("area                files    lines");
for (const [id, a] of Object.entries(result)) {
  total += a.files.length;
  console.log(`${id.padEnd(18)} ${String(a.files.length).padStart(6)} ${String(a.lines).padStart(8)}`);
}
console.log(`${"total".padEnd(18)} ${String(total).padStart(6)}`);

if (failed) {
  console.error("\npartition: FAILED");
  process.exit(1);
}
if (!checkOnly) {
  mkdirSync(INVENTORY_DIR, { recursive: true });
  const commit = git("rev-parse", "HEAD").trim();
  const out = { commit, areas: result };
  writeFileSync(join(INVENTORY_DIR, "partition.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`\nwrote inventory/partition.json (commit ${commit.slice(0, 7)})`);
}
console.log("partition: OK");
