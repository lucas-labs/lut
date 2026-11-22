import { describe, expect, it } from 'vitest';
import { applyPaddingEdit } from './padding';

const PADDING = { top: 2, right: 14, bottom: 6, left: 10 };

describe('applyPaddingEdit', () => {
  it('sets the edited sides and keeps the rest', () => {
    expect(applyPaddingEdit(PADDING, { kind: 'set', sides: ['left', 'right'], value: 4 })).toEqual({
      top: 2,
      right: 4,
      bottom: 6,
      left: 4,
    });
  });

  it('joins right to left and bottom to top', () => {
    expect(applyPaddingEdit(PADDING, { kind: 'join' })).toEqual({
      top: 2,
      right: 10,
      bottom: 2,
      left: 10,
    });
  });
});
