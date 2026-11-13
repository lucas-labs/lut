import { beforeAll, describe, expect, it } from 'vitest';
import { compilerSkips } from '../../scripts/compiler-coverage.mjs';

/**
 * The functions the React Compiler may leave uncompiled, by file and the start of its reason, each with why. Anything
 * else it skips fails here: the build skips silently, and no lint rule reports syntax the compiler does not support.
 */
const ALLOWED: { file: string; reason: string; why: string }[] = [
  {
    file: 'src/modules/editor/EditorPane.tsx',
    reason: 'Cannot access refs during render',
    why: "CodeMirror's extensions are built once and call the pane's latest handlers through refs",
  },
  ...[
    'src/modules/explorer/FileExplorer.tsx',
    'src/modules/git-history/GitHistoryPane.tsx',
    'src/modules/source-control/SourceControlPanel.tsx',
  ].map((file) => ({
    file,
    reason: 'Use of incompatible library',
    why: "TanStack Virtual's useVirtualizer returns a mutable instance the compiler cannot memoize",
  })),
];

describe('React Compiler coverage', () => {
  let skips: ReturnType<typeof compilerSkips> = [];
  beforeAll(() => {
    skips = compilerSkips(process.cwd());
  }, 120_000);

  it('compiles every component and hook outside the allowlist', () => {
    const unexpected = skips
      .filter((s) => !ALLOWED.some((a) => a.file === s.file && s.reason.startsWith(a.reason)))
      .map((s) => `${s.file}:${s.line ?? '?'} ${s.reason.split('\n')[0]}`);
    expect(unexpected).toEqual([]);
  });

  it('keeps no allowlist entry the compiler no longer needs', () => {
    const unused = ALLOWED.filter(
      (a) => !skips.some((s) => s.file === a.file && s.reason.startsWith(a.reason)),
    );
    expect(unused.map((a) => a.file)).toEqual([]);
  });
});
