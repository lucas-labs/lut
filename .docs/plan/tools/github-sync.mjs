#!/usr/bin/env node
// Creates the plan on GitHub: epics (issues labelled "epic"), their issues as sub-issues (parent set at creation), labels,
// GitHub Project membership, and "blocked by" dependencies for issues and epics.
//
// Idempotent and resumable:
//   - every created issue carries a hidden marker "<!-- lut-plan-id: E01-02 -->"; on start, existing issues are read from
//     GitHub and matched by marker, so nothing is created twice even without the map file;
//   - .docs/plan/github-map.json records plan id -> issue number/node id and the dependency edges already created.
// Only creates what is missing; it never edits or deletes existing issues.
//
// Pacing: one content-creating request every --interval ms (default 800, under the 80/min limit). A short back-off is
// waited out once; the hourly limit stops the run (exit code 2) with progress saved: run it again later to continue.
// Order: epic by epic in plan order (epic, its issues, then every edge whose two ends exist), so early epics are usable
// while the rest is still being created.
//
// usage: node .docs/plan/tools/github-sync.mjs [--dry-run] [--interval ms] [--repo owner/name] [--project-title T]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_DIR, parsePlan, readJson } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const DRY = args.includes("--dry-run");
const REPO = opt("--repo", "lucas-labs/lut");
const [OWNER, NAME] = REPO.split("/");
const PROJECT_TITLE = opt("--project-title", "lut");
let interval = Number(opt("--interval", "800")); // ~75 writes/min, under the 80/min content limit
const MAP_PATH = join(PLAN_DIR, "github-map.json");
const MARK = (id) => `<!-- lut-plan-id: ${id} -->`;

const DOD = `## Definition of done

- [ ] Acceptance criteria verified in the PR.
- [ ] Newly discovered work added to \`.docs/plan/plan.md\`, synced to GitHub (\`node .docs/plan/tools/github-sync.mjs\`) and linked in a comment here — or a comment stating "nothing new".
- [ ] \`.docs/proposal.md\` updated if a decision changed.`;

const LABELS = {
  epic: ["5319e7", "Epic: parent of the plan's issues"],
  "type:task": ["c5def5", "Plan issue type: task"],
  "type:design": ["f9d0c4", "Plan issue type: UI design owned by the user"],
  "type:spike": ["fef2c0", "Plan issue type: investigation"],
  "type:closeout": ["d4c5f9", "Plan issue type: epic close-out"],
  "scope:ui": ["1d76db", "Frontend"],
  "scope:be": ["0e8a16", "Backend"],
  "size:XS": ["ededed", "Plan size"],
  "size:S": ["ededed", "Plan size"],
  "size:M": ["ededed", "Plan size"],
  "size:L": ["ededed", "Plan size"],
  "size:XL": ["ededed", "Plan size"],
};

// ---------------------------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

