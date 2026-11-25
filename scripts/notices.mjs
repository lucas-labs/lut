// Third-party notices (E25-03): writes `dist/licenses/third-party.txt`, the licenses of every Rust crate and npm
// package lut ships, so each bundle carries the license texts and copyright notices they ask for. Runs after
// `pnpm build` in `beforeBuildCommand`; `pnpm tauri dev` never needs it.
//
// - Rust: `cargo about` (installed with `cargo install --locked cargo-about --features cli`), configured by
//   `src-tauri/about.toml` and rendered with `src-tauri/about.hbs`.
// - npm: the production packages from `pnpm licenses list --prod --json`, each with its own license file.
//
// Both halves use the allowlist in `src-tauri/about.toml`: a dependency under another license fails the build until
// it is reviewed and added there.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Packages whose `package.json` names no license although their license file does (checked by hand). The value is
 * the license their file states.
 */
export const LICENSE_OVERRIDES = {
  khroma: 'MIT', // `license` file: "The MIT License (MIT)"; package.json has no `license` field.
};

/** The `accepted = [...]` list of an `about.toml`. */
export function parseAccepted(toml) {
  const block = /^accepted\s*=\s*\[([\s\S]*?)\]/m.exec(toml);
  if (!block) throw new Error('about.toml has no `accepted` list');
  return [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

/**
 * Whether an SPDX expression is satisfied by the accepted licenses: one side of an `OR` is enough, both sides of an
 * `AND` are needed, and `A WITH B` must be accepted as written. npm's legacy `A/B` counts as `A OR B`.
 */
export function expressionAccepted(expression, accepted) {
  const tokens = expression
    .replace(/\//g, ' OR ')
    .replace(/([()])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];
  function atom() {
    if (peek() === '(') {
      take();
      const value = or();
      if (take() !== ')') throw new Error(`unbalanced license expression: ${expression}`);
      return value;
    }
    let id = take();
    if (id === undefined) throw new Error(`incomplete license expression: ${expression}`);
    if (peek() === 'WITH') {
      take();
      id = `${id} WITH ${take()}`;
    }
    return accepted.includes(id);
  }
  function and() {
    let value = atom();
    while (peek() === 'AND') {
      take();
      value = atom() && value;
    }
    return value;
  }
  function or() {
    let value = and();
    while (peek() === 'OR') {
      take();
      value = and() || value;
    }
    return value;
  }
  const value = or();
  if (at !== tokens.length)
    throw new Error(`unexpected token in license expression: ${expression}`);
  return value;
}

/** The text of a package's license file (`LICENSE`, `LICENCE`, `COPYING`, any case or extension), or null. */
export function readLicenseFile(directory) {
  const file = readdirSync(directory)
    .filter((name) => /^(licen[cs]e|copying)/i.test(name))
    .sort()[0];
  return file ? readFileSync(join(directory, file), 'utf8').replace(/\r\n/g, '\n').trim() : null;
}

/** The MIT license with a package's author, for an MIT package that ships no license file. */
export function mitText(author) {
  return `MIT License

Copyright (c) ${author || 'the package authors'}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
}

/**
 * The npm half of the notices from `pnpm licenses list --json` output: packages grouped by identical license text,
 * each group listing its packages (name, version, homepage). Returns the text and the problems found (a license
 * outside the allowlist, or no license text), which fail the build.
 *
 * @param {Record<string, {name: string, versions: string[], paths: string[], author?: string, homepage?: string}[]>} list
 * @param {string[]} accepted
 * @param {(directory: string) => string | null} readText
 */
export function npmNotices(list, accepted, readText = readLicenseFile) {
  const groups = new Map();
  const problems = [];
  for (const [listed, packages] of Object.entries(list)) {
    for (const pkg of packages) {
      const license = LICENSE_OVERRIDES[pkg.name] ?? listed;
      pkg.versions.forEach((version, index) => {
        const id = `${pkg.name}@${version}`;
        if (license === 'Unknown' || !expressionAccepted(license, accepted)) {
          problems.push(`${id}: license ${license} is not in src-tauri/about.toml's accepted list`);
          return;
        }
        let text = readText(pkg.paths[index] ?? pkg.paths[0]);
        if (!text && license === 'MIT') text = mitText(pkg.author);
        if (!text) {
          problems.push(`${id}: ${license}, but it ships no license file`);
          return;
        }
        const entry = `  - ${id}${pkg.homepage ? ` (${pkg.homepage})` : ''}`;
        const group = groups.get(text) ?? { license, entries: [] };
        group.entries.push(entry);
        groups.set(text, group);
      });
    }
  }
  const sections = [...groups.entries()]
    .map(([text, { license, entries }]) => ({ license, entries: entries.sort(), text }))
    .sort((a, b) => a.license.localeCompare(b.license) || a.entries[0].localeCompare(b.entries[0]))
    .map(
      ({ license, entries, text }) =>
        `--------------------------------------------------------------------------------\n${license}, used by:\n${entries.join('\n')}\n\n${text}\n`,
    );
  return { text: sections.join('\n'), problems };
}

