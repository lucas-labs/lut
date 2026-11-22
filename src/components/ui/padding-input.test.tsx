// @vitest-environment happy-dom
import type { Padding, PaddingEdit } from '@/lib/padding';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PaddingInput } from './padding-input';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let value: Padding;
const changes: Padding[] = [];
const edits: PaddingEdit[] = [];

function render() {
  act(() =>
    root.render(
      createElement(PaddingInput, {
        value,
        max: 64,
        'aria-label': 'Padding',
        onChange: (next: Padding, edit: PaddingEdit) => {
          changes.push(next);
          edits.push(edit);
          value = next;
          render();
        },
      }),
    ),
  );
}

const fields = () => [...host.querySelectorAll('input')].map((input) => input.getAttribute('aria-label'));
const field = (label: string) => host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const toggle = () => host.querySelector('button') as HTMLButtonElement;

function type(label: string, text: string) {
  const input = field(label);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  changes.length = 0;
  edits.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('PaddingInput', () => {
  it('shows one field per axis when opposite sides match, and one per side after the toggle', () => {
    value = { top: 4, right: 8, bottom: 4, left: 8 };
    render();
    expect(fields()).toEqual(['Horizontal padding', 'Vertical padding']);
    expect(field('Horizontal padding').value).toBe('8');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');

    act(() => toggle().click());
    expect(fields()).toEqual(['Left padding', 'Top padding', 'Right padding', 'Bottom padding']);
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(changes).toEqual([]);
  });

  it('sets both sides of an axis from its field', () => {
    value = { top: 0, right: 0, bottom: 0, left: 0 };
    render();
    type('Vertical padding', '6');
    expect(changes).toEqual([{ top: 6, right: 0, bottom: 6, left: 0 }]);
    expect(edits).toEqual([{ kind: 'set', sides: ['top', 'bottom'], value: 6 }]);
  });

  it('opens with one field per side when opposite sides differ, and joins them from left and top', () => {
    value = { top: 2, right: 10, bottom: 6, left: 12 };
    render();
    expect(fields()).toEqual(['Left padding', 'Top padding', 'Right padding', 'Bottom padding']);
    type('Right padding', '20');
    expect(value).toEqual({ top: 2, right: 20, bottom: 6, left: 12 });

    act(() => toggle().click());
    expect(value).toEqual({ top: 2, right: 12, bottom: 2, left: 12 });
    expect(edits).toEqual([{ kind: 'set', sides: ['right'], value: 20 }, { kind: 'join' }]);
    expect(fields()).toEqual(['Horizontal padding', 'Vertical padding']);
  });

  it('stays split while a side is typed, even when the sides match on the way', () => {
    value = { top: 0, right: 10, bottom: 0, left: 2 };
    render();
    type('Right padding', '2');
    expect(value.right).toBe(2);
    expect(fields()).toEqual(['Left padding', 'Top padding', 'Right padding', 'Bottom padding']);
    type('Right padding', '20');
    expect(value).toEqual({ top: 0, right: 20, bottom: 0, left: 2 });
  });

  it('stays split after it is opened with matching sides, until the toggle joins them', () => {
    value = { top: 4, right: 4, bottom: 4, left: 4 };
    render();
    act(() => toggle().click());
    type('Left padding', '6');
    type('Left padding', '4');
    expect(fields()).toEqual(['Left padding', 'Top padding', 'Right padding', 'Bottom padding']);
    act(() => toggle().click());
    expect(fields()).toEqual(['Horizontal padding', 'Vertical padding']);
  });

  it('joins at once when the joined value arrives after the click, as Settings writes it', () => {
    value = { top: 2, right: 10, bottom: 6, left: 12 };
    let pending: Padding | null = null;
    const renderLater = () =>
      act(() =>
        root.render(
          createElement(PaddingInput, {
            value,
            max: 64,
            onChange: (next: Padding) => {
              pending = next;
            },
          }),
        ),
      );
    renderLater();
    act(() => toggle().click());
    // The click rendered with the old, differing value: the control is joined anyway.
    expect(fields()).toEqual(['Horizontal padding', 'Vertical padding']);
    value = pending ?? value;
    renderLater();
    expect(fields()).toEqual(['Horizontal padding', 'Vertical padding']);
    expect(field('Horizontal padding').value).toBe('12');
  });

  it('opens one field per side when a value set elsewhere makes the sides differ', () => {
    value = { top: 4, right: 4, bottom: 4, left: 4 };
    render();
    expect(fields()).toEqual(['Horizontal padding', 'Vertical padding']);
    value = { top: 4, right: 9, bottom: 4, left: 4 };
    render();
    expect(fields()).toEqual(['Left padding', 'Top padding', 'Right padding', 'Bottom padding']);
  });

  it('keeps each side between 0 and the maximum, in whole pixels', () => {
    value = { top: 0, right: 0, bottom: 0, left: 0 };
    render();
    type('Horizontal padding', '100');
    type('Horizontal padding', '-3');
    type('Horizontal padding', '7.6');
    expect(changes.map((change) => change.left)).toEqual([64, 0, 8]);
  });

  it('waits for a number while a field is empty', () => {
    value = { top: 5, right: 5, bottom: 5, left: 5 };
    render();
    type('Horizontal padding', '');
    expect(changes).toEqual([]);
    expect(field('Horizontal padding').value).toBe('');
    act(() => field('Horizontal padding').dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(field('Horizontal padding').value).toBe('5');
  });

  it('is one labelled group', () => {
    value = { top: 0, right: 0, bottom: 0, left: 0 };
    render();
    const group = host.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Padding');
    expect(toggle().getAttribute('aria-label')).toBe('Set each side');
  });
});
