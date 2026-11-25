import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  expressionAccepted,
  mitText,
  noticesFile,
  npmNotices,
  parseAccepted,
} from '../../scripts/notices.mjs';

const accepted = ['MIT', 'Apache-2.0', 'Apache-2.0 WITH LLVM-exception', 'MPL-2.0'];

describe('third-party notices (E25-03)', () => {
  it("reads the allowlist from lut's about.toml", () => {
    const toml = readFileSync(
      fileURLToPath(new URL('../../src-tauri/about.toml', import.meta.url)),
      'utf8',
    );
    const list = parseAccepted(toml);
    expect(list).toContain('MIT');
    expect(list).toContain('Apache-2.0');
    expect(list).not.toContain('GPL-3.0');
  });

  it('accepts an expression when one side of an OR, or both sides of an AND, are accepted', () => {
    expect(expressionAccepted('MIT', accepted)).toBe(true);
    expect(expressionAccepted('GPL-3.0', accepted)).toBe(false);
    expect(expressionAccepted('GPL-3.0 OR MIT', accepted)).toBe(true);
    expect(expressionAccepted('(MPL-2.0 OR Apache-2.0)', accepted)).toBe(true);
    expect(expressionAccepted('MIT AND GPL-3.0', accepted)).toBe(false);
    expect(expressionAccepted('(MIT OR GPL-3.0) AND Apache-2.0', accepted)).toBe(true);
    expect(expressionAccepted('Apache-2.0 WITH LLVM-exception', accepted)).toBe(true);
    expect(expressionAccepted('MIT/Apache-2.0', accepted)).toBe(true);
  });

  it('groups npm packages by license text, and gives an MIT package without a license file the MIT text', () => {
    const texts: Record<string, string | null> = { '/a': 'MIT text', '/b': 'MIT text', '/c': null };
    const { text, problems } = npmNotices(
      {
        MIT: [
          { name: 'a', versions: ['1.0.0'], paths: ['/a'], homepage: 'https://a.dev' },
          { name: 'b', versions: ['2.0.0'], paths: ['/b'] },
          { name: 'c', versions: ['3.0.0'], paths: ['/c'], author: 'Ada' },
        ],
      },
      accepted,
      (directory) => texts[directory] ?? null,
    );
    expect(problems).toEqual([]);
    expect(text.match(/^MIT, used by:$/gm)).toHaveLength(2);
    expect(text).toContain('  - a@1.0.0 (https://a.dev)\n  - b@2.0.0\n\nMIT text');
    expect(text).toContain(`  - c@3.0.0\n\n${mitText('Ada')}`);
  });

  it('reports a license outside the allowlist, an unknown one, and a non-MIT package without a license file', () => {
    const { problems } = npmNotices(
      {
        'GPL-3.0': [{ name: 'copyleft', versions: ['1.0.0'], paths: ['/x'] }],
        Unknown: [{ name: 'mystery', versions: ['1.0.0'], paths: ['/y'] }],
        'Apache-2.0': [{ name: 'textless', versions: ['1.0.0'], paths: ['/z'] }],
      },
      accepted,
      () => null,
    );
    expect(problems).toEqual([
      "copyleft@1.0.0: license GPL-3.0 is not in src-tauri/about.toml's accepted list",
      "mystery@1.0.0: license Unknown is not in src-tauri/about.toml's accepted list",
      'textless@1.0.0: Apache-2.0, but it ships no license file',
    ]);
  });

  it('takes the license a package states in its file when package.json names none', () => {
    const { problems } = npmNotices(
      { Unknown: [{ name: 'khroma', versions: ['2.1.0'], paths: ['/k'] }] },
      accepted,
      () => 'The MIT License (MIT)',
    );
    expect(problems).toEqual([]);
  });

  it('puts the Rust crates first and the npm packages second', () => {
    const file = noticesFile('rust part', 'npm part');
    expect(file.indexOf('Part 1: Rust crates')).toBeLessThan(file.indexOf('rust part'));
    expect(file.indexOf('rust part')).toBeLessThan(file.indexOf('Part 2: npm packages'));
    expect(file.indexOf('Part 2: npm packages')).toBeLessThan(file.indexOf('npm part'));
  });
});
