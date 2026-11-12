import { describe, expect, it } from 'vitest';
import { logoFor } from './AppLogo';

describe('logoFor', () => {
  it('takes the export drawn for the closest size', () => {
    expect(logoFor(14)).toBe(logoFor(16));
    expect(logoFor(18)).toBe(logoFor(16));
    expect(logoFor(48)).not.toBe(logoFor(16));
    expect(logoFor(40)).toBe(logoFor(48));
  });
});
