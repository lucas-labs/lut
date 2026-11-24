// @vitest-environment happy-dom
import { TooltipProvider } from '@/components/ui/tooltip';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompactViewButtons } from './CompactViewButtons';
import type { SidebarViewId } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onSelectView = vi.fn<(view: SidebarViewId) => void>();

function render(activeView: SidebarViewId | null, changedCount: number) {
  act(() =>
    root.render(
      <TooltipProvider>
        <CompactViewButtons activeView={activeView} onSelectView={onSelectView} changedCount={changedCount} />
      </TooltipProvider>,
    ),
  );
}

const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label^="${name}"]`);
const tooltip = () => document.querySelector('[data-slot="tooltip-content"]')?.textContent;

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

describe('CompactViewButtons (E27-04)', () => {
  it('shows the open view pressed, and none while the views are closed', () => {
    render('source-control', 0);
    expect(button('Files')?.getAttribute('aria-pressed')).toBe('false');
    expect(button('Git')?.getAttribute('aria-pressed')).toBe('true');
    render(null, 0);
    expect(button('Git')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('asks for its view on a click', () => {
    render(null, 0);
    act(() => button('Files')?.click());
    act(() => button('Git')?.click());
    expect(onSelectView.mock.calls).toEqual([['explorer'], ['source-control']]);
  });

  it('marks Git with a dot and the count while there are changes', async () => {
    render(null, 0);
    expect(button('Git')?.getAttribute('aria-label')).toBe('Git');
    expect(host.querySelector('[data-slot="changes-dot"]')).toBeNull();
    render(null, 3);
    expect(button('Git')?.getAttribute('aria-label')).toBe('Git, 3 changes');
    expect(button('Git')?.querySelector('[data-slot="changes-dot"]')).not.toBeNull();
    await act(async () => button('Git')?.focus());
    expect(tooltip()).toBe('Git · 3 changes');
    render(null, 1);
    expect(button('Git')?.getAttribute('aria-label')).toBe('Git, 1 change');
  });
});
