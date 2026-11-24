import { describe, expect, it } from 'vitest';
import { coerceSidebarMode } from './store';

describe('coerceSidebarMode', () => {
  it('keeps the sidebar modes', () => {
    expect(coerceSidebarMode('full')).toBe('full');
    expect(coerceSidebarMode('compact')).toBe('compact');
  });

  it('falls back to full for invalid persisted values', () => {
    expect(coerceSidebarMode('rail')).toBe('full');
    expect(coerceSidebarMode(1)).toBe('full');
    expect(coerceSidebarMode(null)).toBe('full');
    expect(coerceSidebarMode(undefined)).toBe('full');
  });
});
