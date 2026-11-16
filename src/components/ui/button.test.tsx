// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';

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

describe('Button', () => {
  it('is not a submit button unless it says so', () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    act(() =>
      root.render(
        createElement(
          'form',
          { onSubmit },
          createElement(Button, { id: 'action' }, 'Reset'),
          createElement(Button, { id: 'submit', type: 'submit' }, 'Launch'),
        ),
      ),
    );
    const action = host.querySelector<HTMLButtonElement>('#action')!;
    const submit = host.querySelector<HTMLButtonElement>('#submit')!;
    expect(action.type).toBe('button');
    expect(submit.type).toBe('submit');
    act(() => action.click());
    expect(onSubmit).not.toHaveBeenCalled();
    act(() => submit.click());
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('leaves the type of an asChild element alone', () => {
    act(() => root.render(createElement(Button, { asChild: true }, createElement('a', { href: '#x' }, 'Link'))));
    expect(host.querySelector('a')?.hasAttribute('type')).toBe(false);
  });
});
