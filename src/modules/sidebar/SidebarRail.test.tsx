// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarRail } from './SidebarRail';
import type { SidebarViewId } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onSelectView = vi.fn<(view: SidebarViewId) => void>();

const tab = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((el) => el.textContent?.startsWith(name));

beforeEach(() => {
  onSelectView.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('SidebarRail', () => {
  it('is one Tab stop, on the active view, and the side arrows move between the views (E27-13)', () => {
    act(() => root.render(<SidebarRail activeView="explorer" onSelectView={onSelectView} changedCount={0} />));
    expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Sidebar view');
    expect([tab('Spaces'), tab('Files'), tab('Git')].map((el) => el?.tabIndex)).toEqual([-1, 0, -1]);
    act(() => tab('Files')?.focus());
    act(() => {
      tab('Files')?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });
    expect(document.activeElement).toBe(tab('Git'));
    expect(onSelectView).not.toHaveBeenCalled();
  });
});
