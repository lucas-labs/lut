import { describe, expect, it } from 'vitest';
import { shouldPersistSidebarWidth, sidebarStartsCollapsed } from './useSidebarPanel';

describe('shouldPersistSidebarWidth', () => {
  it('only persists a positive width from direct user interaction', () => {
    expect(shouldPersistSidebarWidth(320, true)).toBe(true);
    expect(shouldPersistSidebarWidth(320, false)).toBe(false);
    expect(shouldPersistSidebarWidth(0, true)).toBe(false);
  });
});

describe('sidebarStartsCollapsed', () => {
  it('starts collapsed unless the user left the sidebar open', () => {
    expect(sidebarStartsCollapsed(null)).toBe(true);
    expect(sidebarStartsCollapsed('1')).toBe(true);
    expect(sidebarStartsCollapsed('0')).toBe(false);
  });
});
