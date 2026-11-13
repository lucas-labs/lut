// Runs the React Compiler over the app's source as the Vite build does (babel-plugin-react-compiler, target 19) and
// reports every function it did not compile. The build skips those silently: they still work, unoptimized, and no lint
// rule reports the syntax the compiler does not support yet.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const compilerPlugin = require.resolve('babel-plugin-react-compiler');

const SKIP_EVENTS = new Set(['CompileError', 'PipelineError', 'CompileSkip']);

/** The non-test `.ts`/`.tsx` files under `dir`. */
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.|\.d\.ts$/.test(entry.name) ? [path] : [];
  });
}

/**
 * The functions the compiler skipped, as `{ file, line, reason }` with `file` relative to `root` and `/`-separated.
 * @param {string} root the repository root
 * @returns {{ file: string; line: number | null; reason: string }[]}
 */
export function compilerSkips(root) {
  const skips = [];
  for (const path of sourceFiles(join(root, 'src'))) {
    const file = relative(root, path).split(sep).join('/');
    const logger = {
      logEvent(_filename, event) {
        // A `'use no memo'` opt-out is a skip too; its reason is on the event itself.
        if (!SKIP_EVENTS.has(event.kind)) return;
        const detail = event.detail ?? {};
        const reason = String(
          event.reason ?? detail.reason ?? detail.options?.reason ?? event.data ?? event.kind,
        );
        skips.push({ file, line: event.fnLoc?.start?.line ?? null, reason });
      },
    };
    babel.transformSync(readFileSync(path, 'utf8'), {
      filename: path,
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ['typescript', 'jsx'] },
      plugins: [[compilerPlugin, { target: '19', logger }]],
    });
  }
  return skips;
}