/** The whole notices file from its two halves. */
export function noticesFile(rust, npm) {
  return `Third-party notices for lut
===========================

lut is licensed under the Apache License 2.0. It includes the open-source software listed below, each under the
license that follows its list. Part 1 lists the Rust crates in the lut and lut-cli executables; part 2 the npm
packages in its interface. Terax's attribution and the terminal's licenses ship with lut as files of their own.

================================================================================
Part 1: Rust crates
================================================================================
${rust.trim()}

================================================================================
Part 2: npm packages
================================================================================

${npm.trim()}
`;
}

function run(command, args, root) {
  const options = {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  };
  // pnpm is a `.cmd` shim on Windows, which only a shell runs; the arguments here are fixed strings.
  const result =
    process.platform === 'win32' && command === 'pnpm'
      ? spawnSync([command, ...args].join(' '), { ...options, shell: true })
      : spawnSync(command, args, options);
  if (result.error) {
    const hint =
      command === 'cargo' ? ' (install it: cargo install --locked cargo-about --features cli)' : '';
    throw new Error(`could not run ${command}: ${result.error.message}${hint}`);
  }
  if (result.status !== 0) {
    const hint =
      command === 'cargo'
        ? "\ncargo about failed: a crate's license is missing from src-tauri/about.toml, or cargo-about is not" +
          ' installed (cargo install --locked cargo-about --features cli).'
        : '';
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}${hint}`);
  }
  return result.stdout;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tauri = join(root, 'src-tauri');
  const out = join(root, 'dist', 'licenses', 'third-party.txt');
  try {
    if (!existsSync(join(root, 'dist')))
      throw new Error('dist/ is missing: run `pnpm build` first');
    const accepted = parseAccepted(readFileSync(join(tauri, 'about.toml'), 'utf8'));
    // `cargo about` writes the file itself: it refuses a redirected stdout on Windows (encoding).
    const scratch = mkdtempSync(join(tmpdir(), 'lut-notices-'));
    const rustFile = join(scratch, 'rust.txt');
    run(
      'cargo',
      [
        'about',
        'generate',
        '--frozen',
        '--fail',
        '--manifest-path',
        join(tauri, 'Cargo.toml'),
        '-c',
        join(tauri, 'about.toml'),
        join(tauri, 'about.hbs'),
        '-o',
        rustFile,
      ],
      root,
    );
    const rust = readFileSync(rustFile, 'utf8');
    rmSync(scratch, { recursive: true, force: true });
    const npm = npmNotices(
      JSON.parse(run('pnpm', ['licenses', 'list', '--prod', '--json'], root)),
      accepted,
    );
    if (npm.problems.length) {
      throw new Error(`npm packages without an accepted license:\n  ${npm.problems.join('\n  ')}`);
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, noticesFile(rust, npm.text));
    console.log(`third-party notices: ${out}`);
  } catch (error) {
    console.error(`notices: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
