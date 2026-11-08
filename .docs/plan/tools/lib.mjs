import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
export const PLAN_DIR = resolve(TOOLS_DIR, "..");
export const REPO_ROOT = resolve(PLAN_DIR, "..", "..");
export const INVENTORY_DIR = join(PLAN_DIR, "inventory");
export const ANALYSIS_DIR = join(PLAN_DIR, "analysis");

export function git(...args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
}

export function trackedFiles() {
  return git("ls-files", "-z").split("\0").filter(Boolean);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Line count for text files; null for binary (NUL byte in the first 8 KiB). */
export function countLines(absPath) {
  const buf = readFileSync(absPath);
  if (buf.subarray(0, 8192).includes(0)) return null;
  if (buf.length === 0) return 0;
  let n = 0;
  for (const b of buf) if (b === 10) n++;
  return buf[buf.length - 1] === 10 ? n : n + 1;
}

// ---------------------------------------------------------------------------
// Minimal YAML for plan metadata blocks: `key: scalar` and `key: [a, b, "c d"]` only.
// Anything else is rejected, so metadata stays trivially machine-readable.
// ---------------------------------------------------------------------------
export function parseMiniYaml(text, where) {
  const out = {};
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, "").trimEnd();
    if (!line.trim()) return;
    const m = line.match(/^([a-z][a-z0-9-]*):\s*(.*)$/);
    if (!m) throw new Error(`${where}: yaml line ${i + 1} not "key: value": ${raw}`);
    const [, key, value] = m;
    if (key in out) throw new Error(`${where}: duplicate yaml key "${key}"`);
    out[key] = parseValue(value, `${where}: key "${key}"`);
  });
  return out;
}

function parseValue(v, where) {
  v = v.trim();
  if (v.startsWith("[")) {
    if (!v.endsWith("]")) throw new Error(`${where}: unterminated list`);
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return splitList(inner).map((s) => unquote(s.trim()));
  }
  if (v === "true") return true;
  if (v === "false") return false;
  return unquote(v);
}

function splitList(s) {
  const parts = [];
  let cur = "";
  let q = null;
  for (const ch of s) {
    if (q) {
      if (ch === q) q = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
    } else if (ch === ",") {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

// ---------------------------------------------------------------------------
// Plan parser: `## <EPIC-ID> — title` and `### <ISSUE-ID> — title`, each followed by a ```yaml block.
// A `## Not planned` section lists exclusions as "- `ID` — reason".
// ---------------------------------------------------------------------------
export const NOT_PLANNED_HEADING = "Not planned";

export function parsePlan(text, file = "plan.md") {
  const lines = text.split(/\r?\n/);
  const epics = [];
  const notPlanned = [];
  const errors = [];
  let cur = null; // current epic or issue node
  let curEpic = null;
  let inNotPlanned = false;
  let fence = null;

  const finish = () => {
    if (cur) cur.body = cur.bodyLines.join("\n").trim();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;
    if (fence) {
      if (/^```\s*$/.test(line)) {
        if (fence.node) {
          try {
            fence.node.meta = parseMiniYaml(fence.lines.join("\n"), `${file}:${fence.start}`);
          } catch (e) {
            errors.push(e.message);
            fence.node.meta = {};
          }
        } else if (cur) cur.bodyLines.push(...fence.raw, line);
        fence = null;
      } else {
        fence.lines.push(line);
        fence.raw.push(line);
      }
      continue;
    }
    const h = line.match(/^(##|###)\s+(.*)$/);
    if (h) {
      finish();
      const [, level, rest] = h;
      if (level === "##" && rest.trim() === NOT_PLANNED_HEADING) {
        inNotPlanned = true;
        cur = curEpic = null;
        continue;
      }
      inNotPlanned = false;
      const m = rest.match(/^(\S+)\s+[—-]\s+(.+)$/);
      if (!m) {
        errors.push(`${file}:${ln}: heading must be "<ID> — <title>": ${line}`);
        cur = null;
        continue;
      }
      const node = { headingId: m[1], title: m[2].trim(), line: ln, meta: null, bodyLines: [], body: "" };
      if (level === "##") {
        node.issues = [];
        epics.push(node);
        curEpic = node;
      } else {
        if (!curEpic) {
          errors.push(`${file}:${ln}: issue outside of an epic`);
          cur = null;
          continue;
        }
        node.epic = curEpic;
        curEpic.issues.push(node);
      }
      cur = node;
      // The metadata block must be the first non-empty thing after the heading.
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (/^```yaml\s*$/.test(lines[j] ?? "")) {
        fence = { node, start: j + 1, lines: [], raw: [] };
        i = j;
      } else {
        errors.push(`${file}:${ln}: "${m[1]}" has no \`\`\`yaml metadata block right after the heading`);
      }
      continue;
    }
    if (/^```/.test(line)) {
      fence = { node: null, start: ln, lines: [], raw: [line] };
      continue;
    }
    if (inNotPlanned) {
      const np = line.match(/^-\s+`([^`]+)`\s+[—-]\s+(.+)$/);
      if (np) notPlanned.push({ id: np[1], reason: np[2].trim(), line: ln });
      else if (line.trim() && !line.startsWith(">")) errors.push(`${file}:${ln}: "Not planned" entries must be "- \`ID\` — reason"`);
      continue;
    }
    if (cur) cur.bodyLines.push(line);
  }
  if (fence) errors.push(`${file}: unterminated code fence starting at line ${fence.start}`);
  finish();
  return { epics, notPlanned, errors };
}
