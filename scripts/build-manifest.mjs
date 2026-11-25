// The updater manifest of a release (E25-02, `.docs/development/releasing.md`): one `latest.json` written once, after
// every target's job, from the updater bundles and their `.sig` files.
//
// CLI:  node scripts/build-manifest.mjs build <dir> <tag> <owner/repo>   writes <dir>/latest.json
//       node scripts/build-manifest.mjs publish <latest.json> <notes-file> <published-at>
//                                            sets the published release's notes and date (manifests job)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The platform keys every release must carry. The updater looks for `{os}-{arch}-{installer}`, then `{os}-{arch}`
 * (tauri-plugin-updater `get_urls`); on Linux the plain key is the AppImage.
 */
export const REQUIRED_PLATFORMS = [
  'windows-x86_64',
  'windows-x86_64-nsis',
  'darwin-aarch64',
  'darwin-aarch64-app',
  'darwin-x86_64',
  'darwin-x86_64-app',
  'linux-x86_64',
  'linux-x86_64-appimage',
  'linux-x86_64-deb',
  'linux-x86_64-rpm',
  'linux-aarch64',
  'linux-aarch64-appimage',
  'linux-aarch64-deb',
  'linux-aarch64-rpm',
];

/** The architecture a bundle's name says, in the updater's words. */
function archOf(name) {
  if (/(^|[_.-])(x64|amd64|x86_64)([_.-]|$)/.test(name)) return 'x86_64';
  if (/(^|[_.-])(aarch64|arm64)([_.-]|$)/.test(name)) return 'aarch64';
  return null;
}

/** The manifest keys an updater bundle serves, from its file name; `[]` for a file the updater does not use. */
export function platformKeys(name) {
  const arch = archOf(name);
  if (!arch) return [];
  if (name.endsWith('-setup.exe'))
    return arch === 'x86_64' ? ['windows-x86_64', 'windows-x86_64-nsis'] : [];
  if (name.endsWith('.app.tar.gz')) return [`darwin-${arch}`, `darwin-${arch}-app`];
  if (name.endsWith('.AppImage')) return [`linux-${arch}`, `linux-${arch}-appimage`];
  if (name.endsWith('.deb')) return [`linux-${arch}-deb`];
  if (name.endsWith('.rpm')) return [`linux-${arch}-rpm`];
  return [];
}

/**
 * `latest.json` for `bundles` (`{ name, signature }`), each downloaded from the release of `tag`. Throws when a
 * required platform is missing or two bundles claim the same one.
 */
export function buildManifest({ version, tag, repo, bundles, pubDate }) {
  const platforms = {};
  for (const { name, signature } of bundles) {
    const url = `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;
    for (const key of platformKeys(name)) {
      if (platforms[key])
        throw new Error(`${key} is served by both ${basename(platforms[key].url)} and ${name}`);
      platforms[key] = { signature: signature.trim(), url };
    }
  }
  const missing = REQUIRED_PLATFORMS.filter((key) => !platforms[key]);
  if (missing.length > 0) throw new Error(`the release has no bundle for ${missing.join(', ')}`);
  return { version, notes: '', pub_date: pubDate, platforms };
}

/** The manifest of a published release: its notes and the time it was published. */
export function publishedManifest(manifest, notes, publishedAt) {
  return { ...manifest, notes: notes.trim(), pub_date: publishedAt };
}

/** Every file under `dir`, at any depth (the workflow's artifacts are one folder per target). */
function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'build') {
    const [dir, tag, repo] = args;
    const files = filesUnder(dir);
    const bundles = files
      .filter((path) => files.includes(`${path}.sig`) && platformKeys(basename(path)).length > 0)
      .map((path) => ({ name: basename(path), signature: readFileSync(`${path}.sig`, 'utf8') }));
    const manifest = buildManifest({
      version: tag.replace(/^v/, ''),
      tag,
      repo,
      bundles,
      pubDate: new Date().toISOString(),
    });
    writeFileSync(join(dir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`latest.json: ${Object.keys(manifest.platforms).length} platforms\n`);
  } else if (mode === 'publish') {
    const [path, notesFile, publishedAt] = args;
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    const notes = readFileSync(notesFile, 'utf8');
    writeFileSync(
      path,
      `${JSON.stringify(publishedManifest(manifest, notes, publishedAt), null, 2)}\n`,
    );
  } else {
    process.stderr.write(
      'usage: build-manifest.mjs build <dir> <tag> <owner/repo> | publish <latest.json> <notes> <date>\n',
    );
    process.exit(1);
  }
}
