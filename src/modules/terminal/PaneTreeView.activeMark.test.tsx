// @vitest-environment happy-dom
import { act, createElement, forwardRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaneNode } from './lib/panes';
import { PaneTreeView } from './PaneTreeView';

// The mark is the subject here, not the terminal: the pane renders as an empty box.
vi.mock('./TerminalPane', () => ({
  TerminalPane: forwardRef<HTMLDivElement>(function TerminalPane(_props, ref) {
    return createElement('div', { ref });
  }),
}));

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(node: PaneNode, activeLeafId: number) {
  act(() =>
    root.render(
      createElement(PaneTreeView, {
        node,
        tabVisible: true,
        activeLeafId,
        onFocusLeaf: () => {},
        registerHandle: () => {},
        onSearchReady: () => {},
        onCwd: () => {},
        onExit: () => {},
      }),
    ),
  );
}

/** The leaf ids whose pane carries the active mark. */
const marked = () =>
  Array.from(host.querySelectorAll('[data-active-pane-mark]')).map((mark) =>
    Number(mark.closest('[data-pane-leaf]')?.getAttribute('data-pane-leaf')),
  );

describe('active pane mark', () => {
  it('marks only the active pane of a split', () => {
    const split: PaneNode = {
      kind: 'split',
      id: 1,
      dir: 'row',
      ratios: [0.5, 0.5],
      children: [
        { kind: 'leaf', id: 2 },
        { kind: 'leaf', id: 3 },
      ],
    };
    render(split, 3);
    expect(marked()).toEqual([3]);
    render(split, 2);
    expect(marked()).toEqual([2]);
  });

  it('marks nothing when the tab has a single pane', () => {
    render({ kind: 'leaf', id: 2 }, 2);
    expect(marked()).toEqual([]);
  });
});
