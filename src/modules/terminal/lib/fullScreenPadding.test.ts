import { describe, expect, it } from 'vitest';
import { fillsFullScreen, needsRunningPrograms } from './fullScreenPadding';

const rule = (fill: boolean, keepPadding: string[] = []) => ({ fill, keepPadding });

describe('fillsFullScreen', () => {
  it('keeps the padding for every program when full-screen programs do not fill the pane', () => {
    expect(needsRunningPrograms(rule(false, ['claude']))).toBe(false);
    expect(fillsFullScreen(rule(false, ['claude']), null)).toBe(false);
    expect(fillsFullScreen(rule(false), ['nvim'])).toBe(false);
  });

  it('drops it for every program without exceptions, with no need to know which runs', () => {
    expect(needsRunningPrograms(rule(true))).toBe(false);
    expect(fillsFullScreen(rule(true), null)).toBe(true);
  });

  it('keeps it while the programs are not known, then drops it unless one of them is an exception', () => {
    const keepClaude = rule(true, ['claude']);
    expect(needsRunningPrograms(keepClaude)).toBe(true);
    expect(fillsFullScreen(keepClaude, null)).toBe(false);
    expect(fillsFullScreen(keepClaude, ['nvim'])).toBe(true);
    expect(fillsFullScreen(keepClaude, ['node', 'claude'])).toBe(false);
    expect(fillsFullScreen(keepClaude, [])).toBe(true);
  });
});
