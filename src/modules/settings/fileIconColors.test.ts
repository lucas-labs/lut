import { describe, expect, it } from 'vitest';
import { coerceFileIconColors } from './store';

describe('coerceFileIconColors', () => {
  it('keeps the three file icon colour modes', () => {
    for (const mode of ['theme', 'original', 'monochrome']) {
      expect(coerceFileIconColors(mode)).toBe(mode);
    }
  });

  it('falls back to theme for a missing or invalid persisted value', () => {
    expect(coerceFileIconColors(undefined)).toBe('theme');
    expect(coerceFileIconColors('sepia')).toBe('theme');
    expect(coerceFileIconColors(1)).toBe('theme');
  });
});
