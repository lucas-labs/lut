import { describe, expect, it } from 'vitest';
import { titleBarLayout } from './titleBarLayout';

const base = {
  mac: false,
  verticalTabs: false,
  focusMode: false,
  compact: false,
  sidebarHidden: false,
  viewsClosed: false,
  sidePanelsOpen: true,
};

describe('titleBarLayout', () => {
  it('floats the bar with vertical tabs and in focus mode, and keeps it inline with the tab strip otherwise', () => {
    expect(titleBarLayout(base)).toEqual({ placement: 'inline', tabStrip: true, corner: 'panel' });
    expect(titleBarLayout({ ...base, verticalTabs: true }).placement).toBe('overlay');
    expect(titleBarLayout({ ...base, focusMode: true }).placement).toBe('overlay');
  });

  it("keeps the bar inline on macOS's compact sidebar with vertical tabs, without the strip (E27-06)", () => {
    const vertical = { ...base, verticalTabs: true, compact: true, viewsClosed: true };
    expect(titleBarLayout({ ...vertical, mac: true })).toEqual({
      placement: 'inline',
      tabStrip: false,
      corner: 'rail',
    });
    expect(titleBarLayout(vertical).placement).toBe('overlay');
    expect(titleBarLayout({ ...vertical, mac: true, focusMode: true }).placement).toBe('overlay');
  });

  it('names what lies left of the bar: the views or the sidebar, the rail alone, or nothing', () => {
    const compact = { ...base, compact: true };
    expect(titleBarLayout(compact).corner).toBe('panel');
    expect(titleBarLayout({ ...compact, viewsClosed: true }).corner).toBe('rail');
    expect(titleBarLayout({ ...compact, viewsClosed: true, sidebarHidden: true }).corner).toBe(
      'window',
    );
    expect(titleBarLayout({ ...base, sidePanelsOpen: false }).corner).toBe('window');
  });
});
