import { describe, expect, it } from 'vitest';
import { gitStatusTextClass } from './gitStatusColor';

describe('git status colours', () => {
  it('maps each status code to a theme colour', () => {
    expect(gitStatusTextClass('M')).toBe('text-warning');
    expect(gitStatusTextClass('A')).toBe('text-[var(--terminal-ansi-green)]');
    expect(gitStatusTextClass('D')).toBe('text-[var(--terminal-ansi-red)]');
    expect(gitStatusTextClass('R')).toBe('text-[var(--terminal-ansi-blue)]');
    expect(gitStatusTextClass('?')).toBe('text-muted-foreground');
  });

  it('treats adds and untracked, and renames and copies, alike', () => {
    expect(gitStatusTextClass('U')).toBe(gitStatusTextClass('A'));
    expect(gitStatusTextClass('C')).toBe(gitStatusTextClass('R'));
  });
});
