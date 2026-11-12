// Builds lut's app icons and logo from the artwork in src-tauri/icons/source/:
//   icon-<size>.png  one export per size, each adjusted by hand for its size;
//   icon.ico         the exports from 16 to 256 px packed together.
// Every bundle file is an export as it is, or the macOS .icns packed from them: nothing is rescaled.
//
// usage: pnpm icons
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'src-tauri', 'icons');
const source = join(icons, 'source');

/** Bundle file -> the export it is. */
const EXPORTS = {
  'icon.ico': 'icon.ico',
  '32x32.png': 'icon-32.png',
  '64x64.png': 'icon-64.png',
  '128x128.png': 'icon-128.png',
  '128x128@2x.png': 'icon-256.png',
  'icon.png': 'icon-512.png',
};

/**
 * The .icns entries (type -> export), PNG payloads only: the 1x sizes and their 2x (retina) doubles. `icp4`/`icp5`
 * take PNG since macOS 10.7; lut requires 13.
 */
const ICNS = {
  icp4: 16,
  ic11: 32,
  icp5: 32,
  ic12: 64,
  ic07: 128,
  ic13: 256,
  ic08: 256,
  ic14: 512,
  ic09: 512,
  ic10: 1024,
};

/** An Apple icon image: the `icns` header and one (type, length, data) entry per image; lengths include headers. */
function icns(entries) {
  const chunks = entries.map(([type, png]) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 'latin1');
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'latin1');
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

for (const [file, from] of Object.entries(EXPORTS))
  copyFileSync(join(source, from), join(icons, file));
writeFileSync(
  join(icons, 'icon.icns'),
  icns(
    Object.entries(ICNS).map(([type, size]) => [
      type,
      readFileSync(join(source, `icon-${size}.png`)),
    ]),
  ),
);
copyFileSync(join(source, 'icon-256.png'), join(root, 'public', 'logo.png'));
console.log('icons written to src-tauri/icons and public/logo.png');
