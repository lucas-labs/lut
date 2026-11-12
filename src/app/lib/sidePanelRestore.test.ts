import { describe, expect, it } from 'vitest';
import { sidePanelsToRestore } from './sidePanelRestore';

const SIDE = ['sidebar', 'tabs-column'] as const;
const vertical = { sidebar: 20, 'tabs-column': 15, workspace: 65 };

describe('sidePanelsToRestore', () => {
  it('never undoes a drag', () => {
    expect(
      sidePanelsToRestore(vertical, { sidebar: 0, 'tabs-column': 35, workspace: 65 }, true, SIDE),
    ).toEqual([]);
  });

  it('leaves the first layout alone', () => {
    expect(sidePanelsToRestore(null, vertical, false, SIDE)).toEqual([]);
  });

  it('puts every side panel back when the tab column goes or comes', () => {
    const horizontal = { sidebar: 0, workspace: 100 };
    expect(sidePanelsToRestore(vertical, horizontal, false, SIDE)).toEqual(['sidebar']);
    expect(sidePanelsToRestore(horizontal, vertical, false, SIDE)).toEqual([
      'sidebar',
      'tabs-column',
    ]);
  });

  it('puts both back when focus mode ends', () => {
    expect(sidePanelsToRestore({ workspace: 100 }, vertical, false, SIDE)).toEqual([
      'sidebar',
      'tabs-column',
    ]);
  });

  it('keeps the tab column at its width when the sidebar opens or closes', () => {
    const closed = { sidebar: 0, 'tabs-column': 35, workspace: 65 };
    expect(sidePanelsToRestore(vertical, closed, false, SIDE)).toEqual(['tabs-column']);
    expect(sidePanelsToRestore(closed, vertical, false, SIDE)).toEqual(['tabs-column']);
  });

  it('reopens the tab column when the sidebar squeezed it shut while opening', () => {
    const before = { sidebar: 0, 'tabs-column': 22, workspace: 78 };
    const after = { sidebar: 22, 'tabs-column': 0, workspace: 78 };
    expect(sidePanelsToRestore(before, after, false, SIDE)).toEqual(['tabs-column']);
  });

  it('keeps the sidebar at its width when the tab column opens or closes', () => {
    const closed = { sidebar: 20, 'tabs-column': 0, workspace: 80 };
    expect(sidePanelsToRestore(vertical, closed, false, SIDE)).toEqual(['sidebar']);
  });

  it('does nothing for a layout that only changed size', () => {
    expect(
      sidePanelsToRestore(vertical, { sidebar: 18, 'tabs-column': 13, workspace: 69 }, false, SIDE),
    ).toEqual([]);
  });
});
