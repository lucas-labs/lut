// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingExpander, SettingRow, SettingRowList } from './SettingRow';

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

  it('stands alone as a card, and joins the others inside a list', () => {
    act(() =>
      root.render(
        createElement('div', null, [
          createElement(SettingRow, { key: 'a', title: 'Alone', children: 'x' }),
          createElement(SettingRowList, {
            key: 'b',
            children: createElement(SettingRow, { title: 'Listed', children: 'y' }),
          }),
        ]),
      ),
    );
    expect([...host.querySelectorAll('[data-slot="setting-row"]')].map((r) => r.getAttribute('data-variant'))).toEqual([
      'card',
      'listed',
    ]);
  });

  it('describes the control with a description that is markup', () => {
    act(() =>
      root.render(
        createElement(SettingRow, {
          title: 'Rust',
          description: createElement('span', null, createElement('code', null, 'rust-analyzer'), ' (rs)'),
          children: (a11y) => createElement('button', { type: 'button', role: 'switch', ...a11y }),
        }),
      ),
    );
    const control = host.querySelector('[role="switch"]');
    expect(text(control?.getAttribute('aria-describedby') ?? null)).toBe('rust-analyzer (rs)');
  });

  it('puts its details under the title and control', () => {
    act(() =>
      root.render(
        createElement(SettingRow, {
          title: 'Language overrides',
          children: 'add',
          details: createElement('p', { id: 'details' }, 'Python'),
        }),
      ),
    );
    const row = host.querySelector('[data-slot="setting-row"]');
    expect(row?.lastElementChild?.id).toBe('details');
    expect(row?.className).toContain('flex-col');
  });
});

describe('SettingExpander', () => {
  const render = (open: boolean) =>
    act(() =>
      root.render(
        createElement(SettingExpander, {
          open,
          setting: createElement(SettingRow, { title: 'Word wrap', children: 'switch' }),
          children: createElement(SettingRow, { title: 'Wrap column', children: 'input' }),
        }),
      ),
    );
  const body = () => host.querySelector('[data-slot="setting-expander-body"]');

  it('shows the switch row and nests the rows that depend on it', () => {
    render(true);
    expect([...host.querySelectorAll('[data-slot="setting-row"]')].map((r) => r.getAttribute('data-variant'))).toEqual([
      'expander',
      'nested',
    ]);
  });

  it('keeps the dependent rows inert while closed', () => {
    render(false);
    expect(body()?.getAttribute('data-state')).toBe('closed');
    expect(body()?.hasAttribute('inert')).toBe(true);
    expect(body()?.textContent).toContain('Wrap column');
    render(true);
    expect(body()?.getAttribute('data-state')).toBe('open');
    expect(body()?.hasAttribute('inert')).toBe(false);
  });
});
