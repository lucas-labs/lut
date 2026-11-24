// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { edgeDragPassed, useEdgeDrag } from './useEdgeDrag';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('edgeDragPassed (E27-05)', () => {
  it('passes only beyond 24 px, in its own direction', () => {
    expect(edgeDragPassed(-23, 'left')).toBe(false);
    expect(edgeDragPassed(-25, 'left')).toBe(true);
    expect(edgeDragPassed(25, 'left')).toBe(false);
    expect(edgeDragPassed(23, 'right')).toBe(false);
    expect(edgeDragPassed(25, 'right')).toBe(true);
  });
});

describe('useEdgeDrag (E27-05)', () => {
  let host: HTMLDivElement;
  let root: Root;
  const onChange = vi.fn();
  const onEnd = vi.fn();

  function Edge({ direction }: { direction: 'left' | 'right' }) {
    return <div data-testid="edge" {...useEdgeDrag({ direction, onChange, onEnd })} />;
  }

  const edge = () => host.querySelector('[data-testid="edge"]') as HTMLElement;
  const pointer = (type: string, clientX: number) =>
    act(() => {
      edge().dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX, pointerId: 1 }));
    });

  beforeEach(() => {
    onChange.mockReset();
    onEnd.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('acts as soon as the drag passes the threshold, once per crossing', () => {
    act(() => root.render(<Edge direction="left" />));
    pointer('pointerdown', 100);
    pointer('pointermove', 77);
    expect(onChange).not.toHaveBeenCalled();
    pointer('pointermove', 75);
    pointer('pointermove', 10);
    expect(onChange.mock.calls).toEqual([[true, 'left']]);
    pointer('pointerup', 10);
    expect(onEnd).toHaveBeenCalledWith(true, 'left');
  });

  it('takes it back when the drag goes back over the threshold before the release', () => {
    act(() => root.render(<Edge direction="left" />));
    pointer('pointerdown', 100);
    pointer('pointermove', 60);
    pointer('pointermove', 90);
    pointer('pointerup', 90);
    expect(onChange.mock.calls).toEqual([
      [true, 'left'],
      [false, 'left'],
    ]);
    expect(onEnd).toHaveBeenCalledWith(false, 'left');
  });

  it('does nothing for a drag the other way, or a move with no drag', () => {
    act(() => root.render(<Edge direction="right" />));
    pointer('pointermove', 60);
    pointer('pointerdown', 100);
    pointer('pointermove', 40);
    pointer('pointerup', 40);
    expect(onChange).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledWith(false, 'right');
  });
});
