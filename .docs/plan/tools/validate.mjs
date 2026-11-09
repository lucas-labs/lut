#!/usr/bin/env node
// Validates the plan (format, ids, dependencies, cycles) and its coverage against:
//   - inventory/proposal-items.json  (every proposal item covered or "Not planned")
//   - analysis/<area>.json           (every file of the area in exactly one item; every item that is
//                                     not "keep" covered or "Not planned")
//   - .docs/product/requirements.md  (every requirement listed, generated columns up to date; requirements.mjs)
//
// usage: node .docs/plan/tools/validate.mjs [plan.md] [--analysis-only] [--allow-missing-analysis] [--partial]
//   --partial: validate a file holding only some epics (e.g. drafts/E05.md): dependencies on ids of other epics are
//              not reported, and coverage is checked only for the items analysis/skeleton.json assigns to its epics.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AREAS, toMatcher } from "./areas.mjs";
import { ANALYSIS_DIR, INVENTORY_DIR, PLAN_DIR, parsePlan, readJson } from "./lib.mjs";
import { requirementsErrors } from "./requirements.mjs";

const args = process.argv.slice(2);
const planPath = args.find((a) => !a.startsWith("--")) ?? join(PLAN_DIR, "plan.md");
const analysisOnly = args.includes("--analysis-only");
const allowMissingAnalysis = args.includes("--allow-missing-analysis");
const partial = args.includes("--partial");

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const DISPOSITIONS = ["keep", "adapt", "replace", "remove", "defer"];
const SCOPES = ["ui", "be", "none"];
const SIZES = ["XS", "S", "M", "L", "XL"];
const TYPES = ["task", "design", "spike", "closeout"];

// --- inventories ------------------------------------------------------------------------------
const partition = readJson(join(INVENTORY_DIR, "partition.json"));
const proposal = readJson(join(INVENTORY_DIR, "proposal-items.json"));
const proposalIds = new Set(proposal.items.map((i) => i.id));
const proposalSections = new Set(proposal.items.map((i) => i.section));

// --- analysis: file -> item mapping per area --------------------------------------------------
const analysisItems = new Map(); // id -> item
for (const area of AREAS) {
  const file = join(ANALYSIS_DIR, `${area.id}.json`);
  if (!existsSync(file)) {
    (allowMissingAnalysis ? warn : err)(`analysis/${area.id}.json missing`);
    continue;
  }
  let data;
  try {
    data = readJson(file);
  } catch (e) {
    err(`analysis/${area.id}.json: invalid JSON (${e.message})`);
    continue;
  }
  if (data.area !== area.id) err(`analysis/${area.id}.json: "area" must be "${area.id}"`);
  const files = partition.areas[area.id].files.map((f) => f.path);
  const hits = new Map(files.map((f) => [f, []]));
  for (const it of data.items ?? []) {
    const where = `analysis/${area.id}.json item "${it.id}"`;
    if (!it.id?.startsWith(`${area.id}/`)) err(`${where}: id must start with "${area.id}/"`);
    if (analysisItems.has(it.id)) err(`${where}: duplicate id`);
    analysisItems.set(it.id, { ...it, area: area.id });
    if (!DISPOSITIONS.includes(it.disposition)) err(`${where}: disposition must be one of ${DISPOSITIONS.join("|")}`);
    if (!it.title?.trim()) err(`${where}: missing title`);
    if (!it.rationale?.trim()) err(`${where}: missing rationale`);
    if (!Array.isArray(it.paths) || !it.paths.length) {
      err(`${where}: "paths" must be a non-empty array`);
      continue;
    }
    for (const p of it.paths) {
      const m = toMatcher(p);
      const matched = files.filter((f) => m(f));
      if (!matched.length) err(`${where}: path "${p}" matches no file of area ${area.id}`);
      for (const f of matched) hits.get(f).push(it.id);
    }
  }
  for (const [f, ids] of hits) {
    if (ids.length === 0) err(`analysis/${area.id}.json: file not assigned to any item: ${f}`);
    else if (new Set(ids).size > 1) err(`analysis/${area.id}.json: file in several items (${[...new Set(ids)].join(", ")}): ${f}`);
  }
}

if (analysisOnly) finish(null);