function ghGraphql(query, variables = {}) {
  const out = execFileSync("gh", ["api", "graphql", "--include", "--input", "-"], {
    input: JSON.stringify({ query, variables }),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const split = out.indexOf("\r\n\r\n") >= 0 ? out.indexOf("\r\n\r\n") : out.indexOf("\n\n");
  const body = JSON.parse(out.slice(split).trim());
  if (body.errors?.length) {
    const e = new Error(body.errors.map((x) => x.message).join("; "));
    e.gqlErrors = body.errors;
    throw e;
  }
  return body.data;
}

const isRateLimit = (e) => /secondary rate limit|abuse|rate limit|HTTP 403|HTTP 429|was submitted too quickly/i.test(`${e.message}\n${e.stderr ?? ""}\n${e.stdout ?? ""}`);
const retryAfter = (e) => {
  const m = `${e.stdout ?? ""}`.match(/retry-after:\s*(\d+)/i);
  return m ? Number(m[1]) * 1000 : null;
};

// A short (per-minute) back-off is waited out once; a long one (retry-after > MAX_WAIT, or a second limit right after
// waiting, i.e. the hourly content limit) stops the run: state is saved and a later run continues where this one stopped.
const MAX_WAIT = 120_000;
class StopRun extends Error {}
async function write(label, query, variables) {
  if (DRY) return null;
  for (let attempt = 1; ; attempt++) {
    try {
      const d = ghGraphql(query, variables);
      await sleep(interval);
      return d;
    } catch (e) {
      if (isRateLimit(e)) {
        const wait = retryAfter(e) ?? 60_000;
        if (wait > MAX_WAIT || attempt > 1) throw new StopRun(`rate limited on ${label} (retry-after ${Math.round(wait / 1000)} s, attempt ${attempt})`);
        log(`rate limited on ${label}; waiting ${Math.round(wait / 1000)} s`);
        await sleep(wait);
        continue;
      }
      if (attempt <= 3 && /timeout|ECONNRESET|502|503|504/i.test(`${e.message}${e.stderr ?? ""}`)) {
        await sleep(5000 * attempt);
        continue;
      }
      throw new Error(`${label}: ${e.message}\n${e.stderr ?? ""}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
const plan = parsePlan(readFileSync(join(PLAN_DIR, "plan.md"), "utf8"), "plan.md");
if (plan.errors.length) throw new Error(`plan.md has format errors; run validate.mjs first:\n${plan.errors.join("\n")}`);
const map = existsSync(MAP_PATH) ? readJson(MAP_PATH) : { repo: REPO, project: null, items: {}, edges: [] };
const saveMap = () => !DRY && writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + "\n");
const edgeKey = (a, b) => `${a}<-${b}`; // a is blocked by b
const edgesDone = new Set(map.edges);

// GitHub renders single newlines in issues as line breaks: join hard-wrapped lines of a paragraph or list item.
function unwrap(md) {
  const out = [];
  let fence = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) fence = !fence;
    const prev = out.length ? out[out.length - 1] : "";
    const startsBlock = /^\s*([-*+]\s|\d+[.)]\s|#|>|\||```)/.test(line) || /^\*\*[^*]+:\*\*/.test(line);
    const prevIsBreak = !prev.trim() || /^\s*(#|\||```)/.test(prev);
    if (!fence && line.trim() && !startsBlock && !prevIsBreak && !/^\s*```/.test(prev)) out[out.length - 1] = `${prev} ${line.trim()}`;
    else out.push(line);
  }
  return out.join("\n");
}

const refList = (xs) => (xs?.length ? xs.map((x) => `\`${x}\``).join(", ") : "—");
function issueBody(epic, i) {
  const m = i.meta;
  return [
    MARK(m.id),
    `> Plan: \`${m.id}\` · epic \`${epic.meta.id}\` · type \`${m.type}\` · scope \`${m.scope}\` · size \`${m.size}\`${m["size-exception"] ? ` (exception: ${m["size-exception"]})` : ""}`,
    `> Covers: ${refList(m.covers)}`,
    `> Refs: ${refList(m.refs)}`,
    "",
    unwrap(i.body.trim()),
    "",
    DOD,
    "",
  ].join("\n");
}
function epicBody(e) {
  return [
    MARK(e.meta.id),
    `> Plan: \`${e.meta.id}\` · refs: ${refList(e.meta.refs)}`,
    "",
    unwrap(e.body.trim()),
    "",
    `Source of truth: \`.docs/plan/plan.md\` (section ${e.meta.id}). Issues of this epic are its sub-issues.`,
    "",
  ].join("\n");
}
const labelsFor = (i) => [`type:${i.meta.type}`, ...(i.meta.scope !== "none" ? [`scope:${i.meta.scope}`] : []), `size:${i.meta.size}`];

// ---------------------------------------------------------------------------------------------------------------
async function main() {
  const epics = plan.epics;
  const preview = opt("--preview", null); // print the title and body that would be created for one plan id
  if (preview) {
    const e = epics.find((x) => x.meta.id === preview.slice(0, 3));
    const i = e?.issues.find((x) => x.meta.id === preview);
    if (!e || (preview.length > 3 && !i)) throw new Error(`unknown plan id ${preview}`);
    console.log(i ? `[${i.meta.id}] ${i.title}\nlabels: ${labelsFor(i).join(", ")}\n\n${issueBody(e, i)}` : `[${e.meta.id}] ${e.title}\nlabels: epic\n\n${epicBody(e)}`);
    return;
  }
  const issues = epics.flatMap((e) => e.issues.map((i) => ({ epic: e, i })));
  const allEdges = [
    ...epics.flatMap((e) => (e.meta["depends-on"] ?? []).map((d) => [e.meta.id, d])),
    ...issues.flatMap(({ i }) => (i.meta["depends-on"] ?? []).map((d) => [i.meta.id, d])),
  ];

  // Existing issues on GitHub, matched by marker (repairs/extends the map).
  let existing = new Map();
  if (!DRY || map.items) {
    try {
      let cursor = null;
      do {
        const d = ghGraphql(
          `query($o:String!,$n:String!,$c:String){repository(owner:$o,name:$n){id issues(first:100,after:$c,states:[OPEN,CLOSED]){pageInfo{hasNextPage endCursor} nodes{id number body}}}}`,
          { o: OWNER, n: NAME, c: cursor },
        );
        map.repoId = d.repository.id;
        for (const n of d.repository.issues.nodes) {
          const mk = n.body?.match(/<!-- lut-plan-id: (E\d{2}(?:-\d{2})?) -->/);
          if (mk) existing.set(mk[1], { number: n.number, id: n.id });
        }
        cursor = d.repository.issues.pageInfo.hasNextPage ? d.repository.issues.pageInfo.endCursor : null;
      } while (cursor);
    } catch (e) {
      if (!DRY) throw e;
    }
  }
  for (const [k, v] of existing) map.items[k] = v;

  const toCreate = [...epics.map((e) => e.meta.id), ...issues.map(({ i }) => i.meta.id)].filter((id) => !map.items[id]);
  const edgesTodo = allEdges.filter(([a, b]) => !edgesDone.has(edgeKey(a, b)));
  const est = Math.round(((toCreate.length + edgesTodo.length) * interval) / 60_000);
  log(`plan: ${epics.length} epics, ${issues.length} issues, ${allEdges.length} dependencies`);
  log(`to do: ${toCreate.length} issues to create, ${edgesTodo.length} dependencies to add (~${est} min at ${interval} ms/write, without back-offs)`);
  if (DRY) return;

  // Labels (idempotent via --force) and project.
  const missingLabels = Object.keys(LABELS).filter((l) => !map.labels?.[l]);
  if (missingLabels.length) {
    for (const [name, [color, desc]] of Object.entries(LABELS)) {
      execFileSync("gh", ["label", "create", name, "--repo", REPO, "--color", color, "--description", desc, "--force"], { stdio: "ignore" });
    }
    const d = ghGraphql(`query($o:String!,$n:String!){repository(owner:$o,name:$n){labels(first:100){nodes{id name}}}}`, { o: OWNER, n: NAME });
    map.labels = Object.fromEntries(d.repository.labels.nodes.filter((l) => LABELS[l.name]).map((l) => [l.name, l.id]));
    saveMap();
  }
  if (!map.project) {
    const d = ghGraphql(`query($o:String!){user(login:$o){id projectsV2(first:50){nodes{id number title}}}}`, { o: OWNER });
    let p = d.user.projectsV2.nodes.find((x) => x.title === PROJECT_TITLE);
    if (!p) {
      const c = await write("create project", `mutation($o:ID!,$t:String!){createProjectV2(input:{ownerId:$o,title:$t}){projectV2{id number title}}}`, { o: d.user.id, t: PROJECT_TITLE });
      p = c.createProjectV2.projectV2;
      log(`created project #${p.number} "${p.title}"`);
    }
    map.project = { id: p.id, number: p.number };
    saveMap();
  }

  const create = async (id, title, body, labels, parentId) => {
    const d = await write(
      `create ${id}`,
      `mutation($r:ID!,$t:String!,$b:String!,$l:[ID!],$p:ID,$pr:[ID!]){createIssue(input:{repositoryId:$r,title:$t,body:$b,labelIds:$l,parentIssueId:$p,projectV2Ids:$pr}){issue{id number}}}`,
      { r: map.repoId, t: title, b: body, l: labels.map((l) => map.labels[l]), p: parentId ?? null, pr: [map.project.id] },
    );
    map.items[id] = { number: d.createIssue.issue.number, id: d.createIssue.issue.id };
    saveMap();
    log(`#${d.createIssue.issue.number} ${id}`);
  };
  const flushEdges = async () => {
    for (const [a, b] of allEdges) {
      const k = edgeKey(a, b);
      if (edgesDone.has(k) || !map.items[a] || !map.items[b]) continue;
      try {
        await write(`dep ${k}`, `mutation($i:ID!,$b:ID!){addBlockedBy(input:{issueId:$i,blockingIssueId:$b}){issue{id}}}`, { i: map.items[a].id, b: map.items[b].id });
      } catch (e) {
        if (!/already|exists|duplicate/i.test(e.message)) throw e;
      }
      edgesDone.add(k);
      map.edges = [...edgesDone];
      saveMap();
    }
  };

  for (const e of epics) {
    if (!map.items[e.meta.id]) await create(e.meta.id, `[${e.meta.id}] ${e.title}`, epicBody(e), ["epic"], null);
    for (const i of e.issues) {
      if (!map.items[i.meta.id]) await create(i.meta.id, `[${i.meta.id}] ${i.title}`, issueBody(e, i), labelsFor(i), map.items[e.meta.id].id);
    }
    await flushEdges();
    log(`epic ${e.meta.id} done`);
  }
  log(`done: ${Object.keys(map.items).length} issues, ${edgesDone.size} dependencies. Project #${map.project.number}`);
}

main().catch((e) => {
  if (e instanceof StopRun) {
    log(`STOPPED: ${e.message}. Progress is saved in github-map.json; run the script again later to continue.`);
    process.exit(2);
  }
  console.error(e.message);
  process.exit(1);
});
