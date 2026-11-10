// Builds lut's app icons and logo from the artwork in src-tauri/icons/source/:
//   icon-<size>.png  one export per size, each adjusted by hand for its size;
//   icon.ico         the exports from 16 to 256 px packed together.
// Wherever a bundle file has the size of an export, the export is used as it is. `tauri icon` renders only the rest
// (the macOS .icns, the 64 px PNG and the Microsoft Store logos) from the 1024 px export.
//
// usage: pnpm icons
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'src-tauri', 'icons');
const source = join(icons, 'source');

/** Bundle file -> the export it is. */
const EXPORTS = {
  'icon.ico': 'icon.ico',
  '32x32.png': 'icon-32.png',
  '128x128.png': 'icon-128.png',
  '128x128@2x.png': 'icon-256.png',
  'icon.png': 'icon-512.png',
};
/** Bundle files no export matches, taken from `tauri icon`. */
const RENDERED = [
  'icon.icns',
  '64x64.png',
  'StoreLogo.png',
  ...[30, 44, 71, 89, 107, 142, 150, 284, 310].map((s) => `Square${s}x${s}Logo.png`),
];

const rendered = mkdtempSync(join(tmpdir(), 'lut-icons-'));
try {
  const cli = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  const result = spawnSync(
    process.execPath,
    [cli, 'icon', join(source, 'icon-1024.png'), '-o', rendered],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) throw new Error(`tauri icon failed (exit code ${result.status})`);
  for (const file of RENDERED) copyFileSync(join(rendered, file), join(icons, file));
} finally {
  rmSync(rendered, { recursive: true, force: true });
}

for (const [file, from] of Object.entries(EXPORTS))
  copyFileSync(join(source, from), join(icons, file));
copyFileSync(join(source, 'icon-256.png'), join(root, 'public', 'logo.png'));
console.log('icons written to src-tauri/icons and public/logo.png');
