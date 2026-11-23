import { describe, expect, it } from 'vitest';
import { accentFor, SPACE_COLORS, spaceTint } from './spaceColor';

describe('accentFor', () => {
  it('returns the palette color for an in-range index', () => {
    expect(accentFor({ color: 0 })).toBe(SPACE_COLORS[0]);
    expect(accentFor({ color: SPACE_COLORS.length - 1 })).toBe(
      SPACE_COLORS[SPACE_COLORS.length - 1],
    );
  });

  it('falls back to the theme primary for out-of-range, negative, or unset colors', () => {
    expect(accentFor({ color: SPACE_COLORS.length })).toBe('var(--primary)');
    expect(accentFor({ color: -1 })).toBe('var(--primary)');
    expect(accentFor({})).toBe('var(--primary)');
  });
});

describe('spaceTint', () => {
  it('returns the palette color for an in-range index', () => {
    expect(spaceTint({ color: 2 })).toBe(SPACE_COLORS[2]);
  });

  it('returns null for an unset, negative or out-of-range color', () => {
    expect(spaceTint({})).toBeNull();
    expect(spaceTint({ color: -1 })).toBeNull();
    expect(spaceTint({ color: SPACE_COLORS.length })).toBeNull();
  });
});
