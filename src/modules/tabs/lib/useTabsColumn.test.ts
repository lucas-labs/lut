import { describe, expect, it } from 'vitest';
import {
  parseTabsColumnWidth,
  TABS_COLUMN_MAX_WIDTH,
  TABS_COLUMN_MIN_WIDTH,
} from './useTabsColumn';

describe('parseTabsColumnWidth', () => {
  it('restores a stored width within the limits and falls back to the default', () => {
    expect(parseTabsColumnWidth('240')).toBe(240);
    expect(parseTabsColumnWidth('10')).toBe(TABS_COLUMN_MIN_WIDTH);
    expect(parseTabsColumnWidth('9999')).toBe(TABS_COLUMN_MAX_WIDTH);
    expect(parseTabsColumnWidth(null)).toBe(200);
    expect(parseTabsColumnWidth('wide')).toBe(200);
  });
});
