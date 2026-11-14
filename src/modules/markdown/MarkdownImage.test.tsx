// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InsideLinkContext, MarkdownImage } from './MarkdownImage';

let host: HTMLDivElement;
let root: Root;

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

describe('MarkdownImage', () => {
  it('loads again once its source changes after a failure', () => {
    act(() => root.render(createElement(MarkdownImage, { src: 'broken.png', alt: 'Logo' })));
    act(() => {
      host.querySelector('img')?.dispatchEvent(new Event('error'));
    });
    expect(host.textContent).toBe('Logo (image not available)');
    act(() => root.render(createElement(MarkdownImage, { src: 'fixed.png', alt: 'Logo' })));
    expect(host.querySelector('img')?.getAttribute('src')).toBe('fixed.png');
  });

  it('draws a plain image inside a link, leaving the click to the link', () => {
    act(() =>
      root.render(
        createElement(
          InsideLinkContext.Provider,
          { value: true },
          createElement(MarkdownImage, { src: 'badge.svg', alt: 'CI' }),
        ),
      ),
    );
    expect(host.querySelector('button')).toBeNull();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('badge.svg');
  });
});