// --- plan --------------------------------------------------------------------------------------
if (!existsSync(planPath)) {
  err(`plan not found: ${planPath}`);
  finish(null);
}
const plan = parsePlan(readFileSync(planPath, "utf8"), planPath.split(/[\\/]/).pop());
errors.push(...plan.errors);
const fileEpics = new Set(plan.epics.map((e) => e.meta?.id));
const owner = new Map(); // item id -> owner epic (partial mode)
if (partial) {
  const sk = readJson(join(ANALYSIS_DIR, "skeleton.json"));
  for (const e of sk.epics) for (const id of [...e.proposal, ...e.inventory]) owner.set(id, e.id);
}
const otherEpic = (id) => partial && /^E\d{2}/.test(id) && !fileEpics.has(id.slice(0, 3));

const nodes = new Map(); // id -> node
const listField = (n, k, where) => {
  const v = n.meta?.[k];
  if (v === undefined) {
    err(`${where}: missing "${k}"`);
    return [];
  }
  if (!Array.isArray(v)) {
    err(`${where}: "${k}" must be a list`);
    return [];
  }
  return v;
};

for (const e of plan.epics) {
  const where = `epic ${e.headingId} (line ${e.line})`;
  const id = e.meta?.id;
  if (!/^E\d{2}$/.test(id ?? "")) err(`${where}: id must look like E01`);
  if (id !== e.headingId) err(`${where}: heading id and yaml id differ`);
  if (nodes.has(id)) err(`${where}: duplicate id ${id}`);
  nodes.set(id, e);
  e.kind = "epic";
  e.deps = listField(e, "depends-on", where);
  e.refs = listField(e, "refs", where);
  if (!e.body) err(`${where}: missing description`);
  const closeouts = e.issues.filter((i) => i.meta?.type === "closeout");
  if (closeouts.length !== 1) err(`${where}: must have exactly one closeout issue (has ${closeouts.length})`);
  else if (e.issues.at(-1) !== closeouts[0]) err(`${where}: the closeout issue must be the last one`);
  else {
    const cdeps = new Set(closeouts[0].meta?.["depends-on"] ?? []);
    const missing = e.issues.slice(0, -1).map((i) => i.meta?.id).filter((x) => !cdeps.has(x));
    if (missing.length) err(`${where}: closeout must depend on every other issue of the epic (missing ${missing.join(", ")})`);
  }

  for (const i of e.issues) {
    const w = `issue ${i.headingId} (line ${i.line})`;
    const m = i.meta ?? {};
    if (!/^E\d{2}-\d{2}$/.test(m.id ?? "")) err(`${w}: id must look like E01-02`);
    else if (!m.id.startsWith(`${id}-`)) err(`${w}: id must start with its epic id ${id}`);
    if (m.id !== i.headingId) err(`${w}: heading id and yaml id differ`);
    if (nodes.has(m.id)) err(`${w}: duplicate id ${m.id}`);
    nodes.set(m.id, i);
    i.kind = "issue";
    i.deps = listField(i, "depends-on", w);
    i.refs = listField(i, "refs", w);
    i.covers = listField(i, "covers", w);
    if (!TYPES.includes(m.type)) err(`${w}: type must be one of ${TYPES.join("|")}`);
    if (!SCOPES.includes(m.scope)) err(`${w}: scope must be one of ${SCOPES.join("|")}`);
    if (!SIZES.includes(m.size)) err(`${w}: size must be one of ${SIZES.join("|")}`);
    if (["L", "XL"].includes(m.size) && !m["size-exception"]) err(`${w}: size ${m.size} needs "size-exception: <reason>" (or split it)`);
    if (m.type !== "closeout" && !i.covers.length) err(`${w}: "covers" is empty — every issue must trace to a proposal or inventory item`);
    const needed = m.type === "closeout" ? ["Goal"] : m.type === "design" ? ["Goal", "Acceptance criteria"] : ["Goal", "Acceptance criteria", "Verification"];
    for (const s of needed) if (!new RegExp(`\\*\\*${s}:?\\*\\*`).test(i.body)) err(`${w}: body lacks "**${s}:**"`);
  }
}

// references
const isProposalRef = (r) => proposalIds.has(r) || proposalSections.has(r);
for (const [id, n] of nodes) {
  for (const d of n.deps ?? []) {
    const t = nodes.get(d);
    if (!t) {
      if (!otherEpic(d)) err(`${id}: depends-on unknown id ${d}`);
      continue;
    }
    if (t.kind !== n.kind) err(`${id}: ${n.kind} can only depend on ${n.kind}s (got ${d})`);
    if (d === id) err(`${id}: depends on itself`);
  }
  for (const r of n.refs ?? []) if (!isProposalRef(r) && !/^\.docs\//.test(r)) err(`${id}: ref "${r}" is not a proposal item/section or a .docs/ path`);
  for (const c of n.covers ?? []) if (!proposalIds.has(c) && !analysisItems.has(c)) err(`${id}: covers unknown item "${c}"`);
}

// cycles (separately for epics and issues)
for (const kind of ["epic", "issue"]) {
  const state = new Map();
  const visit = (id, stack) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      err(`dependency cycle: ${[...stack.slice(stack.indexOf(id)), id].join(" -> ")}`);
      return;
    }
    state.set(id, 1);
    for (const d of nodes.get(id).deps ?? []) if (nodes.get(d)?.kind === kind) visit(d, [...stack, id]);
    state.set(id, 2);
  };
  for (const [id, n] of nodes) if (n.kind === kind) visit(id, []);
}

