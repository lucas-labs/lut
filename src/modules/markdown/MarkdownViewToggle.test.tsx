// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownViewToggle } from './MarkdownViewToggle';

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

const radios = () => [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
const labelOf = (radio: HTMLInputElement) => radio.closest('label');

describe('MarkdownViewToggle', () => {
  it('is a radio group, Raw then Rendered, checking the current mode', () => {
    act(() => root.render(createElement(MarkdownViewToggle, { mode: 'rendered', onChange: () => {} })));
    expect(host.querySelector('fieldset legend')?.textContent).toBe('Markdown view');
    expect(radios().map((r) => [labelOf(r)?.textContent, r.checked])).toEqual([
      ['Raw', false],
      ['Rendered', true],
    ]);
  });

  it('asks for the other mode when it is picked', () => {
    const onChange = vi.fn();
    act(() => root.render(createElement(MarkdownViewToggle, { mode: 'raw', onChange })));
    act(() => radios()[1].click());
    act(() => root.render(createElement(MarkdownViewToggle, { mode: 'rendered', onChange })));
    act(() => radios()[0].click());
    expect(onChange.mock.calls).toEqual([['rendered'], ['raw']]);
  });

  it('disables Rendered with its hint while the file has unsaved changes', () => {
    act(() =>
      root.render(
        createElement(MarkdownViewToggle, {
          mode: 'raw',
          onChange: () => {},
          renderedDisabled: true,
          renderedHint: 'Save to preview',
        }),
      ),
    );
    const [raw, rendered] = radios();
    expect(rendered.disabled).toBe(true);
    expect(labelOf(rendered)?.title).toBe('Save to preview');
    expect(raw.disabled).toBe(false);
  });
});
