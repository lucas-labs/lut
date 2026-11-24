import { describe, expect, it } from 'vitest';
import { programName, programNames } from './programName';

describe('programName', () => {
  it('drops the directory, the launcher extension and the case', () => {
    expect(programName('nvim')).toBe('nvim');
    expect(programName('/usr/local/bin/nvim')).toBe('nvim');
    expect(programName('C:\\Program Files\\Neovim\\bin\\NVim.EXE')).toBe('nvim');
    expect(programName('claude.cmd')).toBe('claude');
    expect(programName('  htop  ')).toBe('htop');
  });

  it('keeps any other extension', () => {
    expect(programName('python3.12')).toBe('python3.12');
  });
});

describe('programNames', () => {
  it('names each program once, without blanks, in order', () => {
    expect(programNames(['Vim.exe', '', 'htop', 'vim', '  '])).toEqual(['vim', 'htop']);
  });
});
