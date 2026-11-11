// Builds packages/glyph-raster (Rust) to WebAssembly and copies the module next to its loader.
// The .wasm is committed, like Ghostty's, so the app build needs no wasm toolchain; rerun this
// after changing the crate and update the hash its test pins.
import { copyFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const crate = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'glyph-raster');
const target = 'wasm32-unknown-unknown';

const build = spawnSync('cargo', ['build', '--release', '--locked', '--target', target], {
  cwd: crate,
  stdio: 'inherit',
});
if (build.error || build.status !== 0) {
  process.stderr.write(
    `cargo build failed${build.error ? `: ${build.error.message}` : ''}\n` +
      `(the target is installed with: rustup target add ${target})\n`,
  );
  process.exit(build.status ?? 1);
}

const output = join(crate, 'glyph-raster.wasm');
copyFileSync(join(crate, 'target', target, 'release', 'lut_glyph_raster.wasm'), output);
const bytes = readFileSync(output);
const sha256 = createHash('sha256').update(bytes).digest('hex');
process.stdout.write(`glyph-raster.wasm: ${bytes.byteLength} bytes, sha256 ${sha256}\n`);
