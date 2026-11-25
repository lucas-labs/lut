// Starts a lut release (E25-02, `.docs/development/releasing.md`): writes the version into every file that holds it,
// commits `release: 🔖 vX.Y.Z` and creates the signed tag `vX.Y.Z`. Pushing is left to the person releasing.
//
// CLI:  pnpm release <version>        on an up-to-date, clean master
//       node scripts/release.mjs --verify <tag>   the release workflow's check: the tag's form and the files agree
//       node scripts/release.mjs --newer <a> <b>  prints "true" when version a is newer than b (manifests job)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/;

/** `X.Y.Z` or `X.Y.Z-beta.N` as numbers (`beta` is `null` for a stable version); `null` for any other form. */
export function parseVersion(text) {
  const match = VERSION.exec(text);
  if (!match) return null;
  const [major, minor, patch, beta] = match
    .slice(1, 5)
    .map((part) => (part === undefined ? null : Number(part)));
  return { major, minor, patch, beta };
}

/** Semver order of two versions lut accepts: negative when `a` is older; a beta comes before its stable version. */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error(`not a lut version: ${x ? b : a}`);
  for (const key of ['major', 'minor', 'patch']) {
    if (x[key] !== y[key]) return x[key] - y[key];
  }
  if (x.beta === y.beta) return 0;
  if (x.beta === null) return 1;
  if (y.beta === null) return -1;
  return x.beta - y.beta;
}

/** Whether `version` is newer than `than`; anything is newer than no version. */
export function isNewer(version, than) {
  return than === null || compareVersions(version, than) > 0;
}

/** The version for tag `vX.Y.Z` or `vX.Y.Z-beta.N`, or `null` for a tag of any other form. */
export function versionOfTag(tag) {
  return tag.startsWith('v') && parseVersion(tag.slice(1)) ? tag.slice(1) : null;
}

/** Where a TOML table's body (`[package]` or `[workspace.package]`) starts and ends. */
function tomlTable(toml, table) {
  const header = new RegExp(`^\\[${table.replace('.', '\\.')}\\]\\r?\\n`, 'm').exec(toml);
  if (!header) throw new Error(`Cargo.toml has no [${table}]`);
  const body = header.index + header[0].length;
  const next = toml.slice(body).search(/^\[/m);
  return { body, end: next < 0 ? toml.length : body + next };
}

/** The versions `Cargo.toml` holds: its package's and the workspace's. */
export function cargoVersions(toml) {
  return ['package', 'workspace.package'].map((table) => {
    const { body, end } = tomlTable(toml, table);
    const match = /^version = "([^"]*)"$/m.exec(toml.slice(body, end));
    if (!match) throw new Error(`Cargo.toml [${table}] has no version`);
    return match[1];
  });
}

/** `Cargo.toml` with `version` set in `[package]` and `[workspace.package]`. */
export function setCargoVersion(toml, version) {
  let out = toml;
  for (const table of ['package', 'workspace.package']) {
    const { body, end } = tomlTable(out, table);
    const section = out.slice(body, end).replace(/^version = "[^"]*"$/m, `version = "${version}"`);
    out = out.slice(0, body) + section + out.slice(end);
  }
  return out;
}

/** `package.json` with `version` set, keeping its formatting. */
export function setPackageVersion(json, version) {
  const out = json.replace(/^(\s*"version": )"[^"]*"/m, `$1"${version}"`);
  if (out === json && !json.includes(`"version": "${version}"`))
    throw new Error('package.json has no version');
  return out;
}

/** The version every file agrees on, or the list of disagreements. */
export function fileVersions(packageJson, cargoToml) {
  const versions = {
    'package.json': JSON.parse(packageJson).version,
    'Cargo.toml [package]': cargoVersions(cargoToml)[0],
    'Cargo.toml [workspace.package]': cargoVersions(cargoToml)[1],
  };
  const distinct = [...new Set(Object.values(versions))];
  return distinct.length === 1 ? { version: distinct[0] } : { mismatch: versions };
}

/** Why a release of `version` cannot start from `current`, or `null` when it can. */
export function releaseProblem(version, current) {
  if (!parseVersion(version)) return `${version} is not X.Y.Z or X.Y.Z-beta.N`;
  if (!isNewer(version, current)) return `${version} is not newer than ${current}`;
  return null;
}

function fail(message) {
  process.stderr.write(`release: ${message}\n`);
  process.exit(1);
}

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const packagePath = join(root, 'package.json');
  const cargoPath = join(root, 'src-tauri', 'Cargo.toml');
  const read = () =>
    fileVersions(readFileSync(packagePath, 'utf8'), readFileSync(cargoPath, 'utf8'));
  const [first, second, third] = process.argv.slice(2);

  if (first === '--newer') {
    process.stdout.write(`${isNewer(second, third || null)}\n`);
  } else if (first === '--verify') {
    const version = versionOfTag(second ?? '');
    if (!version) fail(`tag ${second} is not vX.Y.Z or vX.Y.Z-beta.N`);
    const files = read();
    if (files.mismatch) fail(`the files disagree: ${JSON.stringify(files.mismatch)}`);
    if (files.version !== version) fail(`tag ${second} but the files hold ${files.version}`);
    process.stdout.write(`${version}\n`);
  } else if (first && !first.startsWith('-')) {
    const version = first;
    const files = read();
    if (files.mismatch) fail(`the files disagree: ${JSON.stringify(files.mismatch)}`);
    const problem = releaseProblem(version, files.version);
    if (problem) fail(problem);
    if (git(root, 'rev-parse', '--abbrev-ref', 'HEAD') !== 'master')
      fail('releases start on master');
    if (git(root, 'status', '--porcelain')) fail('the working tree has changes');
    git(root, 'fetch', '--quiet', 'origin', 'master');
    if (git(root, 'rev-parse', 'HEAD') !== git(root, 'rev-parse', 'origin/master')) {
      fail('master is not the same as origin/master');
    }

    writeFileSync(packagePath, setPackageVersion(readFileSync(packagePath, 'utf8'), version));
    writeFileSync(cargoPath, setCargoVersion(readFileSync(cargoPath, 'utf8'), version));
    execFileSync('cargo', ['update', '--workspace', '--manifest-path', cargoPath], {
      cwd: root,
      stdio: 'inherit',
    });
    git(root, 'add', 'package.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock');
    git(root, 'commit', '--quiet', '-m', `release: 🔖 v${version}`);
    git(root, 'tag', '-s', `v${version}`, '-m', `lut v${version}`);
    process.stdout.write(
      `Committed and tagged v${version}. Review it, then push both:\n  git push origin master v${version}\n`,
    );
  } else {
    fail('usage: pnpm release <X.Y.Z | X.Y.Z-beta.N>');
  }
}
