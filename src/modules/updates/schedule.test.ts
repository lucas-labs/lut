import { describe, expect, it } from 'vitest';
import { CHECK_INTERVAL_MS, isCheckDue, resolveChannel } from './schedule';

describe('resolveChannel', () => {
  it('follows the installed version when no channel was chosen', () => {
    expect(resolveChannel(null, '0.10.0')).toBe('stable');
    expect(resolveChannel(null, '0.11.0-beta.2')).toBe('beta');
  });

  it('keeps a chosen channel whatever the version', () => {
    expect(resolveChannel('beta', '0.10.0')).toBe('beta');
    expect(resolveChannel('stable', '0.11.0-beta.2')).toBe('stable');
  });
});

describe('isCheckDue', () => {
  const now = 1_800_000_000_000;

  it('is due when lut never checked', () => {
    expect(isCheckDue(null, now)).toBe(true);
  });

  it('waits for the interval after a check', () => {
    expect(isCheckDue(now - CHECK_INTERVAL_MS + 1, now)).toBe(false);
    expect(isCheckDue(now - CHECK_INTERVAL_MS, now)).toBe(true);
  });

  it('is due when the clock went back past the last check', () => {
    expect(isCheckDue(now + 60_000, now)).toBe(true);
  });
});
