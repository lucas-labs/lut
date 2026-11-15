// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingRow } from './SettingRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const text = (id: string | null) => (id ? document.getElementById(id)?.textContent : undefined);

describe('SettingRow', () => {
  it('names and describes its control by the row title and description', () => {
    act(() =>
      root.render(
        createElement(SettingRow, {
          title: 'Cursor blinking',
          description: 'Blink the cursor.',
          children: (a11y) => createElement('button', { type: 'button', role: 'switch', ...a11y }),
        }),
      ),
    );
    const control = host.querySelector('[role="switch"]');
    expect(text(control?.getAttribute('aria-labelledby') ?? null)).toBe('Cursor blinking');
    expect(text(control?.getAttribute('aria-describedby') ?? null)).toBe('Blink the cursor.');
  });

  it('leaves the description out when the row has none', () => {
    act(() =>
      root.render(
        createElement(SettingRow, {
          title: 'Opacity',
          children: (a11y) => createElement('input', { ...a11y }),
        }),
      ),
    );
    expect(host.querySelector('input')?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('still takes a plain value', () => {
    act(() => root.render(createElement(SettingRow, { title: 'License', children: 'MIT' })));
    expect(host.textContent).toBe('LicenseMIT');
  });
});
