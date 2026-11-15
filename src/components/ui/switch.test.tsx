// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Switch } from './switch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let checked: boolean;
const onCheckedChange = vi.fn((next: boolean) => {
  checked = next;
  render();
});

function render() {
  act(() => root.render(createElement(Switch, { checked, onCheckedChange, 'aria-label': 'Test' })));
}

const track = () => host.querySelector<HTMLButtonElement>('[role="switch"]') as HTMLButtonElement;

function pointer(type: string, clientX: number) {
  act(() => {
    track().dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX }));
  });
}

/** Press at `from`, move through `path`, release, then the click the browser sends after it. */
function drag(from: number, path: number[]) {
  pointer('pointerdown', from);
  for (const x of path) pointer('pointermove', x);
  pointer('pointerup', path[path.length - 1] ?? from);
  act(() => track().click());
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  checked = false;
  onCheckedChange.mockClear();
  HTMLElement.prototype.setPointerCapture ??= () => {};
  render();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Switch', () => {
  it('toggles on a plain click', () => {
    drag(10, []);
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
  });

  it('switches when dragged past the middle', () => {
    drag(10, [14, 22]);
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
  });

  it('stays put when a drag returns to the side it started from', () => {
    drag(10, [20, 12]);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('switches off when dragged back from on', () => {
    checked = true;
    render();
    drag(30, [24, 18]);
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it('marks the track pressed only while the pointer is down', () => {
    pointer('pointerdown', 10);
    expect(track().hasAttribute('data-pressed')).toBe(true);
    pointer('pointerup', 10);
    expect(track().hasAttribute('data-pressed')).toBe(false);
  });
});
