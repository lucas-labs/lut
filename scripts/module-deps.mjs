// Module dependency matrix and contracts for .docs/architecture/module-dependencies.md (E01-08).
//
// Reads every non-test .ts/.tsx file under src/, groups files into modules (src/modules/<name>, plus app, lib,
// components, bench and settings-window) and writes the generated part of the document: the import matrix between
// modules, each module's dependencies, and per-module contract facts (public API, owned state, IPC used, imports that
// bypass the module's index). Test files are left out: they are not runtime dependencies.
//
// CLI:  node scripts/module-deps.mjs           rewrite the generated section
//       node scripts/module-deps.mjs --check   exit 1 if the committed section is out of date
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(root, '.docs/architecture/module-dependencies.md');
const START = '<!-- module-deps:start -->';
const END = '<!-- module-deps:end -->';

/** Modules shown in the matrix (E01-08); every other module is in the per-module lists. */
const CORE = ['app', 'terminal', 'tabs', 'spaces', 'agents', 'control', 'editor', 'git'];
/** Objects that wrap Tauri commands in methods; their commands are attributed to the callers of each method. */
const WRAPPERS = [
  { file: 'src/modules/git/api.ts', obj: 'git' },
  { file: 'src/modules/workspace/native.ts', obj: 'workspaceNative' },
];

const posix = (p) => p.split('\\').join('/');
const rel = (p) => posix(relative(root, p));
const isTest = (f) => /\.test\.|\.bench\.|__tests__/.test(f);

function listSources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listSources(p, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts') && !isTest(name)) out.push(rel(p));
  }
  return out;
}

