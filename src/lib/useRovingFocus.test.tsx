// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRovingFocus } from './useRovingFocus';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function Group({ current }: { current: string | null }) {
  const roving = useRovingFocus(['a', 'b', 'c'], current, 'vertical');
  return (
    <>
      <div {...roving.group}>
        {['a', 'b', 'c'].map((id) => (
          <button key={id} type="button" {...roving.item(id)}>
            {id}
          </button>
        ))}
      </div>
      <button type="button" data-outside>
        out
      </button>
    </>
  );
}

const button = (id: string) => host.querySelector<HTMLButtonElement>(`[data-roving-id="${id}"]`);
const stops = () => [...host.querySelectorAll('[data-roving-id]')].map((el) => el.getAttribute('tabindex'));
const press = (el: HTMLElement | null, key: string) =>
  act(() => {
    el?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
  });

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('useRovingFocus', () => {
  it('makes the group one Tab stop, on the current item or else the first', () => {
    act(() => root.render(<Group current="b" />));
    expect(stops()).toEqual(['-1', '0', '-1']);
    act(() => root.render(<Group current={null} />));
    expect(stops()).toEqual(['0', '-1', '-1']);
  });

  it('moves the focus with the arrows, Home and End, without wrapping, and follows it with the Tab stop', () => {
    act(() => root.render(<Group current="a" />));
    act(() => button('a')?.focus());
    press(button('a'), 'ArrowUp');
    expect(document.activeElement).toBe(button('a'));
    press(button('a'), 'ArrowDown');
    expect(document.activeElement).toBe(button('b'));
    expect(stops()).toEqual(['-1', '0', '-1']);
    press(button('b'), 'End');
    expect(document.activeElement).toBe(button('c'));
    press(button('c'), 'ArrowDown');
    expect(document.activeElement).toBe(button('c'));
    press(button('c'), 'Home');
    expect(document.activeElement).toBe(button('a'));
  });

  it('hands the Tab stop back to the current item when the focus leaves the group', () => {
    act(() => root.render(<Group current="a" />));
    act(() => button('a')?.focus());
    press(button('a'), 'ArrowDown');
    expect(stops()).toEqual(['-1', '0', '-1']);
    act(() => host.querySelector<HTMLButtonElement>('[data-outside]')?.focus());
    expect(stops()).toEqual(['0', '-1', '-1']);
  });
});
