#!/usr/bin/env node
// Builds lut-icons.replacements.json: for each lut-icon, the HugeIcons it replaces in the app.
//
// Input: scripts/lut-icons.map.json, exported from the inventory artifact ("Export
// lut-icons.map.json" on the Migration tab): [{ icon, names: [..], replaces: [..] }].
// Every name must be an icon drawn in the VectorCraft file; otherwise the build fails and leaves
// the previous file untouched.
//
// Usage: node scripts/replacements.mjs [--map <file>] [--source <file>] [--out <file>]

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readIcons } from './vectorcraft.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return resolve(i > -1 ? process.argv[i + 1] : fallback);
};
const mapPath = arg('--map', resolve(root, 'scripts/lut-icons.map.json'));
const sourcePath = arg('--source', resolve(root, 'craft/lut-icons.vectorcraft'));
const outPath = arg('--out', resolve(root, 'lut-icons.replacements.json'));

const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const { icons } = readIcons(sourcePath);

const errors = [];
const out = {};
for (const entry of map) {
  for (const name of entry.names) {
    if (!icons.has(name)) { errors.push(`${name} (${entry.icon}): not drawn in ${sourcePath}`); continue; }
    out[name] = [...new Set([...(out[name] ?? []), ...entry.replaces])].sort();
  }
}

if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`${errors.length} unknown icons; ${outPath} was not written.`);
  process.exit(1);
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n');
console.log(`${Object.keys(sorted).length} icons → ${outPath}`);