// cross-epic issue dependencies must follow the epic graph: if an issue of epic X depends on an issue of epic Y,
// X must (transitively) depend on Y. Otherwise issue- and epic-level orders contradict each other (hidden cycles).
const epicReach = new Map(); // epic id -> set of epics it transitively depends on
const reach = (id, seen = new Set()) => {
  if (epicReach.has(id)) return epicReach.get(id);
  const out = new Set();
  for (const d of nodes.get(id)?.deps ?? []) {
    if (seen.has(d) || nodes.get(d)?.kind !== "epic") continue;
    out.add(d);
    for (const x of reach(d, new Set([...seen, id]))) out.add(x);
  }
  epicReach.set(id, out);
  return out;
};
for (const [id, n] of nodes) {
  if (n.kind !== "issue") continue;
  for (const d of n.deps ?? []) {
    const from = id.slice(0, 3);
    const to = d.slice(0, 3);
    if (from === to || !nodes.has(d) || !nodes.has(from)) continue;
    if (!reach(from).has(to)) err(`${id} depends on ${d}, but epic ${from} does not depend (transitively) on epic ${to}`);
  }
}

// coverage
const covered = new Map(); // item id -> [issue ids]
for (const [id, n] of nodes) for (const c of n.covers ?? []) covered.set(c, [...(covered.get(c) ?? []), id]);
const notPlanned = new Map();
for (const np of plan.notPlanned) {
  if (!proposalIds.has(np.id) && !analysisItems.has(np.id)) err(`Not planned: unknown item "${np.id}"`);
  if (covered.has(np.id)) err(`Not planned: "${np.id}" is also covered by ${covered.get(np.id).join(", ")}`);
  notPlanned.set(np.id, np.reason);
}
// Postponed "Not planned" items must be recorded in future.md (items whose reason starts with "Done" are exempt).
const futurePath = join(PLAN_DIR, "future.md");
const futureText = existsSync(futurePath) ? readFileSync(futurePath, "utf8") : "";
for (const np of plan.notPlanned) {
  if (/^done\b/i.test(np.reason)) continue;
  if (!futureText.includes(`\`${np.id}\``)) err(`Not planned "${np.id}" is not listed in future.md`);
}
const inScope = (id) => !partial || fileEpics.has(owner.get(id));
const uncoveredProposal = proposal.items.filter((i) => inScope(i.id) && !covered.has(i.id) && !notPlanned.has(i.id));
const uncoveredInventory = [...analysisItems.values()].filter((i) => inScope(i.id) && i.disposition !== "keep" && !covered.has(i.id) && !notPlanned.has(i.id));
for (const i of uncoveredProposal) err(`uncovered proposal item ${i.id}: ${i.text.slice(0, 90)}`);
for (const i of uncoveredInventory) err(`uncovered inventory item ${i.id} (${i.disposition}): ${i.title}`);

// requirements traceability: .docs/product/requirements.md lists every requirement with its current issues.
if (!partial) for (const e of requirementsErrors(readFileSync(planPath, "utf8"))) err(e);

finish({
  epics: plan.epics.length,
  issues: [...nodes.values()].filter((n) => n.kind === "issue").length,
  proposal: `${proposal.items.length - uncoveredProposal.length}/${proposal.items.length}`,
  inventory: (() => {
    const actionable = [...analysisItems.values()].filter((i) => i.disposition !== "keep").length;
    return `${actionable - uncoveredInventory.length}/${actionable} (+${analysisItems.size - actionable} keep)`;
  })(),
});

function finish(summary) {
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  if (summary) {
    console.log(`\nepics ${summary.epics} | issues ${summary.issues} | proposal items covered ${summary.proposal} | inventory items covered ${summary.inventory}`);
  }
  console.log(errors.length ? `\nvalidate: FAILED (${errors.length} errors)` : "\nvalidate: OK");
  process.exit(errors.length ? 1 : 0);
}
