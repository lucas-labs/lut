import type { Tab } from '@/modules/tabs';
import { describe, expect, it } from 'vitest';
import { breadcrumbFilePath, explorerFilePath } from './activeFilePath';

const base = { id: 1, spaceId: 'default', title: 't' };
const editor = {
  ...base,
  kind: 'editor',
  path: 'C:/repo/a.ts',
  dirty: false,
  preview: false,
} as Tab;
const markdown = { ...base, kind: 'markdown', path: '/repo/README.md' } as Tab;
const diff = (path: string, repoRoot = '/repo/') =>
  ({
    ...base,
    kind: 'git-diff',
    path,
    repoRoot,
    mode: '+',
    originalPath: null,
    preview: false,
  }) as Tab;
const commitFile = {
  ...base,
  kind: 'git-commit-file',
  repoRoot: 'C:\\repo\\',
  sha: 'abc',
  shortSha: 'abc',
  subject: 's',
  path: '\\src\\b.ts',
  originalPath: null,
} as Tab;
const terminal = {
  ...base,
  kind: 'terminal',
  paneTree: { kind: 'leaf', id: 2 },
  activeLeafId: 2,
} as Tab;

describe('breadcrumbFilePath', () => {
  it("shows an editor's file", () => {
    expect(breadcrumbFilePath(editor)).toBe('C:/repo/a.ts');
  });

  it("shows a diff's file under its repository, unless the path is absolute", () => {
    expect(breadcrumbFilePath(diff('/src/a.ts'))).toBe('/src/a.ts');
    expect(breadcrumbFilePath(diff('D:/x/a.ts'))).toBe('D:/x/a.ts');
    expect(breadcrumbFilePath(diff('src/a.ts'))).toBe('/repo/src/a.ts');
  });

  it("shows a commit file's path under its repository", () => {
    expect(breadcrumbFilePath(commitFile)).toBe('C:\\repo/src\\b.ts');
  });

  it('shows no file for other tabs', () => {
    expect(breadcrumbFilePath(markdown)).toBeNull();
    expect(breadcrumbFilePath(terminal)).toBeNull();
    expect(breadcrumbFilePath(undefined)).toBeNull();
  });
});

describe('explorerFilePath', () => {
  it('marks editor and markdown files only', () => {
    expect(explorerFilePath(editor)).toBe('C:/repo/a.ts');
    expect(explorerFilePath(markdown)).toBe('/repo/README.md');
    expect(explorerFilePath(diff('src/a.ts'))).toBeNull();
    expect(explorerFilePath(undefined)).toBeNull();
  });
});
