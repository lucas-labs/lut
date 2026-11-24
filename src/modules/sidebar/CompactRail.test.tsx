// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CompactRail } from './CompactRail';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function renderRail(withTabs: boolean) {
  act(() =>
    root.render(
      createElement(CompactRail, {
        spaces: createElement('div', { 'data-testid': 'spaces' }),
        tabs: withTabs ? createElement('div', { 'data-testid': 'tabs' }) : null,
        views: createElement('div', { 'data-testid': 'views' }),
      }),
    ),
  );
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const slot = (name: string) => host.querySelector(`[data-slot="${name}"]`);

// The spaces and the tabs are the Spaces view's and the tab navigator's compact forms, tested with them.
describe('CompactRail', () => {
  it('leads with the logo, then the spaces, the separator and the tabs, and ends with the view buttons', () => {
    renderRail(true);
    expect(slot('rail-logo')?.textContent).toBe('lut');
    expect(slot('rail-spaces')?.querySelector('[data-testid="spaces"]')).not.toBeNull();
    expect(slot('rail-tabs')?.querySelector('[data-testid="tabs"]')).not.toBeNull();
    const order = [...host.querySelectorAll('[data-slot]')].map((el) => el.getAttribute('data-slot'));
    expect(order.filter((s) => s?.startsWith('rail-'))).toEqual([
      'rail-logo',
      'rail-groups',
      'rail-spaces',
      'rail-separator',
      'rail-tabs',
      'rail-views',
    ]);
    expect(slot('rail-views')?.querySelector('[data-testid="views"]')).not.toBeNull();
    // The groups take the room left, so the view buttons sit at the bottom (E27-04).
    expect(slot('rail-groups')?.classList.contains('flex-1')).toBe(true);
  });

  it('gives each group at most half the rail with tabs, and the spaces all of it without', () => {
    renderRail(true);
    expect(slot('rail-spaces')?.classList.contains('max-h-1/2')).toBe(true);
    expect(slot('rail-tabs')?.classList.contains('max-h-1/2')).toBe(true);
    renderRail(false);
    expect(slot('rail-spaces')?.classList.contains('max-h-1/2')).toBe(false);
    expect(slot('rail-tabs')).toBeNull();
    expect(slot('rail-separator')).toBeNull();
  });
});
