import { describe, expect, it } from 'vitest';
import { coerceUpdateChannel, coerceUpdatesEnabled } from './store';

describe('coerceUpdatesEnabled', () => {
  it('keeps a stored boolean', () => {
    expect(coerceUpdatesEnabled(false)).toBe(false);
    expect(coerceUpdatesEnabled(true)).toBe(true);
  });

  it('falls back to enabled for anything else', () => {
    expect(coerceUpdatesEnabled('false')).toBe(true);
    expect(coerceUpdatesEnabled(undefined)).toBe(true);
  });
});

describe('coerceUpdateChannel', () => {
  it('keeps a chosen channel', () => {
    expect(coerceUpdateChannel('stable')).toBe('stable');
    expect(coerceUpdateChannel('beta')).toBe('beta');
  });

  it('falls back to following the installed version', () => {
    expect(coerceUpdateChannel('nightly')).toBeNull();
    expect(coerceUpdateChannel(null)).toBeNull();
    expect(coerceUpdateChannel(undefined)).toBeNull();
  });
});