export function moduleOf(file) {
  const m = file.match(/^src\/modules\/([^/]+)\//);
  if (m) return m[1];
  if (file === 'src/main.tsx' || file.startsWith('src/app/')) return 'app';
  if (file.startsWith('src/settings/')) return 'settings-window';
  const top = file.match(/^src\/([^/]+)\//);
  return top ? top[1] : 'app';
}

const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
function resolveImport(spec, from) {
  let base;
  if (spec.startsWith('@/')) base = join(root, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(root, dirname(from), spec);
  else return null;
  for (const e of EXTS) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return rel(p);
  }
  return null;
}

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Import statements of a file: { spec, kind: 'value' | 'type' | 'lazy' }. */
function importsOf(code) {
  const out = [];
  const stmt = /(?:^|\n)\s*(import|export)\s+([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(stmt)) {
    const clause = m[2].trim();
    const typeOnly =
      /^type\b/.test(clause) ||
      (/^\{[\s\S]*\}$/.test(clause) &&
        clause
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .every((s) => s.startsWith('type ')));
    out.push({ spec: m[3], kind: typeOnly ? 'type' : 'value' });
  }
  for (const m of code.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g))
    out.push({ spec: m[1], kind: 'value' });
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    out.push({ spec: m[1], kind: 'lazy' });
  return out;
}

export function analyse() {
  const files = listSources(join(root, 'src'));
  const code = new Map(files.map((f) => [f, stripComments(readFileSync(join(root, f), 'utf8'))]));
  const modules = [...new Set(files.map(moduleOf))].sort();

  // Edges: module -> module -> { files: Set<importing file>, kinds: Set<kind> }; plus deep imports.
  const edges = new Map(modules.map((m) => [m, new Map()]));
  const deep = new Map(modules.map((m) => [m, new Map()]));
  for (const f of files) {
    const from = moduleOf(f);
    for (const { spec, kind } of importsOf(code.get(f))) {
      const target = resolveImport(spec, f);
      if (!target || !code.has(target)) continue;
      const to = moduleOf(target);
      if (to === from) continue;
      const row = edges.get(from);
      if (!row.has(to)) row.set(to, { files: new Set(), kinds: new Map() });
      const e = row.get(to);
      e.files.add(f);
      // A file that imports the same module in two ways counts as a value import.
      const prev = e.kinds.get(f);
      e.kinds.set(f, prev && prev !== kind ? 'value' : kind);
      const isIndex = /^src\/modules\/[^/]+\/index\.tsx?$/.test(target);
      if (to !== 'components' && to !== 'lib' && !isIndex && target.startsWith('src/modules/')) {
        const d = deep.get(to);
        d.set(target, (d.get(target) ?? new Set()).add(from));
      }
    }
  }

  // Tauri commands, from lib.rs, attributed to modules by string literal or by wrapper method.
  const lib = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
  const start = lib.indexOf('generate_handler![');
  const commands = [...lib.slice(start, lib.indexOf('])', start)).matchAll(/^\s*([\w:]+),/gm)].map(
    (m) => m[1].split('::').pop(),
  );
  const wrapperFiles = new Set(WRAPPERS.map((w) => w.file));
  const direct = new Map(modules.map((m) => [m, new Set()]));
  const viaWrapper = new Map(modules.map((m) => [m, new Set()]));
  for (const cmd of commands) {
    const re = new RegExp(`['"\`]${cmd}['"\`]`);
    for (const f of files)
      if (!wrapperFiles.has(f) && re.test(code.get(f))) direct.get(moduleOf(f)).add(cmd);
  }
  for (const w of WRAPPERS) {
    const text = code.get(w.file);
    const body = text.slice(text.indexOf(`export const ${w.obj} = {`));
    for (const m of body.matchAll(/^ {2}(\w+):[\s\S]*?invoke(?:<[\s\S]*?>)?\(\s*'(\w+)'/gm)) {
      const use = new RegExp(`\\b${w.obj}\\s*\\.\\s*${m[1]}\\b`);
      for (const f of files)
        if (f !== w.file && use.test(code.get(f))) viaWrapper.get(moduleOf(f)).add(m[2]);
    }
  }

  // Events by name (Tauri events and DOM custom events with a lut/fs prefix).
  const events = new Map(modules.map((m) => [m, new Set()]));
  for (const f of files)
    for (const m of code.get(f).matchAll(/['"]((?:lut:|lut:\/\/|fs:)[\w-]+)['"]/g))
      if (!/^lut:terminal-(diagnostics|gc-mirror|text-contrast)$/.test(m[1]))
        events.get(moduleOf(f)).add(m[1]);

  // Owned state: zustand stores, plugin-store files and localStorage keys.
  const state = new Map(modules.map((m) => [m, new Set()]));
  for (const f of files) {
    const t = code.get(f);
    const s = state.get(moduleOf(f));
    if (/from 'zustand'/.test(t))
      for (const m of t.matchAll(/export const (use\w+)\s*=\s*create\b/g)) s.add(`\`${m[1]}\``);
    if (/LazyStore/.test(t))
      for (const m of t.matchAll(/'([\w-]+\.json)'/g)) s.add(`\`${m[1]}\` (store file)`);
    if (/localStorage/.test(t))
      for (const m of t.matchAll(/'(lut[-.:][\w.:-]+)'/g)) s.add(`\`${m[1]}\` (localStorage)`);
  }

  // Public API: what each module's index re-exports or declares.
  const api = new Map();
  for (const m of modules) {
    const index = ['ts', 'tsx'].map((e) => `src/modules/${m}/index.${e}`).find((p) => code.has(p));
    if (!index) continue;
    const names = [];
    const t = code.get(index);
    for (const x of t.matchAll(/export\s+(type\s+)?\{([^}]*)\}/g))
      for (const part of x[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean))
        names.push(
          part
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)
            .pop(),
        );
    for (const x of t.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g))
      names.push(`* from ${x[1]}`);
    for (const x of t.matchAll(/export\s+(?:const|function|class|type|interface)\s+(\w+)/g))
      names.push(x[1]);
    api.set(m, { index, names });
  }

  return { files, modules, edges, deep, direct, viaWrapper, events, state, api };
}

const code = (s) => '`' + s + '`';
const list = (xs) => {
  const items = [...xs].sort();
  return items.length ? items.map(code).join(', ') : '—';
};

function describeEdge(e) {
  const kinds = [...e.kinds.values()];
  const type = kinds.filter((k) => k === 'type').length;
  const lazy = kinds.filter((k) => k === 'lazy').length;
  const extra = [type && `${type} type-only`, lazy && `${lazy} lazy`].filter(Boolean).join(', ');
  return `${e.files.size}${extra ? ` (${extra})` : ''}`;
}

export function render(a) {
  const out = [];
  out.push(
    `Generated by \`node scripts/module-deps.mjs\` from ${a.files.length} source files in ${a.modules.length} modules.`,
  );
  out.push('');
  out.push('### Matrix of the core modules');
  out.push('');
  out.push(
    'Rows import from columns. A cell is the number of files of the row module that import from the column module; `t` marks edges that are only type imports, `l` edges that are only lazy `import()`.',
  );
  out.push('');
  out.push(`| from \\ to | ${CORE.join(' | ')} | other modules |`);
  out.push(`| --- | ${CORE.map(() => '---').join(' | ')} | --- |`);
  for (const from of CORE) {
    const row = a.edges.get(from);
    const cells = CORE.map((to) => {
      if (to === from) return '·';
      const e = row.get(to);
      if (!e) return '';
      const kinds = new Set(e.kinds.values());
      const mark =
        kinds.size === 1 && kinds.has('type')
          ? 't'
          : kinds.size === 1 && kinds.has('lazy')
            ? 'l'
            : '';
      return `${e.files.size}${mark}`;
    });
    const others = [...row.keys()].filter((m) => !CORE.includes(m)).sort();
    out.push(`| **${from}** | ${cells.join(' | ')} | ${others.join(', ') || '—'} |`);
  }
  out.push('');
  out.push('### Dependencies of every module');
  out.push('');
  out.push(
    'Imports to and from `components` and `lib` (shared UI primitives and helpers) are counted like any other. Counts are importing files.',
  );
  out.push('');
  out.push('| Module | Imports from | Imported by |');
  out.push('| --- | --- | --- |');
  for (const m of a.modules) {
    const outgoing = [...a.edges.get(m).entries()]
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([to, e]) => `${to} ${describeEdge(e)}`);
    const incoming = a.modules
      .filter((o) => a.edges.get(o).has(m))
      .map((o) => `${o} ${describeEdge(a.edges.get(o).get(m))}`);
    out.push(`| **${m}** | ${outgoing.join(', ') || '—'} | ${incoming.join(', ') || '—'} |`);
  }
  out.push('');
  out.push('### Contract facts per module');
  out.push('');
  out.push(
    'Public API: what `index.ts` exports. Owned state: zustand stores, plugin-store files and localStorage keys declared in the module. IPC: Tauri commands called directly or through the `git`/`native` wrappers, and event names referenced. Deep imports: files of the module imported by other modules without going through its `index.ts`.',
  );
  for (const m of a.modules) {
    out.push('');
    out.push(`#### ${m}`);
    out.push('');
    const api = a.api.get(m);
    out.push(
      `- **Public API** (${api ? code(api.index.replace(/^src\//, '')) : 'no index'}): ${api ? list(api.names) : '—'}`,
    );
    out.push(`- **Owned state:** ${[...a.state.get(m)].sort().join(', ') || '—'}`);
    const via = [...a.viaWrapper.get(m)].filter((c) => !a.direct.get(m).has(c));
    out.push(
      `- **Commands:** ${list(a.direct.get(m))}${via.length ? `; through wrappers: ${list(via)}` : ''}`,
    );
    out.push(`- **Events:** ${list(a.events.get(m))}`);
    const deep = [...a.deep.get(m).entries()].sort(([x], [y]) => x.localeCompare(y));
    out.push(
      `- **Deep imports:** ${
        deep.length
          ? deep
              .map(
                ([f, by]) =>
                  `${code(f.replace(/^src\/modules\/[^/]+\//, ''))} (${[...by].sort().join(', ')})`,
              )
              .join(', ')
          : '—'
      }`,
    );
  }
  return out.join('\n');
}

async function main() {
  const check = process.argv.includes('--check');
  const doc = readFileSync(DOC, 'utf8');
  const s = doc.indexOf(START);
  const e = doc.indexOf(END);
  if (s < 0 || e < 0) throw new Error(`markers ${START} / ${END} not found in ${rel(DOC)}`);
  const next = `${doc.slice(0, s + START.length)}\n\n${render(analyse())}\n\n${doc.slice(e)}`;
  const config = (await prettier.resolveConfig(DOC)) ?? {};
  const formatted = await prettier.format(next, { ...config, filepath: DOC });
  if (check) {
    if (formatted !== doc) {
      console.error(`${rel(DOC)} is out of date: run node scripts/module-deps.mjs`);
      process.exit(1);
    }
    console.log(`${rel(DOC)} is up to date`);
    return;
  }
  writeFileSync(DOC, formatted);
  console.log(`wrote ${rel(DOC)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
