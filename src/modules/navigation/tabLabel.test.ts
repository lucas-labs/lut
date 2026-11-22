import type { TerminalTab } from '@/modules/navigation';
import { describe, expect, it } from 'vitest';
import { labelFor } from './tabLabel';

function terminalTab(over: Partial<TerminalTab> = {}): TerminalTab {
  return {
    id: 1,
    kind: 'terminal',
    spaceId: 'default',
    title: 'shell',
    paneTree: { kind: 'leaf', id: 2 },
    activeLeafId: 2,
    ...over,
  };
}

describe('labelFor (terminal tabs)', () => {
  it('derives the label from the last cwd segment', () => {
    expect(labelFor(terminalTab({ cwd: '/Users/me/projects/lut-ai' }))).toBe('lut-ai');
  });

  it('falls back to the title when there is no cwd', () => {
    expect(labelFor(terminalTab({ title: 'private' }))).toBe('private');
  });

  it('prefers a custom title over the cwd-derived name', () => {
    expect(labelFor(terminalTab({ cwd: '/Users/me/projects/lut-ai', customTitle: 'Server' }))).toBe(
      'Server',
    );
  });

  it('keeps the custom title after the cwd changes (survives cd)', () => {
    const renamed = terminalTab({ cwd: '/Users/me/a', customTitle: 'Server' });
    const afterCd = { ...renamed, cwd: '/Users/me/b/c' };
    expect(labelFor(afterCd)).toBe('Server');
  });

  it('handles Windows-style cwd separators', () => {
    expect(labelFor(terminalTab({ cwd: 'C:\\Users\\me\\proj' }))).toBe('proj');
  });
});

describe('labelFor (shell titles)', () => {
  const allowed = (profileId: string | undefined) => profileId !== 'quiet';
  const split = (over: Partial<TerminalTab> = {}) =>
    terminalTab({
      cwd: '/Users/me/projects/lut',
      paneTree: {
        kind: 'split',
        id: 1,
        dir: 'row',
        ratios: [0.5, 0.5],
        children: [
          { kind: 'leaf', id: 2, shellTitle: 'vim notes.md' },
          { kind: 'leaf', id: 3, profileId: 'quiet', shellTitle: 'htop' },
        ],
      },
      ...over,
    });

  it("uses the title the active pane's shell set when its profile allows it", () => {
    expect(labelFor(split(), allowed)).toBe('vim notes.md');
  });

  it("ignores the title when the active pane's profile does not allow it", () => {
    expect(labelFor(split({ activeLeafId: 3 }), allowed)).toBe('lut');
  });

  it("follows the active pane, not another pane's title", () => {
    const tab = split();
    const other = { ...tab, activeLeafId: 3 };
    expect(labelFor(other, () => true)).toBe('htop');
    expect(labelFor(tab, () => true)).toBe('vim notes.md');
  });

  it('keeps the custom title over the shell title', () => {
    expect(labelFor(split({ customTitle: 'Server' }), allowed)).toBe('Server');
  });

  it('shows no shell title without a policy', () => {
    expect(labelFor(split())).toBe('lut');
  });

  it('falls back to the folder when the pane has no shell title', () => {
    expect(labelFor(terminalTab({ cwd: '/Users/me/projects/lut' }), () => true)).toBe('lut');
  });
});
