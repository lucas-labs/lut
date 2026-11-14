// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FileIcon, FolderIcon } from './FileIcon';
import { preloadFileIcons } from './lib/iconResolver';

let host: HTMLDivElement;
let root: Root;

// The icon set is large: parse it once up front, so no test spends its own time
// budget on it under a loaded run. The resolver still starts empty, as in the app.
beforeAll(async () => {
  await import('./lib/iconEngine');
}, 30_000);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('FileIcon', () => {
  it('holds a blank slot until the icon set lands, then draws the icon inline', async () => {
    act(() => root.render(createElement(FileIcon, { name: 'index.ts', className: 'size-3.5' })));
    // The icon set is still on its way: the slot keeps the icon's box.
    expect(host.querySelector('span')?.classList.contains('size-3.5')).toBe(true);
    expect(host.querySelector('svg')).toBeNull();

    await act(() => preloadFileIcons());
    const svg = host.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg?.classList.contains('size-3.5')).toBe(true);
    expect(svg?.innerHTML).toContain('var(--file-icon-');
  });

  it('gives each copy of an icon its own ids', async () => {
    await act(() => preloadFileIcons());
    await act(async () =>
      root.render(
        createElement(
          Fragment,
          null,
          createElement(FileIcon, { name: 'humans.txt' }),
          createElement(FileIcon, { name: 'humans.txt' }),
          createElement(FolderIcon, { name: 'src', expanded: true }),
        ),
      ),
    );
    const [first, second] = [...host.querySelectorAll('svg')].map((svg) =>
      [...svg.querySelectorAll('[id]')].map((el) => el.id),
    );
    expect(first.length).toBeGreaterThan(0);
    expect(first.some((id) => second.includes(id))).toBe(false);
    for (const id of first) {
      expect(host.querySelector('svg')?.innerHTML).toContain(`url(#${id})`);
    }
  });
});
