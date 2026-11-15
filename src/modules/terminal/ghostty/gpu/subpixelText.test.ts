import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentSubpixelOrder, resolveSubpixelOrder, subpixelOrderFor } from './subpixelText';

describe('subpixel text', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the stripe order, and grayscale for anything else', () => {
    expect(subpixelOrderFor('rgb')).toBe('rgb');
    expect(subpixelOrderFor(' BGR ')).toBe('bgr');
    for (const value of [null, undefined, '', 'on', 'true', 'vrgb']) {
      expect(subpixelOrderFor(value)).toBeNull();
    }
  });

  it('reads localStorage, and falls back to grayscale when it is missing or throws', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'bgr' } });
    expect(currentSubpixelOrder()).toBe('bgr');
    vi.stubGlobal('window', {});
    expect(currentSubpixelOrder()).toBeNull();
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    });
    expect(currentSubpixelOrder()).toBeNull();
  });

  it('draws the requested order only with hinting and dual-source blending, and says why not', () => {
    const both = { dualSourceBlending: true, hinting: true };
    expect(resolveSubpixelOrder('rgb', both)).toEqual({ order: 'rgb', unavailable: null });
    expect(resolveSubpixelOrder(null, both)).toEqual({ order: null, unavailable: null });
    expect(resolveSubpixelOrder('bgr', { ...both, dualSourceBlending: false })).toEqual({
      order: null,
      unavailable: 'the GPU has no dual-source-blending',
    });
    expect(resolveSubpixelOrder('bgr', { ...both, hinting: false }).order).toBeNull();
  });
});
