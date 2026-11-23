// @vitest-environment happy-dom
import { TooltipProvider } from '@/components/ui/tooltip';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompactRail, spaceInitial } from './CompactRail';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onSwitchSpace = vi.fn();
const onNewSpace = vi.fn();

const spaces = [
  { id: 'a', name: 'api' },
  { id: 'b', name: 'web' },
  { id: 'c', name: '  docs' },
];

beforeEach(() => {
  onSwitchSpace.mockReset();
  onNewSpace.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      createElement(
        TooltipProvider,
        null,
        createElement(CompactRail, { spaces, activeSpaceId: 'b', onSwitchSpace, onNewSpace }),
      ),
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const buttons = () => [...host.querySelectorAll('button')];

describe('CompactRail', () => {
  it('shows each space by its initial, in order, and marks the active one', () => {
    const spaceButtons = buttons().slice(0, spaces.length);
    expect(spaceButtons.map((b) => b.textContent)).toEqual(['A', 'W', 'D']);
    expect(spaceButtons.map((b) => b.getAttribute('aria-label'))).toEqual(['api', 'web', '  docs']);
    expect(spaceButtons.map((b) => b.getAttribute('aria-current'))).toEqual([null, 'true', null]);
  });

  it('switches to a space on click', () => {
    act(() => buttons()[0].click());
    expect(onSwitchSpace).toHaveBeenCalledWith('a');
  });

  it('opens a new space from its last button', () => {
    const plus = buttons()[buttons().length - 1];
    expect(plus?.getAttribute('aria-label')).toBe('Open space');
    act(() => plus?.click());
    expect(onNewSpace).toHaveBeenCalledOnce();
    expect(onSwitchSpace).not.toHaveBeenCalled();
  });
});

describe('spaceInitial', () => {
  it('upper-cases the first character and keeps an emoji whole', () => {
    expect(spaceInitial('lut')).toBe('L');
    expect(spaceInitial(' 🚀 launch')).toBe('🚀');
    expect(spaceInitial('ñandú')).toBe('Ñ');
  });

  it('falls back to a question mark for a blank name', () => {
    expect(spaceInitial('')).toBe('?');
    expect(spaceInitial('   ')).toBe('?');
  });
});
